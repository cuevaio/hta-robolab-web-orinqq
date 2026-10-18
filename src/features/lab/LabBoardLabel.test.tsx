// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MISSIONS, missionById } from "@robolab/backend/domain/lab/mission";
import { LabBoard, placeOf } from "./LabBoard";

afterEach(cleanup);

describe("descripción del tablero para lector de pantalla", () => {
  it("dice dónde cae una casilla en palabras", () => {
    expect(placeOf([0, 0])).toBe("arriba a la izquierda");
    expect(placeOf([5, 5])).toBe("abajo a la derecha");
    expect(placeOf([0, 5])).toBe("arriba a la derecha");
    expect(placeOf([5, 0])).toBe("abajo a la izquierda");
    expect(placeOf([2, 0])).toBe("en el medio a la izquierda");
    expect(placeOf([0, 3])).toBe("arriba al centro");
    expect(placeOf([3, 2])).toBe("en el centro");
  });

  it("la misión del prototipo sigue empezando arriba a la izquierda", () => {
    const m = missionById("primaria-tecnologia-materiales")!;
    render(<LabBoard mission={m} robot={{ cell: m.start, heading: 90 }} mood="idle" stepMs={100} />);
    expect(screen.getByRole("img", { name: /Robi empieza arriba a la izquierda y debe terminar en la meta, abajo a la derecha\./ })).toBeTruthy();
  });

  it("una misión que empieza en otro lado lo dice con su inicio y su meta", () => {
    const m = missionById("primaria-ciencia-lluvia")!; // empieza abajo a la izquierda y termina arriba a la derecha
    render(<LabBoard mission={m} robot={{ cell: m.start, heading: 90 }} mood="idle" stepMs={100} />);
    expect(screen.getByRole("img", { name: /Robi empieza abajo a la izquierda y debe terminar en la meta, arriba a la derecha\./ })).toBeTruthy();
  });

  it("nunca dice «arriba a la izquierda» de una misión que no empieza ahí", () => {
    for (const m of MISSIONS.filter((x) => x.start[0] !== 0 || x.start[1] !== 0)) {
      render(<LabBoard mission={m} robot={{ cell: m.start, heading: 90 }} mood="idle" stepMs={100} />);
      const label = screen.getByRole("img", { name: /Tablero de 6 por 6/ }).getAttribute("aria-label")!;
      expect(label, m.id).not.toMatch(/Robi empieza arriba a la izquierda/);
      expect(label, m.id).toContain(`Robi empieza ${placeOf(m.start)}`);
      cleanup();
    }
  });
});
