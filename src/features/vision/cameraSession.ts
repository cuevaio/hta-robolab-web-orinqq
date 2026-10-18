import type { GestureSample } from "./gestureGate";
import { type RecognizerUse, attachRecognizer, disposeRecognizer } from "./recognizer";

type Callbacks = {
  onSample: (sample: GestureSample, time: number) => void;
  /** Ya se ve la imagen de la cámara; los gestos pueden seguir preparándose. */
  onCamera?: () => void;
  /** Porcentaje del modelo de gestos ya bajado (solo la primera vez tarda). */
  onProgress?: (percent: number) => void;
  /** Cámara y gestos listos: desde aquí llegan muestras. */
  onReady: () => void;
  onError: (message: string) => void;
  isPaused: () => boolean;
};

const LOAD_ERROR = "No pudimos cargar los gestos. Revisa tu conexión e intenta otra vez.";
const READ_ERROR = "No pudimos leer la cámara. Intenta otra vez o usa los botones.";

/**
 * Una sesión posee la cámara y sus fotogramas; el reconocedor es compartido y
 * sigue listo al apagarla. La imagen se muestra apenas hay permiso, sin esperar
 * al modelo. stop también cancela permisos pendientes.
 */
export function startCameraSession(video: HTMLVideoElement, callbacks: Callbacks): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;
  let recognizer: RecognizerUse | null = null;
  let animation = 0;
  let pending = false;
  let previousFrame = -Infinity;
  let previousVideoTime = -1;
  // La primera vez baja ~12 MB: con internet lento puede pasar de 30 s.
  const timeout = window.setTimeout(() => fail("La cámara tardó demasiado. Intenta otra vez o usa los botones."), 60000);

  function stop() {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timeout);
    window.cancelAnimationFrame(animation);
    recognizer?.release();
    stream?.getTracks().forEach((track) => {
      track.removeEventListener("ended", ended);
      track.stop();
    });
    video.pause();
    video.srcObject = null;
  }

  /** dispose también apaga el reconocedor: sin permiso de cámara no tiene sentido tenerlo en memoria. */
  function fail(message: string, dispose = false) {
    if (stopped) return;
    stop();
    if (dispose) disposeRecognizer();
    callbacks.onError(message);
  }

  function ended() {
    fail("La cámara se desconectó. Conéctala e intenta otra vez.");
  }

  function frame(time: number) {
    if (stopped) return;
    animation = window.requestAnimationFrame(frame);
    if (pending || callbacks.isPaused() || video.readyState < 2 || time - previousFrame < 100 || video.currentTime === previousVideoTime) return;
    pending = true;
    previousFrame = time;
    previousVideoTime = video.currentTime;
    void createImageBitmap(video).then((bitmap) => {
      if (stopped || callbacks.isPaused()) {
        bitmap.close();
        pending = false;
        return;
      }
      try {
        recognizer!.send(bitmap, time);
      } catch {
        bitmap.close();
        fail(READ_ERROR);
      }
    }).catch(() => fail(READ_ERROR));
  }

  async function start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      fail("La cámara necesita HTTPS o localhost. Puedes usar los botones.");
      return;
    }
    if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined") {
      fail("Este navegador no permite usar los gestos. Prueba Chrome o Edge, o usa los botones.");
      return;
    }
    // El modelo se prepara mientras el navegador pide el permiso: las dos esperas se solapan.
    let modelReady = false;
    let cameraReady = false;
    function begin() {
      if (stopped || !modelReady || !cameraReady) return;
      window.clearTimeout(timeout);
      callbacks.onReady();
      animation = window.requestAnimationFrame(frame);
    }
    recognizer = attachRecognizer({
      onSample: (sample, time) => {
        if (stopped) return;
        pending = false;
        if (!callbacks.isPaused()) callbacks.onSample(sample, time);
      },
      onError: () => fail(LOAD_ERROR),
      onProgress: (percent) => {
        if (!stopped) callbacks.onProgress?.(percent);
      },
    });
    recognizer.ready.then(
      () => {
        modelReady = true;
        begin();
      },
      () => fail(LOAD_ERROR),
    );
    let acquired: MediaStream;
    try {
      acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
    } catch (error) {
      const name = error instanceof Error || error instanceof DOMException ? error.name : "";
      fail(
        name === "NotAllowedError" || name === "SecurityError"
          ? "La cámara necesita tu permiso. Permítela en el navegador o usa los botones."
          : name === "NotFoundError"
            ? "No encontramos una cámara. Conecta una o usa los botones."
            : "No pudimos abrir la cámara. Cierra otras apps que la usen e intenta otra vez.",
        true,
      );
      return;
    }
    if (stopped) {
      acquired.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = acquired;
    stream.getTracks().forEach((track) => track.addEventListener("ended", ended));
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      fail("No pudimos iniciar la cámara. Intenta otra vez o usa los botones.");
      return;
    }
    if (stopped) return;
    cameraReady = true;
    callbacks.onCamera?.();
    begin();
  }
  void start();
  return stop;
}
