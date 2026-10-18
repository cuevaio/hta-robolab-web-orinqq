// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { challengesFor } from "@robolab/backend/domain/explore/challenges";
import { missionsFor } from "@robolab/backend/domain/lab/mission";
const warmUp = vi.hoisted(() => vi.fn());
vi.mock("../vision/recognizer", () => ({ warmUpRecognizer: warmUp }));

import { ChallengeListPage } from "./ChallengeListPage";

afterEach(() => {
  cleanup();
  warmUp.mockClear();
});

function at(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/explorar/:topic/:level" element={<ChallengeListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("lista de un tópico y nivel", () => {
  it("en Inicial empieza a preparar los gestos mientras el niño elige; en Primaria no", () => {
    at("/explorar/tecnologia/inicial");
    expect(warmUp).toHaveBeenCalledOnce();
    cleanup();
    at("/explorar/tecnologia/primaria");
    expect(warmUp).toHaveBeenCalledOnce();
  });

  it("en Primaria lista las misiones del tópico (miniatura, título, 3 niveles) y enlaza a /reto/:id", () => {
    at("/explorar/tecnologia/primaria");
    const missions = missionsFor("tecnologia");
    expect(missions.length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Misiones de Tecnología · Primaria");
    for (const m of missions) {
      const card = screen.getByRole("link", { name: new RegExp(`${m.title}.*3 niveles`) });
      expect(card.getAttribute("href")).toBe(`/reto/${m.id}`);
      expect(card.querySelector(".mission-thumb")).toBeTruthy();
    }
    // Los retos de bloques de Primaria ya no aparecen.
    for (const c of challengesFor("tecnologia", "primaria")) expect(screen.queryByText(c.title)).toBeNull();
  });

  it("en Inicial sigue listando los retos de bloques", () => {
    at("/explorar/tecnologia/inicial");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Retos de Tecnología · Inicial");
    for (const c of challengesFor("tecnologia", "inicial")) expect(screen.getByText(c.title)).toBeTruthy();
  });
});
