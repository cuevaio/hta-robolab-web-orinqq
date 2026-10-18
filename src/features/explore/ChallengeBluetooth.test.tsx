// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ToastProvider } from "../../shared/ui/Toast";
import { ChallengeRoute } from "./ChallengePage";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => async () => ({ solved: true }) }));
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); Reflect.deleteProperty(navigator, "serial"); });

it("Ejecutar envía una vez por Bluetooth y el resultado en pantalla conserva el enlace mientras el robot termina", async () => {
  let receive!: ReadableStreamDefaultController<Uint8Array>;
  const written: string[] = [];
  const respond = (text: string) => receive.enqueue(new TextEncoder().encode(text));
  const close = vi.fn(async () => {});
  const port = {
    readable: new ReadableStream<Uint8Array>({ start(controller) { receive = controller; } }),
    writable: new WritableStream<Uint8Array>({ write(data) {
      const text = new TextDecoder().decode(data); written.push(text);
      if (text === "HELLO\n") respond("ROBO/1 ADZ ARC\n");
      if (text === "PING\n") respond("PONG\n");
      const run = /^RUN ([\w-]+) AAAA\n$/.exec(text);
      if (run) respond(`STATUS ${run[1]} OK\nSTATUS ${run[1]} RUN\n`);
    } }), open: async () => {}, close,
  };
  Object.defineProperty(navigator, "serial", { configurable: true, value: { requestPort: async () => port } });
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
  await act(async () => { respond(`STATUS ${id} DONE\n`); });
  expect(screen.queryByRole("button", { name: "Parar robot" })).toBeNull();
  view.unmount();
  vi.useRealTimers();
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
}, 15_000); // Monta el reto completo y avanza cinco segundos con timers, también bajo carga de CI.
