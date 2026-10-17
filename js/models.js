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

function createAll(opts) {
	return Promise.all(
		[SEG_URL, DEPTH_URL, SEM_URL].map((u) =>
			ort.InferenceSession.create(u, opts),
		),
	);
}

// Tries WebGPU for all three models unless FORCE_CPU is set. If any fails, all three use the CPU
// path, so the models never run on mixed backends.
export async function loadModels() {
	if (segSession && depthSession && semSession) return;

	if (!FORCE_CPU && (await webgpuAvailable())) {
		try {
			[segSession, depthSession, semSession] = await createAll(GPU_OPTS);
			backend = "webgpu";
			return;
		} catch (err) {
			console.warn("WebGPU unavailable, using CPU:", err);
		}
	}

	[segSession, depthSession, semSession] = await createAll(CPU_OPTS);
	backend = "cpu";
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
