import {
  BLUETOOTH_HEARTBEAT_MS, BLUETOOTH_LEASE_MS, BLUETOOTH_LINE_LIMIT,
  bluetoothProgramProblem, bluetoothRunFrame, parseBluetoothLine,
} from "@robolab/backend/domain/robot/bluetooth";

/** Parte de Web Serial que usa este adaptador; permite probarlo con streams reales. */
export interface SerialPortLike {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}
export interface SerialApi {
  requestPort(options: { filters: { bluetoothServiceClassId: number }[] }): Promise<SerialPortLike>;
}
export type BluetoothSnapshot = {
  readonly state: "off" | "searching" | "on";
  readonly busy: boolean;
  readonly error: string | null;
  readonly commands: string | null;
  readonly turns: "arc" | "pivot" | null;
  readonly last: { readonly id: string; readonly letters: string; readonly status: "sending" | "received" | "running" | "done" | "failed"; readonly error?: string } | null;
};
type Options = {
  serial?: SerialApi;
  secure?: boolean;
  uuid?: () => string;
  handshakeMs?: number;
  leaseMs?: number;
};

export const BLUETOOTH_ERRORS: Record<string, string> = {
  REVERSE_UNSUPPORTED: "Este robot no puede retroceder.",
  TURN_UNSUPPORTED: "Este robot no admite esos giros.",
  BUSY: "El robot está ocupado. Espera a que termine.",
  TOO_LONG: "El programa es muy largo.",
  BAD_CHAR: "El programa tiene movimientos no válidos.",
  STOPPED: "El robot se detuvo.",
  DURATION_LIMIT: "El recorrido tarda demasiado. Usa menos pasos.",
  TIMING_INVALID: "Hay que revisar los tiempos del firmware.",
  RECONNECT: "Desconecta y vuelve a elegir el robot para seguir.",
  MOTOR: "El robot avisó una falla de motor.",
  HEARTBEAT: "Se perdió la conexión. Vuelve a elegir el robot.",
  DISCONNECTED: "Se perdió la conexión. Vuelve a elegir el robot.",
  TIMEOUT: "El robot no confirmó que terminó. Revisa el robot antes de reenviar.",
  NETWORK: "Se perdió la conexión. Vuelve a elegir el robot.",
};

/** Classic SPP usa Web Serial, no navigator.bluetooth (BLE). Nunca reintenta RUN. */
export function createBluetoothLink({
  serial = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { serial?: SerialApi }).serial,
  secure = globalThis.isSecureContext !== false,
  uuid = () => crypto.randomUUID(),
  handshakeMs = 4500,
  leaseMs = BLUETOOTH_LEASE_MS,
}: Options = {}) {
  const supported = !!serial && secure;
  let snapshot: BluetoothSnapshot = { state: "off", busy: false, error: null, commands: null, turns: null, last: null };
  const listeners = new Set<() => void>();
  const update = (next: Partial<BluetoothSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };
  let generation = 0;
  let port: SerialPortLike | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  let reading: Promise<void> | null = null;
  let closing = Promise.resolve();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let helloTimer: ReturnType<typeof setTimeout> | undefined;
  let helloResolve: (() => void) | undefined;
  let helloReject: ((error: Error) => void) | undefined;
  let lastPing = 0;
  const encoder = new TextEncoder();

  const write = async (text: string) => {
    if (!writer) throw new Error("El robot está desconectado.");
    await writer.write(encoder.encode(text));
  };

  function shutdown(error: string | null, sendStop = true) {
    ++generation;
    clearInterval(heartbeat); clearTimeout(deadline); clearTimeout(helloTimer);
    helloReject?.(new Error(error ?? "Conexión cancelada."));
    helloResolve = undefined; helloReject = undefined;
    const currentPort = port, currentReader = reader, currentWriter = writer, currentReading = reading;
    port = null; reader = null; writer = null; reading = null;
    update({ state: "off", busy: false, error, commands: null, turns: null,
      ...(snapshot.busy && snapshot.last ? { last: { ...snapshot.last, status: "failed", error: error ? "DISCONNECTED" : "STOPPED" } } : {}),
    });
    const previousClosing = closing;
    closing = (async () => {
      await previousClosing;
      if (sendStop && currentWriter) {
        // Un cierre no queda esperando indefinidamente una escritura atascada.
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          currentWriter.write(encoder.encode("STOP\n")).catch(() => {}),
          new Promise<void>((resolve) => { timer = setTimeout(resolve, 150); }),
        ]);
        clearTimeout(timer);
      }
      await currentReader?.cancel().catch(() => {});
      await currentReading;
      currentWriter?.releaseLock();
      await currentPort?.close().catch(() => {});
    })();
    return closing;
  }

  function fail(message: string) { void shutdown(message); }
  function setDeadline(ms: number, message: string) {
    clearTimeout(deadline);
    deadline = setTimeout(() => fail(message), ms);
  }

  function receive(line: string) {
    const message = parseBluetoothLine(line);
    if (!message) return;
    if (message.kind === "hello" && snapshot.state === "searching") {
      lastPing = Date.now();
      update({ commands: message.commands, turns: message.turns });
      helloResolve?.();
    } else if (message.kind === "pong") lastPing = Date.now();
    else if (message.kind === "status" && snapshot.busy && message.id === snapshot.last?.id) {
      const reply = message.reply;
      if (reply.kind === "ERR") {
        clearTimeout(deadline);
        update({ busy: false, last: { ...snapshot.last, status: "failed", error: reply.code },
          error: BLUETOOTH_ERRORS[reply.code] ?? "El robot avisó un problema. Revisa la conexión.",
        });
        if (["RECONNECT", "HEARTBEAT", "DISCONNECTED", "NETWORK"].includes(reply.code)) fail(snapshot.error!);
      } else if (reply.kind === "DONE") {
        clearTimeout(deadline);
        update({ busy: false, last: { ...snapshot.last, status: "done" } });
      } else {
        // Un OK tardío no hace retroceder un estado RUN.
        const status = reply.kind === "RUN" || snapshot.last.status === "running" ? "running" : "received";
        update({ last: { ...snapshot.last, status } });
        setDeadline(105_000, BLUETOOTH_ERRORS.TIMEOUT!);
      }
    }
  }

  async function readLoop(currentReader: ReadableStreamDefaultReader<Uint8Array>, current: number) {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (current === generation) {
        const { done, value } = await currentReader.read();
        if (done) {
          if (current === generation) fail(BLUETOOTH_ERRORS.DISCONNECTED!);
          break;
        }
        if (current !== generation) break;
        for (const character of decoder.decode(value, { stream: true })) {
          if (character === "\n") { receive(buffer); buffer = ""; }
          else buffer += character;
          if (buffer.length > BLUETOOTH_LINE_LIMIT) throw new Error("Trama demasiado larga.");
          if (current !== generation) break;
        }
      }
    } catch {
      if (current === generation) fail(BLUETOOTH_ERRORS.DISCONNECTED!);
    } finally { currentReader.releaseLock(); }
  }

  return {
    supported,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async connect() {
      if (snapshot.state !== "off") return;
      if (!supported) { update({ error: "Abre RoboLab en Chrome de laptop por HTTPS o localhost para usar Bluetooth Classic." }); return; }
      const current = ++generation;
      update({ state: "searching", error: null, last: null });
      let selected: SerialPortLike | undefined;
      try {
        // El selector se abre dentro del gesto del usuario, antes de cualquier otra espera.
        selected = await serial!.requestPort({ filters: [{ bluetoothServiceClassId: 0x1101 }] });
        if (current !== generation) return;
        await closing;
        if (current !== generation) return;
        await selected.open({ baudRate: 115200 });
        if (current !== generation) { await selected.close(); return; }
        port = selected;
        if (!port.readable || !port.writable) throw new Error("No pudimos abrir el puerto del robot.");
        reader = port.readable.getReader(); writer = port.writable.getWriter();
        const hello = new Promise<void>((resolve, reject) => {
          helloResolve = resolve; helloReject = reject;
          helloTimer = setTimeout(() => reject(new Error("El robot no respondió. Carga el firmware Bluetooth de RoboLab y vuelve a elegirlo.")), handshakeMs);
        });
        reading = readLoop(reader, current);
        await Promise.all([hello, write("HELLO\n")]);
        clearTimeout(helloTimer); helloResolve = undefined; helloReject = undefined;
        if (current !== generation) return;
        update({ state: "on" });
        heartbeat = setInterval(() => {
          if (Date.now() - lastPing >= leaseMs) { fail(BLUETOOTH_ERRORS.DISCONNECTED!); return; }
          void write("PING\n").catch(() => { if (current === generation) fail(BLUETOOTH_ERRORS.DISCONNECTED!); });
        }, BLUETOOTH_HEARTBEAT_MS);
      } catch (error) {
        if (current !== generation) return;
        const cancelled = error instanceof Error && error.name === "NotFoundError";
        const denied = error instanceof Error && ["SecurityError", "NotAllowedError"].includes(error.name);
        const message = cancelled ? null : denied
          ? "No tenemos permiso para abrir el puerto. Revisa los permisos del navegador y usa HTTPS o localhost."
          : error instanceof DOMException
            ? "No pudimos abrir el puerto. Cierra otras aplicaciones que lo usen y revisa el emparejamiento."
            : error instanceof Error ? error.message : "No pudimos abrir Bluetooth. Revisa el emparejamiento y los permisos.";
        await shutdown(message, false);
      }
    },
    async send(sequence: string) {
      if (snapshot.state !== "on" || snapshot.busy) return;
      const problem = bluetoothProgramProblem(sequence, snapshot.commands ?? "");
      if (problem) { update({ error: problem }); return; }
      let frame: string;
      const id = uuid();
      try { frame = bluetoothRunFrame(id, sequence); }
      catch (error) { update({ error: error instanceof Error ? error.message : "El programa no es válido." }); return; }
      const current = generation;
      update({ busy: true, error: null, last: { id, letters: sequence, status: "sending" } });
      setDeadline(5000, "El robot no confirmó la recepción. Revisa la conexión antes de reenviar.");
      try { await write(frame); }
      catch { if (current === generation) fail(BLUETOOTH_ERRORS.DISCONNECTED!); }
    },
    async stop() {
      if (!snapshot.busy) return;
      const current = generation;
      setDeadline(5000, "El robot no confirmó la parada. Se cerró la conexión.");
      try { await write("STOP\n"); }
      catch { if (current === generation) fail(BLUETOOTH_ERRORS.DISCONNECTED!); }
    },
    disconnect: () => shutdown(null),
  };
}
