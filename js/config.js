// Classes the spec treats as moving obstacles. Their names are announced.
// Any other class is a general obstacle, announced without a name.
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

// Distance words, in meters from the depth model.
// "close": under CLOSE_M. Spoken as "close". Triggers an alert right away.
// "near": between CLOSE_M and NEAR_M. Spoken as "near". Only moving objects get a near alert.
// Beyond NEAR_M is "far" and is not announced.
export const CLOSE_M = 2;
export const NEAR_M = 5;

// A moving object is "approaching" if it got this many meters closer since the last cycle.
export const APPROACH_M = 0.3;

// Ground thresholds, as percent of the frame.
export const MIN_WALK_PCT = 10;  // a side needs at least this much walkable ground to step onto
export const WARN_PCT = 15;      // road or grass in the bottom third
export const HAZARD_PCT = 3;     // stairs anywhere in the frame
export const DOOR_PCT = 5;       // door anywhere in the frame

// Speech timing.
export const REMINDER_MS = 10000; // repeat the "still ahead" reminder after this long
export const CONFIRM_CYCLES = 2;  // a non-urgent alert must hold for this many analysis cycles