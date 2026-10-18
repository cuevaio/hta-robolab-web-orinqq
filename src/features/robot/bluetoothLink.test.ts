import { afterEach, describe, expect, it, vi } from "vitest";
import { createBluetoothLink, type SerialPortLike } from "./bluetoothLink";

function device({ hello = true, pong = true, stopWrite }: { hello?: boolean; pong?: boolean; stopWrite?: () => Promise<void> } = {}) {
  let input!: ReadableStreamDefaultController<Uint8Array>;
  const written: string[] = [];
  const receive = (text: string) => input.enqueue(new TextEncoder().encode(text));
  const port: SerialPortLike = {
    readable: new ReadableStream({ start: (controller) => { input = controller; } }),
    writable: new WritableStream<Uint8Array>({
      write(data) {
        const text = new TextDecoder().decode(data);
        written.push(text);
        if (text === "HELLO\n" && hello) receive("ROBO/1 ADZ ARC\n");
        if (text === "PING\n" && pong) receive("PONG\n");
        if (text === "STOP\n" && stopWrite) return stopWrite();
      },
    }),
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const serial = { requestPort: vi.fn(async () => port) };
  const link = createBluetoothLink({ serial, uuid: () => "test-id", handshakeMs: 100, leaseMs: 3500 });
  return { port, serial, link, written, receive, input: () => input };
}

afterEach(() => vi.useRealTimers());

describe("vínculo Bluetooth Classic por Web Serial", () => {
  it("comprueba la identidad antes de conectar y conserva el enlace hasta la respuesta final", async () => {
    const robot = device();
    await robot.link.connect();
    expect(robot.serial.requestPort).toHaveBeenCalledWith({ filters: [{ bluetoothServiceClassId: 0x1101 }] });
    expect(robot.link.getSnapshot()).toMatchObject({ state: "on", commands: "ADZ", turns: "arc" });
    await robot.link.send("AADZ");
    expect(robot.written).toContain("RUN test-id AADZ\n");
    expect(robot.link.getSnapshot().busy).toBe(true);
    robot.receive("STATUS test-id OK\nSTATUS test-id RU");
    await vi.waitFor(() => expect(robot.link.getSnapshot().last?.status).toBe("received"));
    robot.receive("N\r\nSTATUS other-id DONE\n");
    await vi.waitFor(() => expect(robot.link.getSnapshot().last?.status).toBe("running"));
    expect(robot.link.getSnapshot().busy).toBe(true);
    robot.receive("STATUS test-id DONE\n");
    await vi.waitFor(() => expect(robot.link.getSnapshot().busy).toBe(false));
    expect(robot.link.getSnapshot().last?.status).toBe("done");
    await robot.link.disconnect();
    expect(robot.port.readable?.locked).toBe(false);
    expect(robot.port.writable?.locked).toBe(false);
    expect(robot.port.close).toHaveBeenCalledOnce();
  });

  it("no envía retroceso ni un segundo programa mientras espera al robot", async () => {
    const robot = device();
    await robot.link.connect();
    await robot.link.send("AR");
    expect(robot.link.getSnapshot().error).toMatch(/retroceder/);
    expect(robot.written.some((text) => text.startsWith("RUN"))).toBe(false);
    await robot.link.send("A");
    await robot.link.send("D");
    expect(robot.written.filter((text) => text.startsWith("RUN"))).toEqual(["RUN test-id A\n"]);
    await robot.link.stop();
    expect(robot.written).toContain("STOP\n");
    expect(robot.link.getSnapshot().busy).toBe(true); // espera confirmación física
    robot.receive("STATUS test-id ERR:STOPPED\n");
    await vi.waitFor(() => expect(robot.link.getSnapshot().busy).toBe(false));
    expect(robot.link.getSnapshot().last?.status).toBe("failed");
    await robot.link.disconnect();
  });

  it("cierra un puerto sin firmware compatible y permite volver a intentarlo", async () => {
    vi.useFakeTimers();
    const robot = device({ hello: false });
    const connection = robot.link.connect();
    await vi.advanceTimersByTimeAsync(101);
    await connection;
    expect(robot.link.getSnapshot()).toMatchObject({ state: "off", busy: false });
    expect(robot.link.getSnapshot().error).toMatch(/firmware/);
    expect(robot.port.close).toHaveBeenCalledOnce();
  });

  it("cancelar el selector no inventa un error ni deja conectado", async () => {
    const link = createBluetoothLink({ serial: { requestPort: async () => { throw new DOMException("cancelado", "NotFoundError"); } } });
    await link.connect();
    expect(link.getSnapshot()).toMatchObject({ state: "off", error: null });
  });

  it("explica en español un bloqueo de permisos del navegador", async () => {
    const link = createBluetoothLink({ serial: { requestPort: async () => { throw new DOMException("Access denied", "SecurityError"); } } });
    await link.connect();
    expect(link.getSnapshot().state).toBe("off");
    expect(link.getSnapshot().error).toMatch(/permiso/i);
  });

  it("no abre un puerto elegido después de cancelar la conexión", async () => {
    const robot = device();
    let select!: (port: SerialPortLike) => void;
    const link = createBluetoothLink({ serial: { requestPort: () => new Promise((resolve) => { select = resolve; }) } });
    const connecting = link.connect();
    await link.disconnect();
    select(robot.port);
    await connecting;
    expect(robot.port.open).not.toHaveBeenCalled();
    expect(link.getSnapshot().state).toBe("off");
  });

  it("libera un puerto que termina de abrir después de desmontar la pantalla", async () => {
    const robot = device();
    let finishOpen!: () => void;
    let startedOpen!: () => void;
    const opening = new Promise<void>((resolve) => { startedOpen = resolve; });
    robot.port.open = () => new Promise((resolve) => { finishOpen = resolve; startedOpen(); });
    const connecting = robot.link.connect();
    await opening;
    await robot.link.disconnect();
    finishOpen();
    await connecting;
    expect(robot.port.close).toHaveBeenCalledOnce();
    expect(robot.link.getSnapshot().state).toBe("off");
  });

  it("no abre un puerto cancelado mientras esperaba el cierre de la conexión anterior", async () => {
    let finishClose!: () => void;
    const old = device();
    const next = device();
    old.port.close = vi.fn(() => new Promise<void>((resolve) => { finishClose = resolve; }));
    old.serial.requestPort.mockResolvedValueOnce(old.port).mockResolvedValueOnce(next.port);
    await old.link.connect();
    const closing = old.link.disconnect();
    await vi.waitFor(() => expect(old.port.close).toHaveBeenCalledOnce());
    const connecting = old.link.connect();
    await Promise.resolve();
    const cancelled = old.link.disconnect();
    finishClose();
    await Promise.all([closing, connecting, cancelled]);
    expect(next.port.open).not.toHaveBeenCalled();
  });

  it("pierde conexión al faltar latidos y no reintenta programas", async () => {
    vi.useFakeTimers();
    const robot = device({ pong: false });
    await robot.link.connect();
    await robot.link.send("A");
    await vi.advanceTimersByTimeAsync(4000);
    expect(robot.link.getSnapshot()).toMatchObject({ state: "off", busy: false });
    expect(robot.link.getSnapshot().error).toMatch(/conexión/);
    expect(robot.written.filter((text) => text.startsWith("RUN"))).toHaveLength(1);
    await robot.link.disconnect();
  });

  it("ignora estados repetidos que intentarían reabrir un programa terminado", async () => {
    const robot = device();
    await robot.link.connect();
    await robot.link.send("A");
    robot.receive("STATUS test-id DONE\nSTATUS test-id RUN\n");
    await vi.waitFor(() => expect(robot.link.getSnapshot().busy).toBe(false));
    expect(robot.link.getSnapshot().last?.status).toBe("done");
    await robot.link.disconnect();
  });

  it("el fallo tardío de una parada anterior no desconecta al robot recién elegido", async () => {
    vi.useFakeTimers();
    let rejectStop!: (error: Error) => void;
    const old = device({ stopWrite: () => new Promise((_resolve, reject) => { rejectStop = reject; }) });
    const next = device();
    old.serial.requestPort.mockResolvedValueOnce(old.port).mockResolvedValueOnce(next.port);
    await old.link.connect();
    await old.link.send("A");
    const stopping = old.link.stop();
    await Promise.resolve();
    const disconnecting = old.link.disconnect();
    await vi.advanceTimersByTimeAsync(151);
    await disconnecting;
    await old.link.connect();
    expect(old.link.getSnapshot().state).toBe("on");
    rejectStop(new Error("el puerto anterior se cerró"));
    await stopping;
    expect(old.link.getSnapshot().state).toBe("on");
    await old.link.disconnect();
  });

  it("un corte del stream o exceso de datos desconecta y libera el puerto", async () => {
    for (const fault of ["disconnect", "overflow"]) {
      const robot = device();
      await robot.link.connect();
      if (fault === "disconnect") robot.input().error(new Error("radio apagada"));
      else robot.receive("X".repeat(201));
      await vi.waitFor(() => expect(robot.link.getSnapshot().state).toBe("off"));
      await robot.link.disconnect();
      expect(robot.port.close).toHaveBeenCalledOnce();
    }
  });
});
