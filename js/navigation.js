import {
	CLOSE_M,
	NEAR_M,
	APPROACH_M,
	MIN_WALK_PCT,
	OPEN_PCT,
	NARROW_PCT,
	WARN_PCT,
	HAZARD_PCT,
	DOOR_PCT,
	WALL_PCT,
	STAIRS_M,
	DOOR_M,
	SURFACE_M,
	WALL_CLOSE_M,
} from "./config.js";

const OPPOSITE = { left: "right", right: "left" };
const SIDEWALK_MIN_PCT = 20; // walkable ground in the bottom third that counts as "on a sidewalk"

// Horizontal extent of each zone in the 640-pixel model input.
const IMG = 640;
const ZONES = {
	left: [0, IMG / 3],
	center: [IMG / 3, (2 * IMG) / 3],
	right: [(2 * IMG) / 3, IMG],
};

// State carried between cycles.
let prevWalkPct = 0;
let prevWarnName = null;
let prevWallM = null;

export function resetNavigation() {
	prevWalkPct = 0;
	prevWarnName = null;
	prevWallM = null;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const where = (zone) => (zone === "center" ? "ahead" : `on your ${zone}`);

// Spoken distance, rounded to the nearest half meter.
export function spokenDistance(m) {
	const half = Math.max(0.5, Math.round(m * 2) / 2);
	return half === 1 ? "1 meter" : `${half} meters`;
}

// ", 3 meters" when a distance is known, otherwise nothing.
const distPhrase = (m) => (m == null ? "" : `, ${spokenDistance(m)}`);

// Marks moving objects that got closer since the last cycle, matched by label and zone.
// Returns the distances to compare against next cycle.
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

// Picks the side to step to for a single obstacle. An obstacle on the left means stepping
// right, and the reverse. A center obstacle can go either way. Walkable or warning ground
// both count, since the user can walk on road or grass. A side needs no close object of its own.
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
// Moving objects within NEAR_M, general obstacles within CLOSE_M, and a close wall.
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
	if (wallM != null && wallM < WALL_CLOSE_M) {
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
// key: identifies the situation, so the same alert isn't spoken again
// text: what to say
// urgent: speak right away, interrupting anything being said
// reminder: shorter text spoken if the same situation continues
export function decide(dets, ground) {
	// Surface change: only when the road or grass is within range.
	const warnName =
		ground.bottomWarningPct >= WARN_PCT &&
		ground.warnM != null &&
		ground.warnM <= SURFACE_M
			? ground.warnLabel
			: null;
	const sidewalkEnds =
		warnName !== null &&
		warnName !== prevWarnName &&
		prevWalkPct >= SIDEWALK_MIN_PCT;
	prevWarnName = warnName;
	prevWalkPct = ground.bottomWalkablePct;

	// Wall: silent when far. Tracked across cycles so an approaching wall can be spoken.
	const wallM = ground.wallPct >= WALL_PCT ? ground.wallM : null;
	const wallApproaching =
		wallM != null && prevWallM != null && prevWallM - wallM >= APPROACH_M;
	prevWallM = wallM;

	// 1. Stairs (object). Warns from STAIRS_M. If no depth is available, still warns for safety.
	if (
		ground.hazardPct >= HAZARD_PCT &&
		(ground.hazardM == null || ground.hazardM <= STAIRS_M)
	) {
		return {
			key: "stairs",
			text: `Stairs ahead${distPhrase(ground.hazardM)}.`,
			urgent: true,
			reminder: "Stairs still ahead.",
		};
	}

	// 2. Two or more blockers: name the top two and give a direction that accounts for both.
	const blockers = collectBlockers(dets, wallM);
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
		// "Stop" is only used when there's no way around.
		return {
			key: `obstacle:${obstacle.zone}:stop`,
			text: `Obstacle ${loc}, ${dist}. Stop.`,
			urgent: true,
			reminder: `Obstacle still ${loc}. Stop.`,
		};
	}

	// 5. Single wall in the path. Only when it's close, or getting closer within near range.
	if (
		wallM != null &&
		(wallM < WALL_CLOSE_M || (wallApproaching && wallM < NEAR_M))
	) {
		const side = sideToStep("center", dets, ground);
		const word = wallApproaching ? "approaching" : "ahead";
		const dist = spokenDistance(wallM);
		if (side) {
			return {
				key: `wall:${side}`,
				text: `Wall ${word}, ${dist}. Move ${side}.`,
				urgent: true,
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
			text: `Door ahead${distPhrase(ground.doorM)}.`,
			urgent: false,
			reminder: "Door still ahead.",
		};
	}

	// 8. Surface change ahead: road, grass, dirt, or sand, within SURFACE_M. Heads-up only.
	if (warnName) {
		const name = cap(warnName);
		const dist = distPhrase(ground.warnM);
		return {
			key: `ground:${warnName}`,
			text: sidewalkEnds
				? `Sidewalk ends. ${name} ahead${dist}.`
				: `${name} ahead${dist}.`,
			urgent: false,
			reminder: `${name} still ahead.`,
		};
	}

	// 9. Clear
	return { key: "clear", text: "Path clear.", urgent: false, reminder: null };
}
