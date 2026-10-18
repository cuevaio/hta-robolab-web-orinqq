// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const home = vi.fn();
vi.mock("convex/react", () => ({ useQuery: () => home(), useMutation: () => vi.fn() }));
const warmUp = vi.hoisted(() => vi.fn());
vi.mock("../vision/recognizer", () => ({ warmUpRecognizer: warmUp }));

import { StudentHome } from "./StudentHome";

afterEach(() => {
  cleanup();
  warmUp.mockClear();
});

const HOME = {
  displayName: "Ana",
  level: "inicial",
  classroomLabel: "Inicial · 5 años · Sección A",
  joinCode: "TEC-482",
  classChallenges: [],
};

function renderHome() {
  render(
    <MemoryRouter>
      <StudentHome token="t-1" onSignOut={() => undefined} />
    </MemoryRouter>,
  );
}

describe("portada del alumno", () => {
  it("si su clase tiene retos de Inicial, empieza a preparar los gestos desde la portada", () => {
    home.mockReturnValue({ ...HOME, classChallenges: [{ assignmentId: "a1", challengeId: "inicial-paseo", title: "Primer paseo", level: "inicial", kind: "sequence", solved: false }] });
    renderHome();
    expect(warmUp).toHaveBeenCalledOnce();
  });

  it("sin retos de Inicial no baja el modelo de gestos", () => {
    home.mockReturnValue({ ...HOME, level: "primaria", classChallenges: [{ assignmentId: "a2", challengeId: "primaria-ciencia-reparto", title: "El reparto", level: "primaria", kind: "mission", solved: false }] });
    renderHome();
    expect(warmUp).not.toHaveBeenCalled();
  });

  it("solo habla de retos: no hay evaluaciones del día ni fecha", () => {
    home.mockReturnValue(HOME);
    renderHome();
    expect(screen.getByRole("heading", { name: "Retos de tu clase" })).toBeTruthy();
    expect(screen.queryByText(/evaluaci/i)).toBeNull();
    expect(screen.queryByText(/Hoy es/)).toBeNull();
    expect(screen.queryByRole("button", { name: /empezar|intentar de nuevo|seguir jugando/i })).toBeNull();
  });

  it("saluda por el apodo, muestra el código de su clase y enlaza cada reto asignado a /reto/<id>", () => {
    home.mockReturnValue({
      ...HOME,
      displayName: "Pingüino veloz",
      classChallenges: [
        { assignmentId: "a1", challengeId: "inicial-charquito", title: "El charquito", level: "inicial", kind: "sequence", solved: true },
        { assignmentId: "a2", challengeId: "primaria-ciencia-reparto", title: "El reparto", level: "primaria", kind: "mission", solved: false },
      ],
    });
    renderHome();
    expect(screen.getByRole("heading", { name: "¡Hola, Pingüino veloz!" })).toBeTruthy();
    expect(screen.getByText(/Clase TEC-482/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Jugar en vivo" }).getAttribute("href")).toBe("/alumno/en-vivo");
    const done = screen.getByRole("link", { name: /El charquito/ }) as HTMLAnchorElement;
    expect(done.getAttribute("href")).toBe("/reto/inicial-charquito");
    expect(done.textContent).toMatch(/Logrado/);
    const mission = screen.getByRole("link", { name: /El reparto/ }) as HTMLAnchorElement;
    expect(mission.getAttribute("href")).toBe("/reto/primaria-ciencia-reparto");
    expect(mission.textContent).toMatch(/Misión/);
  });

  it("sin retos asignados, lo invita a explorar", () => {
    home.mockReturnValue(HOME);
    renderHome();
    expect(screen.getByText(/todavía no asignó retos/i)).toBeTruthy();
  });
});
