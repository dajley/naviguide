import { speakText, setOnFree } from "./speech.js";
import { confirmSpoken } from "./navigation.js";
import { REMINDER_MS, INFO_GAP_MS } from "./config.js";

let currentKey = null;
let lastSpokenAt = 0;
let lastInfoAt = 0;
let queued = null; // { key, text, tier }. Only the newest message is kept.

// Speaks the queued message once speech is free. Sentences are never cut off.
// Information messages (tier 3) also wait until INFO_GAP_MS has passed since the last one.
function attempt() {
	if (!queued) return;
	if (queued.key !== currentKey) {
		queued = null;
		return;
	}
	const now = Date.now();
	if (queued.tier === 3 && now - lastInfoAt < INFO_GAP_MS) return;
	if (speakText(queued.text)) {
		if (queued.tier === 3) lastInfoAt = now;
		lastSpokenAt = now;
		if (queued.key.startsWith("on:")) confirmSpoken(queued.key);
		queued = null;
	}
}

// Called by speech.js when speech finishes, so a waiting message can be spoken.
setOnFree(attempt);

export function resetAlerts() {
	currentKey = null;
	lastSpokenAt = 0;
	lastInfoAt = 0;
	queued = null;
}

export function handleAlert(alert) {
	const now = Date.now();
	if (alert.key !== currentKey) {
		// A new situation replaces anything still waiting, so stale messages are dropped.
		currentKey = alert.key;
		queued = alert.text
			? { key: alert.key, text: alert.text, tier: alert.tier }
			: null;
	} else if (!queued && alert.reminder && now - lastSpokenAt >= REMINDER_MS) {
		queued = { key: alert.key, text: alert.reminder, tier: alert.tier };
	}
	attempt();
}
