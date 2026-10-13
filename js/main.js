import { startCamera, stopCamera } from "./camera.js";
import { loadSegModel, runSeg } from "./models.js";
import { frameToTensor } from "./preprocess.js";

const video = document.getElementById("camera");
const button = document.getElementById("toggle");
const status = document.getElementById("status");

let running = false;
let timer = null;
let busy = false;

function maxClassScore(t) {
    // output0 layout is [1, 116, N]: rows 4 to 83 are the 80 class scores.
    const [, , N] = t.dims;
    let max = -Infinity;
    for (let c = 4; c < 84; c++) {
        for (let i = 0; i < N; i++) {
            max = Math.max(max, t.data[c * N + i]);
        }
    }
    return max.toFixed(2);
}

async function inferOnce() {
    if (busy || video.readyState < 2) return;
    busy = true;
    try {
        const t0 = performance.now();
        const out = await runSeg(frameToTensor(video));
        const ms = Math.round(performance.now() - t0);
        const [a, b] = Object.values(out);
        status.textContent =
            `out0 [${a.dims}], out1 [${b.dims}]. ` +
            `Top class score ${maxClassScore(a)}. ${ms} ms/frame.`;
    } catch (err) {
        status.textContent = `Inference error: ${err.message}`;
    } finally {
        busy = false;
    }
}

button.addEventListener("click", async () => {
    button.disabled = true;
    try {
        if (!running) {
            status.textContent = "Starting camera…";
            await startCamera(video);
            status.textContent = "Loading model…";
            await loadSegModel();
            running = true;
            button.textContent = "Stop";
            timer = setInterval(inferOnce, 2000);
        } else {
            clearInterval(timer);
            stopCamera(video);
            running = false;
            button.textContent = "Start";
            status.textContent = "Camera off.";
        }
    } catch (err) {
        status.textContent = `Error: ${err.name}. ${err.message}`;
    } finally {
        button.disabled = false;
    }
});