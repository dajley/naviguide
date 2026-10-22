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
import { setOverlay, startDisplay, stopDisplay } from "./overlay.js";
import { updateGeometry } from "./geometry.js";
import { startIntro } from "./intro.js";

// Spoken as a safety message while the phone is held sideways.
const UPRIGHT_MSG = "Hold your phone upright.";

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

// True when a phone or tablet is held sideways. Laptops and desktops are skipped,
// since they are always horizontal. Uses the screen orientation, and falls back
// to the window shape if the browser doesn't report an orientation.
function isHorizontal() {
	if (!(navigator.maxTouchPoints > 0)) return false;
	const type = screen.orientation?.type;
	if (type) return type.startsWith("landscape");
	return window.innerWidth > window.innerHeight;
}

// Runs one model and returns its output along with how long it took.
async function timed(run) {
	const t = performance.now();
	const out = await run();
	return { out, ms: Math.round(performance.now() - t) };
}

async function inferOnce() {
	busy = true;
	try {
		const t0 = performance.now();
		updateGeometry(video.videoWidth, video.videoHeight);
		const frame = frameToTensor(video);

		// The models run one after another. ONNX Runtime web does not allow overlapping runs across sessions.
		const seg = await timed(() => runSeg(frame));
		const depth = await timed(() => runDepth(frame));

		// The semantic model runs every SEM_EVERY cycles. Its class map and ground state are reused in between.
		const fresh = cycle % SEM_EVERY === 0 || lastGround === null;
		const sem = fresh ? await timed(() => runSem(frame)) : null;

		const depthMap = Object.values(depth.out)[0];
		if (sem) {
			lastSemMap = Object.values(sem.out)[0];
			lastGround = analyzeSem(lastSemMap, depthMap);
		}
		cycle++;
		const ms = Math.round(performance.now() - t0);

		const dets = decodeDetections(Object.values(seg.out)[0]).map((d) => ({
			...d,
			meters: depthAt(depthMap, d.box),
		}));
		prevMeters = markApproaching(dets, prevMeters);

		let alert = decide(dets, lastGround, fresh);
		if (isHorizontal()) {
			// A safety message: it repeats every REMINDER_MS until the phone is upright again.
			alert = {
				...alert,
				key: "orientation",
				text: UPRIGHT_MSG,
				tier: 1,
				topic: null,
				safety: true,
				reminder: UPRIGHT_MSG,
			};
		}
		handleAlert(alert);
		setOverlay(lastSemMap, alert.focus);

		// Timings and the backend go to the console. The status line stays focused on navigation.
		const backend = getBackend();
		console.log("timing", backend, {
			seg: seg.ms,
			depth: depth.ms,
			sem: sem ? sem.ms : null,
			total: ms,
		});

		status.textContent = `Alert: "${alert.text}" | ${describe(dets)} | ${describeGround(lastGround)}`;
	} catch (err) {
		status.textContent = `Inference error: ${err.message}`;
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
			status.textContent = "Starting camera…";
			await startCamera(video);
			startDisplay(video);
			status.textContent = "Loading models…";
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
			stopDisplay();
			button.textContent = "Start";
			status.textContent = "Camera off.";
		}
	} catch (err) {
		status.textContent = `Error: ${err.name}. ${err.message}`;
	} finally {
		button.disabled = false;
	}
});

startIntro();
