// Voice commands for "start navigation" and "stop navigation", using Vosk.
// Vosk runs on the phone's CPU, so it works offline once the model is cached.

const MODEL_PATH = "models/vosk-model-small-en-us.tar.gz";
const START_PHRASE = "start navigation";
const STOP_PHRASE = "stop navigation";

// Ignore speech for this long after the app stops talking, so "Navigation started."
// can't trigger a command.
const QUIET_AFTER_SPEECH_MS = 1500;

// Lowercase, remove punctuation, and collapse spaces.
function normalize(text) {
	return text
		.toLowerCase()
		.replace(/[^a-z\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function voiceSupported() {
	return Boolean(window.Vosk && navigator.mediaDevices?.getUserMedia);
}

// onStart and onStop are the same functions the buttons call.
// onStatus shows a short message on the status line if voice can't start.
export function createVoice({ onStart, onStop, onStatus }) {
	if (!voiceSupported()) return null;

	let recognizer = null;
	let audioContext = null;
	let loading = null;
	let failed = false;
	let lastSpoke = 0;

	setInterval(() => {
		if (speechSynthesis.speaking) lastSpoke = Date.now();
	}, 250);

	function appIsSpeaking() {
		return (
			speechSynthesis.speaking || Date.now() - lastSpoke < QUIET_AFTER_SPEECH_MS
		);
	}

	function handleText(text) {
		if (!text || appIsSpeaking()) return;
		if (text.includes(STOP_PHRASE)) {
			onStop();
		} else if (text.includes(START_PHRASE)) {
			onStart();
		}
	}

	async function setup() {
		// Microphone first, while the tap that started this is still recent.
		const stream = await navigator.mediaDevices.getUserMedia({
			video: false,
			audio: {
				channelCount: 1,
				sampleRate: 16000,
				echoCancellation: true,
				noiseSuppression: true,
			},
		});
		audioContext = new AudioContext({ sampleRate: 16000 });
		const source = audioContext.createMediaStreamSource(stream);
		const processor = audioContext.createScriptProcessor(4096, 1, 1);
		processor.onaudioprocess = (event) => {
			if (!recognizer) return;
			try {
				recognizer.acceptWaveform(event.inputBuffer);
			} catch (err) {
				console.warn("voice audio error:", err);
			}
		};
		source.connect(processor);
		// Chrome only runs the processor when it's connected to the output.
		// The processor writes silence, so nothing is played.
		processor.connect(audioContext.destination);

		// Load the speech model. It's cached after the first download.
		const modelUrl = new URL(MODEL_PATH, document.baseURI).href;
		const model = await Vosk.createModel(modelUrl);
		recognizer = new model.KaldiRecognizer();
		recognizer.on("result", (message) => {
			handleText(normalize(message.result?.text ?? ""));
		});
	}

	function fail(err) {
		failed = true;
		console.warn("voice unavailable:", err);
		onStatus?.("Voice commands unavailable. Use the buttons.");
	}

	return {
		// Call on each tap. Chrome only allows the microphone after a tap,
		// and audio can pause in the background, so resume it each time.
		listen() {
			if (failed) return;
			audioContext?.resume();
			if (!loading) loading = setup().catch(fail);
		},
	};
}
