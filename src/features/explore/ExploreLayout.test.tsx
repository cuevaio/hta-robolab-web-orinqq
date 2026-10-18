// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExploreLayout } from "./ExploreLayout";

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
  document.title = "";
});

function renderAt(path: string, ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("cabecera del modo abierto en el celular", () => {
  beforeEach(() => pretendViewport(true));

  it("muestra un botón de menú con aria-expanded que despliega y oculta las secciones", () => {
    renderAt("/", <ExploreLayout>hola</ExploreLayout>);
    const menu = screen.getByRole("button", { name: "Menú" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    // Cerrado: las secciones no están disponibles (ni para el lector de pantalla).
    expect(screen.queryByRole("link", { name: "Mi avance" })).toBeNull();

    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(menu.getAttribute("aria-controls")!)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Mi avance" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Unirme a una clase" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Soy docente" })).toBeTruthy();
  });

  it("se cierra con Escape y devuelve el foco al botón", () => {
    renderAt("/", <ExploreLayout>hola</ExploreLayout>);
    const menu = screen.getByRole("button", { name: "Menú" });
    fireEvent.click(menu);
    fireEvent.keyDown(screen.getByRole("link", { name: "Mi avance" }), { key: "Escape" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menu);
  });

  it("se cierra al navegar a otra sección", () => {
    renderAt("/", <ExploreLayout>hola</ExploreLayout>);
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    fireEvent.click(screen.getByRole("link", { name: "Mi avance" }));
    expect(screen.getByRole("button", { name: "Menú" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("en una página interior muestra la flecha para volver y el título de la página", () => {
    renderAt(
      "/explorar/tecnologia",
      <ExploreLayout title="Tecnología" backTo="/">
        hola
      </ExploreLayout>,
    );
    const back = screen.getByRole("link", { name: "Volver" });
    expect(back.getAttribute("href")).toBe("/");
    expect(screen.getByText("Tecnología", { selector: ".explore-title" })).toBeTruthy();
    expect(document.title).toBe("Tecnología · RoboLab");
  });
});

describe("cabecera del modo abierto en pantalla ancha", () => {
  beforeEach(() => pretendViewport(false));

  it("muestra las secciones sin necesidad del menú", () => {
    document.title = "RoboLab"; // el de index.html: una pantalla sin título no lo cambia
    renderAt("/", <ExploreLayout>hola</ExploreLayout>);
    expect(screen.getByRole("link", { name: "Mi avance" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Menú" })).toBeNull();
    expect(document.title).toBe("RoboLab");
  });
});

describe("botón de sonido", () => {
  beforeEach(() => {
    pretendViewport(false);
    localStorage.clear();
  });

  it("está en la cabecera, con ícono y palabra; apagarlo y encenderlo se recuerda", async () => {
    vi.resetModules();
    const { ExploreLayout: Layout } = await import("./ExploreLayout");
    const { setMuted } = await import("../../shared/sound/sounds");
    setMuted(false);
    renderAt("/", <Layout>contenido</Layout>);
    const button = screen.getByRole("button", { name: /Sonido/ });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem("robolab.sonido")).toBe("off");
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("robolab.sonido")).toBe("on");
  });
});
