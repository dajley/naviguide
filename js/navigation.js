import { CLOSE_M, NEAR_M, APPROACH_M, MIN_WALK_PCT, WARN_PCT, HAZARD_PCT, DOOR_PCT } from "./config.js";

const OPPOSITE = { left: "right", right: "left" };

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const where = (zone) => (zone === "center" ? "ahead" : `on your ${zone}`);
const distWord = (m) => (m < CLOSE_M ? "close" : "near");

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

// Picks the side to step to. An obstacle on the left means stepping right, and the reverse.
// A center obstacle can go either way. A side needs enough walkable ground
// and no close obstacle of its own.
function sideToStep(zone, dets, ground) {
    const options = zone === "center" ? ["left", "right"] : [OPPOSITE[zone]];
    const ok = options.filter(
        (s) =>
            ground.bottomWalkZones[s] >= MIN_WALK_PCT &&
            !dets.some((d) => d.zone === s && d.meters < CLOSE_M)
    );
    ok.sort((a, b) => ground.bottomWalkZones[b] - ground.bottomWalkZones[a]);
    return ok[0] ?? null;
}

// Returns the single alert for this cycle, highest priority first.
// key: identifies the situation, so the same alert isn't spoken again
// text: what to say
// urgent: speak right away, interrupting anything being said
// reminder: shorter text spoken if the same situation continues
export function decide(dets, ground) {
    // 1. Stairs
    if (ground.hazardPct >= HAZARD_PCT) {
        return { key: "stairs", text: "Stairs ahead.", urgent: true, reminder: "Stairs still ahead." };
    }

    // 2. Moving object that is close or approaching
    const moving = dets
        .filter((d) => d.kind === "moving" && d.meters < NEAR_M)
        .sort((a, b) => a.meters - b.meters)[0];
    if (moving) {
        const who = cap(moving.label);
        const word = moving.approaching ? "approaching" : distWord(moving.meters);
        return {
            key: `moving:${moving.label}:${moving.zone}`,
            text: `${who} ${word}, ${where(moving.zone)}.`,
            urgent: moving.approaching || moving.meters < CLOSE_M,
            reminder: `${who} still ${where(moving.zone)}.`,
        };
    }

    // 3. General obstacle that is close
    const obstacle = dets
        .filter((d) => d.kind === "general" && d.meters < CLOSE_M)
        .sort((a, b) => a.meters - b.meters)[0];
    if (obstacle) {
        const loc = where(obstacle.zone);
        const side = sideToStep(obstacle.zone, dets, ground);
        if (side) {
            return {
                key: `obstacle:${obstacle.zone}:${side}`,
                text: `Obstacle ${loc}. Move ${side}.`,
                urgent: true,
                reminder: `Obstacle still ${loc}.`,
            };
        }
        // "Stop" is only used when there's no way around.
        return {
            key: `obstacle:${obstacle.zone}:stop`,
            text: `Obstacle ${loc}. Stop.`,
            urgent: true,
            reminder: `Obstacle still ${loc}. Stop.`,
        };
    }

    // 4. Road or grass ahead
    if (ground.bottomWarningPct >= WARN_PCT) {
        return {
            key: "warning",
            text: "Caution. Road or grass ahead.",
            urgent: false,
            reminder: "Road or grass still ahead.",
        };
    }

    // 5. Door
    if (ground.doorPct >= DOOR_PCT) {
        return { key: "door", text: "Door ahead.", urgent: false, reminder: "Door still ahead." };
    }

    // 6. General obstacle near, in the center
    const near = dets.find((d) => d.kind === "general" && d.zone === "center" && d.meters < NEAR_M);
    if (near) {
        return {
            key: "obstacle:near",
            text: "Obstacle ahead, near.",
            urgent: false,
            reminder: "Obstacle still ahead.",
        };
    }

    // 7. Clear. Spoken once when the path changes to clear, with no reminder.
    return { key: "clear", text: "Path clear.", urgent: false, reminder: null };
}