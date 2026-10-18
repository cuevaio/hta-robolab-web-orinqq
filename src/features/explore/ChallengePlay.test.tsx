// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../shared/ui/Toast";

/** `robot.status` del servidor y las mutaciones (envío al robot, registro de la partida): las decide cada prueba. */
const status = vi.fn();
const mutation = vi.fn(async (_args?: unknown) => ({ robotName: "Wayra-12", letters: "FFF" }));
vi.mock("convex/react", () => ({
  useQuery: (_fn: unknown, args: unknown) => (args === "skip" ? undefined : status(args)),
  useMutation: () => mutation,
}));

const voice = vi.hoisted(() => ({ speak: vi.fn() }));
vi.mock("../student/speech", () => ({ speak: voice.speak, stopSpeaking: vi.fn(), canSpeak: () => true }));

import { ChallengeRoute } from "./ChallengePage";

const NOW = Date.UTC(2026, 9, 17, 20, 0);
const ROBOT_KEY = "robolab.robot";
const scrollTo = vi.fn();

function renderChallenge(id = "inicial-paseo") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/reto/${id}`]}>
        <Routes>
          <Route path="/reto/:id" element={<ChallengeRoute />} />
          <Route path="*" element={<p>otra página</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOW);
  window.localStorage.clear();
  status.mockReset();
  mutation.mockClear();
  // jsdom no hace scroll: se vigila que cada fase nueva pida empezar arriba.
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  scrollTo.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("el personaje se llama Wayra", () => {
  it("la ficha, la instrucción y el audio al empezar dicen Wayra, nunca Kusi", () => {
    renderChallenge();
    expect(screen.getByText(/Wayra quiere llegar a la estrella/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Empezar el reto/ }));
    expect(voice.speak).toHaveBeenCalledWith("Wayra quiere llegar a la estrella. ¡Está en línea recta!");
    expect(screen.getAllByText(/Arma el programa para que Wayra llegue a la estrella/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Kusi/);
  });
});

describe("pantalla del reto: Robot y Ejecutar", () => {
  it("al empezar el reto el foco pasa al título, para que el lector de pantalla anuncie dónde está", () => {
    renderChallenge();
    fireEvent.click(screen.getByRole("button", { name: /Empezar el reto/ }));
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.textContent).toBe("Primer paseo.");
    expect(document.activeElement).toBe(title);
  });

  it("cada fase nueva (ficha, juego) empieza arriba de la pantalla", () => {
    renderChallenge();
    scrollTo.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Empezar el reto/ }));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("Robot va arriba a la derecha de «Tu programa»; Ejecutar y la papelera, dentro del cuadro del programa", () => {
    renderChallenge();
    fireEvent.click(screen.getByRole("button", { name: /Empezar el reto/ }));
    const head = screen.getByRole("heading", { name: "Tu programa" }).closest(".program-head") as HTMLElement;
    expect(within(head).getByRole("button", { name: /^Robot/ })).toBeTruthy();
    const box = screen.getByRole("list", { name: "Tu secuencia" }).closest(".sequence") as HTMLElement;
    expect(within(box).getByRole("button", { name: /Ejecutar/ })).toBeTruthy();
    expect(within(box).getByRole("button", { name: "Borrar la secuencia" })).toBeTruthy();
    // Ya no hay barra fija al pie: Ejecutar vive en el cuadro. (Solo la usa «Comprobar», en predecir.)
    expect(document.querySelector(".game.has-action-bar")).toBeNull();
  });

  it("Wayra queda arriba a la derecha, junto al reto, con su botón de pista; el jardín es la tarjeta del tablero", () => {
    renderChallenge();
    fireEvent.click(screen.getByRole("button", { name: /Empezar el reto/ }));
    const row = document.querySelector(".goal-row") as HTMLElement;
    expect(within(row).getByRole("heading", { level: 1 })).toBeTruthy();
    const wayra = within(within(row).getByRole("complementary", { name: /Wayra/ }));
    expect(wayra.getByRole("button", { name: "Pista 0/3: pedir una pista" }).textContent).toBe(" Pista 0/3");
    fireEvent.click(wayra.getByRole("button", { name: /pedir una pista/ }));
    expect(wayra.getByRole("button", { name: /Pista 1\/3/ })).toBeTruthy();
    expect(within(screen.getByRole("complementary", { name: "Tablero" })).getByRole("heading", { level: 2 })).toBeTruthy();
  });

  it("con un robot conectado, Ejecutar también manda la secuencia al robot", async () => {
    window.localStorage.setItem("robolab.robot.transport", "wifi");
    window.localStorage.setItem(ROBOT_KEY, "K7Q4MZ");
    status.mockReturnValue({ name: "Wayra-12", lastSeenAt: NOW - 1000, codeExpiresAt: NOW + 3_600_000, lastCommand: null });
    renderChallenge();
    fireEvent.click(screen.getByRole("button", { name: /Empezar el reto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Avanzar" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Ejecutar/ }));
    });
    expect(mutation).toHaveBeenCalledWith(expect.objectContaining({ code: "K7Q4MZ", program: [{ kind: "move", command: "FORWARD" }] }));
  });

  it("sin robot conectado, Ejecutar no manda nada al robot", async () => {
    status.mockReturnValue(undefined);
    renderChallenge();
    fireEvent.click(screen.getByRole("button", { name: /Empezar el reto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Avanzar" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Ejecutar/ }));
    });
    expect(mutation).not.toHaveBeenCalled();
  });
});

describe("pantalla del reto: al lograrlo", () => {
  it("al llegar a la estrella aparece '¡Reto logrado!' con el foco en su título y las cifras de la partida", async () => {
    renderChallenge();
    fireEvent.click(screen.getByRole("button", { name: /Empezar el reto/ }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Avanzar" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Ejecutar/ }));
      // La animación (4 pasos de 450 ms) y el momento de ver a Wayra en la estrella (1,2 s).
      await vi.advanceTimersByTimeAsync(4000);
    });
    const title = screen.getByRole("heading", { level: 1, name: "¡Reto logrado!" });
    expect(document.activeElement).toBe(title);
    expect([...document.querySelectorAll(".stat-row .stat")].map((s) => s.querySelector("span")!.textContent)).toEqual(["intento", "pistas", "tiempo"]);
    expect(screen.getByRole("link", { name: /Siguiente reto/ }).getAttribute("href")).toBe("/reto/inicial-gira");
    // Solo estadística anónima: se registra la partida del dispositivo.
    expect(mutation).toHaveBeenCalledWith(expect.objectContaining({ challengeId: "inicial-paseo", runs: 1, hints: 0 }));
  });

  it("'Repetir' vuelve a jugar el mismo reto y el foco regresa al título del reto", async () => {
    renderChallenge();
    fireEvent.click(screen.getByRole("button", { name: /Empezar el reto/ }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Avanzar" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Ejecutar/ }));
      await vi.advanceTimersByTimeAsync(4000);
    });
    fireEvent.click(screen.getByRole("button", { name: /Repetir/ }));
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.textContent).toBe("Primer paseo.");
    expect(document.activeElement).toBe(title);
  });
});
