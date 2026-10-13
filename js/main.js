import { startCamera, stopCamera } from "./camera.js";

const video = document.getElementById("camera");
const button = document.getElementById("toggle");
const status = document.getElementById("status");
let running = false;

button.addEventListener("click", async () => {
    button.disabled = true;
    try {
        if (!running) {
            const { width, height } = await startCamera(video);
            running = true;
            button.textContent = "Stop";
            status.textContent = `Camera on (${width}×${height}).`;
        } else {
            stopCamera(video);
            running = false;
            button.textContent = "Start";
            status.textContent = "Camera off.";
        }
    } catch (err) {
        status.textContent = `Camera error: ${err.name}. ${err.message}`;
    } finally {
        button.disabled = false;
    }
});