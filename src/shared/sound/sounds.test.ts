// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Note = { type: string; start: number; stop: number; freqs: number[]; peak: number };

/** Un AudioContext falso que anota cada nota que se programa (inicio, fin, frecuencias y volumen máximo). */
function fakeAudio() {
  const notes: Note[] = [];
  const created = { contexts: 0, resumed: 0 };
  class Param {
    values: number[] = [];
    setValueAtTime(v: number) { this.values.push(v); return this; }
    linearRampToValueAtTime(v: number) { this.values.push(v); return this; }
    exponentialRampToValueAtTime(v: number) { this.values.push(v); return this; }
    cancelScheduledValues() { return this; }
    set value(v: number) { this.values.push(v); }
  }
  class FakeContext {
    currentTime = 0;
    state = "suspended";
    destination = {};
    constructor() { created.contexts++; }
    resume() { created.resumed++; this.state = "running"; return Promise.resolve(); }
    createGain() { return { gain: new Param(), connect: vi.fn(() => ({ connect: vi.fn() })), disconnect: vi.fn() }; }
    createBiquadFilter() { return { type: "", frequency: new Param(), Q: new Param(), connect: vi.fn(() => ({ connect: vi.fn() })) }; }
    createOscillator() {
      const frequency = new Param();
      const osc = {
        type: "sine", frequency, connect: vi.fn(() => ({ connect: vi.fn() })), onended: null as null | (() => void),
        start(t = 0) { (osc as { t0?: number }).t0 = t; },
        stop(t = 0) {
          const t0 = (osc as { t0?: number }).t0 ?? 0;
          notes.push({ type: osc.type, start: t0, stop: t, freqs: frequency.values.slice(), peak: 0 });
        },
      };
      return osc;
    }
  }
  return { notes, created, Context: FakeContext };
}

let audio: ReturnType<typeof fakeAudio>;
beforeEach(() => {
  localStorage.clear();
  audio = fakeAudio();
  vi.stubGlobal("AudioContext", audio.Context);
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

const load = async () => await import("./sounds");
const length = (notes: Note[]) => (Math.max(...notes.map((n) => n.stop)) - Math.min(...notes.map((n) => n.start))) * 1000;

describe("sonidos de RoboLab (sintetizados, sin archivos)", () => {
  it("no crea el audio hasta que suena algo (el navegador solo lo permite tras un gesto del usuario)", async () => {
    const { playSound } = await load();
    expect(audio.created.contexts).toBe(0);
    playSound("place");
    expect(audio.created.contexts).toBe(1);
    playSound("remove");
    expect(audio.created.contexts).toBe(1);
  });

  it("reanuda el audio si el navegador lo dejó suspendido", async () => {
    const { playSound } = await load();
    playSound("place");
    expect(audio.created.resumed).toBe(1);
  });

  it.each([
    ["place", 90, 170],
    ["remove", 100, 170],
    ["play", 200, 360],
    ["step", 70, 150],
    ["win", 800, 1300],
    ["oops", 250, 460],
  ] as const)("«%s» dura entre %i y %i ms", async (name, min, max) => {
    const { playSound } = await load();
    playSound(name);
    expect(audio.notes.length).toBeGreaterThan(0);
    const ms = length(audio.notes);
    expect(ms).toBeGreaterThanOrEqual(min);
    expect(ms).toBeLessThanOrEqual(max);
  });

  it("la melodía de éxito sube: cuatro notas, cada una más aguda que la anterior", async () => {
    const { playSound } = await load();
    playSound("win");
    const first = audio.notes.filter((n) => n.type !== "sine" || true).sort((a, b) => a.start - b.start);
    const heads = [...new Map(first.map((n) => [n.start.toFixed(3), n.freqs[0]!])).values()];
    expect(heads.length).toBe(4);
    expect([...heads].sort((a, b) => a - b)).toEqual(heads);
  });

  it("el error es amable: un «boop» grave y corto que baja, no un zumbido ni una nota aguda", async () => {
    const { playSound } = await load();
    playSound("oops");
    const freqs = audio.notes.flatMap((n) => n.freqs);
    expect(Math.max(...freqs)).toBeLessThanOrEqual(520);
    expect(audio.notes.every((n) => n.type === "sine" || n.type === "triangle")).toBe(true);
  });

  it("en silencio no suena nada ni se crea el audio, y la elección se recuerda", async () => {
    const mod = await load();
    expect(mod.isMuted()).toBe(false);
    mod.setMuted(true);
    mod.playSound("win");
    expect(audio.notes).toEqual([]);
    expect(audio.created.contexts).toBe(0);
    expect(localStorage.getItem("robolab.sonido")).toBe("off");
    vi.resetModules();
    const again = await load();
    expect(again.isMuted()).toBe(true);
    again.setMuted(false);
    expect(localStorage.getItem("robolab.sonido")).toBe("on");
  });

  it("avisa a quien escucha el cambio de silencio (el botón se actualiza)", async () => {
    const mod = await load();
    const listener = vi.fn();
    const off = mod.subscribeMuted(listener);
    mod.setMuted(true);
    mod.setMuted(true);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    mod.setMuted(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("sin AudioContext (navegador viejo) o sin almacenamiento, no se cae", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    const mod = await load();
    expect(() => mod.playSound("win")).not.toThrow();
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } });
    vi.resetModules();
    const blocked = await load();
    expect(blocked.isMuted()).toBe(false);
    expect(() => blocked.setMuted(true)).not.toThrow();
  });

  it("si el audio falla por dentro, el juego sigue", async () => {
    vi.stubGlobal("AudioContext", class { constructor() { throw new Error("sin audio"); } });
    const { playSound } = await load();
    expect(() => playSound("place")).not.toThrow();
  });
});

describe("los pasos del robot no cansan en programas largos", () => {
  it("con pocos pasos suena cada uno; con muchos, los primeros, luego uno de cada tres y el último siempre", async () => {
    const { shouldStepSound } = await load();
    expect(Array.from({ length: 8 }, (_, i) => shouldStepSound(i, 8))).toEqual(Array(8).fill(true));
    const long = Array.from({ length: 30 }, (_, i) => shouldStepSound(i, 30));
    expect(long.slice(0, 4)).toEqual([true, true, true, true]);
    expect(long.filter(Boolean).length).toBeLessThanOrEqual(13);
    expect(long.filter(Boolean).length).toBeGreaterThanOrEqual(8);
    expect(long[29]).toBe(true);
  });

  it("el «plop» varía un poco de tono cada vez para no cansar", async () => {
    const { playSound } = await load();
    const heads = new Set<number>();
    for (let i = 0; i < 8; i++) {
      audio.notes.length = 0;
      playSound("place");
      heads.add(Math.round(audio.notes[0]!.freqs[0]!));
    }
    expect(heads.size).toBeGreaterThan(1);
    const all = [...heads];
    expect(Math.max(...all) / Math.min(...all)).toBeLessThan(1.08);
  });
});
