import {
	WALKABLE_IDS,
	WARNING_IDS,
	HAZARD_IDS,
	DOOR_ID,
	WALL_ID,
} from "./config.js";

const SIZE = 640;
const BOTTOM_START = Math.round((SIZE * 2) / 3);
const WALL_START = Math.round(SIZE / 2);
const BIN_M = 0.1; // depth histogram resolution, in meters
const MAX_M = 20; // anything farther goes in the last bin
const BINS = Math.round(MAX_M / BIN_M);

// Spoken names for warning surfaces.
const WARN_NAMES = { 6: "road", 9: "grass", 13: "dirt", 46: "sand" };

function newHist() {
	return new Uint32Array(BINS + 1);
}

function addDepth(h, m) {
	if (!(m >= 0)) return false;
	h[Math.min(BINS, Math.round(m / BIN_M))]++;
	return true;
}

// Nearest distance: the 10th percentile, so one noisy pixel doesn't decide it.
function nearest(h, count) {
	if (count === 0) return null;
	const target = count * 0.1;
	let acc = 0;
	for (let b = 0; b <= BINS; b++) {
		acc += h[b];
		if (acc >= target) return b * BIN_M;
	}
	return null;
}

// Reads the [1, 640, 640] class-ID map and the matching depth map.
// Objects (stairs, doors, walls) get the nearest distance across their pixels.
// Surfaces (road, grass, etc.) get the nearest distance across their pixels in the bottom third.
export function analyzeSem(t, depthMap) {
	const d = t.data;
	const depth = depthMap ? depthMap.data : null;
	const total = SIZE * SIZE;
	const counts = new Map();
	const bottomWarnIds = new Map();
	let walk = 0,
		warn = 0,
		hazard = 0,
		door = 0;
	let wallRegion = 0,
		wall = 0;
	const bottom = {
		left: 0,
		center: 0,
		right: 0,
		walk: 0,
		warn: 0,
		total: 0,
		warnLeft: 0,
		warnCenter: 0,
		warnRight: 0,
	};

	const hHazard = newHist(),
		hDoor = newHist(),
		hWarn = newHist(),
		hWall = newHist();
	let nHazard = 0,
		nDoor = 0,
		nWarn = 0,
		nWall = 0;

	for (let i = 0; i < total; i++) {
		const id = Math.round(d[i]);
		counts.set(id, (counts.get(id) || 0) + 1);
		const m = depth ? depth[i] : NaN;

		const row = Math.floor(i / SIZE);
		const col = i % SIZE;
		const inBottom = row >= BOTTOM_START;
		const zone =
			col < SIZE / 3 ? "left" : col < (2 * SIZE) / 3 ? "center" : "right";

		if (WALKABLE_IDS.has(id)) {
			walk++;
		} else if (WARNING_IDS.has(id)) {
			warn++;
			if (inBottom && addDepth(hWarn, m)) nWarn++;
		} else if (HAZARD_IDS.has(id)) {
			hazard++;
			if (addDepth(hHazard, m)) nHazard++;
		} else if (id === DOOR_ID) {
			door++;
			if (addDepth(hDoor, m)) nDoor++;
		}

		// Wall: center of the lower half of the frame, the area in front of the user.
		if (row >= WALL_START && zone === "center") {
			wallRegion++;
			if (id === WALL_ID) {
				wall++;
				if (addDepth(hWall, m)) nWall++;
			}
		}

		if (inBottom) {
			bottom.total++;
			if (WALKABLE_IDS.has(id)) {
				bottom.walk++;
				bottom[zone]++;
			} else if (WARNING_IDS.has(id)) {
				bottom.warn++;
				bottom[`warn${zone[0].toUpperCase()}${zone.slice(1)}`]++;
				bottomWarnIds.set(id, (bottomWarnIds.get(id) || 0) + 1);
			}
		}
	}

	const pct = (n, of) => Math.round((100 * n) / of);
	const topIds = [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([id, n]) => `${id}:${pct(n, total)}%`)
		.join(" ");

	// The most common warning surface in the bottom third, by name.
	let warnLabel = null;
	if (bottomWarnIds.size > 0) {
		const [topWarnId] = [...bottomWarnIds.entries()].sort(
			(a, b) => b[1] - a[1],
		)[0];
		warnLabel = WARN_NAMES[topWarnId] || "rough ground";
	}

	return {
		walkablePct: pct(walk, total),
		warningPct: pct(warn, total),
		hazardPct: pct(hazard, total),
		doorPct: pct(door, total),
		wallPct: pct(wall, wallRegion),
		bottomWalkablePct: pct(bottom.walk, bottom.total),
		bottomWarningPct: pct(bottom.warn, bottom.total),
		bottomWalkZones: {
			left: pct(bottom.left, bottom.total),
			center: pct(bottom.center, bottom.total),
			right: pct(bottom.right, bottom.total),
		},
		bottomWarnZones: {
			left: pct(bottom.warnLeft, bottom.total),
			center: pct(bottom.warnCenter, bottom.total),
			right: pct(bottom.warnRight, bottom.total),
		},
		warnLabel,
		hazardM: nearest(hHazard, nHazard),
		doorM: nearest(hDoor, nDoor),
		warnM: nearest(hWarn, nWarn),
		wallM: nearest(hWall, nWall),
		topIds,
	};
}
