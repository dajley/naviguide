const supported = "speechSynthesis" in window;
let voice = null;
let token = 0; // identifies the current utterance, so a cancelled one can't free the queue
let busy = false;
let onFree = null;
let watchdog = null;

function pickVoice() {
	const voices = speechSynthesis.getVoices();
	// The browser's default English voice if it runs on the device, so it works offline.
	// Otherwise the first English voice on the device.
	voice =
		voices.find(
			(v) => v.default && v.localService && v.lang.startsWith("en"),
		) ||
		voices.find((v) => v.localService && v.lang.startsWith("en")) ||
		null;
}

if (supported) {
	pickVoice();
	speechSynthesis.addEventListener("voiceschanged", pickVoice);
}

// Called by alerts.js when speech finishes, so a waiting message can be spoken.
export function setOnFree(cb) {
	onFree = cb;
}

// Call once from the Start tap. Browsers only allow speech after a user gesture.
export function unlockSpeech() {
	if (!supported) return;
	speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}

function finish(my) {
	if (my !== token) return;
	busy = false;
	clearTimeout(watchdog);
	if (onFree) onFree();
}

function speakRaw(text) {
	const my = ++token;
	const u = new SpeechSynthesisUtterance(text);
	if (voice) {
		u.voice = voice;
		u.lang = voice.lang;
	} else {
		u.lang = "en-US";
	}
	u.rate = 1;
	u.pitch = 1;
	u.onend = () => finish(my);
	u.onerror = () => finish(my);
	busy = true;
	// Safety net: if the browser never reports the end, free the queue after a rough estimate.
	clearTimeout(watchdog);
	watchdog = setTimeout(() => finish(my), 1500 + text.length * 90);
	speechSynthesis.speak(u);
}

// Speaks text and returns true if it started.
// Normal messages wait for the current speech to finish, and return false if it's still busy.
// Interrupting messages cancel the current speech and start right away.
export function speakText(text, interrupt = false) {
	if (!supported) return false;
	if (busy && !interrupt) return false;
	if (busy) speechSynthesis.cancel();
	speakRaw(text);
	return true;
}

// Kept for the Start button's "Navigation started." message.
export function say(text, urgent = false) {
	return speakText(text, urgent);
}

// Lists the English voices this device offers, for choosing one later.
export function listVoices() {
	return speechSynthesis
		.getVoices()
		.filter((v) => v.lang.startsWith("en"))
		.map(
			(v) =>
				`${v.name} (${v.lang}, ${v.localService ? "offline" : "network"}${v.default ? ", default" : ""})`,
		);
}
