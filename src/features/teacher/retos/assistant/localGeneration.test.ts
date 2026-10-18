import { afterEach, expect, it, vi } from "vitest";
import { checkLocalModel, requestLocalMissions } from "./localGeneration";
afterEach(() => vi.unstubAllGlobals());
it("pide inferencia al loopback, con JSON y sin credenciales de Convex", async () => {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    expect(url).toBe("http://127.0.0.1:8765/generate");
    expect(init.credentials).toBe("omit");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ objective: "Sumar costos", grades: [2] });
    return Response.json({ missions: [], failed: [{ grade: 2, code: "PROVIDER_TIMEOUT" }] });
  });
  expect(await requestLocalMissions({ objective: "Sumar costos", grades: [2] })).toMatchObject({ failed: [{ code: "PROVIDER_TIMEOUT" }] });
});
it("comprueba el modelo y rechaza respuestas ajenas al contrato de transporte", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ ready: true }));
  expect(await checkLocalModel()).toBe(true);
  await expect(requestLocalMissions({ objective: "Sumar costos", grades: [2] })).rejects.toThrow(/respuesta/i);
});
it("explica un conector ocupado sin intentar otro proveedor", async () => {
  vi.stubGlobal("fetch", async () => new Response("", { status: 409 }));
  await expect(requestLocalMissions({ objective: "Sumar costos", grades: [2] })).rejects.toThrow(/otra misión/);
});
