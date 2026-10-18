// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GestureSample } from "./gestureGate";
import { IDLE_MS, attachRecognizer, disposeRecognizer, warmUpRecognizer } from "./recognizer";

class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { FakeWorker.all.push(this); }
  send(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
}
const worker = () => FakeWorker.all.at(-1)!;
const inits = () => FakeWorker.all.flatMap((w) => w.postMessage.mock.calls).filter(([m]) => m.type === "init").length;
const THUMB: GestureSample = { name: "Thumb_Up", score: 1, hands: 1 };

beforeEach(() => {
  FakeWorker.all = [];
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  disposeRecognizer();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("reconocedor de gestos compartido", () => {
  it("calentarlo crea un solo worker y le pide preparar el modelo una sola vez", () => {
    warmUpRecognizer();
    warmUpRecognizer();
    attachRecognizer({ onSample: vi.fn(), onError: vi.fn() });
    expect(FakeWorker.all).toHaveLength(1);
    expect(inits()).toBe(1);
  });

  it("con el ahorro de datos activado no se adelanta la descarga, pero la cámara igual lo usa", () => {
    vi.stubGlobal("navigator", { ...navigator, connection: { saveData: true } });
    warmUpRecognizer();
    expect(FakeWorker.all).toHaveLength(0);
    attachRecognizer({ onSample: vi.fn(), onError: vi.fn() });
    expect(FakeWorker.all).toHaveLength(1);
  });

  it("cada cámara recibe solo sus propios resultados (los tardíos de una cámara anterior se descartan)", async () => {
    const first = { onSample: vi.fn(), onError: vi.fn() };
    const second = { onSample: vi.fn(), onError: vi.fn() };
    const a = attachRecognizer(first);
    worker().send({ type: "ready" });
    await a.ready;
    const bitmap = {} as ImageBitmap;
    a.send(bitmap, 100);
    expect(worker().postMessage).toHaveBeenLastCalledWith({ type: "frame", bitmap, time: 100, session: a.session }, [bitmap]);
    a.release();
    const b = attachRecognizer(second);
    await b.ready;
    worker().send({ type: "sample", sample: THUMB, time: 100, session: a.session });
    worker().send({ type: "sample", sample: THUMB, time: 200, session: b.session });
    expect(first.onSample).not.toHaveBeenCalled();
    expect(second.onSample).toHaveBeenCalledExactlyOnceWith(THUMB, 200);
  });

  it("sin uso se libera a los 5 minutos; si se vuelve a usar antes, sigue vivo", () => {
    vi.useFakeTimers();
    const a = attachRecognizer({ onSample: vi.fn(), onError: vi.fn() });
    a.release();
    vi.advanceTimersByTime(IDLE_MS - 1000);
    const b = attachRecognizer({ onSample: vi.fn(), onError: vi.fn() });
    vi.advanceTimersByTime(IDLE_MS * 2);
    expect(worker().terminate).not.toHaveBeenCalled();
    b.release();
    vi.advanceTimersByTime(IDLE_MS);
    expect(worker().terminate).toHaveBeenCalledOnce();
    expect(FakeWorker.all).toHaveLength(1);
  });

  it("el avance de la descarga llega a cada cámara, y la que llega tarde recibe el último valor", () => {
    const first = { onSample: vi.fn(), onError: vi.fn(), onProgress: vi.fn() };
    attachRecognizer(first);
    worker().send({ type: "progress", loaded: 2_000_000, total: 8_000_000 });
    expect(first.onProgress).toHaveBeenCalledWith(25);
    const late = { onSample: vi.fn(), onError: vi.fn(), onProgress: vi.fn() };
    attachRecognizer(late);
    expect(late.onProgress).toHaveBeenCalledWith(25);
    worker().send({ type: "progress", loaded: 8_000_000, total: 8_000_000 });
    expect(late.onProgress).toHaveBeenLastCalledWith(100);
  });

  it("si el modelo no carga, avisa a la cámara y la próxima vez empieza de nuevo", async () => {
    const camera = { onSample: vi.fn(), onError: vi.fn() };
    const a = attachRecognizer(camera);
    worker().send({ type: "error" });
    await expect(a.ready).rejects.toThrow();
    expect(camera.onError).toHaveBeenCalledOnce();
    expect(worker().terminate).toHaveBeenCalledOnce();
    attachRecognizer({ onSample: vi.fn(), onError: vi.fn() });
    expect(FakeWorker.all).toHaveLength(2);
  });
});
