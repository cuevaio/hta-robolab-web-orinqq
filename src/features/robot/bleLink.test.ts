import { afterEach, describe, expect, it, vi } from "vitest";
import { createBleLink } from "./bleLink";
import { bleTestDevice } from "./bleTestDevice";

const links: ReturnType<typeof createBleLink>[] = [];
afterEach(async () => { for (const link of links.splice(0)) await link.disconnect(); vi.useRealTimers(); });
describe("BLE desde la web, sin puerto ni emparejamiento del sistema", () => {
  it("abre el selector en el gesto del usuario y confirma HELLO antes de conectar", async () => {
    const peripheral = bleTestDevice({ autoHello: false });
    const link = createBleLink({ bluetooth: peripheral.bluetooth }); links.push(link);
    const connecting = link.connect();
    expect(peripheral.bluetooth.requestDevice).toHaveBeenCalledWith({ filters: [{
      namePrefix: "RoboLab", services: ["6e400001-b5a3-f393-e0a9-e50e24dcca9e"],
    }] });
    await vi.waitFor(() => expect(peripheral.frames).toContain("HELLO\n"));
    expect(link.getSnapshot().state).toBe("searching");
    peripheral.tx.notify("ROBO/1 AD"); peripheral.tx.notify("Z ARC\n");
    await connecting;
    expect(link.getSnapshot()).toMatchObject({ state: "on", commands: "ADZ", turns: "arc" });
  });

  it("fragmenta el programa en escrituras de hasta 20 bytes sin repetir el RUN", async () => {
    const peripheral = bleTestDevice();
    const link = createBleLink({ bluetooth: peripheral.bluetooth, uuid: () => "ble-run-1" }); links.push(link);
    await link.connect();
    await link.send("A".repeat(40));
    expect(peripheral.frames).toEqual(["HELLO\n", "RUN ble-run-1 " + "A".repeat(40) + "\n"]);
    expect(peripheral.chunks.every((chunk) => chunk.length <= 20)).toBe(true);
    expect(link.getSnapshot().last?.status).toBe("sending");
    peripheral.tx.notify("STATUS ble-run-1 OK\nSTATUS ble-run-1 RUN\n");
    await vi.waitFor(() => expect(link.getSnapshot().last?.status).toBe("running"));
    peripheral.tx.notify("STATUS ble-run-1 DONE\n");
    await vi.waitFor(() => expect(link.getSnapshot().busy).toBe(false));
  });

  it("detecta un corte, obtiene características nuevas y reconecta sin reenviar movimientos", async () => {
    const peripheral = bleTestDevice();
    const link = createBleLink({ bluetooth: peripheral.bluetooth, uuid: () => "ble-run-1" }); links.push(link);
    await link.connect(); await link.send("A");
    const previousTx = peripheral.tx;
    peripheral.gatt.disconnect();
    await vi.waitFor(() => expect(link.getSnapshot().state).toBe("off"));
    expect(link.getSnapshot().last?.status).toBe("failed");
    await link.connect();
    previousTx.notify("ROBO/1 ARDZ PIVOT\nSTATUS ble-run-1 DONE\n");
    expect(link.getSnapshot()).toMatchObject({ state: "on", commands: "ADZ", turns: "arc", busy: false, last: null });
    expect(peripheral.sessions).toHaveLength(2);
    expect(peripheral.frames).toEqual(["HELLO\n", "RUN ble-run-1 A\n", "HELLO\n"]);
  });

  it("no usa Web Serial como sustituto si falta Web Bluetooth", async () => {
    const link = createBleLink({ bluetooth: null }); links.push(link);
    expect(link.supported).toBe(false);
    await link.connect();
    expect(link.getSnapshot().error).toMatch(/Web Bluetooth|BLE/);
  });

  it("cancelar el selector deja el enlace apagado y sin error", async () => {
    const peripheral = bleTestDevice();
    peripheral.bluetooth.requestDevice.mockRejectedValueOnce(new DOMException("User cancelled", "NotFoundError"));
    const link = createBleLink({ bluetooth: peripheral.bluetooth }); links.push(link);
    await link.connect();
    expect(link.getSnapshot()).toMatchObject({ state: "off", error: null, diagnostic: null });
    expect(peripheral.frames).toEqual([]);
  });

  it("un error al abrir GATT conserva el diagnóstico y libera el dispositivo", async () => {
    const peripheral = bleTestDevice();
    peripheral.gatt.connect.mockRejectedValueOnce(new DOMException("GATT connection failed", "NetworkError"));
    const link = createBleLink({ bluetooth: peripheral.bluetooth }); links.push(link);
    await link.connect();
    expect(link.getSnapshot()).toMatchObject({ state: "off", diagnostic: { stage: "open", name: "NetworkError", message: "GATT connection failed" } });
    expect(peripheral.gatt.connected).toBe(false);
    expect(link.getSnapshot().error).toMatch(/BLE|Bluetooth/);
    await link.connect();
    expect(link.getSnapshot().state).toBe("on");
  });

  it("una pantalla nueva espera la desconexión de la anterior antes de abrir GATT", async () => {
    const peripheral = bleTestDevice();
    const first = createBleLink({ bluetooth: peripheral.bluetooth }); links.push(first);
    await first.connect();
    let finishStop!: () => void;
    let startedStop!: () => void;
    const stopping = new Promise<void>((resolve) => { startedStop = resolve; });
    peripheral.rx.writeValueWithResponse.mockImplementationOnce(() => new Promise<void>((resolve) => { finishStop = resolve; startedStop(); }));
    const closing = first.disconnect();
    await stopping;
    const next = createBleLink({ bluetooth: peripheral.bluetooth }); links.push(next);
    const connecting = next.connect();
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(peripheral.gatt.connect).toHaveBeenCalledTimes(1);
    } finally {
      finishStop();
      await Promise.all([closing, connecting]);
    }
    expect(next.getSnapshot().state).toBe("on");
  });

  it("cancelar durante el descubrimiento GATT libera el robot antes del timeout", async () => {
    const peripheral = bleTestDevice();
    let rejectDiscovery!: (error: Error) => void;
    let startedDiscovery!: () => void;
    const discovering = new Promise<void>((resolve) => { startedDiscovery = resolve; });
    peripheral.gatt.getPrimaryService.mockImplementationOnce(() => {
      startedDiscovery();
      return new Promise((_, reject) => { rejectDiscovery = reject; });
    });
    const disconnect = peripheral.gatt.disconnect.getMockImplementation()!;
    peripheral.gatt.disconnect.mockImplementation(() => {
      disconnect();
      rejectDiscovery(new DOMException("GATT disconnected", "NetworkError"));
    });
    const link = createBleLink({ bluetooth: peripheral.bluetooth }); links.push(link);
    const connecting = link.connect();
    await discovering;
    const closing = link.disconnect();
    try {
      expect(peripheral.gatt.connected).toBe(false);
      expect(peripheral.gatt.disconnect).toHaveBeenCalled();
    } finally {
      rejectDiscovery(new DOMException("External timeout", "NetworkError"));
      await Promise.all([connecting, closing]);
    }
    await link.connect();
    expect(link.getSnapshot().state).toBe("on");
  });
});
