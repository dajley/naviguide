// Classes the spec treats as moving obstacles. Their names are announced.
// Any other class the seg model detects is a general obstacle, announced without a name.
export const MOVING_CLASSES = new Set([
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe",
]);

// ADE20K class IDs for the semantic model.
// Walkable: safe to walk on. Warning: needs an alert before stepping onto it.
// Hazard: stairs or steps. Door: a transition to announce.
export const WALKABLE_IDS = new Set([3, 11, 52]);   // floor, sidewalk, pathway
export const WARNING_IDS = new Set([6, 9, 13, 46]); // road, grass, earth, sand
export const HAZARD_IDS = new Set([53, 59, 121]);   // stairs, stairway, step
export const DOOR_ID = 14;