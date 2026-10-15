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
export const WALKABLE_IDS = new Set([3, 11, 52]); // floor, sidewalk, pathway
export const WARNING_IDS = new Set([6, 9, 13, 46]); // road, grass, earth, sand
export const HAZARD_IDS = new Set([53, 59, 121]); // stairs, stairway, step
export const DOOR_ID = 14;
export const WALL_ID = 0;

// Spoken names for ground classes, and which ones count as sidewalk-type walkable ground.
export const SURFACE_NAMES = {
	3: "floor",
	11: "sidewalk",
	52: "path",
	6: "road",
	9: "grass",
	13: "dirt",
	46: "sand",
};
export const WALKABLE_NAMES = new Set(["floor", "sidewalk", "path"]);

// Ground bands, as fractions of frame height.
export const STAND_TOP = 0.85; // bottom 15%: the surface under the user
export const AHEAD_TOP = 0.55; // 55% to 85%: the surface ahead
export const WALL_TOP = 0.5; // walls count from the middle of the frame down, center only
export const SURFACE_MIN_PCT = 25; // a band counts as one surface if it covers this much of the band
export const SURFACE_CONFIRM = 2; // fresh readings in a row before a surface change is accepted

// Distance words, in meters from the depth model.
export const CLOSE_M = 2;
export const NEAR_M = 5;

// Alert ranges, in meters.
export const STAIRS_M = 10; // stairs warn from this far
export const DOOR_M = 5; // doors
export const SURFACE_M = 8; // surfaces ahead, all types
export const WALL_PATH_M = 2.5; // a wall this close in the path is a blocker
export const WALL_NEAR_M = 4; // an approaching wall is announced within this range

// A moving object or wall is "approaching" if it got this many meters closer since the last reading.
export const APPROACH_M = 0.3;

// Ground thresholds, as percent of the frame or region.
export const MIN_WALK_PCT = 10; // a side needs at least this much usable ground to step onto
export const OPEN_PCT = 15; // multi-obstacle logic: a side with this much floor and no blocker is "open"
export const NARROW_PCT = 5; // multi-obstacle logic: a side with this much floor is "narrow"
export const HAZARD_PCT = 3; // stairs anywhere in the frame
export const DOOR_PCT = 5; // door anywhere in the frame
export const WALL_PCT = 15; // wall share of the center path region

// Processing and speech timing.
export const SEM_EVERY = 2; // run the semantic model every Nth cycle; ground is reused in between
export const REMINDER_MS = 10000; // repeat the "still ahead" reminder after this long
export const CONFIRM_CYCLES = 1; // a non-urgent alert must hold for this many cycles
