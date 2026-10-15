import { startCamera, stopCamera } from "./camera.js";
import { loadModels, runSeg, runDepth, runSem } from "./models.js";
import { frameToTensor } from "./preprocess.js";
import { decodeDetections } from "./detect.js";
import { depthRange, depthAt } from "./depth.js";
import { analyzeSem } from "./sem.js";
import { decide, markApproaching, resetNavigation } from "./navigation.js";
import { unlockSpeech, say } from "./speech.js";
import { handleAlert, resetAlerts } from "./alerts.js";

// Bump this number whenever you update the files. If the status line
// doesn't show the new number, the browser is still running old code.
const BUILD = "wall-1";

const video = document.getElementById("camera");
const button = document.getElementById("toggle");
const status = document.getElementById("status");

let running = false;
let loopId = 0;
let busy = false;
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

function fmt(v) {
	return v == null ? "none" : v.toFixed(1);
}

function describeGround(s) {
	const z = s.bottomWalkZones;
	return (
		`Ground: walkable ${s.bottomWalkablePct}% ` +
		`(left ${z.left}, center ${z.center}, right ${z.right}), ` +
		`warning ${s.bottomWarningPct}%, stairs ${s.hazardPct}%, door ${s.doorPct}%, ` +
		`wall ${s.wallPct}%. ` +
		`distances: stairs ${fmt(s.hazardM)}, door ${fmt(s.doorM)}, ` +
		`warn ${fmt(s.warnM)}, wall ${fmt(s.wallM)}.`
	);
}

async function inferOnce() {
	busy = true;
	try {
		const t0 = performance.now();
		const frame = frameToTensor(video);
		const segOut = await runSeg(frame);
		const depthOut = await runDepth(frame);
		const semOut = await runSem(frame);
		const ms = Math.round(performance.now() - t0);

		const depthMap = Object.values(depthOut)[0];
		const dets = decodeDetections(Object.values(segOut)[0]).map((d) => ({
			...d,
			meters: depthAt(depthMap, d.box),
		}));
		prevMeters = markApproaching(dets, prevMeters);
		const ground = analyzeSem(Object.values(semOut)[0], depthMap);

		const alert = decide(dets, ground);
		handleAlert(alert);

		status.textContent = `[${BUILD}] Alert: "${alert.text}" | ${describe(dets)} | ${describeGround(ground)} | ${ms} ms`;
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
			button.textContent = "Start";
			status.textContent = `[${BUILD}] Camera off.`;
		}
	} catch (err) {
		status.textContent = `[${BUILD}] Error: ${err.name}. ${err.message}`;
	} finally {
		button.disabled = false;
	}
});
