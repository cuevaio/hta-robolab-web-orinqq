// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
let classrooms: unknown[] = [];
let rooms: unknown[] = [];
vi.mock("convex/react", () => ({
  useQuery: (ref: unknown) => getFunctionName(ref as never) === "classrooms:listMine" ? classrooms : rooms,
  useMutation: () => create,
}));
import { TeacherLivePage } from "./TeacherLivePage";

beforeEach(() => {
  classrooms = [{ _id: "c1", label: "Primaria A" }]; rooms = []; create.mockResolvedValue("r1");
});
afterEach(() => { cleanup(); create.mockReset(); });
function show() {
  return render(<MemoryRouter initialEntries={["/docente/en-vivo"]}><Routes>
    <Route path="/docente/en-vivo" element={<TeacherLivePage />} />
    <Route path="/docente/en-vivo/:id" element={<p>Sala creada</p>} />
  </Routes></MemoryRouter>);
}

describe("crear una partida en vivo", () => {
  it("Clase, Laberinto y Cómo jugar tienen el mismo formato que los demás campos: etiqueta arriba y recuadro de selección", () => {
    show();
    for (const name of ["Clase", "Laberinto", "Cómo jugar"]) {
      const select = screen.getByLabelText(name) as HTMLSelectElement;
      expect(select.tagName).toBe("SELECT");
      expect(select.classList.contains("select")).toBe(true);
      const label = document.querySelector<HTMLLabelElement>(`label[for="${select.id}"]`)!;
      expect(label.textContent).toBe(name);
      expect(label.contains(select)).toBe(false);
      expect(label.parentElement!.classList.contains("field")).toBe(true);
    }
  });

  it("permite elegir carrera o equipo y abre la sala que devuelve el servidor", async () => {
    show();
    expect((screen.getByRole("button", { name: "Crear sala de espera" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Clase"), { target: { value: "c1" } });
    fireEvent.change(screen.getByLabelText("Cómo jugar"), { target: { value: "cooperative" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear sala de espera" }));
    await waitFor(() => expect(screen.getByText("Sala creada")).toBeTruthy());
    expect(create).toHaveBeenCalledWith({ classroomId: "c1", mazeId: "jardin", mode: "cooperative" });
  });
  it("si el servidor rechaza crear, conserva la selección y muestra el error", async () => {
    create.mockRejectedValue(new ConvexError("No encontramos esa clase."));
    show();
    fireEvent.change(screen.getByLabelText("Clase"), { target: { value: "c1" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear sala de espera" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("No encontramos esa clase."));
    expect((screen.getByLabelText("Clase") as HTMLSelectElement).value).toBe("c1");
  });
  it("sin clases indica el paso necesario para poder jugar", () => {
    classrooms = []; show();
    expect(screen.getByRole("link", { name: "Crear una clase" }).getAttribute("href")).toBe("/docente/clases/nueva");
    expect(screen.queryByRole("button", { name: "Crear sala de espera" })).toBeNull();
  });
});
