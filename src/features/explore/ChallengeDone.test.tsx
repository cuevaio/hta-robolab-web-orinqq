// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHALLENGES, challengeById, challengesFor } from "@robolab/backend/domain/explore/challenges";
import { ChallengeDone } from "./ChallengeDone";

afterEach(cleanup);

/** Las tres cifras de arriba: [valor, etiqueta]. */
const cifras = () =>
  [...document.querySelectorAll(".stat-row .stat")].map((stat) => [stat.querySelector("strong")!.textContent, stat.querySelector("span")!.textContent]);

function renderDone(id: string, stats = { runs: 2, hints: 0, ms: 192_000 }, onRepeat = () => undefined) {
  const challenge = challengeById(id)!;
  return render(
    <MemoryRouter>
      <ChallengeDone challenge={challenge} stats={stats} onRepeat={onRepeat} />
    </MemoryRouter>,
  );
}

describe("¡Reto logrado! (M6)", () => {
  it("muestra intentos, pistas y tiempo en mm:ss, y el foco queda en el título", () => {
    renderDone("inicial-paseo");
    const title = screen.getByRole("heading", { level: 1, name: "¡Reto logrado!" });
    expect(document.activeElement).toBe(title);
    expect(screen.getByText("Primer paseo · Tecnología · Inicial")).toBeTruthy();
    expect(cifras()).toEqual([
      ["2", "intentos"],
      ["0", "pistas"],
      ["3:12", "tiempo"],
    ]);
  });

  it("en singular: un intento y una pista", () => {
    renderDone("inicial-paseo", { runs: 1, hints: 1, ms: 42_000 });
    expect(cifras()).toEqual([
      ["1", "intento"],
      ["1", "pista"],
      ["0:42", "tiempo"],
    ]);
  });

  it("'Siguiente reto' es un enlace al reto que sigue, 'Volver a la lista' al tópico y nivel, y 'Repetir' vuelve a jugar", () => {
    const onRepeat = vi.fn();
    renderDone("inicial-paseo", undefined, onRepeat);
    const siguiente = screen.getByRole("link", { name: /Siguiente reto/ });
    const next = challengesFor("tecnologia", "inicial")[1]!;
    expect(siguiente.getAttribute("href")).toBe(`/reto/${next.id}`);
    expect(screen.getByRole("link", { name: "Volver a la lista" }).getAttribute("href")).toBe("/explorar/tecnologia/inicial");
    fireEvent.click(screen.getByRole("button", { name: /Repetir/ }));
    expect(onRepeat).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Tu avance se guarda en este dispositivo.")).toBeTruthy();
  });

  it("en el último reto de la lista no hay 'Siguiente reto'", () => {
    const list = challengesFor("tecnologia", "inicial");
    const last = list[list.length - 1]!;
    expect(CHALLENGES).toContain(last);
    renderDone(last.id);
    expect(screen.queryByRole("link", { name: /Siguiente reto/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Repetir/ })).toBeTruthy();
  });

  it("Robi felicita; sin pistas lo destaca", () => {
    renderDone("inicial-paseo");
    expect(screen.getByRole("complementary", { name: /Robi/ })).toBeTruthy();
    expect(screen.getByText("¡Sin pistas! ¡Qué buen trabajo!")).toBeTruthy();
  });
});
