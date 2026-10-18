// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const status = vi.fn();
vi.mock("convex/react", () => ({ useQuery: () => status() }));

import { NewRetoChoice } from "./NewRetoChoice";

afterEach(cleanup);
const page = () => (
  <MemoryRouter>
    <NewRetoChoice />
  </MemoryRouter>
);

describe("Nuevo reto: dos caminos (G1)", () => {
  it("ofrece elegir un juego ya hecho («Empecemos») y crear con el asistente, marcado «IA»", () => {
    status.mockReturnValue({ configured: true });
    render(page());
    expect(document.title).toBe("Nuevo reto · RoboLab");
    expect(screen.getByRole("heading", { level: 1, name: "¿Cómo quieres crear el reto?" })).toBeTruthy();
    const empecemos = screen.getByRole("link", { name: /Empecemos/ }) as HTMLAnchorElement;
    expect(empecemos.getAttribute("href")).toBe("/docente/retos/nuevo/juego");
    const assistant = screen.getByRole("link", { name: /Crear con el asistente/ }) as HTMLAnchorElement;
    expect(assistant.getAttribute("href")).toBe("/docente/retos/nuevo/asistente");
    expect(screen.getByText("IA")).toBeTruthy();
    expect(screen.queryByText("Nuevo")).toBeNull();
    expect(screen.getByText(/El asistente propone; tú decides/)).toBeTruthy();
  });

  it("si la nube no está activada mantiene el camino para una Jetson local", () => {
    status.mockReturnValue({ configured: false });
    render(page());
    expect(screen.getByRole("link", { name: /Crear con el asistente/ })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/La nube aún no está activada/);
    // El camino de siempre sigue disponible.
    expect(screen.getByRole("link", { name: /Empecemos/ })).toBeTruthy();
  });

  it("mientras carga el estado no muestra el aviso de «no activado»", () => {
    status.mockReturnValue(undefined);
    render(page());
    expect(screen.queryByText(/La nube aún no está activada/)).toBeNull();
    expect(screen.getByRole("link", { name: /Crear con el asistente/ })).toBeTruthy();
  });
});
