let stream = null;

const LONG = 1280;
const SHORT = 720;
const GOOD_ENOUGH = 0.15; // how far off the screen's proportions a picture can be and still be accepted

// Width over height of the screen as it's held right now.
function screenAspect() {
	return window.innerWidth / window.innerHeight;
}

// How far a picture's proportions are from the screen's. 0 means they match.
function mismatch(width, height) {
	if (!width || !height) return Infinity;
	return Math.abs(Math.log(width / height / screenAspect()));
}

function request(width, height) {
	return navigator.mediaDevices.getUserMedia({
		video: {
			facingMode: { ideal: "environment" },
			width: { ideal: width },
			height: { ideal: height },
		},
		audio: false,
	});
}

function settingsOf(s) {
	const st = s.getVideoTracks()[0].getSettings();
	return { width: st.width ?? 0, height: st.height ?? 0 };
}

function stopStream(s) {
	s.getTracks().forEach((t) => t.stop());
}

export async function startCamera(videoEl) {
	if (!navigator.mediaDevices?.getUserMedia) {
		throw new Error(
			"Camera not available. The page must be served over HTTPS.",
		);
	}

	// Ask first for the shape that matches the screen: tall when held upright, wide when sideways.
	const upright = window.innerHeight >= window.innerWidth;
	const matchShape = upright ? [SHORT, LONG] : [LONG, SHORT];
	const otherShape = upright ? [LONG, SHORT] : [SHORT, LONG];

	let chosen = await request(...matchShape);
	let asked = matchShape;
	let fallback = false;

	const first = settingsOf(chosen);
	if (mismatch(first.width, first.height) > GOOD_ENOUGH) {
		// The picture came back with the wrong proportions. Try the opposite shape instead.
		stopStream(chosen);
		chosen = await request(...otherShape);
		asked = otherShape;
		fallback = true;
	}

	stream = chosen;
	videoEl.srcObject = stream;
	await videoEl.play();
	if (!videoEl.videoWidth) {
		await new Promise((resolve) => {
			videoEl.onloadedmetadata = () => resolve();
		});
	}

	const got = settingsOf(stream);
	return {
		vw: videoEl.videoWidth,
		vh: videoEl.videoHeight,
		tw: got.width,
		th: got.height,
		screen: `${window.innerWidth}x${window.innerHeight}`,
		asked: `${asked[0]}x${asked[1]}`,
		fallback,
	};
}

export function stopCamera(videoEl) {
	if (stream) {
		stopStream(stream);
		stream = null;
	}
	videoEl.srcObject = null;
}
