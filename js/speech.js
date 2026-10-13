let voice = null;

function pickVoice() {
    const voices = speechSynthesis.getVoices();
    // The browser's default English voice if it runs on the device, so it works offline.
    // Otherwise the first English voice on the device.
    voice =
        voices.find((v) => v.default && v.localService && v.lang.startsWith("en")) ||
        voices.find((v) => v.localService && v.lang.startsWith("en")) ||
        null;
}

if ("speechSynthesis" in window) {
    pickVoice();
    speechSynthesis.addEventListener("voiceschanged", pickVoice);
}

// Call once from the Start tap. Browsers only allow speech after a user gesture.
export function unlockSpeech() {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}

// Speaks text and returns true if it was spoken.
// Normal alerts wait until the current speech finishes.
// Urgent alerts cancel the current speech and speak immediately.
export function say(text, urgent = false) {
    if (!("speechSynthesis" in window)) return false;
    if (speechSynthesis.speaking && !urgent) return false;
    if (urgent) speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
    } else {
        u.lang = "en-US";
    }
    u.rate = 1;
    u.pitch = 1;
    speechSynthesis.speak(u);
    return true;
}

// Lists the English voices this device offers, for choosing one later.
export function listVoices() {
    return speechSynthesis
        .getVoices()
        .filter((v) => v.lang.startsWith("en"))
        .map((v) => `${v.name} (${v.lang}, ${v.localService ? "offline" : "network"}${v.default ? ", default" : ""})`);
}