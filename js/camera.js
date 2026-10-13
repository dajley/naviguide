let stream = null;

export async function startCamera(videoEl) {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera not available. The page must be served over HTTPS.");
    }

    stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 640 },
            height: { ideal: 480 },
        },
        audio: false,
    });

    videoEl.srcObject = stream;
    await videoEl.play();
    return { width: videoEl.videoWidth, height: videoEl.videoHeight };
}

export function stopCamera(videoEl) {
    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
    }
    videoEl.srcObject = null;
}