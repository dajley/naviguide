// Asks the camera for its default picture. The app accepts whatever picture the camera
// gives, and the models fit any size into their 640px square.

let stream = null;

export async function startCamera(videoEl) {
	if (!navigator.mediaDevices?.getUserMedia) {
		throw new Error(
			"Camera not available. The page must be served over HTTPS.",
		);
	}

	stream = await navigator.mediaDevices.getUserMedia({
		video: { facingMode: { ideal: "environment" } },
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
