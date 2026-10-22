// Tap page, then a spoken welcome before the main screen opens.
const FADE_MS = 600;

const intro = document.getElementById("intro");
const begin = document.getElementById("begin");
const welcome = document.getElementById("welcome");
const main = document.querySelector("main");

// Speaks text, then calls done. A timer backs it up in case the browser never reports the end.
function speak(text, done) {
	let finished = false;
	const finish = () => {
		if (finished) return;
		finished = true;
		done();
	};
	if (!("speechSynthesis" in window)) {
		setTimeout(finish, 1000);
		return;
	}
	const u = new SpeechSynthesisUtterance(text);
	u.lang = "en-US";
	u.onend = finish;
	u.onerror = finish;
	speechSynthesis.speak(u);
	setTimeout(finish, 1500 + text.length * 120);
}

function openMain() {
	intro.classList.add("leaving");
	setTimeout(() => {
		intro.hidden = true;
		main.removeAttribute("inert");
	}, FADE_MS);
}

export function startIntro() {
	begin.addEventListener(
		"click",
		() => {
			begin.hidden = true;
			welcome.hidden = false;
			speak("Welcome to NaViGuide.", () => {
				speak("Press Start to begin.", openMain);
			});
		},
		{ once: true },
	);
}
