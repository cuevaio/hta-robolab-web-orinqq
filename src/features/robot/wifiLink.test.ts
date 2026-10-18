import { describe, expect, it, vi } from "vitest";
import { type RobotEvent, createWifiLink } from "./wifiLink";
import source from "./wifiLink.ts?raw";

/** Un relé falso: responde como las rutas /robot/web/* y avanza el estado en cada consulta. */
function fakeRelay(options: { busy?: boolean; states?: string[]; badCode?: boolean } = {}) {
  const states = [...(options.states ?? ["ENTREGADO", "OK", "RUN", "DONE"])];
  const calls: { url: string; body?: unknown }[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (options.badCode) return new Response(JSON.stringify({ estado: "ERR:NO_ROBOT" }), { status: 404 });
    if (url.includes("/robot/web/enviar")) {
      // Como el relé real (probado en convex/robot.test.ts): valida las letras.
      if (!/^[ARDZ]+$/.test(body.secuencia)) return new Response(JSON.stringify({ estado: "ERR:BAD_CHAR" }), { status: 400 });
      return options.busy
        ? new Response(JSON.stringify({ estado: "ERR:BUSY" }), { status: 409 })
        : new Response(JSON.stringify({ estado: "EN_COLA", id: body.id }), { status: 200 });
    }
    const estado = url.includes("id=") ? (states.shift() ?? "DONE") : null;
    return new Response(JSON.stringify({ estado, conectado: true, robot: "Robi" }), { status: 200 });
  });
  return { fetchImpl, calls };
}

const collect = (link: ReturnType<typeof createWifiLink>) => {
  const events: RobotEvent[] = [];
  link.subscribe((e) => events.push(e));
  return events;
};

describe("adaptador WiFi (RobotLink del contrato)", () => {
  it("se conecta con el código y envía; resuelve al enviar y avisa received, running y done", async () => {
    const relay = fakeRelay();
    const link = createWifiLink({ baseUrl: "https://relay.test", code: () => "sr965h", fetchImpl: relay.fetchImpl, pollMs: 1 });
    const events = collect(link);
    expect(link.transport).toBe("wifi");

    await link.connect();
    expect(events).toContainEqual({ type: "state", state: "connected", message: "Robi" });

    await link.send("AADZAA");
    expect(relay.calls.find((c) => c.url.includes("enviar"))?.body).toMatchObject({ codigo: "sr965h", secuencia: "AADZAA" });
    await vi.waitFor(() => expect(events).toContainEqual({ type: "done" }));
    const types = events.map((e) => (e.type === "state" ? `state:${e.state}` : e.type));
    expect(types).toEqual(["state:connecting", "state:connected", "received", "state:running", "done", "state:connected"]);
  });

  it("si entre dos consultas el robot pasó de OK a RUN (o a DONE), igual avisa received y running", async () => {
    for (const states of [["ENTREGADO", "RUN", "DONE"], ["ENTREGADO", "DONE"]]) {
      const relay = fakeRelay({ states });
      const link = createWifiLink({ baseUrl: "https://relay.test", code: () => "SR965H", fetchImpl: relay.fetchImpl, pollMs: 1 });
      const events = collect(link);
      await link.connect();
      await link.send("AA");
      await vi.waitFor(() => expect(events).toContainEqual({ type: "done" }));
      const types = events.map((e) => (e.type === "state" ? `state:${e.state}` : e.type));
      expect(types).toEqual(["state:connecting", "state:connected", "received", "state:running", "done", "state:connected"]);
    }
  });

  it("si el robot está ocupado, el envío falla con BUSY", async () => {
    const relay = fakeRelay({ busy: true });
    const link = createWifiLink({ baseUrl: "https://relay.test", code: () => "SR965H", fetchImpl: relay.fetchImpl, pollMs: 1 });
    const events = collect(link);
    await link.connect();
    await expect(link.send("A")).rejects.toThrow("BUSY");
    expect(events).toContainEqual({ type: "failed", reason: "BUSY" });
  });

  it("avisa los errores del relé (BAD_CHAR) y los del robot (MOTOR)", async () => {
    const relay = fakeRelay({ states: ["OK", "ERR:MOTOR"] });
    const link = createWifiLink({ baseUrl: "https://relay.test", code: () => "SR965H", fetchImpl: relay.fetchImpl, pollMs: 1 });
    const events = collect(link);
    await link.connect();
    await expect(link.send("AXA")).rejects.toThrow("BAD_CHAR");
    await link.send("AA");
    await vi.waitFor(() => expect(events).toContainEqual({ type: "failed", reason: "MOTOR" }));
  });

  it("es un solo archivo sin dependencias: otra web lo copia tal cual", () => {
    expect(source).toContain("export function createWifiLink");
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it("manda el código tal como lo escribió el usuario, sin romper la dirección", async () => {
    const relay = fakeRelay();
    const link = createWifiLink({ baseUrl: "https://relay.test", code: () => " sr9&id=x ", fetchImpl: relay.fetchImpl, pollMs: 1 });
    await link.connect();
    // El relé normaliza el código (mayúsculas, sin espacios): el adaptador no repite esa regla.
    expect(relay.calls[0]!.url).toBe("https://relay.test/robot/web/estado?codigo=%20sr9%26id%3Dx%20");
  });

  it("un código que no existe deja el enlace en error", async () => {
    const link = createWifiLink({ baseUrl: "https://relay.test", code: () => "ZZZZZZ", fetchImpl: fakeRelay({ badCode: true }).fetchImpl });
    const events = collect(link);
    await expect(link.connect()).rejects.toThrow("NO_ROBOT");
    expect(events.at(-1)).toMatchObject({ type: "state", state: "error" });
  });
});
