import { afterEach, describe, expect, it, vi } from "vitest";
import { createUsbLink } from "./usbLink";
import { serialTestDevice } from "./serialTestDevice";

const links: ReturnType<typeof createUsbLink>[] = [];
afterEach(async () => { for (const link of links.splice(0)) await link.disconnect(); vi.useRealTimers(); });

describe("USB serial con Chrome", () => {
  it("elige un puerto USB y sincroniza/parada antes de confirmar la identidad", async () => {
    const robot = serialTestDevice();
    const link = createUsbLink({ serial: robot.serial }); links.push(link);
    const connecting = link.connect();
    expect(robot.serial.requestPort).toHaveBeenCalledWith({ filters: [
      { usbVendorId: 0x1a86 }, { usbVendorId: 0x10c4 }, { usbVendorId: 0x0403 }, { usbVendorId: 0x303a },
    ] });
    await connecting;
    expect(robot.writes[0]).toBe("\0\nSTOP\nHELLO\n");
    expect(link.getSnapshot()).toMatchObject({ state: "on", commands: "ADZ" });
    expect(robot.port.open).toHaveBeenCalledWith({ baudRate: 115200 });
  });

  it("tolera el reinicio al abrir USB repitiendo solo el saludo y termina los reintentos al conectar", async () => {
    vi.useFakeTimers();
    const robot = serialTestDevice({ bootHellos: 2 });
    const link = createUsbLink({ serial: robot.serial, handshakeMs: 100, helloRetryMs: 10 }); links.push(link);
    const connecting = link.connect();
    await vi.advanceTimersByTimeAsync(110);
    await connecting;
    expect(link.getSnapshot().state).toBe("on");
    expect(robot.frames.filter((frame) => frame === "HELLO\n")).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(100);
    expect(robot.frames.filter((frame) => frame === "HELLO\n")).toHaveLength(3);
    expect(robot.frames.some((frame) => frame.startsWith("RUN"))).toBe(false);
  });

  it("desenchufar falla el programa y reconectar nunca reenvía sus movimientos", async () => {
    const robot = serialTestDevice();
    const link = createUsbLink({ serial: robot.serial, uuid: () => "usb-run" }); links.push(link);
    await link.connect(); await link.send("A");
    robot.unplug();
    await vi.waitFor(() => expect(link.getSnapshot().state).toBe("off"));
    expect(link.getSnapshot().last?.status).toBe("failed");
    await link.connect();
    expect(link.getSnapshot().state).toBe("on");
    expect(robot.frames.filter((frame) => frame.startsWith("RUN"))).toEqual(["RUN usb-run A\n"]);
  });

  it("explica USB y Chrome si el navegador no ofrece Web Serial", async () => {
    const link = createUsbLink({ serial: null }); links.push(link);
    await link.connect();
    expect(link.getSnapshot().error).toMatch(/USB.*Chrome|Chrome.*USB/);
    expect(link.getSnapshot().error).not.toMatch(/Bluetooth/);
  });

  it("un saludo anterior que falla tarde no cancela el nuevo intento de conexión", async () => {
    vi.useFakeTimers();
    const old = serialTestDevice(), next = serialTestDevice({ bootHellos: Infinity });
    let rejectOldHello!: (error: Error) => void;
    const open = old.port.open.getMockImplementation()!;
    old.port.open.mockImplementation(async () => {
      await open();
      old.port.writable = new WritableStream<Uint8Array>({ write: () => new Promise<void>((_, reject) => { rejectOldHello = reject; }) });
    });
    const serial = { requestPort: vi.fn().mockResolvedValueOnce(old.port).mockResolvedValueOnce(next.port) };
    const link = createUsbLink({ serial }); links.push(link);
    const first = link.connect();
    await vi.advanceTimersByTimeAsync(0);
    const closing = link.disconnect();
    await vi.advanceTimersByTimeAsync(151);
    await Promise.all([first, closing]);
    const connecting = link.connect();
    await vi.advanceTimersByTimeAsync(0);
    rejectOldHello(new Error("Fallo tardío del saludo anterior"));
    await vi.advanceTimersByTimeAsync(0);
    expect(link.getSnapshot()).toMatchObject({ state: "searching", error: null });
    next.receive("ROBO/1 ADZ ARC\n");
    await connecting;
    expect(link.getSnapshot().state).toBe("on");
  });
});
