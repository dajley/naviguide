// Opening sequence: logo and "Tap to continue", then the welcome (shown and spoken),
// then the main screen. Browsers only allow speech after a tap, so the first tap starts it.

const WELCOME = "Welcome to NaViGuide";
const PROMPT =
	"Instructions may lag by a few seconds. Say Navi start navigation or press Start to begin.";
const FADE_MS = 600;

const intro = document.getElementById("intro");
const begin = document.getElementById("begin");
const welcome = document.getElementById("welcome");
const main = document.querySelector("main");

// Speaks text, then calls done. A timed wait backs it up in case the browser
// never reports the end of the speech.
function speak(text, done) {
	let finished = false;
	const finish = () => {
		if (finished) return;
		finished = true;
		done();
	};

	if (!("speechSynthesis" in window)) {
		setTimeout(finish, 1500);
		return;
	}

	const u = new SpeechSynthesisUtterance(text);
	u.lang = "en-US";
	u.onend = finish;
	u.onerror = finish;
	speechSynthesis.speak(u);
	setTimeout(finish, 2000 + text.length * 120);
}

function openMain() {
	intro.classList.add("leaving");
	setTimeout(() => {
		intro.hidden = true;
		main.inert = false;
	}, FADE_MS);
}

// The first tap anywhere on the opening screen shows the welcome and speaks it,
// then the prompt, then opens the main screen.
export function startIntro() {
	begin.addEventListener(
		"click",
		() => {
			begin.hidden = true;
			welcome.hidden = false;
			speak(WELCOME, () => speak(PROMPT, openMain));
		},
		{ once: true },
	);
}
