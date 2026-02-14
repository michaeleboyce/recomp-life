// Simple timer worker that sends tick messages
// Runs in a separate thread so it stays accurate when the browser tab
// is backgrounded or the phone screen locks.
let intervalId = null;
let remaining = 0;
let startTime = 0;
let totalDuration = 0;

self.onmessage = function (e) {
  const { type, duration, seconds } = e.data;

  if (type === "start") {
    remaining = duration;
    totalDuration = duration;
    startTime = Date.now();

    if (intervalId) clearInterval(intervalId);

    intervalId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      remaining = totalDuration - elapsed;
      self.postMessage({ type: "tick", remaining, elapsed });

      if (remaining <= 0 && remaining > -1) {
        self.postMessage({ type: "complete" });
      }
    }, 250); // tick 4x per second for smooth display
  }

  if (type === "stop") {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  if (type === "add") {
    totalDuration += seconds;
    // Recalculate from original start time — the next tick will pick up the new totalDuration
  }
};
