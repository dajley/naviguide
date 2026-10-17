import {
	WALKABLE_IDS,
	WARNING_IDS,
	HAZARD_IDS,
	DOOR_IDS,
	STRUCTURE_IDS,
} from "./config.js";
import { MODEL, geometry } from "./geometry.js";

const CAT_WALK = 1;
const CAT_WARN = 2;
const CAT_HAZARD = 3;
const CAT_DOOR = 4;
const CAT_STRUCT = 5;
const CAT_BY_NAME = {
	walk: CAT_WALK,
	warn: CAT_WARN,
	hazard: CAT_HAZARD,
	door: CAT_DOOR,
	structure: CAT_STRUCT,
};

// Display smoothing for the lead box only. Each frame moves the drawn box this fraction of the
// way toward the new detection: lower is steadier but lags more, higher follows more closely.
const LEAD_SMOOTH = 0.8;

// Category lookup from class ID. 0 means the class isn't drawn.
const CAT_OF = new Uint8Array(256);
for (const id of WALKABLE_IDS) CAT_OF[id] = CAT_WALK;
for (const id of WARNING_IDS) CAT_OF[id] = CAT_WARN;
for (const id of HAZARD_IDS) CAT_OF[id] = CAT_HAZARD;
for (const id of DOOR_IDS) CAT_OF[id] = CAT_DOOR;
for (const id of STRUCTURE_IDS) CAT_OF[id] = CAT_STRUCT;

// Colors as [r, g, b, alpha]. Walkable surfaces are a pale green, warning surfaces a deeper
// green, doors red, stairs dark red, and structures a blue fill.
const STYLE = {
	[CAT_WALK]: [120, 220, 120, 120],
	[CAT_WARN]: [0, 110, 40, 170],
	[CAT_HAZARD]: [150, 0, 0, 170],
	[CAT_DOOR]: [255, 60, 60, 160],
	[CAT_STRUCT]: [30, 120, 255, 130],
};
const OBJECT_RGB = { moving: [255, 140, 0], general: [170, 80, 255] };

const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

// Ground layer: the 640×640 class map, colored, drawn only for the categories in focus.
const groundCanvas = document.createElement("canvas");
groundCanvas.width = MODEL;
groundCanvas.height = MODEL;
const groundCtx = groundCanvas.getContext("2d");
const groundImage = groundCtx.createImageData(MODEL, MODEL);
const catMap = new Uint8Array(MODEL * MODEL);

let visible = true;

// Smoothed lead box, kept between frames. Reset when the lead changes or disappears.
let leadBox = null;
let leadKey = null;

export function overlayVisible() {
	return visible;
}

export function setOverlayVisible(v) {
	visible = v;
	canvas.style.display = v ? "block" : "none";
	if (!v) clearOverlay();
}

export function clearOverlay() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	leadBox = null;
	leadKey = null;
}

// Colors the class map. Walkable surfaces are always shown. Other categories are shown only
// when they're in the active set.
function drawGround(classTensor, active) {
	const src = classTensor.data;
	const n = MODEL * MODEL;
	for (let i = 0; i < n; i++) {
		const id = Math.round(src[i]);
		catMap[i] = id >= 0 && id < 256 ? CAT_OF[id] : 0;
	}

	const px = groundImage.data;
	for (let i = 0; i < n; i++) {
		const cat = catMap[i];
		const o = i * 4;
		px[o + 3] = 0;
		if (!cat) continue;
		if (cat !== CAT_WALK && !active.has(cat)) continue;

		const s = STYLE[cat];
		px[o] = s[0];
		px[o + 1] = s[1];
		px[o + 2] = s[2];
		px[o + 3] = s[3];
	}
	groundCtx.putImageData(groundImage, 0, 0);
}

// Moves the drawn lead box part of the way toward the newest detection.
// A different object starts fresh, so the box doesn't slide across the screen to a new target.
function smoothLeadBox(obj) {
	const key = `${obj.name}:${obj.moving ? "m" : "g"}`;
	if (!leadBox || leadKey !== key) {
		leadBox = [...obj.box];
	} else {
		leadBox = leadBox.map((v, i) => v + (obj.box[i] - v) * LEAD_SMOOTH);
	}
	leadKey = key;
	return leadBox;
}

// Highlights the lead object with a translucent fill, a soft white outline, and a small label.
function drawLead(obj, g, vw, vh) {
	const sx = vw / g.cw;
	const sy = vh / g.ch;
	const [x1, y1, x2, y2] = smoothLeadBox(obj);
	const x = (x1 - g.x0) * sx;
	const y = (y1 - g.y0) * sy;
	const w = (x2 - x1) * sx;
	const h = (y2 - y1) * sy;
	const [r, gg, b] = obj.moving ? OBJECT_RGB.moving : OBJECT_RGB.general;
	const lw = Math.max(4, Math.round(vh * 0.008));

	ctx.save();
	ctx.fillStyle = `rgba(${r}, ${gg}, ${b}, 0.28)`;
	ctx.fillRect(x, y, w, h);
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = lw;
	ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
	ctx.shadowBlur = lw * 2;
	ctx.strokeRect(x, y, w, h);
	ctx.restore();

	const fs = Math.max(12, Math.round(vh * 0.03));
	const text = `${obj.name} ${obj.meters.toFixed(1)}m`;
	ctx.font = `600 ${fs}px system-ui, sans-serif`;
	ctx.textBaseline = "top";
	const pad = 4;
	const tw = ctx.measureText(text).width + pad * 2;
	const top = Math.max(0, y - fs - pad * 2);
	ctx.fillStyle = `rgb(${r}, ${gg}, ${b})`;
	ctx.fillRect(x, top, tw, fs + pad * 2);
	ctx.fillStyle = "#000";
	ctx.fillText(text, x + pad, top + pad);
}

// Draws the overlay on top of the live video, aligned with the real picture.
// classTensor: the most recent class map (may be a few cycles old).
// focus: what the current alert is about, from navigation.js, or null.
export function drawOverlay(video, classTensor, focus) {
	if (!visible || !classTensor || video.videoWidth === 0) return;

	const vw = video.videoWidth;
	const vh = video.videoHeight;
	if (canvas.width !== vw || canvas.height !== vh) {
		canvas.width = vw;
		canvas.height = vh;
	}

	// No lead this frame: drop the smoothed box so the next lead starts clean.
	if (!focus?.object) {
		leadBox = null;
		leadKey = null;
	}

	const g = geometry();
	const active = new Set(
		(focus?.cats ?? []).map((name) => CAT_BY_NAME[name]).filter(Boolean),
	);
	drawGround(classTensor, active);

	ctx.clearRect(0, 0, vw, vh);
	ctx.imageSmoothingEnabled = true;
	ctx.drawImage(groundCanvas, g.x0, g.y0, g.cw, g.ch, 0, 0, vw, vh);

	if (focus?.object) drawLead(focus.object, g, vw, vh);
}
