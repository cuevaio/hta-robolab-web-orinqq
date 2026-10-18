/**
 * Sonidos de RoboLab, sintetizados con Web Audio (sin archivos, sin licencias, sin red).
 * Pensados para niños: cortos (menos de 200 ms los de interfaz, solo el éxito pasa de 1 s),
 * ondas seno o triángulo, nada agudo ni seco, y el error nunca más fuerte que el acierto.
 * El audio se crea al sonar el primero (siempre tras un gesto del niño: el navegador no lo
 * permite antes). Todo sonido tiene su equivalente visual: el sonido nunca es la única señal.
 */

export type SoundName = "place" | "remove" | "play" | "step" | "win" | "oops";

const KEY = "robolab.sonido";
/** Volumen general: moderado-bajo; el éxito sube un poco, el error baja. */
const MASTER = 0.35;

let muted = readMuted();
let context: AudioContext | null = null;
let master: GainNode | null = null;
const listeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
}

export const isMuted = (): boolean => muted;

export function setMuted(value: boolean): void {
  if (value === muted) return;
  muted = value;
  try {
    window.localStorage.setItem(KEY, value ? "off" : "on");
  } catch {
    // Sin almacenamiento: la elección dura lo que dure la pestaña.
  }
  listeners.forEach((l) => l());
}

/** Para que el botón de silencio se actualice. Devuelve cómo dejar de escuchar. */
export function subscribeMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function audio(): { ctx: AudioContext; out: GainNode } | null {
  try {
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!context) {
      context = new Ctor();
      master = context.createGain();
      master.gain.value = MASTER;
      master.connect(context.destination);
    }
    if (context.state === "suspended") void context.resume();
    return { ctx: context, out: master! };
  } catch {
    return null;
  }
}

type Tone = {
  /** Cuándo empieza, en segundos desde ahora. */
  at: number;
  /** Cuánto dura, en segundos. */
  length: number;
  from: number;
  to?: number;
  type?: "sine" | "triangle";
  peak: number;
};

/** Una nota con ataque de 8 ms y caída suave (sin clics ni picos). */
function tone(ctx: AudioContext, out: GainNode, t: Tone): void {
  const start = ctx.currentTime + t.at;
  const end = start + t.length;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = t.type ?? "sine";
  osc.frequency.setValueAtTime(t.from, start);
  if (t.to !== undefined) osc.frequency.exponentialRampToValueAtTime(t.to, end);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(t.peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(end);
}

// Do mayor pentatónica: sin disonancias entre notas (C5, E5, G5, C6).
const WIN = [523.25, 659.25, 783.99, 1046.5];

const RECIPES: Record<SoundName, (ctx: AudioContext, out: GainNode) => void> = {
  /** «Plop» de burbuja al soltar un bloque: sube redondeado; cambia ±3 % de tono cada vez. */
  place(ctx, out) {
    const f = 520 * (1 + (Math.random() - 0.5) * 0.06);
    tone(ctx, out, { at: 0, length: 0.12, from: f, to: f * 1.7, peak: 0.5 });
  },
  /** «Fiu» suave que baja al quitar un bloque; más bajito que el error para no sonar a fallo. */
  remove(ctx, out) {
    tone(ctx, out, { at: 0, length: 0.13, from: 640, to: 300, peak: 0.3 });
  },
  /** «Bip-bip» robótico al presionar Play: dos notas suaves, no agudas. */
  play(ctx, out) {
    tone(ctx, out, { at: 0, length: 0.09, from: 740, type: "triangle", peak: 0.35 });
    tone(ctx, out, { at: 0.13, length: 0.11, from: 988, type: "triangle", peak: 0.35 });
  },
  /** «Tup» mecánico ligero en cada paso del robot. */
  step(ctx, out) {
    tone(ctx, out, { at: 0, length: 0.1, from: 240, to: 160, type: "triangle", peak: 0.35 });
  },
  /** Melodía ascendente de cuatro notas al completar el reto (una sola vez, ~1,1 s). */
  win(ctx, out) {
    WIN.forEach((f, i) => tone(ctx, out, { at: i * 0.19, length: i === 3 ? 0.5 : 0.26, from: f, type: "triangle", peak: 0.45 }));
  },
  /** «Boop» amable y grave que baja un poco: no llegaste, pero puedes intentar otra vez. */
  oops(ctx, out) {
    tone(ctx, out, { at: 0, length: 0.32, from: 330, to: 235, peak: 0.28 });
  },
};

export function playSound(name: SoundName): void {
  if (muted) return;
  const a = audio();
  if (!a) return;
  try {
    RECIPES[name](a.ctx, a.out);
  } catch {
    // El sonido es un adorno: si falla, el juego sigue.
  }
}

/** Con pocos pasos suena cada uno; con muchos, los primeros, luego uno de cada tres y el último siempre. */
export function shouldStepSound(index: number, total: number): boolean {
  if (total <= 10) return true;
  return index < 4 || index === total - 1 || (index - 4) % 3 === 2;
}
