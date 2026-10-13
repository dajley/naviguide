import { MOVING_CLASSES } from "./config.js";

// Standard 80 COCO class names, in model index order.
export const COCO = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
    "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
    "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
    "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
    "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator",
    "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush",
];

const INPUT_SIZE = 640;

// tensor dims are [1, 116, N]. Rows 0-3 are box center x, center y, width, height
// (in 640px input pixels). Rows 4-83 are the 80 class scores.
export function decodeDetections(t, threshold = 0.25, iouThreshold = 0.45) {
    const N = t.dims[2];
    const d = t.data;
    const candidates = [];

    for (let i = 0; i < N; i++) {
        let best = -1;
        let bestScore = 0;
        for (let c = 0; c < 80; c++) {
            const s = d[(4 + c) * N + i];
            if (s > bestScore) {
                bestScore = s;
                best = c;
            }
        }
        if (bestScore >= threshold) {
            const cx = d[i];
            const cy = d[N + i];
            const w = d[2 * N + i];
            const h = d[3 * N + i];
            candidates.push({
                cls: best,
                score: bestScore,
                x1: cx - w / 2,
                y1: cy - h / 2,
                x2: cx + w / 2,
                y2: cy + h / 2,
            });
        }
    }

    return nms(candidates, iouThreshold).map((det) => {
        const cx = (det.x1 + det.x2) / 2;
        const third = INPUT_SIZE / 3;
        const label = COCO[det.cls];
        return {
            label,
            kind: MOVING_CLASSES.has(label) ? "moving" : "general",
            score: det.score,
            zone: cx < third ? "left" : cx < 2 * third ? "center" : "right",
            box: [det.x1, det.y1, det.x2, det.y2],
        };
    });
}

function iou(a, b) {
    const x1 = Math.max(a.x1, b.x1);
    const y1 = Math.max(a.y1, b.y1);
    const x2 = Math.min(a.x2, b.x2);
    const y2 = Math.min(a.y2, b.y2);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
    const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
    return inter / (areaA + areaB - inter);
}

// Non-maximum suppression: keep the highest-scoring box, drop overlapping
// boxes of the same class.
function nms(list, threshold) {
    list.sort((a, b) => b.score - a.score);
    const keep = [];
    for (const c of list) {
        if (keep.every((k) => k.cls !== c.cls || iou(k, c) < threshold)) {
            keep.push(c);
        }
    }
    return keep;
}