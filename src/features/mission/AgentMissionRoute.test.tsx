// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { missionFixtures } from "@robolab/backend/domain/mission/fixtures";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MISSION = missionFixtures.find((m) => m.grade === 2)!;
const data: Record<string, unknown> = {};
const asked: { name: string; args: unknown }[] = [];
const auth = { isAuthenticated: false, isLoading: false };
const record = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (ref: unknown, args: unknown) => {
    const name = getFunctionName(ref as never);
    asked.push({ name, args });
    return args === "skip" ? undefined : data[name];
  },
  useMutation: () => record,
  useConvexAuth: () => auth,
}));
vi.mock("../explore/ExploreLayout", () => ({ ExploreLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import { ChallengeRoute } from "../explore/ChallengePage";
import { STEP_MS } from "./MissionPlayer";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  asked.length = 0;
  auth.isAuthenticated = false;
  auth.isLoading = false;
  record.mockResolvedValue({ solved: true });
  for (const k of Object.keys(data)) delete data[k];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  record.mockReset();
});

const page = (id = "ia:m1") => (
  <MemoryRouter initialEntries={[`/reto/${id}`]}>
    <Routes>
      <Route path="/reto/:id" element={<ChallengeRoute />} />
      <Route path="/" element={<p>Inicio</p>} />
    </Routes>
  </MemoryRouter>
);
const solve = () => {
  for (let i = 0; i < 3; i++) fireEvent.click(within(screen.getByRole("group", { name: "Piezas" })).getByRole("button", { name: "Avanzar" }));
  fireEvent.click(screen.getByRole("button", { name: /Ejecutar/ }));
  act(() => void vi.advanceTimersByTime(STEP_MS * 5));
};

describe("/reto/ia:<id>: una misión del asistente", () => {
  it("un alumno con sesión pide el tablero a su clase y manda lo que jugó para que el servidor lo revise", async () => {
    localStorage.setItem("robolab.alumno.token", "tok");
    data["student:agentMission"] = MISSION;
    render(page());
    expect(asked.find((a) => a.name === "student:agentMission")?.args).toEqual({ token: "tok", challengeId: "ia:m1" });
    expect(screen.getByRole("heading", { level: 1, name: "Lleva los libros." })).toBeTruthy();
    solve();
    expect(record).toHaveBeenCalledWith({
      token: "tok",
      challengeId: "ia:m1",
      program: Array(3).fill({ kind: "move", command: "FORWARD" }),
      runs: 1,
      hints: 0,
      ms: expect.any(Number),
    });
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toBeTruthy();
  });

  it("si la clase no la tiene abierta (o no es de su clase) lo dice y vuelve al inicio", () => {
    localStorage.setItem("robolab.alumno.token", "tok");
    data["student:agentMission"] = null;
    render(page());
    expect(screen.getByRole("heading", { name: "No encontramos esta misión" })).toBeTruthy();
    expect(screen.getByText(/la haya cerrado o que no sea de tu clase/)).toBeTruthy();
  });

  it("mientras carga no muestra «no encontramos»", () => {
    localStorage.setItem("robolab.alumno.token", "tok");
    render(page());
    expect(screen.getByText("Cargando…")).toBeTruthy();
    expect(screen.queryByText("No encontramos esta misión")).toBeNull();
  });

  it("sin sesión de alumno ni de docente invita a entrar con el código de la clase", () => {
    render(page());
    expect(screen.getByText(/Entra con el código de tu clase/)).toBeTruthy();
    expect(asked.every((a) => a.args === "skip")).toBe(true);
  });

  it("un docente la prueba (su misión) y la partida no se manda a ningún lado", () => {
    auth.isAuthenticated = true;
    data["agent:get"] = { _id: "m1", mission: MISSION };
    render(page());
    expect(asked.find((a) => a.name === "agent:get")?.args).toEqual({ id: "m1" });
    expect(screen.getByText(/Vista del docente: esta partida no cuenta/)).toBeTruthy();
    solve();
    expect(screen.getByRole("heading", { name: "¡Misión lograda!" })).toBeTruthy();
    expect(record).not.toHaveBeenCalled();
  });

  it("un docente no ve la misión de otro (el servidor devuelve null)", () => {
    auth.isAuthenticated = true;
    data["agent:get"] = null;
    render(page());
    expect(screen.getByRole("heading", { name: "No encontramos esta misión" })).toBeTruthy();
  });
});
