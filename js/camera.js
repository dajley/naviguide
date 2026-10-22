// Phones get a vertical picture when held upright. Laptops get a wide one, because
// their webcams are wide and asking for a vertical picture makes the browser crop it.
// The app accepts whatever picture the camera gives, and the models fit any size
// into their 640px square.
const PHONE_SIZE = { width: 720, height: 1280 };
const LAPTOP_SIZE = { width: 1280, height: 720 };

let stream = null;

function wantedSize() {
	const isPhone = navigator.maxTouchPoints > 0;
	const upright = window.innerHeight >= window.innerWidth;
	return isPhone && upright ? PHONE_SIZE : LAPTOP_SIZE;
}

export async function startCamera(videoEl) {
	if (!navigator.mediaDevices?.getUserMedia) {
		throw new Error(
			"Camera not available. The page must be served over HTTPS.",
		);
	}

	const size = wantedSize();
	stream = await navigator.mediaDevices.getUserMedia({
		video: {
			facingMode: { ideal: "environment" },
			width: { ideal: size.width },
			height: { ideal: size.height },
		},
		audio: false,
	});

	videoEl.srcObject = stream;
	await videoEl.play();
	if (!videoEl.videoWidth) {
		await new Promise((resolve) => {
			videoEl.onloadedmetadata = () => resolve();
		});
	}
}

export function stopCamera(videoEl) {
	if (stream) {
		stream.getTracks().forEach((t) => t.stop());
		stream = null;
	}
	videoEl.srcObject = null;
}
