// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { missionFixtures } from "@robolab/backend/domain/mission/fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sound = vi.hoisted(() => ({ playSound: vi.fn() }));
vi.mock("../../shared/sound/sounds", () => ({ playSound: sound.playSound, shouldStepSound: () => true }));
import { STEP_MS, MissionPlayer } from "./MissionPlayer";

// «Lleva los libros»: una fila de 4 casillas; avanzar 3 veces llega a la meta con los 3 de energía.
const MISSION = missionFixtures.find((m) => m.grade === 2)!;
// «Visita la biblioteca»: una estación obligatoria y un terreno que cuesta 3.
const WITH_STATION = missionFixtures.find((m) => m.grade === 3)!;

beforeEach(() => {
  vi.useFakeTimers();
  sound.playSound.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const piece = (name: string) => fireEvent.click(within(screen.getByRole("group", { name: "Piezas" })).getByRole("button", { name }));
const run = () => fireEvent.click(screen.getByRole("button", { name: /Ejecutar/ }));
const play = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const status = () => screen.getByRole("status").textContent ?? "";
const board = () => screen.getByRole("img", { name: /^Tablero de/ }).getAttribute("aria-label")!;

describe("jugar una misión del asistente", () => {
  it("muestra la consigna, el tablero, la energía y la bandeja de piezas de siempre", () => {
    render(<MissionPlayer mission={MISSION} />);
    expect(screen.getByRole("heading", { level: 1, name: "Lleva los libros." })).toBeTruthy();
    expect(board()).toMatch(/Tablero de 1 por 4\. Robi está en la fila 1, columna 1, mirando a la derecha\./);
    expect(screen.getByText(/Energía: 3 de 3/)).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Piezas" })).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Avanzar",
      "Retroceder",
      "Girar a la izquierda",
      "Girar a la derecha",
    ]);
    expect((screen.getByRole("button", { name: /Ejecutar/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("reproduce el recorrido paso a paso, gasta energía y celebra al llegar", () => {
    const onSolved = vi.fn().mockResolvedValue(undefined);
    render(<MissionPlayer mission={MISSION} onSolved={onSolved} />);
    for (let i = 0; i < 3; i++) piece("Avanzar");
    run();
    expect(status()).toMatch(/Mira cómo se mueve Robi/);
    play(STEP_MS);
    expect(board()).toMatch(/columna 2/);
    expect(screen.getByText(/Energía: 2 de 3/)).toBeTruthy();
    play(STEP_MS * 3);
    expect(board()).toMatch(/columna 4/);
    expect(status()).toMatch(/Llegaste a la meta/);
    expect(screen.getByRole("heading", { name: "¡Misión lograda!" })).toBeTruthy();
    expect(screen.getByText("Usaste 3 de 3 de energía.")).toBeTruthy();
    expect(onSolved).toHaveBeenCalledTimes(1);
    expect(onSolved).toHaveBeenCalledWith({ program: Array(3).fill({ kind: "move", command: "FORWARD" }), runs: 1, ms: expect.any(Number) });
  });

  it("al lograrla no deja seguir jugando (el resultado ya se mandó)", () => {
    render(<MissionPlayer mission={MISSION} onSolved={vi.fn()} />);
    for (let i = 0; i < 3; i++) piece("Avanzar");
    run();
    play(STEP_MS * 5);
    expect((screen.getByRole("button", { name: /Ejecutar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(screen.getByRole("group", { name: "Piezas" })).getByRole("button", { name: "Avanzar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("si el programa falla lo dice con el paso, no manda resultado y deja corregir", () => {
    const onSolved = vi.fn();
    render(<MissionPlayer mission={MISSION} onSolved={onSolved} />);
    piece("Girar a la izquierda");
    piece("Avanzar");
    run();
    play(STEP_MS * 4);
    expect(status()).toMatch(/se salió del tablero en el paso 2/);
    expect(onSolved).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "¡Misión lograda!" })).toBeNull();
    // Borrar devuelve al robot al inicio y deja armar otro programa.
    fireEvent.click(screen.getByRole("button", { name: "Borrar la secuencia" }));
    expect(board()).toMatch(/fila 1, columna 1/);
    for (let i = 0; i < 3; i++) piece("Avanzar");
    run();
    play(STEP_MS * 5);
    expect(onSolved).toHaveBeenCalledTimes(1);
  });

  it("cuando no alcanza la energía lo dice, y con estaciones pendientes, también", () => {
    render(<MissionPlayer mission={WITH_STATION} />);
    expect(screen.getByRole("img", { name: /Faltan 1 estación/ })).toBeTruthy();
    // Llegar a la meta sin pasar por la estación.
    for (const name of ["Girar a la derecha", "Avanzar", "Avanzar", "Avanzar"]) piece(name);
    run();
    play(STEP_MS * 6);
    expect(status()).toMatch(/chocó con un obstáculo|se salió del tablero|Se acabó la energía|faltan estaciones|antes de llegar/);
  });

  it("si guardar el resultado falla, el niño sigue viendo que lo logró y se le avisa", async () => {
    render(<MissionPlayer mission={MISSION} onSolved={() => Promise.reject(new Error("sin internet"))} />);
    for (let i = 0; i < 3; i++) piece("Avanzar");
    run();
    play(STEP_MS * 5);
    await act(async () => void (await Promise.resolve()));
    expect(screen.getByRole("heading", { name: "¡Misión lograda!" })).toBeTruthy();
    expect(status()).toMatch(/no pudimos guardar tu resultado/);
  });

  it("sin onSolved (vista previa del docente) también se juega, sin guardar nada", () => {
    render(<MissionPlayer mission={MISSION} />);
    for (let i = 0; i < 3; i++) piece("Avanzar");
    run();
    play(STEP_MS * 5);
    expect(screen.getByRole("heading", { name: "¡Misión lograda!" })).toBeTruthy();
  });

  it("suena: «bip-bip» al ejecutar, un «tup» por paso y la melodía al llegar", () => {
    render(<MissionPlayer mission={MISSION} />);
    for (let i = 0; i < 3; i++) piece("Avanzar");
    run();
    play(STEP_MS * 5);
    const names = sound.playSound.mock.calls.map((c) => c[0]);
    expect(names.filter((n) => n === "place")).toHaveLength(3);
    expect(names.slice(3)).toEqual(["play", "step", "step", "step", "win"]);
  });

  it("si no llega, suena el «boop» amable, no la melodía", () => {
    render(<MissionPlayer mission={MISSION} />);
    piece("Girar a la izquierda");
    piece("Avanzar");
    run();
    play(STEP_MS * 4);
    const names = sound.playSound.mock.calls.map((c) => c[0]);
    expect(names).toContain("oops");
    expect(names).not.toContain("win");
  });

  it("al salir de la pantalla a mitad del recorrido no deja temporizadores sueltos", () => {
    const view = render(<MissionPlayer mission={MISSION} />);
    for (let i = 0; i < 3; i++) piece("Avanzar");
    run();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
