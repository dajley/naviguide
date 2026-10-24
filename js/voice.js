// Voice commands and questions, using Moonshine (offline speech recognition).
// Every command starts with "Navi". "Navi" alone opens a short window for a question.
import * as Moonshine from "./vendor/moonshine/moonshine.min.js";

const MODEL_PATH = "models/moonshine-base";
const QUESTION_WINDOW_MS = 6000;
const QUIET_AFTER_SPEECH_MS = 2000;

export function createVoice({
	onStart,
	onStop,
	onQuestionOpen,
	onQuestionTimeout,
	onQuestion,
	onStatus,
}) {
	let transcriber = null;
	let questionOpen = false;
	let questionTimer = null;
	let quietUntil = 0;

	// The app's own speech is ignored, so it can't trigger a command.
	setInterval(() => {
		if (window.speechSynthesis?.speaking) {
			quietUntil = Date.now() + QUIET_AFTER_SPEECH_MS;
		}
	}, 200);

	function isAppSpeaking() {
		return Date.now() < quietUntil || !!window.speechSynthesis?.speaking;
	}

	function openQuestion() {
		questionOpen = true;
		clearTimeout(questionTimer);
		questionTimer = setTimeout(() => {
			questionOpen = false;
			onQuestionTimeout?.();
		}, QUESTION_WINDOW_MS);
		onQuestionOpen?.();
	}

	function handle(text) {
		console.log("committed:", text);
		if (isAppSpeaking()) return;
		const phrase = text
			.toLowerCase()
			.replace(/[^a-z ]/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		if (!phrase) return;

		// The phrase right after "Navi" is the question.
		if (questionOpen) {
			questionOpen = false;
			clearTimeout(questionTimer);
			onQuestion?.(phrase);
			return;
		}

		// Only phrases that start with the word "navi" count. "Navigation" alone doesn't match.
		if (!/^navi\b/.test(phrase)) return;
		const rest = phrase.replace(/^navi\b/, "").trim();
		if (rest === "") openQuestion();
		else if (rest === "start navigation") onStart?.();
		else if (rest === "stop navigation") onStop?.();
		// Anything else after "navi" is ignored.
	}

	return {
		async listen() {
			if (transcriber) return;
			try {
				onStatus?.("Loading voice model. This can take a moment.");
				transcriber = new Moonshine.MicrophoneTranscriber(
					MODEL_PATH,
					{
						onTranscriptionUpdated: (text) => console.log("updated:", text),
						onTranscriptionCommitted: handle,
					},
					true,
				);
				await transcriber.start();
				onStatus?.('Voice on. Say "Navi start navigation" to begin.');
			} catch (err) {
				transcriber = null;
				onStatus?.(`Voice unavailable: ${err.message}`);
			}
		},
	};
}
