import { WALKABLE_IDS, WARNING_IDS, HAZARD_IDS, DOOR_ID } from "./config.js";

const SIZE = 640;
const BOTTOM_START = Math.round(SIZE * 2 / 3); // bottom third: the ground right in front of the user

// Reads the [1, 640, 640] class-ID map and summarizes it.
// Returns percentages of the whole frame and of the bottom third, split into left, center, right.
export function analyzeSem(t) {
    const d = t.data;
    const total = SIZE * SIZE;
    const counts = new Map();
    let walk = 0, warn = 0, hazard = 0, door = 0;
    const bottom = { left: 0, center: 0, right: 0, walk: 0, warn: 0, total: 0 };

    for (let i = 0; i < total; i++) {
        const id = Math.round(d[i]);
        counts.set(id, (counts.get(id) || 0) + 1);

        if (WALKABLE_IDS.has(id)) walk++;
        else if (WARNING_IDS.has(id)) warn++;
        else if (HAZARD_IDS.has(id)) hazard++;
        else if (id === DOOR_ID) door++;

        const row = Math.floor(i / SIZE);
        const col = i % SIZE;
        if (row >= BOTTOM_START) {
            const zone = col < SIZE / 3 ? "left" : col < 2 * SIZE / 3 ? "center" : "right";
            bottom.total++;
            if (WALKABLE_IDS.has(id)) {
                bottom.walk++;
                bottom[zone]++;
            } else if (WARNING_IDS.has(id)) {
                bottom.warn++;
            }
        }
    }

    const pct = (n, of) => Math.round((100 * n) / of);
    const topIds = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, n]) => `${id}:${pct(n, total)}%`)
        .join(" ");

    return {
        walkablePct: pct(walk, total),
        warningPct: pct(warn, total),
        hazardPct: pct(hazard, total),
        doorPct: pct(door, total),
        bottomWalkablePct: pct(bottom.walk, bottom.total),
        bottomWarningPct: pct(bottom.warn, bottom.total),
        bottomWalkZones: {
            left: pct(bottom.left, bottom.total),
            center: pct(bottom.center, bottom.total),
            right: pct(bottom.right, bottom.total),
        },
        topIds,
    };
}