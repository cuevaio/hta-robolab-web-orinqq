// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useReducer } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editorReducer, emptyEditor } from "@robolab/backend/domain/game/editor";
import { policyFor } from "@robolab/backend/domain/game/levels";
import { InitialProgramEditor } from "./InitialProgramEditor";
import type { GestureSample } from "./gestureGate";

const session = vi.hoisted(() => ({
  onSample: null as ((sample: GestureSample, time: number) => void) | null,
  stop: vi.fn(),
  start: vi.fn(),
  failWith: null as string | null,
  /** Solo la cámara: hay imagen, pero el modelo de gestos aún se prepara. */
  cameraOnly: false,
}));
const voice = vi.hoisted(() => ({ speak: vi.fn() }));
// La app no usa voz sintética: si algo llamara a la del navegador, estas pruebas lo verían.
vi.stubGlobal("speechSynthesis", { speak: voice.speak, cancel: vi.fn(), getVoices: () => [] });
vi.stubGlobal("SpeechSynthesisUtterance", class {});
const sound = vi.hoisted(() => ({ playSound: vi.fn() }));
vi.mock("../../shared/sound/sounds", () => ({ playSound: sound.playSound, shouldStepSound: () => true }));
vi.mock("./cameraSession", () => ({
  startCameraSession: (_video: HTMLVideoElement, callbacks: { onSample: typeof session.onSample; onCamera?: () => void; onReady: () => void; onError: (message: string) => void }) => {
    session.start();
    session.onSample = callbacks.onSample;
    if (session.failWith) callbacks.onError(session.failWith);
    else {
      callbacks.onCamera?.();
      if (!session.cameraOnly) callbacks.onReady();
    }
    return session.stop;
  },
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); session.onSample = null; session.failWith = null; session.cameraOnly = false; });

function Harness({ disabled = false, onExecute = vi.fn(), cameraHost }: { disabled?: boolean; onExecute?: () => void; cameraHost?: HTMLElement | null }) {
  const [state, dispatch] = useReducer(editorReducer, emptyEditor);
  return (
    <InitialProgramEditor
      policy={policyFor("inicial")}
      state={state}
      dispatch={dispatch}
      disabled={disabled}
      onExecute={onExecute}
      headerActions={<button type="button">Robot</button>}
      actions={<button type="button">Ejecutar</button>}
      cameraHost={cameraHost ?? null}
    />
  );
}

function sample(name: string, start: number, duration = 800) {
  act(() => { for (let t = start; t <= start + duration; t += 100) session.onSample?.({ name, score: 0.95, hands: 1 }, t); });
}
function release(start: number) {
  act(() => { for (let t = start; t <= start + 400; t += 100) session.onSample?.({ name: "", score: 0, hands: 0 }, t); });
}
const choose = (name: "Gestos" | "Botones") => fireEvent.click(screen.getByRole("button", { name }));
const sequence = () => within(screen.getByRole("list", { name: "Tu secuencia" }));

describe("programar Inicial: Gestos por defecto, Botones como alternativa", () => {
  it("empieza en Gestos: la cámara se enciende sola, las piezas son manos y no hay botón «Activar cámara»", () => {
    render(<Harness />);
    expect(session.start).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Gestos" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Botones" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button", { name: /cámara/i })).toBeNull();
    expect(screen.getByLabelText("Vista de tu cámara")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Avanzar" }));
    expect(screen.getByRole("button", { name: /Paso 1: Avanzar/ })).toBeTruthy();
  });

  it("«Tu programa» lleva a la derecha el Robot y el selector; la papelera y Ejecutar quedan dentro del cuadro", () => {
    render(<Harness />);
    const head = screen.getByRole("heading", { name: "Tu programa" }).closest(".program-head") as HTMLElement;
    expect(within(head).getByRole("button", { name: "Robot" })).toBeTruthy();
    expect(within(head).getByRole("group", { name: "Cómo programar" })).toBeTruthy();
    const box = screen.getByRole("list", { name: "Tu secuencia" }).closest(".sequence") as HTMLElement;
    expect(within(box).getByRole("button", { name: "Borrar la secuencia" })).toBeTruthy();
    expect(within(box).getByRole("button", { name: "Ejecutar" })).toBeTruthy();
  });

  it("Botones apaga la cámara y cambia las manos por flechas; Gestos la vuelve a encender, sin perder el programa", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Avanzar" }));
    choose("Botones");
    expect(session.stop).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("Vista de tu cámara")).toBeNull();
    expect(document.querySelector(".piece-hand")).toBeNull();
    expect(within(screen.getByRole("group", { name: "Piezas" })).getAllByRole("button").every((b) => b.querySelector("img"))).toBe(true);
    expect(screen.getByRole("button", { name: /Paso 1: Avanzar/ })).toBeTruthy();
    choose("Gestos");
    expect(session.start).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: /Paso 1: Avanzar/ })).toBeTruthy();
  });

  it("en Gestos la bandeja muestra solo manos (dedo arriba, abajo, izquierda, derecha y pulgar), sin flechas, sin texto y sin ⓘ", () => {
    render(<Harness />);
    const tray = screen.getByRole("group", { name: "Piezas" });
    expect([...tray.querySelectorAll(".piece-hand")].map((n) => n.textContent)).toEqual(["☝️", "👇", "👈", "👉", "👍"]);
    expect(tray.querySelector("img")).toBeNull();
    expect(tray.querySelector(".piece-info")).toBeNull();
    // El único «texto» de cada pieza es la mano; su nombre va en el aria-label.
    expect(within(tray).getAllByRole("button").map((b) => b.textContent)).toEqual(["☝️", "👇", "👈", "👉"]);
    expect(within(tray).getByRole("img", { name: /^Ejecutar:/ })).toBeTruthy();
    expect(tray.querySelector(".piece-tip-detail")?.textContent).toBe("Apunta arriba");
  });

  it("la cámara va en la columna del tablero (cameraHost) y solo ella lleva ⓘ; no dice «En vivo»", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    render(<Harness cameraHost={host} />);
    expect(host.querySelector(".vision-controls")).not.toBeNull();
    expect(host.querySelector(".piece-info")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Tu programa" }).closest("section")!.querySelector(".vision-controls")).toBeNull();
    expect(document.body.textContent).not.toMatch(/En vivo|Cámara activa/);
    host.remove();
  });

  it("si la cámara no se puede encender, vuelve a Botones y lo avisa", () => {
    session.failWith = "La cámara necesita HTTPS o localhost. Puedes usar los botones.";
    render(<Harness />);
    expect(screen.getByRole("alert").textContent).toMatch(/HTTPS/);
    expect(screen.getByRole("button", { name: "Botones" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByLabelText("Vista de tu cámara")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Avanzar" }));
    expect(screen.getByRole("button", { name: /Paso 1: Avanzar/ })).toBeTruthy();
  });

  it("con la cámara encendida, los gestos agregan las mismas piezas y el pulgar ejecuta el programa visible", () => {
    const onExecute = vi.fn();
    render(<Harness onExecute={onExecute} />);
    release(0);
    sample("Pointing_Up", 500);
    expect(screen.getByRole("button", { name: /Paso 1: Avanzar/ })).toBeTruthy();
    release(1400);
    sample("Pointing_Right", 1900);
    expect(screen.getByRole("button", { name: /Paso 2: Girar a la derecha/ })).toBeTruthy();
    expect(onExecute).not.toHaveBeenCalled();
    release(2800);
    sample("Pointing_Down", 3300);
    expect(screen.getByRole("button", { name: /Paso 3: Retroceder/ })).toBeTruthy();
    release(4200);
    sample("Pointing_Left", 4700);
    expect(screen.getByRole("button", { name: /Paso 4: Girar a la izquierda/ })).toBeTruthy();
    release(5600);
    sample("Thumb_Up", 6100, 1200);
    expect(onExecute).toHaveBeenCalledOnce();
  });

  it("se pueden mezclar: una pieza tocada y otra por gesto quedan en la misma secuencia", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Girar a la izquierda" }));
    release(0);
    sample("Pointing_Up", 500);
    expect(sequence().getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Paso 1: Girar a la izquierda. Toca para quitar.",
      "Paso 2: Avanzar. Toca para quitar.",
    ]);
  });

  it("un pulgar sostenido nunca ejecuta un programa vacío", () => {
    const onExecute = vi.fn();
    render(<Harness onExecute={onExecute} />);
    release(0);
    sample("Thumb_Up", 500, 1200);
    expect(onExecute).not.toHaveBeenCalled();
  });

  it("ignora la cámara durante la ejecución", () => {
    const view = render(<Harness />);
    view.rerender(<Harness disabled />);
    release(0);
    sample("Pointing_Up", 500);
    expect(sequence().queryAllByRole("listitem")).toHaveLength(0);
  });

  it("la pieza del gesto que la cámara está viendo se resalta", () => {
    render(<Harness />);
    release(0);
    act(() => { for (let t = 500; t <= 700; t += 100) session.onSample?.({ name: "Pointing_Right", score: 0.95, hands: 1 }, t); });
    const flags = within(screen.getByRole("group", { name: "Piezas" })).getAllByRole("button").map((b) => b.hasAttribute("data-current"));
    expect(flags).toEqual([false, false, false, true]);
  });

  it("al salir de la pestaña la cámara se apaga y al volver se enciende otra vez", () => {
    render(<Harness />);
    const visibility = vi.spyOn(document, "hidden", "get");
    visibility.mockReturnValue(true);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(session.stop).toHaveBeenCalledOnce();
    visibility.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(session.start).toHaveBeenCalledTimes(2);
    visibility.mockRestore();
  });

  it("las explicaciones de la cámara (cómo apuntar, privacidad) van en un solo ⓘ, y el lector de pantalla las oye una vez", () => {
    render(<Harness />);
    const copies = screen.getAllByText(/No se graba ni se envía/);
    expect(copies).toHaveLength(2);
    expect(copies.filter((n) => n.classList.contains("sr-only"))).toHaveLength(1);
    expect(copies.filter((n) => n.closest(".piece-tip"))).toHaveLength(1);
    const describedBy = screen.getByLabelText("Vista de tu cámara").getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)?.textContent).toMatch(/recoge los otros dedos/);
  });

  it("ningún comando se dice en voz alta (ni «Arriba» ni «Avanzar»): ni por gesto ni tocando, en Gestos o en Botones", () => {
    render(<Harness />);
    release(0);
    sample("Pointing_Up", 500);
    fireEvent.click(screen.getByRole("button", { name: "Girar a la derecha" }));
    expect(sequence().getAllByRole("button")).toHaveLength(2);
    expect(voice.speak).not.toHaveBeenCalled();
  });

  it("en Botones tampoco: tocar una pieza solo hace sonar el «plop»", () => {
    render(<Harness />);
    choose("Botones");
    fireEvent.click(screen.getByRole("button", { name: "Avanzar" }));
    expect(voice.speak).not.toHaveBeenCalled();
    expect(sound.playSound).toHaveBeenCalledWith("place");
  });

  it("una pieza que agrega la mano suena igual que una tocada, y quitarla suena distinto", () => {
    render(<Harness />);
    release(0);
    sample("Pointing_Up", 500);
    expect(sound.playSound).toHaveBeenCalledWith("place");
    fireEvent.click(screen.getByRole("button", { name: /Paso 1: Avanzar/ }));
    expect(sound.playSound).toHaveBeenLastCalledWith("remove");
  });

  it("al elegir Gestos la imagen de la cámara se ve apenas hay permiso, mientras se preparan los gestos", () => {
    session.cameraOnly = true;
    render(<Harness />);
    choose("Botones");
    choose("Gestos");
    const video = screen.getByLabelText("Vista de tu cámara") as HTMLVideoElement;
    expect(video.hidden).toBe(false);
    expect(screen.getByText("Preparando los gestos…")).toBeTruthy();
    // Hasta que el modelo esté listo, la cámara no agrega piezas.
    release(0);
    sample("Pointing_Up", 500);
    expect(sequence().queryAllByRole("button")).toHaveLength(0);
  });
});
