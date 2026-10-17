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

// Bump this when you update the files, so the status line shows which build is running.
const BUILD = "overlay-5";

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

function describeGround(s) {
	const z = s.bottomWalkZones;
	const ahead =
		s.aheadM == null
			? (s.aheadSurface ?? "none")
			: `${s.aheadSurface} ${fmt(s.aheadM)}m`;
	return (
		`Under you: ${s.standingSurface ?? "unknown"}. Ahead: ${ahead}. ` +
		`Walk zones L${z.left} C${z.center} R${z.right}, wall ${s.wallPct}%, ` +
		`stairs ${s.hazardPct}%, door ${s.doorPct}%. ` +
		`distances: stairs ${fmt(s.hazardM)}, door ${fmt(s.doorM)}, wall ${fmt(s.wallM)}.`
	);
}

async function inferOnce() {
	busy = true;
	try {
		const t0 = performance.now();
		updateGeometry(video.videoWidth, video.videoHeight);
		const frame = frameToTensor(video);
		const segOut = await runSeg(frame);
		const depthOut = await runDepth(frame);
		const depthMap = Object.values(depthOut)[0];

		// The semantic model runs every SEM_EVERY cycles. Its class map and ground state are reused in between.
		const fresh = cycle % SEM_EVERY === 0 || lastGround === null;
		if (fresh) {
			const semOut = await runSem(frame);
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

		// The alert is decided first, so the overlay can highlight what it's about.
		const alert = decide(dets, lastGround, fresh);
		handleAlert(alert);
		drawOverlay(video, lastSemMap, alert.focus);

		status.textContent = `[${BUILD} ${getBackend()}] Alert: "${alert.text}" | ${describe(dets)} | ${describeGround(lastGround)} | ${ms} ms`;
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
