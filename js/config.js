// Classes the spec treats as moving obstacles. Their names are announced.
// Any other class is a general obstacle, announced without a name.
export const MOVING_CLASSES = new Set([
	"person",
	"bicycle",
	"car",
	"motorcycle",
	"airplane",
	"bus",
	"train",
	"truck",
	"boat",
	"bird",
	"cat",
	"dog",
	"horse",
	"sheep",
	"cow",
	"elephant",
	"bear",
	"zebra",
	"giraffe",
]);

// ADE20K class IDs for the semantic model.
// Walkable: safe to walk on. Warning: a surface change, announced as a heads-up.
// Hazard: stairs or steps. Door: a transition to announce. Wall: a fixed obstacle.
export const WALKABLE_IDS = new Set([3, 11, 52]); // floor, sidewalk, pathway
export const WARNING_IDS = new Set([6, 9, 13, 46]); // road, grass, earth, sand
export const HAZARD_IDS = new Set([53, 59, 121]); // stairs, stairway, step
export const DOOR_ID = 14;
export const WALL_ID = 0;

// Distance words, in meters from the depth model.
// "close": under CLOSE_M. Triggers an alert right away.
// "near": between CLOSE_M and NEAR_M. Moving objects and general obstacles get a near alert.
// Beyond NEAR_M is not announced for those.
export const CLOSE_M = 2;
export const NEAR_M = 5;

// Alert ranges for ground and wall alerts, in meters.
export const STAIRS_M = 10; // stairs warn from this far, since a fall is the biggest hazard
export const DOOR_M = 5; // doors
export const SURFACE_M = 5; // road, grass, dirt, sand
export const WALL_CLOSE_M = 2; // a wall closer than this in the path is announced

// A moving object or wall is "approaching" if it got this many meters closer since the last cycle.
export const APPROACH_M = 0.3;

// Ground thresholds, as percent of the whole bottom third.
// Each side (left, center, right) can reach about 33% at most.
export const MIN_WALK_PCT = 10; // single-obstacle logic: a side needs at least this much usable ground
export const OPEN_PCT = 15; // multi-obstacle logic: a side with this much floor and no blocker is "open"
export const NARROW_PCT = 5; // multi-obstacle logic: a side with this much floor is "narrow"
export const WARN_PCT = 15; // road or grass in the bottom third
export const HAZARD_PCT = 3; // stairs anywhere in the frame
export const DOOR_PCT = 5; // door anywhere in the frame
export const WALL_PCT = 15; // wall in the center of the lower half of the frame

// Speech timing.
export const REMINDER_MS = 10000; // repeat the "still ahead" reminder after this long
export const CONFIRM_CYCLES = 1; // a non-urgent alert must hold for this many analysis cycles
