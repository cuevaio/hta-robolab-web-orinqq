// Doble del periférico para pruebas: protocolo y streams de la web son reales.
import { vi } from "vitest";

class Notifications extends EventTarget {
  value?: DataView;
  startNotifications = vi.fn(async () => this);
  notify(text: string) {
    const bytes = new TextEncoder().encode(text);
    this.value = new DataView(bytes.buffer);
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }
}

export function bleTestDevice({ autoHello = true, onFrame }: {
  autoHello?: boolean;
  onFrame?: (frame: string, reply: (text: string) => void) => void;
} = {}) {
  const frames: string[] = [];
  const chunks: Uint8Array[] = [];
  const sessions: { tx: Notifications; rx: { writeValueWithResponse: ReturnType<typeof vi.fn> } }[] = [];
  const device = new EventTarget();
  const gatt = {
    connected: false,
    connect: vi.fn(async () => {
      gatt.connected = true;
      let pending = "";
      const tx = new Notifications();
      const rx = { writeValueWithResponse: vi.fn(async (data: Uint8Array) => {
        chunks.push(data.slice());
        pending += new TextDecoder().decode(data);
        while (pending.includes("\n")) {
          const end = pending.indexOf("\n") + 1;
          const frame = pending.slice(0, end); pending = pending.slice(end);
          frames.push(frame);
          if (frame === "HELLO\n" && autoHello) tx.notify("ROBO/1 ADZ ARC\n");
          if (frame === "PING\n") tx.notify("PONG\n");
          onFrame?.(frame, (text) => tx.notify(text));
        }
      }) };
      sessions.push({ tx, rx });
      return gatt;
    }),
    disconnect: vi.fn(() => {
      if (!gatt.connected) return;
      gatt.connected = false;
      device.dispatchEvent(new Event("gattserverdisconnected"));
    }),
    getPrimaryService: vi.fn(async (uuid: string) => {
      if (uuid !== "6e400001-b5a3-f393-e0a9-e50e24dcca9e") throw new Error("Servicio BLE incorrecto.");
      const session = sessions.at(-1)!;
      return { getCharacteristic: vi.fn(async (characteristic: string) => {
        if (characteristic === "6e400002-b5a3-f393-e0a9-e50e24dcca9e") return session.rx;
        if (characteristic === "6e400003-b5a3-f393-e0a9-e50e24dcca9e") return session.tx;
        throw new Error("Característica BLE incorrecta.");
      }) };
    }),
  };
  const peripheral = Object.assign(device, { name: "RoboLab", gatt });
  const bluetooth = { requestDevice: vi.fn(async () => peripheral) };
  return { device: peripheral, gatt, bluetooth, frames, chunks, sessions,
    get tx() { return sessions.at(-1)!.tx; }, get rx() { return sessions.at(-1)!.rx; },
  };
}
