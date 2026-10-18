import { afterEach, expect, it, vi } from "vitest";
import { createJetsonLink } from "./localGeneration";
import type { JetsonSerialApi, JetsonSerialPort } from "./localGeneration";
const links: ReturnType<typeof createJetsonLink>[] = [];
afterEach(async () => { await Promise.all(links.splice(0).map(link => link.disconnect())); vi.unstubAllGlobals(); });
function fake(handler?: (message: Record<string, unknown>) => unknown, handshakeMs = 100) {
  const sent: Record<string, unknown>[] = [];
  let input!: ReadableStreamDefaultController<Uint8Array>;
  const port: JetsonSerialPort = {
    readable: new ReadableStream({ start(c) { input = c; } }),
    writable: new WritableStream({ write(bytes) {
      const m = JSON.parse(new TextDecoder().decode(bytes)); sent.push(m);
      const result = handler ? handler(m) : m.method === "hello" ? { device: "robolab-jetson", protocol: 1, ready: true, model: "qwen", provider: "ollama" } : m.method === "generate" ? { generationId: "proof", missions: [], failed: [{ grade: 2, code: "UNSOLVABLE" }] } : { alive: true };
      if (result !== undefined) {
        const response = new TextEncoder().encode(JSON.stringify({ v: 1, id: m.id, ok: true, result }) + "\n");
        input.enqueue(response.slice(0, 7)); input.enqueue(response.slice(7));
      }
    } }),
    open: vi.fn(async () => {}), close: vi.fn(async () => {}),
  };
  const serial: JetsonSerialApi = { requestPort: vi.fn(async () => port) };
  const link = createJetsonLink({ serial, handshakeMs, generationMs: 1000 }); links.push(link);
  return { link, serial, port, sent, input };
}
it("elige el dispositivo por un clic, comprueba su identidad y transmite sin HTTP ni credenciales", async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No debe usar HTTP en la laptop"); }));
  const s = fake(); expect(s.sent).toHaveLength(0);
  await s.link.connect();
  expect(s.serial.requestPort).toHaveBeenCalledWith({ filters: [{ usbVendorId: 0x0955 }] });
  expect(s.port.open).toHaveBeenCalledWith({ baudRate: 115200 });
  expect(await s.link.generate({ objective: "Comparar costos", grades: [2] })).toMatchObject({ failed: [{ code: "UNSOLVABLE" }] });
  expect(s.sent.find(m => m.method === "generate")).toMatchObject({ v: 1, params: { objective: "Comparar costos", grades: [2] } });
  expect(fetch).not.toHaveBeenCalled();
});
it("rechaza otro dispositivo aunque responda en JSON", async () => {
  const s = fake(() => ({ device: "otro", protocol: 1, ready: true }));
  await expect(s.link.connect()).rejects.toThrow(/no es una Jetson/);
  expect(s.port.close).toHaveBeenCalled();
});
it("explica el modelo no disponible y la selección cancelada", async () => {
  const s = fake(() => ({ device: "robolab-jetson", protocol: 1, provider: "ollama", ready: false }));
  await expect(s.link.connect()).rejects.toThrow(/modelo/);
  const cancelled = createJetsonLink({ serial: { requestPort: async () => { throw new DOMException("Cancelado", "NotFoundError"); } } });
  links.push(cancelled); await expect(cancelled.connect()).rejects.toThrow(/seleccionaste/);
});
it("cancela la inferencia por el mismo puerto sin cambiar a otro proveedor", async () => {
  const s = fake(m => m.method === "hello" ? { device: "robolab-jetson", protocol: 1, provider: "ollama", ready: true } : undefined);
  await s.link.connect(); const controller = new AbortController();
  const result = s.link.generate({ objective: "Comparar costos", grades: [2] }, controller.signal);
  controller.abort(); await expect(result).rejects.toThrow();
  await vi.waitFor(() => expect(s.sent.some(m => m.method === "cancel")).toBe(true));
});
it("rechaza la solicitud activa y avisa al desconectar el cable", async () => {
  const s = fake(m => m.method === "hello" ? { device: "robolab-jetson", protocol: 1, provider: "ollama", ready: true } : undefined);
  const disconnected = vi.fn(); s.link.subscribeDisconnected(disconnected);
  await s.link.connect(); const result = s.link.generate({ objective: "Comparar costos", grades: [2] });
  s.input.error(new Error("USB retirado"));
  await expect(result).rejects.toThrow(/conexión/);
  expect(disconnected).toHaveBeenCalled();
});
it("limita respuestas del dispositivo y no acepta tramas sin identidad coincidente", async () => {
  const s = fake(() => undefined); const pending = s.link.connect();
  await vi.waitFor(() => expect(s.sent.length).toBe(1));
  s.input.enqueue(new TextEncoder().encode("x".repeat(513 * 1024)));
  await expect(pending).rejects.toThrow(/grande/);
});

it("repite solo la identificación si el servicio aún estaba arrancando", async () => {
  let hellos = 0;
  const s = fake(m => m.method === "hello" && ++hellos > 1 ? { device: "robolab-jetson", protocol: 1, provider: "ollama", ready: true } : undefined, 2000);
  await s.link.connect();
  expect(hellos).toBeGreaterThan(1);
  expect(new Set(s.sent.filter(m => m.method === "hello").map(m => m.id)).size).toBe(1);
});
