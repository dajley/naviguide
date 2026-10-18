import {
	WALKABLE_IDS,
	WARNING_IDS,
	HAZARD_IDS,
	DOOR_IDS,
	STRUCTURE_IDS,
} from "./config.js";
import { MODEL, TURN, geometry } from "./geometry.js";

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

// The one canvas the user sees. It holds the upright camera picture, with the overlay drawn on
// top. The <video> element is only a source and is kept out of sight (see styles.css).
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

// Hides or shows the colored overlay only. The camera picture stays on screen either way.
export function setOverlayVisible(v) {
	visible = v;
	if (!v) resetLead();
}

// Resets the smoothed lead box. The picture is redrawn every frame, so nothing else needs clearing.
export function clearOverlay() {
	resetLead();
}

function resetLead() {
	leadBox = null;
	leadKey = null;
}

// Draws the camera frame onto the canvas, turned upright when needed. The canvas is already the
// upright size. When turned, the video is drawn at its own size, centered, then rotated by TURN.
function drawFrame(video, turn, vw, vh) {
	const uw = canvas.width;
	const uh = canvas.height;
	ctx.save();
	if (turn) {
		ctx.translate(uw / 2, uh / 2);
		ctx.rotate(TURN);
		ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
	} else {
		ctx.drawImage(video, 0, 0, uw, uh);
	}
	ctx.fillStyle = "#ff0000";
	ctx.font = `bold ${Math.round(vh * 0.08)}px sans-serif`;
	ctx.fillText("TOP", -vw / 2 + 20, -vh / 2 + vh * 0.1);
	ctx.restore();
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
// Coordinates are mapped from the model's letterboxed square to the upright picture.
function drawLead(obj, g, uw, uh) {
	const sx = uw / g.cw;
	const sy = uh / g.ch;
	const [x1, y1, x2, y2] = smoothLeadBox(obj);
	const x = (x1 - g.x0) * sx;
	const y = (y1 - g.y0) * sy;
	const w = (x2 - x1) * sx;
	const h = (y2 - y1) * sy;
	const [r, gg, b] = obj.moving ? OBJECT_RGB.moving : OBJECT_RGB.general;
	const lw = Math.max(4, Math.round(uh * 0.008));

	ctx.save();
	ctx.fillStyle = `rgba(${r}, ${gg}, ${b}, 0.28)`;
	ctx.fillRect(x, y, w, h);
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = lw;
	ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
	ctx.shadowBlur = lw * 2;
	ctx.strokeRect(x, y, w, h);
	ctx.restore();

	const fs = Math.max(12, Math.round(uh * 0.03));
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

// Draws the camera picture, with the overlay on top, onto the one visible canvas.
// classTensor: the most recent class map (may be a few cycles old), or null before the first.
// focus: what the current alert is about, from navigation.js, or null.
// turn: true when the frame was turned upright for the models.
export function drawOverlay(video, classTensor, focus, turn = false) {
	const vw = video.videoWidth;
	const vh = video.videoHeight;
	if (!vw || !vh) return;

	// The upright picture is the camera frame with width and height swapped when turned.
	const uw = turn ? vh : vw;
	const uh = turn ? vw : vh;
	if (canvas.width !== uw || canvas.height !== uh) {
		canvas.width = uw;
		canvas.height = uh;
	}

	// The picture always shows, even before the first class map or when the overlay is hidden.
	drawFrame(video, turn, vw, vh);
	ctx.font = "16px system-ui, sans-serif";
	ctx.fillStyle = "#ff0";
	ctx.fillText(`${vw}x${vh} turn=${turn}`, 8, 22);

	if (!visible || !classTensor) {
		resetLead();
		return;
	}
	// No lead this frame: drop the smoothed box so the next lead starts clean.
	if (!focus?.object) resetLead();

	const g = geometry();
	const active = new Set(
		(focus?.cats ?? []).map((name) => CAT_BY_NAME[name]).filter(Boolean),
	);
	drawGround(classTensor, active);
	ctx.drawImage(groundCanvas, g.x0, g.y0, g.cw, g.ch, 0, 0, uw, uh);

	if (focus?.object) drawLead(focus.object, g, uw, uh);
}
