// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { startCameraSession } from "./cameraSession";
import { disposeRecognizer } from "./recognizer";

class CameraWorker {
  static latest: CameraWorker;
  static created = 0;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { CameraWorker.latest = this; CameraWorker.created++; }
  send(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
}

const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  disposeRecognizer();
  CameraWorker.created = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(getUserMedia?: () => Promise<MediaStream>) {
  const stopTrack = vi.fn();
  const track = { stop: stopTrack, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  vi.stubGlobal("Worker", CameraWorker);
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("createImageBitmap", vi.fn());
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true, value: { getUserMedia: getUserMedia ?? vi.fn().mockResolvedValue(stream) },
  });
  const video = document.createElement("video");
  vi.spyOn(video, "play").mockResolvedValue();
  vi.spyOn(video, "pause").mockImplementation(() => undefined);
  const onError = vi.fn();
  const onCamera = vi.fn();
  const onProgress = vi.fn();
  const onReady = vi.fn();
  const onSample = vi.fn();
  const stop = startCameraSession(video, { onError, onCamera, onProgress, onReady, onSample, isPaused: () => false });
  stops.push(stop);
  return { stop, stopTrack, stream, video, onError, onCamera, onProgress, onReady, onSample };
}

describe("ciclo de vida de la cámara", () => {
  it("libera la cámara al salir, y deja el reconocedor listo para volver a Gestos", async () => {
    const camera = setup();
    await vi.waitFor(() => expect(camera.video.srcObject).toBe(camera.stream));
    CameraWorker.latest.send({ type: "ready" });
    await vi.waitFor(() => expect(camera.onReady).toHaveBeenCalledOnce());
    camera.stop();
    expect(camera.stopTrack).toHaveBeenCalledOnce();
    expect(CameraWorker.latest.terminate).not.toHaveBeenCalled();
    expect(camera.video.srcObject).toBeNull();
  });

  it("la imagen se ve apenas llega el permiso, sin esperar a que el modelo esté listo", async () => {
    const camera = setup();
    await vi.waitFor(() => expect(camera.onCamera).toHaveBeenCalledOnce());
    expect(camera.video.play).toHaveBeenCalled();
    expect(camera.onReady).not.toHaveBeenCalled();
    CameraWorker.latest.send({ type: "ready" });
    await vi.waitFor(() => expect(camera.onReady).toHaveBeenCalledOnce());
  });

  it("avisa a la pantalla cuánto lleva bajado el modelo", async () => {
    const camera = setup();
    CameraWorker.latest.send({ type: "progress", loaded: 4_000_000, total: 8_000_000 });
    expect(camera.onProgress).toHaveBeenCalledWith(50);
  });

  it("volver a Gestos no vuelve a bajar ni a preparar el modelo", async () => {
    const first = setup();
    CameraWorker.latest.send({ type: "ready" });
    await vi.waitFor(() => expect(first.onReady).toHaveBeenCalledOnce());
    first.stop();
    const second = setup();
    await vi.waitFor(() => expect(second.onReady).toHaveBeenCalledOnce());
    expect(CameraWorker.created).toBe(1);
    expect(CameraWorker.latest.postMessage.mock.calls.filter(([message]) => message.type === "init")).toHaveLength(1);
  });

  it("detiene una cámara cuyo permiso llega después de salir", async () => {
    let grant!: (stream: MediaStream) => void;
    const permission = new Promise<MediaStream>((resolve) => { grant = resolve; });
    const camera = setup(() => permission);
    camera.stop();
    grant(camera.stream);
    await vi.waitFor(() => expect(camera.stopTrack).toHaveBeenCalledOnce());
    expect(camera.video.srcObject).not.toBe(camera.stream);
  });

  it("explica un permiso denegado y permite seguir con botones", async () => {
    const camera = setup(() => Promise.reject(new DOMException("Denied", "NotAllowedError")));
    await vi.waitFor(() => expect(camera.onError).toHaveBeenCalledWith(expect.stringContaining("permiso")));
    expect(camera.onReady).not.toHaveBeenCalled();
  });

  it("el modelo se empieza a bajar sin esperar el permiso de la cámara, y la cámara arranca cuando llegan las dos cosas", async () => {
    let grant!: (stream: MediaStream) => void;
    const permission = new Promise<MediaStream>((resolve) => { grant = resolve; });
    const camera = setup(() => permission);
    // Aún sin permiso: el worker ya recibió la orden de cargar el modelo.
    expect(CameraWorker.latest.postMessage).toHaveBeenCalledWith({ type: "init" });
    CameraWorker.latest.send({ type: "ready" });
    expect(camera.onReady).not.toHaveBeenCalled();
    grant(camera.stream);
    await vi.waitFor(() => expect(camera.onReady).toHaveBeenCalledOnce());
    expect(camera.video.srcObject).toBe(camera.stream);
  });

  it("un permiso denegado también libera el worker que ya estaba cargando el modelo", async () => {
    const camera = setup(() => Promise.reject(new DOMException("Denied", "NotAllowedError")));
    await vi.waitFor(() => expect(camera.onError).toHaveBeenCalledOnce());
    expect(CameraWorker.latest.terminate).toHaveBeenCalledOnce();
  });

  it("un error del modelo apaga la cámara y descarta resultados tardíos", async () => {
    const camera = setup();
    await vi.waitFor(() => expect(camera.video.srcObject).toBe(camera.stream));
    CameraWorker.latest.send({ type: "error" });
    expect(camera.stopTrack).toHaveBeenCalledOnce();
    expect(camera.onError).toHaveBeenCalledOnce();
    CameraWorker.latest.send({ type: "sample", sample: { name: "Thumb_Up", score: 1, hands: 1 }, time: 500 });
    expect(camera.onSample).not.toHaveBeenCalled();
  });
});
