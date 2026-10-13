import { say } from "./speech.js";
import { REMINDER_MS, CONFIRM_CYCLES } from "./config.js";

let currentKey = null;
let lastSpoken = 0;
let pendingKey = null;
let pendingCount = 0;

export function resetAlerts() {
    currentKey = null;
    lastSpoken = 0;
    pendingKey = null;
    pendingCount = 0;
}

export function handleAlert(alert) {
    const now = Date.now();

    // Count how many cycles in a row this same situation has been detected.
    if (alert.key === pendingKey) {
        pendingCount++;
    } else {
        pendingKey = alert.key;
        pendingCount = 1;
    }

    // Non-urgent alerts must hold steady before they're spoken.
    if (!alert.urgent && pendingCount < CONFIRM_CYCLES) return;

    // New situation: speak it.
    if (alert.key !== currentKey) {
        if (say(alert.text, alert.urgent)) {
            currentKey = alert.key;
            lastSpoken = now;
        }
        return;
    }

    // Same situation still going: speak the short reminder after REMINDER_MS.
    if (alert.reminder && now - lastSpoken >= REMINDER_MS) {
        if (say(alert.reminder)) lastSpoken = now;
    }
}