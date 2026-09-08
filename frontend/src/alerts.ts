let context: AudioContext | null = null;
const announced = new Set<string>();
export async function prepareAudio() {
  if (typeof AudioContext === "undefined")
    throw new Error("This browser does not support timer sounds.");
  context ??= new AudioContext();
  if (context.state === "suspended") await context.resume();
}
export function chime() {
  if (!context || context.state !== "running") return;
  const audio = context;
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const o = audio.createOscillator(),
      g = audio.createGain(),
      t = audio.currentTime + index * 0.16;
    o.frequency.value = frequency;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    o.connect(g);
    g.connect(audio.destination);
    o.start(t);
    o.stop(t + 0.7);
  });
}
export function completionAlert(p: {
  sound?: boolean;
  notifications?: boolean;
  id: string;
  deadline: number;
  userId: string;
  focus: boolean;
}) {
  const identity=`${p.userId}:${p.id}`;
  if(announced.has(identity))return;
  announced.add(identity);
  if(announced.size>100)announced.delete(announced.values().next().value!);
  try {
    const key = `tempo-last-alert:${p.userId}`;
    if (localStorage.getItem(key) === p.id) return;
    localStorage.setItem(key, p.id);
  } catch {}
  if (Date.now() - p.deadline > 60000) return;
  if (p.sound) chime();
  if (
    p.notifications &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  ) {
    try {
      const n = new Notification(
        p.focus ? "Focus session complete" : "Break complete",
        {
          body: p.focus
            ? "Nice work. Time for a break."
            : "Ready for your next focus session?",
          tag: `tempo-${p.id}`,
        },
      );
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {}
  }
}
