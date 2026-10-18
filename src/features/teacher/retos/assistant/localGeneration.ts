import { JETSON_USB_DEVICE, JETSON_USB_HEARTBEAT_MS, JETSON_USB_RESPONSE_LIMIT, JETSON_USB_VERSION } from "@robolab/backend/domain/generation/usbProtocol";

export class LocalGenerationError extends Error {}
type LocalRequest = { objective: string; grades: number[]; difficulty?: string };
export type LocalResult = { generationId?: string; missions: unknown[]; failed: { grade: 2 | 3 | 4; code: string }[] };
export interface JetsonSerialPort {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}
export interface JetsonSerialApi { requestPort(options: { filters: { usbVendorId: number }[] }): Promise<JetsonSerialPort> }
const closures = new WeakMap<JetsonSerialApi, Promise<void>>();
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const errors: Record<string, string> = {
  BUSY: "La Jetson está generando otra misión. Espera a que termine.",
  NOT_READY: "El modelo no está disponible en la Jetson. Vuelve a conectarla.",
  PROTOCOL_VERSION: "El servicio de la Jetson necesita actualizarse.",
  BAD_REQUEST: "La Jetson no pudo leer la solicitud. Revisa el aprendizaje.",
  CANCELLED: "La generación se canceló. Conservamos tu aprendizaje.",
};

/** El USB transporta borradores. Solo reviewLocal de Convex certifica las propuestas. */
export function createJetsonLink(options: { serial?: JetsonSerialApi; handshakeMs?: number; generationMs?: number } = {}) {
  let serial = options.serial;
  let port: JetsonSerialPort | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  let reading: Promise<void> | null = null, opening: Promise<void> | null = null;
  let closing = Promise.resolve(), epoch = 0, connected = false, connecting = false, generating = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<(message: string) => void>();
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const encoder = new TextEncoder();
  function write(id: string, method: string, params?: unknown) {
    if (!writer) return Promise.reject(new LocalGenerationError("Se perdió la conexión USB. Vuelve a elegir la Jetson."));
    return writer.write(encoder.encode(JSON.stringify({ v: JETSON_USB_VERSION, id, method, params }) + "\n"));
  }
  function shutdown(message?: string) {
    ++epoch; connected = false; clearInterval(heartbeat);
    const error = new LocalGenerationError(message ?? "Conexión cerrada.");
    for (const waiter of [...pending.values()]) waiter.reject(error);
    pending.clear();
    const oldPort = port, oldReader = reader, oldWriter = writer, oldReading = reading, oldOpening = opening;
    port = null; reader = null; writer = null; reading = null; opening = null;
    const previous = closing;
    closing = (async () => {
      await previous; await oldOpening?.catch(() => {});
      await oldReader?.cancel().catch(() => {});
      if (oldReading) await oldReading; else oldReader?.releaseLock();
      oldWriter?.releaseLock();
      await oldPort?.close().catch(() => {});
    })();
    if (serial) closures.set(serial, closing);
    if (message) for (const listener of listeners) listener(message);
    return closing;
  }
  function request(method: string, params: unknown, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) return Promise.reject(new DOMException("Cancelado", "AbortError"));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      let repeat: ReturnType<typeof setInterval> | undefined;
      const finish = (value: unknown, error?: Error) => {
        clearTimeout(timer); clearInterval(repeat); signal?.removeEventListener("abort", cancel); pending.delete(id);
        if (error) reject(error); else resolve(value);
      };
      const cancel = () => {
        void write(crypto.randomUUID(), "cancel", { requestId: id }).catch(() => {});
        finish(null, new DOMException("Cancelado", "AbortError"));
      };
      const timer = setTimeout(() => {
        if (method === "generate") void write(crypto.randomUUID(), "cancel", { requestId: id }).catch(() => {});
        finish(null, new LocalGenerationError("La Jetson tardó demasiado en responder. Conservamos tu aprendizaje; puedes reintentar."));
      }, timeoutMs);
      pending.set(id, { resolve: value => finish(value), reject: error => finish(null, error) });
      signal?.addEventListener("abort", cancel, { once: true });
      const transmit = () => { void write(id, method, params).catch(() => { void shutdown("Se perdió la conexión USB. Vuelve a elegir la Jetson."); }); };
      // Solo se repite HELLO: el daemon puede estar reiniciándose al volver a abrir USB.
      if (method === "hello") repeat = setInterval(transmit, 400);
      transmit();
    });
  }
  async function readLoop(current: ReadableStreamDefaultReader<Uint8Array>, token: number) {
    const decoder = new TextDecoder("utf-8", { fatal: true }); let buffer = "", bufferBytes = 0;
    try {
      while (token === epoch) {
        const { value, done } = await current.read();
        if (done) { if (token === epoch) void shutdown("Se perdió la conexión USB. Vuelve a elegir la Jetson."); break; }
        for (const part of decoder.decode(value, { stream: true }).split(/(?<=\n)/)) {
          buffer += part; bufferBytes += encoder.encode(part).byteLength;
          if (bufferBytes > JETSON_USB_RESPONSE_LIMIT) throw new LocalGenerationError("La respuesta USB es demasiado grande.");
          if (!part.endsWith("\n")) continue;
          let m: unknown; try { m = JSON.parse(buffer); } catch { buffer = ""; bufferBytes = 0; continue; } buffer = ""; bufferBytes = 0;
          if (!record(m) || m.v !== JETSON_USB_VERSION || typeof m.id !== "string") continue;
          const waiter = pending.get(m.id); if (!waiter) continue;
          if (m.ok === true) waiter.resolve(m.result);
          else if (m.ok === false) waiter.reject(new LocalGenerationError(typeof m.error === "string" && errors[m.error] || "La Jetson no pudo generar. Revisa su servicio y vuelve a intentar."));
        }
      }
    } catch (error) {
      if (token === epoch) void shutdown(error instanceof LocalGenerationError ? error.message : "Se perdió la conexión USB. Vuelve a elegir la Jetson.");
    } finally { current.releaseLock(); }
  }
  return {
    subscribeDisconnected(listener: (message: string) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async connect() {
      if (connected) return;
      if (connecting) throw new LocalGenerationError("Ya estamos eligiendo la Jetson.");
      serial ??= typeof navigator === "undefined" ? undefined : (navigator as Navigator & { serial?: JetsonSerialApi }).serial;
      if (!serial || globalThis.isSecureContext === false) throw new LocalGenerationError("Abre RoboLab en Chrome o Edge de escritorio para elegir la Jetson por USB.");
      connecting = true; const api = serial; const token = epoch;
      try {
        // La selección empieza dentro del clic, antes de esperar cualquier cierre anterior.
        const selected = await api.requestPort({ filters: [{ usbVendorId: 0x0955 }] });
        await closures.get(api); await closing;
        if (token !== epoch) throw new LocalGenerationError("Conexión cancelada.");
        port = selected; opening = selected.open({ baudRate: 115200 }); await opening; opening = null;
        if (token !== epoch) throw new LocalGenerationError("Conexión cancelada.");
        if (!selected.readable || !selected.writable) throw new LocalGenerationError("El dispositivo no abrió su puerto USB.");
        reader = selected.readable.getReader(); writer = selected.writable.getWriter(); reading = readLoop(reader, token);
        const hello = await request("hello", undefined, options.handshakeMs ?? 10000);
        if (!record(hello) || hello.device !== JETSON_USB_DEVICE || hello.protocol !== JETSON_USB_VERSION || hello.provider !== "ollama") throw new LocalGenerationError("El dispositivo elegido no es una Jetson de RoboLab.");
        if (hello.ready !== true) throw new LocalGenerationError("El modelo no está disponible en la Jetson. Revisa su servicio.");
        connected = true;
        heartbeat = setInterval(() => { void request("ping", undefined, 6000).catch(() => { if (connected) void shutdown("Se perdió la conexión USB. Vuelve a elegir la Jetson."); }); }, JETSON_USB_HEARTBEAT_MS);
      } catch (error) {
        await shutdown();
        if (error instanceof DOMException && error.name === "NotFoundError") throw new LocalGenerationError("No seleccionaste una Jetson. Puedes volver a conectarla.");
        if (error instanceof LocalGenerationError) throw error;
        throw new LocalGenerationError("No pudimos abrir el puerto USB. Cierra otras aplicaciones que usen la Jetson y revisa los permisos.");
      } finally { connecting = false; }
    },
    async generate(input: LocalRequest, signal?: AbortSignal): Promise<LocalResult> {
      if (!connected) throw new LocalGenerationError("Conecta y elige la Jetson antes de generar.");
      if (generating) throw new LocalGenerationError(errors.BUSY);
      generating = true;
      try {
        const data = await request("generate", input, options.generationMs ?? 560000, signal);
        if (!record(data) || !Array.isArray(data.missions) || data.missions.length > 3 || !Array.isArray(data.failed) || data.failed.length > 3 || data.failed.some(f => !record(f) || ![2, 3, 4].includes(Number(f.grade)) || typeof f.grade !== "number" || typeof f.code !== "string")) throw new LocalGenerationError("La respuesta de la Jetson no es válida.");
        return data as LocalResult;
      } finally { generating = false; }
    },
    disconnect: () => shutdown(),
  };
}
