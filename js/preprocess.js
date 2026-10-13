const SIZE = 640;
const canvas = document.createElement("canvas");
canvas.width = SIZE;
canvas.height = SIZE;
const ctx = canvas.getContext("2d", { willReadFrequently: true });

// Returns a Float32Array in NCHW layout (1 x 3 x 640 x 640), values 0 to 1.
// The frame is stretched to a square, which distorts aspect ratio. Letterboxing can come later.
export function frameToTensor(videoEl) {
    ctx.drawImage(videoEl, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
    const n = SIZE * SIZE;
    const out = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
        out[i] = data[i * 4] / 255;
        out[n + i] = data[i * 4 + 1] / 255;
        out[2 * n + i] = data[i * 4 + 2] / 255;
    }
    return out;
}