// Voice commands with the browser's built-in speech recognition.
// Needs internet (Chrome sends audio to a speech service). Listens for
// "start navigation" and "stop navigation".
//
// "stop navigation" is always accepted, since the app never says it.
// "start navigation" is ignored while the app is speaking, so the intro
// ("Say start navigation...") can't start the app by itself.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const QUIET_AFTER_SPEECH_MS = 2000;

export function voiceSupported() {
	return !!SR;
}

export function createVoice({ onStart, onStop, onStatus }) {
	let wanted = false; // true once the user has tapped and voice should keep listening
	let quietUntil = 0;

	const say = (text) => onStatus?.(text);

	function isAppSpeaking() {
		return Date.now() < quietUntil || !!window.speechSynthesis?.speaking;
	}

	function handle(text) {
		const phrase = text.toLowerCase();
		if (phrase.includes("stop navigation")) {
			console.log("voice: stop");
			onStop?.();
		} else if (phrase.includes("start navigation") && !isAppSpeaking()) {
			console.log("voice: start");
			onStart?.();
		}
	}

	function safeStart(r) {
		try {
			r.start();
		} catch {
			// Already running, nothing to do.
		}
	}

	// Starts the recognizer once the app has finished speaking.
	function startWhenQuiet(r) {
		const tryStart = () => {
			if (!wanted) return;
			if (window.speechSynthesis?.speaking) {
				setTimeout(tryStart, 200);
				return;
			}
			safeStart(r);
		};
		setTimeout(tryStart, 500);
	}

	function build() {
		const r = new SR();
		r.lang = "en-US";
		r.continuous = true;
		r.interimResults = false;

		r.onresult = (event) => {
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i];
				if (!result.isFinal) continue;
				const text = result[0].transcript;
				console.log("voice heard:", JSON.stringify(text));
				handle(text);
			}
		};

		r.onerror = (event) => {
			console.warn("voice error:", event.error);
			if (
				event.error === "not-allowed" ||
				event.error === "service-not-allowed"
			) {
				wanted = false;
				say("Microphone is blocked. Use the Start button.");
			} else if (event.error === "network") {
				say("Voice commands need an internet connection.");
			}
		};

		r.onend = () => {
			// Chrome stops listening after a while, so restart it as long as the user wants it on.
			if (wanted) startWhenQuiet(r);
		};

		return r;
	}

	// Remember when the app last spoke, so "start navigation" is ignored just after it.
	setInterval(() => {
		if (window.speechSynthesis?.speaking) {
			quietUntil = Date.now() + QUIET_AFTER_SPEECH_MS;
		}
	}, 200);

	return {
		// Call from a tap. Browsers require a user gesture before the mic can start.
		listen() {
			if (!voiceSupported()) {
				say(
					"Voice commands are not supported in this browser. Use the Start button.",
				);
				return;
			}
			if (wanted) return;
			wanted = true;
			startWhenQuiet(build());
			say('Voice on. Say "start navigation" or "stop navigation".');
		},
	};
}
