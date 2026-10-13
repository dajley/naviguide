const SEG_URL = "./models/yolo26n-seg.onnx";
const DEPTH_URL = "./models/yolo26n-depth.onnx";
const SEM_URL = "./models/yolo26n-sem-ade20k.onnx";
let segSession = null;
let depthSession = null;
let semSession = null;

export async function loadModels() {
    const opts = { executionProviders: ["wasm"] };
    if (!segSession) segSession = await ort.InferenceSession.create(SEG_URL, opts);
    if (!depthSession) depthSession = await ort.InferenceSession.create(DEPTH_URL, opts);
    if (!semSession) semSession = await ort.InferenceSession.create(SEM_URL, opts);
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