// Model work that runs inside the worker: loads the ONNX models and runs one analysis pass per frame.
import { SEM_EVERY, GPU_REST } from "./config.js";
import { MODEL, geometry, updateGeometry } from "./geometry.js";
import { decodeDetections } from "./detect.js";
import { depthAt } from "./depth.js";
import { analyzeSem } from "./sem.js";

// Test switch. true runs every model on the CPU, even when WebGPU is available.
const FORCE_CPU = false;

const GPU_OPTS = {
	executionProviders: ["webgpu", "wasm"],
	preferredOutputLocation: "cpu",
};
const CPU_OPTS = { executionProviders: ["wasm"] };
const PAD = "rgb(114,114,114)"; // the gray padding YOLO models expect

let segSession = null;
let depthSession = null;
let semSession = null;
let backend = "none";
let onGpu = false; // true when seg and depth run on the GPU
let cycle = 0;
let lastGround = null;

const canvas = new OffscreenCanvas(MODEL, MODEL);
const ctx = canvas.getContext("2d", { willReadFrequently: true });

async function webgpuAvailable() {
	try {
		if (!navigator.gpu) return false;
		return !!(await navigator.gpu.requestAdapter());
	} catch {
		return false;
	}
}

// Segmentation and depth use the GPU when it's available. The semantic model always runs on
// the CPU, because some phone GPUs return wrong floor and door results for it.
export async function init(base) {
	// The worker can't find the ONNX Runtime files on its own, so give the folder explicitly.
	ort.env.wasm.wasmPaths = base + "js/vendor/ort/";
	const segUrl = base + "models/yolo26n-seg.onnx";
	const depthUrl = base + "models/yolo26n-depth.onnx";
	const semUrl = base + "models/yolo26n-sem-ade20k.onnx";

	let gpuOk = false;
	if (!FORCE_CPU && (await webgpuAvailable())) {
		try {
			[segSession, depthSession] = await Promise.all([
				ort.InferenceSession.create(segUrl, GPU_OPTS),
				ort.InferenceSession.create(depthUrl, GPU_OPTS),
			]);
			gpuOk = true;
		} catch (err) {
			console.warn("WebGPU unavailable for seg/depth, using CPU:", err);
		}
	}

	if (!gpuOk) {
		[segSession, depthSession] = await Promise.all([
			ort.InferenceSession.create(segUrl, CPU_OPTS),
			ort.InferenceSession.create(depthUrl, CPU_OPTS),
		]);
	}
	semSession = await ort.InferenceSession.create(semUrl, CPU_OPTS);

	onGpu = gpuOk;
	backend = gpuOk ? "webgpu (seg, depth) + cpu (sem)" : "cpu";
	return backend;
}

// Letterboxes the camera frame into the model's square input, same as the old preprocess.js.
function frameToTensor(bitmap) {
	const g = geometry();
	ctx.fillStyle = PAD;
	ctx.fillRect(0, 0, MODEL, MODEL);
	ctx.drawImage(
		bitmap,
		0,
		0,
		bitmap.width,
		bitmap.height,
		g.x0,
		g.y0,
		g.cw,
		g.ch,
	);

	const { data } = ctx.getImageData(0, 0, MODEL, MODEL);
	const n = MODEL * MODEL;
	const out = new Float32Array(3 * n);
	for (let i = 0; i < n; i++) {
		out[i] = data[i * 4] / 255;
		out[n + i] = data[i * 4 + 1] / 255;
		out[2 * n + i] = data[i * 4 + 2] / 255;
	}
	return out;
}

// Each model gets its own copy of the input.
function input(data) {
	return new ort.Tensor("float32", new Float32Array(data), [
		1,
		3,
		MODEL,
		MODEL,
	]);
}

async function timed(run) {
	const t = performance.now();
	const out = await run();
	return { out, ms: Math.round(performance.now() - t) };
}

// The GPU that runs seg and depth also draws the camera video. Back-to-back model runs
// leave it no time for the video, so the picture stutters. This gives it a rest after each one.
function gpuRest(ms) {
	if (!onGpu || GPU_REST <= 0) return Promise.resolve();
	return new Promise((r) => setTimeout(r, ms * GPU_REST));
}

// Runs one analysis pass on a camera frame. Returns the detections, the ground reading,
// and the class map when it was refreshed this pass.
export async function processFrame(bitmap, reset) {
	if (reset) {
		cycle = 0;
		lastGround = null;
	}
	const t0 = performance.now();
	updateGeometry(bitmap.width, bitmap.height);
	const frame = frameToTensor(bitmap);
	bitmap.close();

	const seg = await timed(() =>
		segSession.run({ [segSession.inputNames[0]]: input(frame) }),
	);
	await gpuRest(seg.ms);
	const depth = await timed(() =>
		depthSession.run({ [depthSession.inputNames[0]]: input(frame) }),
	);

	// The semantic model runs every SEM_EVERY cycles. Its ground state is reused in between.
	// It runs on the CPU, so it already gives the GPU a rest. Without it, the rest after depth
	// is returned and taken by main.js before the next frame, so the result isn't held back.
	const fresh = cycle % SEM_EVERY === 0 || lastGround === null;
	const rest = !fresh && onGpu ? Math.round(depth.ms * GPU_REST) : 0;
	const sem = fresh
		? await timed(() =>
				semSession.run({ [semSession.inputNames[0]]: input(frame) }),
			)
		: null;

	const depthMap = Object.values(depth.out)[0];
	let semOut = null;
	if (sem) {
		const semMap = Object.values(sem.out)[0];
		lastGround = analyzeSem(semMap, depthMap);
		semOut = { dims: semMap.dims, data: new Float32Array(semMap.data) };
	}
	cycle++;

	const segTensor = Object.values(seg.out)[0];
	const dets = decodeDetections(segTensor).map((d) => ({
		...d,
		meters: depthAt(depthMap, d.box),
	}));

	return {
		dets,
		ground: lastGround,
		fresh,
		sem: semOut,
		rest,
		timing: {
			backend,
			seg: seg.ms,
			depth: depth.ms,
			sem: sem ? sem.ms : null,
			total: Math.round(performance.now() - t0),
		},
	};
}
