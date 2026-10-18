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

const canvas = document.getElementById("overlay");
const camera = document.getElementById("camera");
const ctx = canvas.getContext("2d");

// Upright picture: the ground layer and lead box are drawn here first, in the upright shape.
const uprightCanvas = document.createElement("canvas");
const uprightCtx = uprightCanvas.getContext("2d");

// Ground layer: the 640×640 class map, colored, drawn only for the categories in focus.
const groundCanvas = document.createElement("canvas");
groundCanvas.width = MODEL;
groundCanvas.height = MODEL;
const groundCtx = groundCanvas.getContext("2d");
const groundImage = groundCtx.createImageData(MODEL, MODEL);
const catMap = new Uint8Array(MODEL * MODEL);

const TURN_DEG = (TURN * 180) / Math.PI;

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

// Places the video and overlay on screen. When turned, both are sized in the camera's shape and
// then turned by TURN, so the picture appears upright. When not turned, the styles are cleared
// and the stylesheet's layout applies.
function layoutElements(turn) {
	const stage = canvas.parentElement;
	for (const el of [camera, canvas]) {
		if (!turn) {
			el.style.cssText = "";
			continue;
		}
		el.style.cssText =
			"left:50%;top:50%;right:auto;bottom:auto;" +
			`width:${stage.clientHeight}px;height:${stage.clientWidth}px;` +
			`transform:translate(-50%,-50%) rotate(${TURN_DEG}deg);`;
	}
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
// Drawn onto the target context, in the upright picture's size.
function drawLead(target, obj, g, uw, uh) {
	const sx = uw / g.cw;
	const sy = uh / g.ch;
	const [x1, y1, x2, y2] = smoothLeadBox(obj);
	const x = (x1 - g.x0) * sx;
	const y = (y1 - g.y0) * sy;
	const w = (x2 - x1) * sx;
	const h = (y2 - y1) * sy;
	const [r, gg, b] = obj.moving ? OBJECT_RGB.moving : OBJECT_RGB.general;
	const lw = Math.max(4, Math.round(uh * 0.008));

	target.save();
	target.fillStyle = `rgba(${r}, ${gg}, ${b}, 0.28)`;
	target.fillRect(x, y, w, h);
	target.strokeStyle = "#ffffff";
	target.lineWidth = lw;
	target.shadowColor = "rgba(255, 255, 255, 0.9)";
	target.shadowBlur = lw * 2;
	target.strokeRect(x, y, w, h);
	target.restore();

	const fs = Math.max(12, Math.round(uh * 0.03));
	const text = `${obj.name} ${obj.meters.toFixed(1)}m`;
	target.font = `600 ${fs}px system-ui, sans-serif`;
	target.textBaseline = "top";
	const pad = 4;
	const tw = target.measureText(text).width + pad * 2;
	const top = Math.max(0, y - fs - pad * 2);
	target.fillStyle = `rgb(${r}, ${gg}, ${b})`;
	target.fillRect(x, top, tw, fs + pad * 2);
	target.fillStyle = "#000";
	target.fillText(text, x + pad, top + pad);
}

// Draws the overlay on top of the live video, aligned with the real picture.
// classTensor: the most recent class map (may be a few cycles old).
// focus: what the current alert is about, from navigation.js, or null.
// turn: true when the frame was turned upright for the models.
export function drawOverlay(video, classTensor, focus, turn = false) {
	if (!visible || !classTensor || video.videoWidth === 0) return;

	const vw = video.videoWidth;
	const vh = video.videoHeight;
	// The upright picture is the camera frame with its width and height swapped when turned.
	const uw = turn ? vh : vw;
	const uh = turn ? vw : vh;

	if (canvas.width !== vw || canvas.height !== vh) {
		canvas.width = vw;
		canvas.height = vh;
	}
	if (uprightCanvas.width !== uw || uprightCanvas.height !== uh) {
		uprightCanvas.width = uw;
		uprightCanvas.height = uh;
	}

	layoutElements(turn);

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

	// Draw the upright picture first: the ground layer, then the lead box.
	uprightCtx.clearRect(0, 0, uw, uh);
	uprightCtx.imageSmoothingEnabled = true;
	uprightCtx.drawImage(groundCanvas, g.x0, g.y0, g.cw, g.ch, 0, 0, uw, uh);
	if (focus?.object) drawLead(uprightCtx, focus.object, g, uw, uh);

	// Then place it on the camera-shaped canvas. It's turned back by -TURN here, so the
	// CSS turn on screen brings it upright.
	ctx.clearRect(0, 0, vw, vh);
	if (turn) {
		ctx.save();
		ctx.translate(vw / 2, vh / 2);
		ctx.rotate(-TURN);
		ctx.drawImage(uprightCanvas, -uw / 2, -uh / 2, uw, uh);
		ctx.restore();
	} else {
		ctx.drawImage(uprightCanvas, 0, 0, uw, uh);
	}
}
