// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { missionById } from "@robolab/backend/domain/lab/mission";
import { ToastProvider } from "../../shared/ui/Toast";

const recordPlay = vi.fn((_args: unknown) => Promise.resolve({ ok: false }));
vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => recordPlay }));

import { LabPlayer } from "./LabPlayer";

const RUTA = missionById("primaria-tecnologia-materiales")!;

function start() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <LabPlayer mission={RUTA} missionId={RUTA.id} back={{ to: "/explorar/tecnologia/primaria", label: "Volver a la lista" }} />
      </ToastProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Empezar la misión/ }));
}

/** Lo que dice Robi (el globo de la guía). */
const status = () => document.querySelector(".guide-bubble p")?.textContent;

beforeEach(() => {
  vi.useFakeTimers();
  recordPlay.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("jugador de misiones: flechas → ejecutar → mensaje", () => {
  it("una flecha a la derecha no llega a la meta, y el servidor recibe la partida", () => {
    start();
    expect(screen.getByRole("button", { name: /Nivel 1/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Nivel 2/ }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Derecha" }));
    expect(screen.getByRole("button", { name: "Paso 1: Derecha. Toca para quitar." }).textContent).toBe("→ ×");
    expect(screen.getByText(/Energía 0 \/ 30/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Ejecutar/ }));
    expect(status()).toBe("Ejecutando tu programa…");
    act(() => vi.advanceTimersByTime(3000));
    expect(status()).toBe("Todavía no: No llegó a la meta. Revisa tu secuencia.");
    expect(screen.getByText(/Energía 1 \/ 30/)).toBeTruthy();
    expect(recordPlay).toHaveBeenCalledTimes(1);
    expect(recordPlay.mock.calls[0]?.[0]).toMatchObject({ missionId: RUTA.id, level: 0, arrows: ["R"], hints: 0, runs: 1 });
    expect(screen.getByRole("button", { name: /Sincronizar con robot/ })).toBeTruthy();
  });

  it("la solución verificada completa la misión y habilita el siguiente nivel", () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "Ver solución verificada" }));
    expect(status()).toMatch(/^Ruta verificada por el validador: \d+ pasos y 12 de energía/);
    fireEvent.click(screen.getByRole("button", { name: /Ejecutar/ }));
    act(() => vi.advanceTimersByTime(5000));
    expect(status()).toBe("¡Misión completada! Ruta válida y dentro del presupuesto. Puedes enviarla al robot.");
    expect(screen.getByText(/Estaciones 1 \/ 1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Siguiente nivel/ })).toBeTruthy();

    // El avance local anota la misión resuelta.
    expect(JSON.parse(window.localStorage.getItem("robolab.avance") ?? "{}").records[RUTA.id]?.solved).toBe(true);
  });

  it("la pista explica el último error y se cuenta en la siguiente ejecución", () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: /Pista/ }));
    expect(status()).toBe(RUTA.hints[0]);
    fireEvent.click(screen.getByRole("button", { name: "Abajo" }));
    fireEvent.click(screen.getByRole("button", { name: "Derecha" })); // (1,1) es pared
    fireEvent.click(screen.getByRole("button", { name: /Ejecutar/ }));
    act(() => vi.advanceTimersByTime(3000));
    expect(status()).toBe("Todavía no: El robot chocó con una pared. Revisa tu secuencia.");
    expect(recordPlay.mock.calls[0]?.[0]).toMatchObject({ arrows: ["D", "R"], hints: 1 });
    fireEvent.click(screen.getByRole("button", { name: /Pista/ }));
    expect(status()).toBe("Pista: mira qué casilla es una pared e intenta rodearla.");
  });

  it("deshacer y limpiar vacían el programa; borrar un paso tocándolo también", () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "Arriba" }));
    fireEvent.click(screen.getByRole("button", { name: "Izquierda" }));
    fireEvent.click(screen.getByRole("button", { name: "Paso 1: Arriba. Toca para quitar." }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Deshacer/ }));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Derecha" }));
    fireEvent.click(screen.getByRole("button", { name: /Limpiar/ }));
    expect(status()).toBe("Programa limpio. Prueba otra estrategia.");
    expect(screen.getByText("Pulsa una flecha para empezar…")).toBeTruthy();
  });
});
