import { MODEL, geometry } from "./geometry.js";

const canvas = document.createElement("canvas");
canvas.width = MODEL;
canvas.height = MODEL;
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const PAD = "rgb(114,114,114)"; // the gray padding YOLO models expect

// Letterboxes the frame into the model's square input: scaled to fit, centered, padded with gray.
// updateGeometry must be called with the current video size first.
// Returns a Float32Array in NCHW layout (1 x 3 x 640 x 640), values 0 to 1.
export function frameToTensor(videoEl) {
	const g = geometry();
	ctx.fillStyle = PAD;
	ctx.fillRect(0, 0, MODEL, MODEL);
	ctx.drawImage(
		videoEl,
		0,
		0,
		videoEl.videoWidth,
		videoEl.videoHeight,
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
