import type { GestureSample } from "./gestureGate";

/** Lo que responde el worker del reconocedor. Cada resultado dice de qué cámara era su fotograma. */
export type RecognitionMessage =
  | { type: "ready" }
  | { type: "sample"; sample: GestureSample; time: number; session: number }
  | { type: "progress"; loaded: number; total: number }
  | { type: "error" };

/** Cuánto sigue vivo el reconocedor sin cámara: al pasar a Botones y volver a Gestos no se espera otra vez. */
export const IDLE_MS = 5 * 60_000;

type Camera = {
  onSample: (sample: GestureSample, time: number) => void;
  onError: () => void;
  /** Porcentaje (0 a 100) del modelo que ya está bajado. */
  onProgress?: (percent: number) => void;
};

type Shared = { worker: Worker; ready: Promise<void>; cameras: Map<number, Camera>; idle: number | undefined; progress: number | null };

export type RecognizerUse = {
  readonly session: number;
  /** Se cumple cuando el modelo está listo; falla si no se pudo cargar. */
  readonly ready: Promise<void>;
  send(bitmap: ImageBitmap, time: number): void;
  /** La cámara se apagó: el reconocedor queda listo un rato por si vuelve. */
  release(): void;
};

/**
 * Un solo reconocedor por página. Bajar y preparar el modelo es lo que más tarda
 * (~12 MB la primera vez), así que se hace una vez: se empieza mientras el niño lee
 * la ficha del reto y sigue vivo al cambiar entre Gestos y Botones.
 */
let shared: Shared | null = null;
let lastSession = 0;

function create(): Shared {
  const worker = new Worker(new URL("./recognizer.worker.ts", import.meta.url), { type: "module" });
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const ready = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Si falla sin ninguna cámara esperando, que no quede como un rechazo sin manejar.
  ready.catch(() => undefined);
  const state: Shared = { worker, ready, cameras: new Map(), idle: undefined, progress: null };
  const broken = () => {
    reject(new Error("No se pudo cargar el reconocedor de gestos."));
    const cameras = [...state.cameras.values()];
    if (shared === state) disposeRecognizer();
    cameras.forEach((camera) => camera.onError());
  };
  worker.onerror = broken;
  worker.onmessage = (event: MessageEvent<RecognitionMessage>) => {
    const message = event.data;
    if (message.type === "ready") resolve();
    else if (message.type === "error") broken();
    else if (message.type === "progress") {
      state.progress = message.total > 0 ? Math.min(100, Math.round((message.loaded / message.total) * 100)) : null;
      if (state.progress !== null) for (const camera of state.cameras.values()) camera.onProgress?.(state.progress);
    } else state.cameras.get(message.session)?.onSample(message.sample, message.time);
  };
  worker.postMessage({ type: "init" });
  return state;
}

function freeWhenIdle(state: Shared) {
  window.clearTimeout(state.idle);
  state.idle = window.setTimeout(() => {
    if (shared === state && state.cameras.size === 0) disposeRecognizer();
  }, IDLE_MS);
}

const saveData = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

/**
 * Empieza a bajar y preparar el reconocedor mientras el niño lee la ficha, para
 * que al encender la cámara ya esté listo. Con el ahorro de datos activado espera
 * a que de verdad se usen los gestos. Si nadie lo usa, se libera solo.
 */
export function warmUpRecognizer(): void {
  if (shared || typeof Worker === "undefined" || saveData()) return;
  shared = create();
  freeWhenIdle(shared);
}

/** Una cámara usa el reconocedor (lo crea si hace falta) y recibe solo los resultados de sus fotogramas. */
export function attachRecognizer(camera: Camera): RecognizerUse {
  if (!shared) shared = create();
  const state = shared;
  window.clearTimeout(state.idle);
  state.idle = undefined;
  const session = ++lastSession;
  state.cameras.set(session, camera);
  // La cámara que llega con la descarga a medias se entera de cuánto va.
  if (state.progress !== null) camera.onProgress?.(state.progress);
  return {
    session,
    ready: state.ready,
    send: (bitmap, time) => state.worker.postMessage({ type: "frame", bitmap, time, session }, [bitmap]),
    release: () => {
      if (state.cameras.delete(session) && shared === state && state.cameras.size === 0) freeWhenIdle(state);
    },
  };
}

/** Apaga el reconocedor y libera su memoria (por ejemplo, si no hay permiso de cámara). */
export function disposeRecognizer(): void {
  if (!shared) return;
  const state = shared;
  shared = null;
  window.clearTimeout(state.idle);
  state.cameras.clear();
  state.worker.terminate();
}
