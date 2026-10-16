import {
	WALKABLE_IDS,
	WARNING_IDS,
	HAZARD_IDS,
	DOOR_ID,
	WALL_ID,
	SURFACE_NAMES,
	STAND_TOP,
	AHEAD_TOP,
	WALL_TOP,
	SURFACE_MIN_PCT,
} from "./config.js";

const SIZE = 640;
const BOTTOM_START = Math.round((SIZE * 2) / 3);
const AHEAD_START = Math.round(SIZE * AHEAD_TOP);
const STAND_START = Math.round(SIZE * STAND_TOP);
const WALL_START = Math.round(SIZE * WALL_TOP);
const BIN_M = 0.1; // depth histogram resolution, in meters
const MAX_M = 20; // anything farther goes in the last bin
const BINS = Math.round(MAX_M / BIN_M);
const ZONE_KEYS = ["left", "center", "right"];
const WARN_KEY = { left: "warnLeft", center: "warnCenter", right: "warnRight" };

const isGround = (id) => WALKABLE_IDS.has(id) || WARNING_IDS.has(id);
const zoneOf = (col) =>
	col < SIZE / 3 ? "left" : col < (2 * SIZE) / 3 ? "center" : "right";

function newHist() {
	return new Uint32Array(BINS + 1);
}

function getHist(map, id) {
	if (!map.has(id)) map.set(id, newHist());
	return map.get(id);
}

function addDepth(h, m) {
	if (!(m >= 0)) return false;
	h[Math.min(BINS, Math.round(m / BIN_M))]++;
	return true;
}

// Nearest distance: the 10th percentile, so one noisy pixel doesn't decide it.
function nearest(h, count) {
	if (!h || count === 0) return null;
	const target = count * 0.1;
	let acc = 0;
	for (let b = 0; b <= BINS; b++) {
		acc += h[b];
		if (acc >= target) return b * BIN_M;
	}
	return null;
}

// The most common ground class in a band, if it covers enough of the band.
function dominant(counts, bandTotal) {
	let best = null;
	let bestN = 0;
	for (const [id, n] of counts) {
		if (n > bestN) {
			best = id;
			bestN = n;
		}
	}
	if (best === null) return null;
	return Math.round((100 * bestN) / bandTotal) >= SURFACE_MIN_PCT ? best : null;
}

// Reads the [1, 640, 640] class-ID map and the matching depth map.
export function analyzeSem(t, depthMap) {
	const d = t.data;
	const depth = depthMap ? depthMap.data : null;
	const total = SIZE * SIZE;
	const counts = new Map();
	let walk = 0,
		hazard = 0,
		door = 0,
		wallRegion = 0,
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
		hWall = newHist();
	let nHazard = 0,
		nDoor = 0,
		nWall = 0;

	const doorZ = { left: 0, center: 0, right: 0 };
	const nDoorZ = { left: 0, center: 0, right: 0 };
	const hDoorZ = { left: newHist(), center: newHist(), right: newHist() };

	const standCounts = new Map();
	const aheadCounts = new Map();
	const aheadHist = new Map();
	const aheadN = new Map();

	for (let i = 0; i < total; i++) {
		const id = Math.round(d[i]);
		counts.set(id, (counts.get(id) || 0) + 1);
		const m = depth ? depth[i] : NaN;
		const row = Math.floor(i / SIZE);
		const zone = zoneOf(i % SIZE);

		if (WALKABLE_IDS.has(id)) {
			walk++;
		} else if (HAZARD_IDS.has(id)) {
			hazard++;
			if (addDepth(hHazard, m)) nHazard++;
		} else if (id === DOOR_ID) {
			door++;
			doorZ[zone]++;
			if (addDepth(hDoor, m)) nDoor++;
			if (addDepth(hDoorZ[zone], m)) nDoorZ[zone]++;
		}

		// Wall: the center path region, from the middle of the frame down.
		if (row >= WALL_START && zone === "center") {
			wallRegion++;
			if (id === WALL_ID) {
				wall++;
				if (addDepth(hWall, m)) nWall++;
			}
		}

		// Side zones over the bottom third, used to pick a direction to step.
		if (row >= BOTTOM_START) {
			bottom.total++;
			if (WALKABLE_IDS.has(id)) {
				bottom.walk++;
				bottom[zone]++;
			} else if (WARNING_IDS.has(id)) {
				bottom.warn++;
				bottom[WARN_KEY[zone]]++;
			}
		}

		// Surface under the user (bottom band) and surface ahead (band above it).
		if (isGround(id)) {
			if (row >= STAND_START) {
				standCounts.set(id, (standCounts.get(id) || 0) + 1);
			} else if (row >= AHEAD_START) {
				aheadCounts.set(id, (aheadCounts.get(id) || 0) + 1);
				if (depth && addDepth(getHist(aheadHist, id), m)) {
					aheadN.set(id, (aheadN.get(id) || 0) + 1);
				}
			}
		}
	}

	const pct = (n, of) => (of > 0 ? Math.round((100 * n) / of) : 0);
	const topIds = [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([id, n]) => `${id}:${pct(n, total)}%`)
		.join(" ");

	const standId = dominant(standCounts, (SIZE - STAND_START) * SIZE);
	const aheadId = dominant(aheadCounts, (STAND_START - AHEAD_START) * SIZE);
	const aheadNum = aheadId !== null ? aheadN.get(aheadId) || 0 : 0;

	const doorZones = {};
	for (const z of ZONE_KEYS) {
		doorZones[z] = {
			pct: pct(doorZ[z], total),
			m: nearest(hDoorZ[z], nDoorZ[z]),
		};
	}

	return {
		hazardPct: pct(hazard, total),
		doorPct: pct(door, total),
		wallPct: pct(wall, wallRegion),
		hazardM: nearest(hHazard, nHazard),
		doorM: nearest(hDoor, nDoor),
		wallM: nearest(hWall, nWall),
		doorZones,
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
		standingSurface: standId !== null ? SURFACE_NAMES[standId] : null,
		aheadSurface: aheadId !== null ? SURFACE_NAMES[aheadId] : null,
		aheadM: aheadNum > 0 ? nearest(aheadHist.get(aheadId), aheadNum) : null,
		topIds,
	};
}
