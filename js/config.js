// Classes the spec treats as moving obstacles. Their names are announced.
// Any other class the seg model detects is a general obstacle, announced without a name.
export const MOVING_CLASSES = new Set([
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe",
]);