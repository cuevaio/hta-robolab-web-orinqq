// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { move } from "@robolab/backend/domain/game/program";
import { policyFor } from "@robolab/backend/domain/game/levels";
import { BlockEditor, PieceTray } from "./BlockEditor";

const sound = vi.hoisted(() => ({ playSound: vi.fn() }));
const voice = vi.hoisted(() => ({ speak: vi.fn() }));
vi.mock("../../shared/sound/sounds", () => ({ playSound: sound.playSound, shouldStepSound: () => true }));
vi.mock("../student/speech", () => ({ speak: voice.speak, stopSpeaking: vi.fn(), canSpeak: () => true }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("sonidos del editor, sin voz", () => {
  const state = { blocks: [move("FORWARD"), move("TURN_LEFT")], openRepeat: null };
  const editor = (dispatch = vi.fn()) => {
    render(<BlockEditor policy={policyFor("primaria")} state={state} dispatch={dispatch} disabled={false} />);
    return dispatch;
  };

  it("poner una pieza hace «plop» y NO dice su nombre en voz alta", () => {
    editor();
    fireEvent.click(within(screen.getByRole("group", { name: "Piezas" })).getByRole("button", { name: "Girar a la derecha" }));
    expect(sound.playSound).toHaveBeenCalledWith("place");
    expect(voice.speak).not.toHaveBeenCalled();
  });

  it("Repetir también hace «plop»", () => {
    editor();
    fireEvent.click(within(screen.getByRole("group", { name: "Piezas" })).getByRole("button", { name: "Repetir" }));
    expect(sound.playSound).toHaveBeenCalledWith("place");
  });

  it("quitar un paso, o borrar todo, hace el sonido de quitar", () => {
    editor();
    fireEvent.click(screen.getByRole("button", { name: /Paso 1: Avanzar/ }));
    expect(sound.playSound).toHaveBeenLastCalledWith("remove");
    sound.playSound.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Borrar la secuencia" }));
    expect(sound.playSound).toHaveBeenCalledWith("remove");
    expect(voice.speak).not.toHaveBeenCalled();
  });

  it("con las piezas bloqueadas (mientras corre) no suena nada", () => {
    render(<BlockEditor policy={policyFor("primaria")} state={state} dispatch={vi.fn()} disabled />);
    fireEvent.click(within(screen.getByRole("group", { name: "Piezas" })).getByRole("button", { name: "Avanzar" }));
    expect(sound.playSound).not.toHaveBeenCalled();
  });
});

describe("editor de bloques", () => {
  it("la secuencia es una lista real: cada paso es un <li> con su botón para quitarlo", () => {
    const dispatch = vi.fn();
    render(
      <BlockEditor
        policy={policyFor("inicial")}
        state={{ blocks: [move("FORWARD"), move("TURN_LEFT")], openRepeat: null }}
        dispatch={dispatch}
        disabled={false}
      />,
    );
    const list = screen.getByRole("list", { name: "Tu secuencia" });
    expect(list.tagName).toBe("UL");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items.every((li) => li.tagName === "LI")).toBe(true);

    const step = within(items[1]!).getByRole("button", { name: /Paso 2: Girar a la izquierda/ });
    fireEvent.click(step);
    expect(dispatch).toHaveBeenCalledWith({ type: "remove", path: [1] });
  });

  it("la paleta muestra las piezas del nivel y la secuencia vacía deja casillas punteadas para llenar", () => {
    render(<BlockEditor policy={policyFor("inicial")} state={{ blocks: [], openRepeat: null }} dispatch={() => undefined} disabled={false} />);
    const palette = screen.getByRole("group", { name: "Piezas" });
    const pieces = within(palette).getAllByRole("button");
    expect(pieces.map((b) => b.getAttribute("aria-label"))).toEqual(["Avanzar", "Retroceder", "Girar a la izquierda", "Girar a la derecha"]);
    expect(pieces.map((b) => b.getAttribute("data-piece"))).toEqual(["FORWARD", "BACKWARD", "TURN_LEFT", "TURN_RIGHT"]);
    // Inicial no tiene Repetir (sí Retroceder, desde el backend 0.4.0).
    expect(within(palette).queryByRole("button", { name: /Repetir/ })).toBeNull();

    const list = screen.getByRole("list", { name: "Tu secuencia" });
    expect(within(list).queryAllByRole("listitem")).toHaveLength(0);
    expect(list.querySelectorAll(".slot-empty").length).toBeGreaterThan(0);
    expect(list.querySelector(".slot-empty")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("en Primaria la pieza Repetir lleva el número de veces dentro de la secuencia", () => {
    render(
      <BlockEditor
        policy={policyFor("primaria")}
        state={{ blocks: [{ kind: "repeat", times: 3, body: [move("FORWARD")] }], openRepeat: null }}
        dispatch={() => undefined}
        disabled={false}
      />,
    );
    const palette = screen.getByRole("group", { name: "Piezas" });
    expect(within(palette).getByRole("button", { name: "Retroceder" }).getAttribute("data-piece")).toBe("BACKWARD");
    expect(within(palette).getByRole("button", { name: "Repetir" }).getAttribute("data-piece")).toBe("repeat");
    // El primer elemento es el bloque Repetir; adentro lleva su propia lista.
    const repeat = within(screen.getByRole("list", { name: "Tu secuencia" })).getAllByRole("listitem")[0]!;
    expect(repeat.getAttribute("data-piece")).toBe("repeat");
    expect((within(repeat).getByRole("combobox", { name: "Veces" }) as HTMLSelectElement).value).toBe("3");
    expect(within(repeat).getByRole("list", { name: "Dentro de repetir" }).tagName).toBe("UL");
  });
});

describe("espacio de trabajo: «Tu programa», papelera y acciones dentro del cuadro", () => {
  const editable = (extra: Partial<React.ComponentProps<typeof BlockEditor>> = {}) =>
    render(<BlockEditor policy={policyFor("primaria")} state={{ blocks: [move("FORWARD")], openRepeat: null }} dispatch={() => undefined} disabled={false} {...extra} />);

  it("el título es «Tu programa» y lo que pase la pantalla (Robot) va a su derecha", () => {
    editable({ headerActions: <button type="button">Robot</button> });
    const head = screen.getByRole("heading", { level: 2, name: "Tu programa" }).closest(".program-head")!;
    expect(within(head as HTMLElement).getByRole("button", { name: "Robot" })).toBeTruthy();
  });

  it("la papelera y las acciones («Ejecutar») viven dentro del mismo cuadro que la secuencia", () => {
    editable({ actions: <button type="button">Ejecutar</button> });
    const box = screen.getByRole("list", { name: "Tu secuencia" }).closest(".sequence")!;
    const actions = within(box.querySelector(".program-actions") as HTMLElement).getAllByRole("button");
    expect(actions.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["Borrar la secuencia", "Ejecutar"]);
  });

  it("las piezas van debajo del cuadro del programa", () => {
    editable();
    const box = screen.getByRole("list", { name: "Tu secuencia" }).closest(".sequence")!;
    const tray = screen.getByRole("group", { name: "Piezas" }).closest(".piece-tray")!;
    expect(box.compareDocumentPosition(tray) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("solo lectura (predecir): sin título, sin papelera y sin piezas", () => {
    editable({ readOnly: true });
    expect(screen.queryByRole("heading", { name: "Tu programa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Borrar la secuencia" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Piezas" })).toBeNull();
  });
});

describe("piezas sin texto: solo ícono, con su nombre al pasar el mouse o enfocarlas", () => {
  it("las piezas de la paleta no tienen texto visible; el nombre va en el aria-label y en su etiqueta, sin ícono ⓘ", () => {
    render(<BlockEditor policy={policyFor("primaria")} state={{ blocks: [], openRepeat: null }} dispatch={() => undefined} disabled={false} />);
    const palette = screen.getByRole("group", { name: "Piezas" });
    const buttons = within(palette).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Avanzar", "Retroceder", "Girar a la izquierda", "Girar a la derecha", "Repetir"]);
    for (const button of buttons) {
      // Sin texto visible: solo la imagen decorativa.
      expect(button.textContent).toBe("");
      expect(button.querySelector("img")!.getAttribute("alt")).toBe("");
      // Sin ícono ⓘ: el nombre sale en la etiqueta al pasar el mouse o enfocar la pieza.
      const frame = button.closest(".piece")!;
      expect(frame.querySelector(".piece-info")).toBeNull();
      expect(frame.querySelector(".piece-tip")!.textContent).toBe(button.getAttribute("aria-label"));
    }
  });

  it("la etiqueta es solo visual: no repiten el nombre al lector ni suman paradas de Tab", () => {
    render(<BlockEditor policy={policyFor("inicial")} state={{ blocks: [move("FORWARD")], openRepeat: null }} dispatch={() => undefined} disabled={false} />);
    for (const hidden of document.querySelectorAll(".piece-tip")) {
      expect(hidden.getAttribute("aria-hidden")).toBe("true");
      expect(hidden.matches("button, a, [tabindex]")).toBe(false);
    }
    // Un botón de pieza = una parada de Tab: 4 de la paleta, 1 del paso y la papelera.
    expect(screen.getAllByRole("button")).toHaveLength(4 + 1 + 1);
  });

  it("los pasos de la secuencia también muestran su nombre en su etiqueta", () => {
    render(
      <BlockEditor policy={policyFor("inicial")} state={{ blocks: [move("TURN_RIGHT")], openRepeat: null }} dispatch={() => undefined} disabled={false} />,
    );
    const step = screen.getByRole("button", { name: /Paso 1: Girar a la derecha/ });
    expect(step.closest("li")!.classList.contains("piece")).toBe(true);
    expect(step.closest("li")!.querySelector(".piece-tip")!.textContent).toBe("Girar a la derecha");
    expect(step.textContent).toBe("1");
  });

  it("en Repetir el nombre queda para el lector de pantalla y la pieza lleva su etiqueta", () => {
    render(
      <BlockEditor
        policy={policyFor("primaria")}
        state={{ blocks: [{ kind: "repeat", times: 3, body: [move("FORWARD")] }], openRepeat: null }}
        dispatch={() => undefined}
        disabled={false}
      />,
    );
    const repeat = within(screen.getByRole("list", { name: "Tu secuencia" })).getAllByRole("listitem")[0]!;
    expect(within(repeat).getByText("Repetir", { selector: ".sr-only" })).toBeTruthy();
    expect(repeat.querySelector(":scope > .piece .piece-tip")!.textContent).toBe("Repetir");
  });

  it("Escape esconde la etiqueta sin quitar el foco, y sale del botón la devuelve", () => {
    render(<BlockEditor policy={policyFor("inicial")} state={{ blocks: [], openRepeat: null }} dispatch={() => undefined} disabled={false} />);
    const button = screen.getByRole("button", { name: "Avanzar" });
    const frame = button.closest(".piece")!;
    button.focus();
    fireEvent.keyDown(button, { key: "Escape" });
    expect(frame.getAttribute("data-tip-dismissed")).toBe("true");
    expect(document.activeElement).toBe(button);

    fireEvent.blur(button);
    expect(frame.getAttribute("data-tip-dismissed")).toBeNull();
  });

  describe("bandeja de piezas con gestos", () => {
    const GESTURES = {
      FORWARD: { emoji: "☝️", prompt: "Apunta arriba" },
      BACKWARD: { emoji: "👇", prompt: "Apunta abajo" },
      TURN_LEFT: { emoji: "👈", prompt: "Apunta a la izquierda" },
      TURN_RIGHT: { emoji: "👉", prompt: "Apunta a la derecha" },
    } as const;
    const tray = (extra: { currentCommand?: "FORWARD" | null } = {}) =>
      render(<PieceTray policy={policyFor("inicial")} state={{ blocks: [], openRepeat: null }} dispatch={() => undefined} disabled={false} gestures={GESTURES} {...extra} />);

    it("cada pieza es la mano que la pide (sin flechas ni texto) y su etiqueta dice el nombre y el gesto", () => {
      tray();
      const group = screen.getByRole("group", { name: "Piezas" });
      const frames = [...group.querySelectorAll(".piece")];
      expect(frames.map((f) => f.querySelector(".piece-hand")?.textContent)).toEqual(["☝️", "👇", "👈", "👉"]);
      expect(frames.every((f) => f.querySelector(".piece-hand")?.getAttribute("aria-hidden") === "true")).toBe(true);
      expect(frames.some((f) => f.querySelector("img"))).toBe(false);
      expect(frames.some((f) => f.querySelector(".piece-info"))).toBe(false);
      const tip = frames[3]!.querySelector(".piece-tip")!;
      expect(tip.textContent).toContain("Girar a la derecha");
      expect(tip.querySelector(".piece-tip-detail")?.textContent).toBe("Apunta a la derecha");
    });

    it("el nombre accesible de la pieza no cambia por la mano", () => {
      tray();
      expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Avanzar", "Retroceder", "Girar a la izquierda", "Girar a la derecha"]);
    });

    it("resalta la pieza del gesto que la cámara está viendo", () => {
      tray({ currentCommand: "FORWARD" });
      const flags = screen.getAllByRole("button").map((b) => b.hasAttribute("data-current"));
      expect(flags).toEqual([true, false, false, false]);
    });

    it("sin gestos (Botones, Primaria) las piezas llevan su flecha, no una mano", () => {
      render(<PieceTray policy={policyFor("primaria")} state={{ blocks: [], openRepeat: null }} dispatch={() => undefined} disabled={false} />);
      expect(document.querySelector(".piece-hand")).toBeNull();
      expect(document.querySelectorAll(".block-btn img").length).toBeGreaterThan(0);
    });

    it("lo que va al final (el pulgar) queda tras un separador", () => {
      render(<PieceTray policy={policyFor("inicial")} state={{ blocks: [], openRepeat: null }} dispatch={() => undefined} disabled={false} gestures={GESTURES} trailing={<span>👍</span>} />);
      const group = screen.getByRole("group", { name: "Piezas" });
      expect(group.querySelector(".palette-sep + span")?.textContent).toBe("👍");
    });
  });
});
