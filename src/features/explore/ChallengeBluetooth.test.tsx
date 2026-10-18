// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ToastProvider } from "../../shared/ui/Toast";
import { ChallengeRoute } from "./ChallengePage";
import { bleTestDevice } from "../robot/bleTestDevice";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => async () => ({ solved: true }) }));
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); Reflect.deleteProperty(navigator, "bluetooth"); });

it("Ejecutar envía una vez por Bluetooth y el resultado en pantalla conserva el enlace mientras el robot termina", async () => {
  const peripheral = bleTestDevice({
    onFrame(text, respond) {
      const run = /^RUN ([\w-]+) AAAA\n$/.exec(text);
      if (run) respond(`STATUS ${run[1]} OK\nSTATUS ${run[1]} RUN\n`);
    },
  });
  const written = peripheral.frames;
  const close = peripheral.gatt.disconnect;
  Object.defineProperty(navigator, "bluetooth", { configurable: true, value: peripheral.bluetooth });
  const view = render(<ToastProvider><MemoryRouter initialEntries={["/reto/inicial-paseo"]}><Routes><Route path="/reto/:id" element={<ChallengeRoute />} /></Routes></MemoryRouter></ToastProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Empezar el reto" }));
  fireEvent.click(screen.getByRole("button", { name: /Sincronizar con robot/ }));
  fireEvent.click(screen.getByRole("button", { name: "Elegir robot" }));
  await waitFor(() => expect(screen.getByText("Robot conectado")).toBeTruthy());
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Robot OK" }));
  for (let i = 0; i < 4; ++i) fireEvent.click(screen.getByRole("button", { name: "Avanzar" }));
  vi.useFakeTimers();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ejecutar" })); });
  expect(written.filter((text) => text.startsWith("RUN"))).toHaveLength(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByRole("heading", { name: "¡Reto logrado!" })).toBeTruthy();
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Parar robot" })).toBeTruthy();
  const id = written.find((text) => text.startsWith("RUN"))!.split(" ")[1];
  await act(async () => { peripheral.tx.notify(`STATUS ${id} DONE\n`); });
  expect(screen.queryByRole("button", { name: "Parar robot" })).toBeNull();
  view.unmount();
  vi.useRealTimers();
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
}, 15_000); // Monta el reto completo y avanza cinco segundos con timers, también bajo carga de CI.
