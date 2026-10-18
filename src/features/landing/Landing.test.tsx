// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { TOPICS } from "@robolab/backend/domain/explore/challenges";
import { saveSolved } from "../explore/testProgress";
import { Landing } from "./Landing";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const renderLanding = () =>
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );

/** La tarjeta de un tópico: el enlace de la cuadrícula cuyo nombre es ese tópico. */
const card = (name: string) => screen.getByText(name, { selector: ".steam-card .steam-name" }).closest("a") as HTMLElement;

describe("portada: tarjetas de tópico con su avance", () => {
  it("sin avance cada tópico muestra 0 de todo lo que tiene (retos de Inicial y misiones de Primaria)", () => {
    renderLanding();
    expect(TOPICS.every((t) => t.available)).toBe(true);
    const totals = { Ciencia: 12, Tecnología: 12, Ingeniería: 10, Artes: 9, Matemáticas: 11 };
    for (const [name, total] of Object.entries(totals)) {
      const link = card(name);
      expect(within(link).getByText(`0/${total} ✓`), name).toBeTruthy();
      expect(within(link).getByText(`0 de ${total} retos resueltos`), name).toBeTruthy();
    }
  });

  it("cuenta juntos los retos de bloques y las misiones resueltos en este dispositivo", () => {
    saveSolved("inicial-ciencia-probeta", "inicial-ciencia-lupa", "primaria-ciencia-huerto", "inicial-paseo");
    renderLanding();
    expect(within(card("Ciencia")).getByText("3/12 ✓")).toBeTruthy();
    expect(within(card("Tecnología")).getByText("1/12 ✓")).toBeTruthy();
    expect(within(card("Artes")).getByText("0/9 ✓")).toBeTruthy();
  });

  it("un reto de bloques de Primaria que ya no se lista no suma al avance", () => {
    saveSolved("primaria-casa");
    renderLanding();
    expect(within(card("Tecnología")).getByText("0/12 ✓")).toBeTruthy();
  });

  it("cada tarjeta enlaza a su tópico; el tagline lo oye el lector de pantalla pero no se ve (solo el nombre)", () => {
    renderLanding();
    expect(card("Ciencia").getAttribute("href")).toBe("/explorar/ciencia");
    expect(card("Matemáticas").getAttribute("href")).toBe("/explorar/matematicas");
    expect(within(card("Ciencia")).getByText("Explora el laboratorio.")).toBeTruthy();
    expect(within(card("Tecnología")).getByText("Programa al robot.")).toBeTruthy();
    expect(within(card("Ingeniería")).getByText("Construye en el taller.")).toBeTruthy();
    expect(within(card("Artes")).getByText("Recorre la galería.")).toBeTruthy();
    expect(within(card("Matemáticas")).getByText("Cuenta los pasos.")).toBeTruthy();
    for (const link of TOPICS.map((t) => card(t.name))) {
      // El tagline y el avance son texto solo para lectores de pantalla: la tarjeta muestra solo el nombre.
      expect(link.querySelector(".steam-name")!.className).not.toMatch(/sr-only/);
      expect(link.querySelector(".steam-sr")!.classList.contains("sr-only")).toBe(true);
    }
    expect(card("Ciencia").textContent).toMatch(/Ciencia.*Explora el laboratorio\./);
  });

  it("cada tarjeta lleva la letra de STEAM y una escena del tema, decorativas (no las lee el lector de pantalla)", () => {
    renderLanding();
    const letters = TOPICS.map((t) => card(t.name).querySelector(".steam-letter")!.textContent);
    expect(letters).toEqual(["S", "T", "E", "A", "M"]);
    for (const t of TOPICS) {
      const scene = card(t.name).querySelector(".steam-scene")!;
      expect(scene.getAttribute("aria-hidden")).toBe("true");
      expect(scene.querySelectorAll(".steam-deco").length).toBeGreaterThanOrEqual(4);
    }
  });

  it("el nombre accesible de cada enlace es el nombre, la bajada y el avance, sin la letra ni los adornos", () => {
    renderLanding();
    const link = screen.getByRole("link", { name: /^Ciencia/ });
    expect(link.getAttribute("href")).toBe("/explorar/ciencia");
    expect(link.textContent).toContain("0 de 12 retos resueltos");
    expect(screen.getAllByRole("link").some((l) => /^S\b/.test(l.textContent ?? ""))).toBe(false);
  });

  it("marca la tarjeta como completa cuando se resolvió todo el tópico", () => {
    saveSolved(
      "inicial-ciencia-probeta",
      "inicial-ciencia-lupa",
      "inicial-ciencia-derrame",
      "inicial-ciencia-muestras",
      "inicial-ciencia-donde",
      "inicial-ciencia-arregla",
      "primaria-ciencia-hormigas",
      "primaria-ciencia-rocas",
      "primaria-ciencia-telescopio",
      "primaria-ciencia-huerto",
      "primaria-ciencia-lluvia",
      "primaria-ciencia-imanes",
    );
    renderLanding();
    const chip = within(card("Ciencia")).getByText("12/12 ✓").closest(".progress-chip");
    expect(chip?.hasAttribute("data-complete")).toBe(true);
    expect(within(card("Artes")).getByText("0/9 ✓").closest(".progress-chip")?.hasAttribute("data-complete")).toBe(false);
  });
});

describe("portada: entradas", () => {
  it("ya no ofrece el Laboratorio multigrado", () => {
    renderLanding();
    expect(screen.queryByText("Laboratorio multigrado")).toBeNull();
    expect(screen.queryByRole("link", { name: /Ver misiones/ })).toBeNull();
    expect(document.querySelector('a[href="/laboratorio"]')).toBeNull();
  });

  it("deja la entrada de alumnos con código y la de docentes, que habla de retos", () => {
    renderLanding();
    const join = screen.getAllByRole("link", { name: /Unirme a una clase/ });
    expect(join.length).toBeGreaterThan(0);
    expect(join.every((l) => l.getAttribute("href") === "/alumno")).toBe(true);
    expect(screen.getByRole("link", { name: /Iniciar sesión/ }).getAttribute("href")).toBe("/docente");
    expect(screen.getByText("Crea retos para tu clase y sigue cómo aprende cada alumno.")).toBeTruthy();
    expect(screen.queryByText(/evaluaciones/i)).toBeNull();
  });
});
