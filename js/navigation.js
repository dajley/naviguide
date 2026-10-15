import {
	CLOSE_M,
	NEAR_M,
	APPROACH_M,
	MIN_WALK_PCT,
	OPEN_PCT,
	NARROW_PCT,
	HAZARD_PCT,
	DOOR_PCT,
	WALL_PCT,
	STAIRS_M,
	DOOR_M,
	SURFACE_M,
	WALL_PATH_M,
	WALL_NEAR_M,
	SURFACE_CONFIRM,
	WALKABLE_NAMES,
} from "./config.js";

const OPPOSITE = { left: "right", right: "left" };
const PENDING_MS = 15000; // how long a "You are now on X" message can wait to be spoken

// Horizontal extent of each zone in the 640-pixel model input.
const IMG = 640;
const ZONES = {
	left: [0, IMG / 3],
	center: [IMG / 3, (2 * IMG) / 3],
	right: [(2 * IMG) / 3, IMG],
};

// Ground state. Only updated when the semantic model gives a fresh reading.
let currentSurface = null; // surface under the user, once confirmed
let candidateSurface = null;
let candidateCount = 0;
let aheadConfirmed = null; // { name, m } for a surface ahead, used for the heads-up
let lastAheadName = null; // the surface most recently announced as approaching
let pendingStep = null; // surface just stepped onto, waiting to be spoken
let pendingUntil = 0; // time after which the pending message is dropped
let wallHist = [];
let prevWallSmooth = null;
let wallInfo = { smooth: null, approaching: false };

export function resetNavigation() {
	currentSurface = null;
	candidateSurface = null;
	candidateCount = 0;
	aheadConfirmed = null;
	lastAheadName = null;
	pendingStep = null;
	pendingUntil = 0;
	wallHist = [];
	prevWallSmooth = null;
	wallInfo = { smooth: null, approaching: false };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const where = (zone) => (zone === "center" ? "ahead" : `on your ${zone}`);

// Spoken distance, rounded to the nearest half meter.
export function spokenDistance(m) {
	const half = Math.max(0.5, Math.round(m * 2) / 2);
	return half === 1 ? "1 meter" : `${half} meters`;
}

// Marks moving objects that got closer since the last cycle, matched by label and zone.
export function markApproaching(dets, prev) {
	const next = new Map();
	for (const d of dets) {
		const key = `${d.label}:${d.zone}`;
		const before = prev.get(key);
		d.approaching = before !== undefined && before - d.meters >= APPROACH_M;
		next.set(key, d.meters);
	}
	return next;
}

// Updates the ground state from a fresh semantic reading.
function updateGround(ground) {
	// Surface under the user. A change normally has to hold for SURFACE_CONFIRM readings,
	// so stepping onto a new surface doesn't flicker. If it's the surface we just warned
	// about as approaching, one reading is enough, since the user has already been told.
	const seen = ground.standingSurface;
	if (seen && seen !== currentSurface) {
		const needed = seen === lastAheadName ? 1 : SURFACE_CONFIRM;
		if (seen === candidateSurface) {
			candidateCount++;
		} else {
			candidateSurface = seen;
			candidateCount = 1;
		}
		if (candidateCount >= needed) {
			if (currentSurface !== null) {
				pendingStep = seen;
				pendingUntil = Date.now() + PENDING_MS;
			}
			currentSurface = seen;
			candidateSurface = null;
			candidateCount = 0;
		}
	} else {
		candidateSurface = null;
		candidateCount = 0;
	}

	// Surface ahead: no confirmation, since this is only a heads-up. Any fresh reading that
	// differs from the surface under the user, within SURFACE_M, counts. If no depth
	// reading is available, it still counts, just without a distance.
	const ahead = ground.aheadSurface;
	const inRange = ground.aheadM == null || ground.aheadM <= SURFACE_M;
	aheadConfirmed =
		currentSurface !== null &&
		ahead !== null &&
		ahead !== currentSurface &&
		inRange
			? { name: ahead, m: ground.aheadM ?? null }
			: null;
	if (aheadConfirmed) lastAheadName = aheadConfirmed.name;

	// Wall in the path: median of the last 3 readings, to ignore depth noise.
	const m = ground.wallPct >= WALL_PCT ? ground.wallM : null;
	wallHist.push(m);
	if (wallHist.length > 3) wallHist.shift();
	const vals = wallHist.filter((v) => v != null).sort((a, b) => a - b);
	const smooth = vals.length ? vals[Math.floor(vals.length / 2)] : null;
	wallInfo = {
		smooth,
		approaching:
			smooth != null &&
			prevWallSmooth != null &&
			prevWallSmooth - smooth >= APPROACH_M,
	};
	prevWallSmooth = smooth;
}

// Picks the side to step to for a single obstacle. An obstacle on the left means stepping
// right, and the reverse. A center obstacle can go either way. Walkable or warning ground
// both count. A side needs no close object of its own.
function sideToStep(zone, dets, ground) {
	const options = zone === "center" ? ["left", "right"] : [OPPOSITE[zone]];
	const usable = (s) => ground.bottomWalkZones[s] + ground.bottomWarnZones[s];
	const ok = options.filter(
		(s) =>
			usable(s) >= MIN_WALK_PCT &&
			!dets.some((d) => d.zone === s && d.meters < CLOSE_M),
	);
	ok.sort((a, b) => usable(b) - usable(a));
	return ok[0] ?? null;
}

// Which of the three zones a box overlaps horizontally, so a wide object blocks every zone it touches.
function zonesOverlapped(box) {
	const [x1, , x2] = box;
	return Object.entries(ZONES)
		.filter(([, [a, b]]) => x2 > a && x1 < b)
		.map(([zone]) => zone);
}

// Everything that can block the path, ranked by urgency, then by distance.
function collectBlockers(dets, wallM) {
	const list = [];
	for (const d of dets) {
		if (d.kind === "moving" && d.meters < NEAR_M) {
			list.push({
				id: `${d.label}:${d.zone}`,
				rank: d.approaching ? 0 : d.meters < CLOSE_M ? 1 : 2,
				meters: d.meters,
				zones: zonesOverlapped(d.box),
				urgent: d.approaching || d.meters < CLOSE_M,
				phrase: `${cap(d.label)} ${where(d.zone)}, ${spokenDistance(d.meters)}`,
			});
		} else if (d.kind === "general" && d.meters < CLOSE_M) {
			list.push({
				id: `obstacle:${d.zone}`,
				rank: 3,
				meters: d.meters,
				zones: zonesOverlapped(d.box),
				urgent: true,
				phrase: `Obstacle ${where(d.zone)}, ${spokenDistance(d.meters)}`,
			});
		}
	}
	if (wallM != null && wallM <= WALL_PATH_M) {
		list.push({
			id: "wall",
			rank: 4,
			meters: wallM,
			zones: ["center"],
			urgent: true,
			phrase: `Wall ahead, ${spokenDistance(wallM)}`,
		});
	}
	return list.sort((a, b) => a.rank - b.rank || a.meters - b.meters);
}

// Status of one zone: blocked by a top blocker, open, narrow, or blocked for lack of floor.
function sideStatus(side, blockers, ground) {
	if (blockers.some((b) => b.zones.includes(side))) return "blocked";
	const usable = ground.bottomWalkZones[side] + ground.bottomWarnZones[side];
	if (usable >= OPEN_PCT) return "open";
	if (usable >= NARROW_PCT) return "narrow";
	return "blocked";
}

// Chooses the direction for two blockers, using the zones and the available floor.
function multiAction(top, ground) {
	const status = {
		left: sideStatus("left", top, ground),
		center: sideStatus("center", top, ground),
		right: sideStatus("right", top, ground),
	};

	if (status.center !== "blocked") {
		return status.center === "open" ? "Keep straight." : "Narrow path ahead.";
	}

	const usable = (s) => ground.bottomWalkZones[s] + ground.bottomWarnZones[s];
	const options = ["left", "right"]
		.filter((s) => status[s] !== "blocked")
		.sort(
			(a, b) =>
				(status[a] === "open" ? 0 : 1) - (status[b] === "open" ? 0 : 1) ||
				usable(b) - usable(a),
		);

	if (options.length === 0) return "Stop.";
	const best = options[0];
	return status[best] === "open"
		? `Move ${best}.`
		: `Narrow path on your ${best}.`;
}

// Returns the single alert for this cycle, highest priority first.
// fresh: true when the semantic model produced a new reading this cycle.
// key: identifies the situation, so the same alert isn't spoken again
// text: what to say
// urgent: speak right away, interrupting anything being said
// reminder: shorter text spoken if the same situation continues
export function decide(dets, ground, fresh = true) {
	if (fresh) updateGround(ground);
	const wall = wallInfo;

	// 1. Stairs (object). Warns from STAIRS_M. If no depth is available, still warns for safety.
	if (
		ground.hazardPct >= HAZARD_PCT &&
		(ground.hazardM == null || ground.hazardM <= STAIRS_M)
	) {
		return {
			key: "stairs",
			text: `Stairs ahead${ground.hazardM == null ? "" : `, ${spokenDistance(ground.hazardM)}`}.`,
			urgent: true,
			reminder: "Stairs still ahead.",
		};
	}

	// 2. Two or more blockers: name the top two and give a direction that accounts for both.
	const blockers = collectBlockers(dets, wall.smooth);
	if (blockers.length >= 2) {
		const top = blockers.slice(0, 2);
		const action = multiAction(top, ground);
		return {
			key: `multi:${top.map((b) => b.id).join("|")}:${action}`,
			text: `${top.map((b) => b.phrase).join(". ")}. ${action}`,
			urgent: top.some((b) => b.urgent),
			reminder: `Obstacles still close. ${action}`,
		};
	}

	// 3. Single moving object that is close, near, or approaching, on any surface
	const moving = dets
		.filter((d) => d.kind === "moving" && d.meters < NEAR_M)
		.sort((a, b) => a.meters - b.meters)[0];
	if (moving) {
		const who = cap(moving.label);
		const loc = where(moving.zone);
		const dist = spokenDistance(moving.meters);
		const isClose = moving.meters < CLOSE_M;
		const text = moving.approaching
			? `${who} approaching, ${loc}, ${dist}.`
			: `${who} ${loc}, ${dist}.`;
		return {
			key: `moving:${moving.label}:${moving.zone}`,
			text,
			urgent: moving.approaching || isClose,
			reminder: `${who} still ${loc}.`,
		};
	}

	// 4. Single general obstacle that is close, on any surface
	const obstacle = dets
		.filter((d) => d.kind === "general" && d.meters < CLOSE_M)
		.sort((a, b) => a.meters - b.meters)[0];
	if (obstacle) {
		const loc = where(obstacle.zone);
		const dist = spokenDistance(obstacle.meters);
		const side = sideToStep(obstacle.zone, dets, ground);
		if (side) {
			return {
				key: `obstacle:${obstacle.zone}:${side}`,
				text: `Obstacle ${loc}, ${dist}. Move ${side}.`,
				urgent: true,
				reminder: `Obstacle still ${loc}.`,
			};
		}
		return {
			key: `obstacle:${obstacle.zone}:stop`,
			text: `Obstacle ${loc}, ${dist}. Stop.`,
			urgent: true,
			reminder: `Obstacle still ${loc}. Stop.`,
		};
	}

	// 5. Wall in the path, close or approaching. Guide toward a clear side if there is one.
	if (
		wall.smooth != null &&
		(wall.smooth <= WALL_PATH_M ||
			(wall.approaching && wall.smooth <= WALL_NEAR_M))
	) {
		const dist = spokenDistance(wall.smooth);
		const word = wall.approaching ? "approaching" : "ahead";
		const side = sideToStep("center", dets, ground);
		const urgent = wall.smooth <= WALL_PATH_M;
		if (side) {
			return {
				key: `wall:${side}`,
				text: `Wall ${word}, ${dist}. Move ${side}.`,
				urgent,
				reminder: "Wall still ahead.",
			};
		}
		return {
			key: "wall:stop",
			text: `Wall ${word}, ${dist}. Stop.`,
			urgent: true,
			reminder: "Wall still ahead. Stop.",
		};
	}

	// 6. General obstacle near, in the center
	const near = dets
		.filter(
			(d) => d.kind === "general" && d.zone === "center" && d.meters < NEAR_M,
		)
		.sort((a, b) => a.meters - b.meters)[0];
	if (near) {
		return {
			key: "obstacle:near",
			text: `Obstacle ahead, ${spokenDistance(near.meters)}.`,
			urgent: false,
			reminder: "Obstacle still ahead.",
		};
	}

	// 7. Door (object), within DOOR_M
	if (
		ground.doorPct >= DOOR_PCT &&
		ground.doorM != null &&
		ground.doorM <= DOOR_M
	) {
		return {
			key: "door",
			text: `Door ahead, ${spokenDistance(ground.doorM)}.`,
			urgent: false,
			reminder: "Door still ahead.",
		};
	}

	// 8. Just stepped onto a surface. Urgent, so it interrupts an approach message.
	// It stays pending for PENDING_MS, so it's still spoken if something else was playing.
	if (
		pendingStep &&
		pendingStep === currentSurface &&
		Date.now() < pendingUntil
	) {
		return {
			key: `on:${pendingStep}`,
			text: `You are now on ${pendingStep}.`,
			urgent: true,
			reminder: null,
		};
	}

	// 9. Surface ahead that differs from the one under the user, within SURFACE_M. Heads-up only.
	if (aheadConfirmed) {
		const name = aheadConfirmed.name;
		const A = cap(name);
		const dist =
			aheadConfirmed.m == null ? "" : `, ${spokenDistance(aheadConfirmed.m)}`;
		const leaving =
			currentSurface !== null &&
			WALKABLE_NAMES.has(currentSurface) &&
			!WALKABLE_NAMES.has(name);
		const text = leaving
			? `${cap(currentSurface)} ends. ${A} approaching${dist}.`
			: `${A} approaching${dist}.`;
		return {
			key: `ahead:${name}`,
			text,
			urgent: false,
			reminder: `${A} still ahead.`,
		};
	}

	// 10. Clear
	return { key: "clear", text: "Path clear.", urgent: false, reminder: null };
}
