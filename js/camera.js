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
