/**
 * Audio, haptic, and notification utilities for the rest timer.
 *
 * Uses the Web Audio API to synthesize a chime (no audio files needed),
 * the Vibration API for haptics, and the Notification API for
 * background alerts.
 */

export function playTimerChime(): void {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    const playTone = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startTime);

      gainNode.gain.setValueAtTime(0.3, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = audioContext.currentTime;
    playTone(880, now, 0.15);        // A5
    playTone(1109, now + 0.15, 0.3); // C#6
    playTone(1319, now + 0.3, 0.4);  // E6 — rising major triad
  } catch {
    // Audio not available — fail silently
  }
}

export function vibrateTimer(): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]); // vibrate-pause-vibrate pattern
    }
  } catch {
    // Vibration not available — fail silently
  }
}

export async function sendTimerNotification(): Promise<void> {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Rest Complete', {
        body: 'Time to start your next set!',
        tag: 'rest-timer', // replaces previous notification
      });
    }
  } catch {
    // Notifications not available
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if ('Notification' in window) {
      const result = await Notification.requestPermission();
      return result === 'granted';
    }
  } catch {
    // Permission request failed
  }
  return false;
}
