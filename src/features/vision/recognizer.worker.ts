import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";
import { MODEL_URL, WASM_BASE } from "./gestureAssets";
import { loadModel } from "./modelCache";
import { gestureSample } from "./pointingGesture";
import type { RecognitionMessage } from "./recognizer";

type Request = { type: "init" } | { type: "frame"; bitmap: ImageBitmap; time: number; session: number };
let recognizer: GestureRecognizer | null = null;
const reply = (message: RecognitionMessage) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    if (request.type === "init") {
      // El motor y el modelo se bajan a la vez, no uno detrás del otro. El motor queda en la
      // caché del navegador (es inmutable) y MediaPipe lo toma de ahí; el modelo queda guardado en el equipo.
      const [files, model] = await Promise.all([
        FilesetResolver.forVisionTasks(WASM_BASE, true).then(async (fileset) => {
          await fetch(fileset.wasmBinaryPath).then((response) => response.arrayBuffer()).catch(() => undefined);
          return fileset;
        }),
        loadModel(MODEL_URL, undefined, (loaded, total) => reply({ type: "progress", loaded, total })),
      ]);
      recognizer = await GestureRecognizer.createFromOptions(files, {
        baseOptions: {
          modelAssetBuffer: model,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      reply({ type: "ready" });
    } else if (recognizer) {
      const result = recognizer.recognizeForVideo(request.bitmap, request.time);
      reply({ type: "sample", sample: gestureSample(result, request.bitmap.width, request.bitmap.height), time: request.time, session: request.session });
    }
  } catch {
    reply({ type: "error" });
  } finally {
    if (request.type === "frame") request.bitmap.close();
  }
};
