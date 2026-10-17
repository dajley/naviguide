import { startCamera, stopCamera } from "./camera.js";
import { loadModels, runSeg, runDepth, runSem, getBackend } from "./models.js";
import { frameToTensor } from "./preprocess.js";
import { decodeDetections } from "./detect.js";
import { depthAt } from "./depth.js";
import { analyzeSem } from "./sem.js";
import { decide, markApproaching, resetNavigation } from "./navigation.js";
import { unlockSpeech, say } from "./speech.js";
import { handleAlert, resetAlerts } from "./alerts.js";
import { SEM_EVERY } from "./config.js";
import { drawOverlay, clearOverlay } from "./overlay.js";
import { updateGeometry } from "./geometry.js";

// Shown in start and error messages so you can tell which build is running.
const BUILD = "timing-1";

const video = document.getElementById("camera");
const button = document.getElementById("toggle");
const status = document.getElementById("status");

let running = false;
let loopId = 0;
let busy = false;
let cycle = 0;
let lastGround = null;
let lastSemMap = null;
let prevMeters = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function describe(dets) {
	if (dets.length === 0) return "Nothing detected.";
	return (
		dets
			.slice(0, 5)
			.map((d) => {
				const name = d.kind === "moving" ? d.label : "obstacle";
				return `${name} ${d.zone} ${d.meters.toFixed(1)}m (${d.score.toFixed(2)})`;
			})
			.join(", ") + "."
	);
}

const fmt = (v) => (v == null ? "none" : v.toFixed(1));

// What the user needs to know about the ground: what they're standing on,
// what is ahead, and which bottom zones are walkable.
function describeGround(s) {
	const z = s.bottomWalkZones;
	const ahead =
		s.aheadM == null
			? (s.aheadSurface ?? "none")
			: `${s.aheadSurface} ${fmt(s.aheadM)}m`;
	return (
		`Under you: ${s.standingSurface ?? "unknown"}. Ahead: ${ahead}. ` +
		`Walk zones L${z.left} C${z.center} R${z.right}.`
	);
}

async function inferOnce() {
	busy = true;
	try {
		const t0 = performance.now();
		updateGeometry(video.videoWidth, video.videoHeight);
		const frame = frameToTensor(video);

		let t = performance.now();
		const segOut = await runSeg(frame);
		const tSeg = Math.round(performance.now() - t);

		t = performance.now();
		const depthOut = await runDepth(frame);
		const tDepth = Math.round(performance.now() - t);
		const depthMap = Object.values(depthOut)[0];

		// The semantic model runs every SEM_EVERY cycles. Its class map and ground state are reused in between.
		const fresh = cycle % SEM_EVERY === 0 || lastGround === null;
		let tSem = null;
		if (fresh) {
			t = performance.now();
			const semOut = await runSem(frame);
			tSem = Math.round(performance.now() - t);
			lastSemMap = Object.values(semOut)[0];
			lastGround = analyzeSem(lastSemMap, depthMap);
		}
		cycle++;
		const ms = Math.round(performance.now() - t0);

		const dets = decodeDetections(Object.values(segOut)[0]).map((d) => ({
			...d,
			meters: depthAt(depthMap, d.box),
		}));
		prevMeters = markApproaching(dets, prevMeters);

		const alert = decide(dets, lastGround, fresh);
		handleAlert(alert);
		drawOverlay(video, lastSemMap, alert.focus);

		const backend = getBackend();
		const semText = tSem === null ? "sem skipped" : `sem ${tSem} ms`;
		console.log("timing", backend, {
			seg: tSeg,
			depth: tDepth,
			sem: tSem,
			total: ms,
		});

		status.textContent =
			`[${BUILD} ${backend}] Alert: "${alert.text}" | ${describe(dets)} | ${describeGround(lastGround)} | ` +
			`seg ${tSeg} ms, depth ${tDepth} ms, ${semText}, total ${ms} ms`;
	} catch (err) {
		status.textContent = `[${BUILD}] Inference error: ${err.message}`;
	} finally {
		busy = false;
	}
}

// Runs analysis back to back. Each pass starts as soon as the previous one ends.
// The id check stops an old loop if Stop and Start are pressed quickly.
async function loop(id) {
	while (running && id === loopId) {
		if (video.readyState < 2 || busy) {
			await sleep(100);
			continue;
		}
		await inferOnce();
		await sleep(0);
	}
}

button.addEventListener("click", async () => {
	button.disabled = true;
	try {
		if (!running) {
			unlockSpeech();
			resetAlerts();
			resetNavigation();
			prevMeters = new Map();
			cycle = 0;
			lastGround = null;
			lastSemMap = null;
			status.textContent = `[${BUILD}] Starting camera…`;
			await startCamera(video);
			status.textContent = `[${BUILD}] Loading models…`;
			await loadModels();
			running = true;
			loopId++;
			button.textContent = "Stop";
			say("Navigation started.");
			loop(loopId);
		} else {
			running = false;
			loopId++;
			stopCamera(video);
			clearOverlay();
			button.textContent = "Start";
			status.textContent = `[${BUILD}] Camera off.`;
		}
	} catch (err) {
		status.textContent = `[${BUILD}] Error: ${err.name}. ${err.message}`;
	} finally {
		button.disabled = false;
	}
});
