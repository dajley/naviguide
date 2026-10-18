const SEG_URL = "./models/yolo26n-seg.onnx";
const DEPTH_URL = "./models/yolo26n-depth.onnx";
const SEM_URL = "./models/yolo26n-sem-ade20k.onnx";

// Test switch. true runs every model on the CPU, even when WebGPU is available.
const FORCE_CPU = false;

let segSession = null;
let depthSession = null;
let semSession = null;
let backend = "none";

const GPU_OPTS = {
	executionProviders: ["webgpu", "wasm"],
	preferredOutputLocation: "cpu",
};
const CPU_OPTS = { executionProviders: ["wasm"] };

// True only if the browser exposes WebGPU and can give us a GPU adapter.
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
export async function loadModels() {
	if (segSession && depthSession && semSession) return;

	// Run the CPU models in a background worker, so the screen can keep drawing while they run.
	ort.env.wasm.proxy = true;

	let gpuOk = false;
	if (!FORCE_CPU && (await webgpuAvailable())) {
		try {
			[segSession, depthSession] = await Promise.all([
				ort.InferenceSession.create(SEG_URL, GPU_OPTS),
				ort.InferenceSession.create(DEPTH_URL, GPU_OPTS),
			]);
			gpuOk = true;
		} catch (err) {
			console.warn("WebGPU unavailable for seg/depth, using CPU:", err);
		}
	}

	if (!gpuOk) {
		[segSession, depthSession] = await Promise.all([
			ort.InferenceSession.create(SEG_URL, CPU_OPTS),
			ort.InferenceSession.create(DEPTH_URL, CPU_OPTS),
		]);
	}
	semSession = await ort.InferenceSession.create(SEM_URL, CPU_OPTS);

	backend = gpuOk ? "webgpu (seg, depth) + cpu (sem)" : "cpu";
}

export function getBackend() {
	return backend;
}

function input(data) {
	return new ort.Tensor("float32", data, [1, 3, 640, 640]);
}

export async function runSeg(data) {
	return segSession.run({ [segSession.inputNames[0]]: input(data) });
}

export async function runDepth(data) {
	return depthSession.run({ [depthSession.inputNames[0]]: input(data) });
}

export async function runSem(data) {
	return semSession.run({ [semSession.inputNames[0]]: input(data) });
}
