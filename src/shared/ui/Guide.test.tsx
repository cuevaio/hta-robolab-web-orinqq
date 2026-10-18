// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTO_FOLD_MS, Guide } from "./Guide";

/** jsdom no trae `matchMedia`: aquí se simula un celular (≤ 640 px) o una pantalla ancha. */
function pretendViewport(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  // @ts-expect-error: se quita el simulacro para las demás pruebas
  delete window.matchMedia;
});

describe("Robi, asistente flotante", () => {
  it("es un complemento de la página con su mensaje anunciado y el botón de pista adentro", () => {
    render(
      <Guide message="Pista 1: avanza.">
        <button type="button">Pedir pista</button>
      </Guide>,
    );
    const guide = screen.getByRole("complementary", { name: "Robi, tu guía" });
    expect(guide.classList.contains("guide")).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Pista 1: avanza.");
    expect(screen.getByRole("button", { name: "Pedir pista" })).toBeTruthy();
  });

  it("tocar su cara esconde el globo y el botón de pista, pero el mensaje sigue disponible para el lector", () => {
    render(
      <Guide message="Hola">
        <button type="button">Pedir pista</button>
      </Guide>,
    );
    const face = screen.getByRole("button", { name: "Esconder el mensaje de Robi" });
    expect(face.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(face);

    const shown = screen.getByRole("button", { name: "Mostrar el mensaje de Robi" });
    expect(shown.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("complementary").getAttribute("data-folded")).toBe("true");
    // El botón de pista no queda invisible pero enfocable.
    expect(screen.queryByRole("button", { name: "Pedir pista" })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Hola");

    fireEvent.click(shown);
    expect(screen.getByRole("button", { name: "Pedir pista" })).toBeTruthy();
  });

  it("si Robi dice algo nuevo, el globo vuelve a abrirse", () => {
    const { rerender } = render(<Guide message="Uno" />);
    fireEvent.click(screen.getByRole("button", { name: "Esconder el mensaje de Robi" }));
    expect(screen.getByRole("complementary").getAttribute("data-folded")).toBe("true");
    rerender(<Guide message="Dos" />);
    expect(screen.getByRole("complementary").getAttribute("data-folded")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Dos");
  });
});

describe("Robi en el celular", () => {
  it("el globo se esconde solo a los 10 s para no tapar el juego, y volver a tocarla lo abre", () => {
    vi.useFakeTimers();
    pretendViewport(true);
    render(<Guide message="Arma el programa" />);
    expect(screen.getByRole("complementary").getAttribute("data-folded")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(AUTO_FOLD_MS - 1);
    });
    expect(screen.getByRole("complementary").getAttribute("data-folded")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("complementary").getAttribute("data-folded")).toBe("true");
    // El mensaje sigue ahí para el lector de pantalla.
    expect(screen.getByRole("status").textContent).toBe("Arma el programa");

    fireEvent.click(screen.getByRole("button", { name: "Mostrar el mensaje de Robi" }));
    expect(screen.getByRole("complementary").getAttribute("data-folded")).toBeNull();
  });

  it("un mensaje nuevo reabre el globo y reinicia la cuenta", () => {
    vi.useFakeTimers();
    pretendViewport(true);
    const { rerender } = render(<Guide message="Uno" />);
    act(() => {
      vi.advanceTimersByTime(AUTO_FOLD_MS);
    });
    expect(screen.getByRole("complementary").getAttribute("data-folded")).toBe("true");
    rerender(<Guide message="Dos" />);
    expect(screen.getByRole("complementary").getAttribute("data-folded")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(AUTO_FOLD_MS - 1);
    });
    expect(screen.getByRole("complementary").getAttribute("data-folded")).toBeNull();
  });

  it("en pantalla ancha nunca se esconde sola", () => {
    vi.useFakeTimers();
    pretendViewport(false);
    render(<Guide message="Hola" />);
    act(() => {
      vi.advanceTimersByTime(AUTO_FOLD_MS * 3);
    });
    expect(screen.getByRole("complementary").getAttribute("data-folded")).toBeNull();
  });
});
