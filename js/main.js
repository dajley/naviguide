import { startCamera, stopCamera } from "./camera.js";
import { loadModels, runSeg, runDepth, runSem } from "./models.js";
import { frameToTensor } from "./preprocess.js";
import { decodeDetections } from "./detect.js";
import { depthRange, depthAt } from "./depth.js";
import { analyzeSem } from "./sem.js";

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
            return `${name} ${d.zone} ${d.meters.toFixed(1)}m (${d.score.toFixed(2)})`;
        })
        .join(", ") + ".";
}

function describeGround(s) {
    const z = s.bottomWalkZones;
    return `Ground ahead: walkable ${s.bottomWalkablePct}% ` +
        `(left ${z.left}, center ${z.center}, right ${z.right}), ` +
        `warning ${s.bottomWarningPct}%. Top IDs ${s.topIds}.`;
}

async function inferOnce() {
    if (busy || video.readyState < 2) return;
    busy = true;
    try {
        const t0 = performance.now();
        const frame = frameToTensor(video);
        const segOut = await runSeg(frame);
        const depthOut = await runDepth(frame);
        const semOut = await runSem(frame);
        const ms = Math.round(performance.now() - t0);

        const depthMap = Object.values(depthOut)[0];
        const dets = decodeDetections(Object.values(segOut)[0]).map((d) => ({
            ...d,
            meters: depthAt(depthMap, d.box),
        }));
        const ground = analyzeSem(Object.values(semOut)[0]);
        const range = depthRange(depthMap);

        status.textContent =
            `${describe(dets)} ${describeGround(ground)} ` +
            `Depth ${range.min.toFixed(1)}–${range.max.toFixed(1)}. ${ms} ms/frame.`;
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
            status.textContent = "Loading models…";
            await loadModels();
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