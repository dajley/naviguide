import { startCamera, stopCamera } from "./camera.js";
import { loadSegModel, runSeg } from "./models.js";
import { frameToTensor } from "./preprocess.js";
import { decodeDetections } from "./detect.js";

const video = document.getElementById("camera");
const button = document.getElementById("toggle");
const status = document.getElementById("status");

let running = false;
let timer = null;
let busy = false;

function describe(dets) {
    if (dets.length === 0) return "Nothing detected.";
    return dets
        .slice(0, 5)
        .map((d) => {
            const name = d.kind === "moving" ? d.label : "obstacle";
            return `${name} ${d.zone} (${d.score.toFixed(2)})`;
        })
        .join(", ") + ".";
}

async function inferOnce() {
    if (busy || video.readyState < 2) return;
    busy = true;
    try {
        const t0 = performance.now();
        const out = await runSeg(frameToTensor(video));
        const ms = Math.round(performance.now() - t0);
        const dets = decodeDetections(Object.values(out)[0]);
        status.textContent = `${describe(dets)} ${ms} ms/frame.`;
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