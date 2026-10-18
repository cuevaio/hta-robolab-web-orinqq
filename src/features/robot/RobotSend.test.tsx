// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { move } from "@robolab/backend/domain/game/program";
import { ToastProvider } from "../../shared/ui/Toast";

/** `robot.status` del servidor: lo decide cada prueba. */
const status = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (_fn: unknown, args: unknown) => (args === "skip" ? undefined : status(args)),
  useMutation: () => vi.fn(),
}));

import { RobotSend } from "./RobotSend";
import { useRobotLink } from "./useRobotLink";
import { bleTestDevice } from "./bleTestDevice";
import { serialTestDevice } from "./serialTestDevice";

const NOW = Date.UTC(2026, 9, 17, 20, 0);
const ROBOT_KEY = "robolab.robot";

function Linked({ program }: { program: readonly ReturnType<typeof move>[] }) {
  const robot = useRobotLink();
  return <RobotSend robot={robot} program={program} disabled={false} />;
}

function Harness({ program = [move("FORWARD")] }: { program?: readonly ReturnType<typeof move>[] }) {
  return (
    <ToastProvider>
      <Linked program={program} />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  window.localStorage.removeItem(ROBOT_KEY);
  window.localStorage.removeItem("robolab.robot.transport");
  window.localStorage.removeItem("robolab.robot.transport.v2");
  status.mockReset();
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "serial");
  Reflect.deleteProperty(navigator, "bluetooth");
  vi.useRealTimers();
});

describe("sincronizar con robot (wifi)", () => {
  beforeEach(() => window.localStorage.setItem("robolab.robot.transport", "wifi"));
  it("sin robot vinculado: el botón dice Robot y la hoja explica los tres pasos con el chip 'Robot sin conectar'", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: /Robot/ });
    expect(trigger.textContent).toContain("Robot");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    const sheet = screen.getByRole("dialog", { name: "Sincronizar con robot" });
    expect(sheet.tagName).toBe("DIALOG");
    const steps = within(sheet).getAllByRole("listitem").map((li) => li.textContent);
    expect(steps).toEqual(["1Enciende el robot", "2Mira su código en la pantalla o en el monitor", "3Escríbelo aquí"]);
    expect(within(sheet).getByRole("status").textContent).toBe("Robot sin conectar");
    expect(within(sheet).getByLabelText("Código del robot")).toBeTruthy();
    // Por wifi no hay lista de dispositivos que elegir.
    expect(within(sheet).queryByRole("list", { name: /dispositivos/i })).toBeNull();
    expect(within(sheet).getByRole("button", { name: "Conectar" })).toBeTruthy();
  });

  it("con un código guardado y el servidor sin responder todavía: 'Buscando robot…'", () => {
    window.localStorage.setItem(ROBOT_KEY, "K7Q4MZ");
    status.mockReturnValue(undefined);
    render(<Harness />);
    expect(screen.getByRole("button", { name: /Buscando/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Buscando/ }));
    expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toBe("Buscando robot…");
  });

  it("si el robot dio señal hace poco: 'Robot conectado', botón Robot OK y se puede enviar la secuencia", () => {
    window.localStorage.setItem(ROBOT_KEY, "K7Q4MZ");
    status.mockReturnValue({ name: "Robi-12", lastSeenAt: NOW - 1000, codeExpiresAt: NOW + 3_600_000, lastCommand: null });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Robot OK/ }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("status").textContent).toBe("Robot conectado");
    expect(within(sheet).getByText("Robi-12")).toBeTruthy();
    expect((within(sheet).getByRole("button", { name: "Enviar al robot" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(within(sheet).getByRole("button", { name: "Robot OK" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("si el robot lleva más de 10 s sin dar señal vuelve a 'Robot sin conectar' y explica qué revisar", () => {
    window.localStorage.setItem(ROBOT_KEY, "K7Q4MZ");
    status.mockReturnValue({ name: "Robi-12", lastSeenAt: NOW - 60_000, codeExpiresAt: NOW + 3_600_000, lastCommand: null });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Robot/ }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("status").textContent).toBe("Robot sin conectar");
    expect(within(sheet).getByText(/encendido y con wifi/)).toBeTruthy();
    expect((within(sheet).getByRole("button", { name: "Enviar al robot" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("sincronizar con robot (BLE)", () => {
  beforeEach(() => window.localStorage.setItem("robolab.robot.transport.v2", "bluetooth"));
  it("cerrar la hoja durante el selector cancela la conexión pendiente", async () => {
    const peripheral = bleTestDevice();
    let choose!: (device: typeof peripheral.device) => void;
    Object.defineProperty(navigator, "bluetooth", { configurable: true, value: { requestDevice: () => new Promise((resolve) => { choose = resolve; }) } });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Sincronizar con robot/ }));
    fireEvent.click(screen.getByRole("button", { name: "Elegir robot" }));
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    choose(peripheral.device);
    await waitFor(() => expect(screen.getByRole("button", { name: /Sincronizar con robot/ }).textContent).toBe("Robot"));
    expect(peripheral.gatt.connect).not.toHaveBeenCalled();
  });

  it("explica Chrome y Ubuntu sin pedir emparejar en el sistema ni código wifi", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Sincronizar con robot/ }));
    const sheet = within(screen.getByRole("dialog"));
    expect(sheet.getByRole("button", { name: "Bluetooth" }).getAttribute("aria-pressed")).toBe("true");
    expect(sheet.queryByLabelText("Código del robot")).toBeNull();
    expect(sheet.getByText(/Chrome.*Web Bluetooth/)).toBeTruthy();
    expect(sheet.getByText(/Ubuntu.*Experimental Web Platform features/)).toBeTruthy();
    expect(sheet.queryByText(/Empareja RoboLab/)).toBeNull();
    expect((sheet.getByRole("button", { name: "Elegir robot" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sheet.getByRole("button", { name: "Wifi" }));
    expect(sheet.getByLabelText("Código del robot")).toBeTruthy();
  });

  it("un fallo GATT conserva el error original y permite volver a elegir el robot", async () => {
    const peripheral = bleTestDevice();
    peripheral.gatt.connect.mockRejectedValueOnce(new DOMException("GATT connection failed", "NetworkError"));
    Object.defineProperty(navigator, "bluetooth", { configurable: true, value: peripheral.bluetooth });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Sincronizar con robot/ }));
    fireEvent.click(screen.getByRole("button", { name: "Elegir robot" }));
    const sheet = within(screen.getByRole("dialog"));
    await waitFor(() => expect(sheet.getByRole("alert").textContent).toMatch(/encendido y cerca/));
    expect(sheet.getByText("Detalles de conexión")).toBeTruthy();
    expect(sheet.getByText(/Al conectar con el robot.*NetworkError/)).toBeTruthy();
    expect(sheet.getByText("GATT connection failed")).toBeTruthy();
    fireEvent.click(sheet.getByRole("button", { name: "Elegir robot" }));
    await waitFor(() => expect(sheet.getByText("Robot conectado")).toBeTruthy());
  });

  it("mantiene el enlace al cerrar la hoja, muestra capacidades reales y permite parar fuera de ella", async () => {
    const peripheral = bleTestDevice();
    Object.defineProperty(navigator, "bluetooth", { configurable: true, value: peripheral.bluetooth });
    const { rerender, unmount } = render(<Harness program={[move("BACKWARD")]} />);
    fireEvent.click(screen.getByRole("button", { name: /Sincronizar con robot/ }));
    fireEvent.click(screen.getByRole("button", { name: "Elegir robot" }));
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByText("Robot conectado")).toBeTruthy());
    expect(screen.getByText(/BLE conectado/)).toBeTruthy();
    expect(screen.getByText(/Quita los pasos de retroceso/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Enviar al robot" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<Harness program={[move("FORWARD")]} />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar al robot" }));
    await waitFor(() => expect(peripheral.frames.some((text) => /^RUN [\w-]+ A\n$/.test(text))).toBe(true));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Robot OK" }));
    expect(peripheral.gatt.connected).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Parar robot" }));
    await waitFor(() => expect(peripheral.frames).toContain("STOP\n"));
    unmount();
    await waitFor(() => expect(peripheral.gatt.connected).toBe(false));
  });
});

describe("sincronizar con robot (USB)", () => {
  it("prioriza USB aunque antes se haya elegido Bluetooth y explica el cable sin flags", () => {
    localStorage.setItem("robolab.robot.transport", "bluetooth");
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Sincronizar con robot/ }));
    const sheet = within(screen.getByRole("dialog"));
    expect(sheet.getByRole("button", { name: "USB" }).getAttribute("aria-pressed")).toBe("true");
    expect(sheet.getByText(/cable USB de datos/)).toBeTruthy();
    expect(sheet.getByText(/Chrome.*Web Serial/)).toBeTruthy();
    expect(sheet.queryByText(/Experimental Web Platform/)).toBeNull();
    expect(sheet.queryByLabelText("Código del robot")).toBeNull();
  });

  it("conecta USB, conserva el enlace al cerrar la hoja y mantiene Parar robot accesible", async () => {
    const device = serialTestDevice();
    Object.defineProperty(navigator, "serial", { configurable: true, value: device.serial });
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Sincronizar con robot/ }));
    fireEvent.click(screen.getByRole("button", { name: "Elegir puerto USB" }));
    await waitFor(() => expect(screen.getByText("Robot conectado")).toBeTruthy());
    expect(screen.getByText(/USB conectado/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enviar al robot" }));
    await waitFor(() => expect(device.frames.some((frame) => /^RUN [\w-]+ A\n$/.test(frame))).toBe(true));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Robot OK" }));
    expect(device.port.close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Parar robot" }));
    await waitFor(() => expect(device.frames.filter((frame) => frame === "STOP\n")).toHaveLength(2));
    view.unmount();
    await waitFor(() => expect(device.port.close).toHaveBeenCalledOnce());
  });
});
