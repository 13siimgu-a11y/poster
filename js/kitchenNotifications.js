export function playNotification() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.frequency.value = 880;
        gain.gain.value = 0.05;
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.16);
    } catch {
        // Sound is best-effort until a real notification service is connected.
    }
}

export function dispatchKitchenUpdate(detail = {}) {
    window.dispatchEvent(new CustomEvent("kitchen:update", { detail }));
}
