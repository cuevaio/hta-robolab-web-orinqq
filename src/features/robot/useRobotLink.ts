import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Program } from "@robolab/backend/domain/game/program";
import { toRobotText } from "@robolab/backend/domain/robot/protocol";
import { bluetoothProgramProblem } from "@robolab/backend/domain/robot/bluetooth";
import { userMessage } from "../../shared/errors";
import { useToast } from "../../shared/ui/Toast";
import { createBleLink } from "./bleLink";
import { createUsbLink } from "./usbLink";
import { useWifiRobotLink } from "./useWifiRobotLink";

export type { SyncState } from "./useWifiRobotLink";
export type RobotTransport = "usb" | "bluetooth" | "wifi";
export type RobotSync = ReturnType<typeof useRobotLink>;
const TRANSPORT_KEY = "robolab.robot.transport.v2";
function savedTransport(): RobotTransport {
  try {
    const saved = localStorage.getItem(TRANSPORT_KEY);
    if (saved === "usb" || saved === "bluetooth" || saved === "wifi") return saved;
    // Conserva Wifi explícito; USB sustituye el antiguo Bluetooth predeterminado.
    return localStorage.getItem("robolab.robot.transport") === "wifi" ? "wifi" : "usb";
  } catch { return "usb"; }
}

/** La ejecución del reto y la hoja Robot comparten una única conexión física. */
export function useRobotLink() {
  const [transport, selectTransport] = useState(savedTransport);
  const [ble] = useState(() => createBleLink());
  const [usb] = useState(() => createUsbLink());
  const bluetooth = transport === "usb" ? usb : ble;
  const connection = useSyncExternalStore(bluetooth.subscribe, bluetooth.getSnapshot);
  const wifi = useWifiRobotLink(transport === "wifi");
  const [localError, setLocalError] = useState<string | null>(null);
  const toast = useToast();
  const isLocal = transport !== "wifi";

  useEffect(() => {
    const leave = () => { void bluetooth.disconnect(); };
    window.addEventListener("pagehide", leave);
    return () => { window.removeEventListener("pagehide", leave); leave(); };
  }, [bluetooth]);

  useEffect(() => {
    if (isLocal && connection.error) toast(connection.error, { tone: "error" });
  }, [connection.error, isLocal, toast]);

  const setTransport = useCallback((next: RobotTransport) => {
    if (bluetooth.getSnapshot().busy) return;
    if (next !== transport) void bluetooth.disconnect();
    setLocalError(null);
    selectTransport(next);
    try { localStorage.setItem(TRANSPORT_KEY, next); } catch { /* Preferencia solo en esta pantalla. */ }
  }, [bluetooth, transport]);

  const send = useCallback(async (program: Program) => {
    if (!isLocal) { await wifi.send(program); return; }
    if (program.length === 0 || bluetooth.getSnapshot().state !== "on") return;
    setLocalError(null);
    try { await bluetooth.send(toRobotText(program)); }
    catch (error) {
      const message = userMessage(error, "No pudimos enviar el programa.");
      setLocalError(message); toast(message, { tone: "error" });
    }
  }, [bluetooth, isLocal, wifi, toast]);

  function programProblem(program: Program): string | null {
    if (!isLocal || !connection.commands || !program.length) return null;
    try { return bluetoothProgramProblem(toRobotText(program), connection.commands); }
    catch (error) { return userMessage(error, "El programa no es válido."); }
  }

  return {
    ...wifi,
    transport, setTransport, send, programProblem,
    state: isLocal ? connection.state : wifi.state,
    online: isLocal ? connection.state === "on" : wifi.online,
    busy: isLocal ? connection.busy : wifi.busy,
    error: isLocal ? localError ?? connection.error : wifi.error,
    problem: isLocal ? null : wifi.problem,
    supported: bluetooth.supported,
    bluetooth: connection,
    connect: bluetooth.connect,
    disconnect: bluetooth.disconnect,
    stop: bluetooth.stop,
  };
}
