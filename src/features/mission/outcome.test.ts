import { describe, expect, it } from "vitest";
import { outcomeMessage } from "./outcome";

describe("lo que Robi dice al terminar el recorrido", () => {
  it("celebra al llegar y no culpa en los errores: dice qué pasó y en qué paso", () => {
    expect(outcomeMessage("SUCCESS")).toMatch(/Llegaste a la meta/);
    expect(outcomeMessage("COLLISION", 3)).toBe("Robi chocó con un obstáculo en el paso 3. Prueba otro camino.");
    expect(outcomeMessage("OUT_OF_BOUNDS", 1)).toMatch(/se salió del tablero en el paso 1/);
    expect(outcomeMessage("ENERGY_EXCEEDED", 5)).toMatch(/Se acabó la energía en el paso 5/);
  });
  it("el robot se llama Robi en todos los mensajes, nunca Kusi", () => {
    for (const outcome of ["SUCCESS", "COLLISION", "OUT_OF_BOUNDS", "ENERGY_EXCEEDED", "MISSING_CHECKPOINTS", "INCOMPLETE"] as const) {
      expect(outcomeMessage(outcome, 2)).not.toMatch(/Kusi/);
    }
    expect(outcomeMessage("COLLISION", 3)).toMatch(/^Robi /);
  });
  it("sin paso, no inventa uno", () => {
    expect(outcomeMessage("COLLISION")).not.toMatch(/paso/);
  });
  it("distingue faltar estaciones de no llegar", () => {
    expect(outcomeMessage("MISSING_CHECKPOINTS")).toMatch(/faltan estaciones/);
    expect(outcomeMessage("INCOMPLETE")).toMatch(/antes de llegar a la meta/);
  });
});
