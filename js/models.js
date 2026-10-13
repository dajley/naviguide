const SEG_URL = "./models/yolo26n-seg.onnx";
let session = null;

export async function loadSegModel() {
    if (!session) {
        session = await ort.InferenceSession.create(SEG_URL, {
            executionProviders: ["wasm"],
        });
    }
    return session;
}

export async function runSeg(inputData) {
    const tensor = new ort.Tensor("float32", inputData, [1, 3, 640, 640]);
    return session.run({ [session.inputNames[0]]: tensor });
}