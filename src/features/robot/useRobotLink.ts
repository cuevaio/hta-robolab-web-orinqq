import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Program } from "@robolab/backend/domain/game/program";
import { toRobotText } from "@robolab/backend/domain/robot/protocol";
import { bluetoothProgramProblem } from "@robolab/backend/domain/robot/bluetooth";
import { userMessage } from "../../shared/errors";
import { useToast } from "../../shared/ui/Toast";
import { createBluetoothLink } from "./bluetoothLink";
import { useWifiRobotLink } from "./useWifiRobotLink";

export type { SyncState } from "./useWifiRobotLink";
export type RobotTransport = "bluetooth" | "wifi";
export type RobotSync = ReturnType<typeof useRobotLink>;
const TRANSPORT_KEY = "robolab.robot.transport";
function savedTransport(): RobotTransport {
  try { return localStorage.getItem(TRANSPORT_KEY) === "wifi" ? "wifi" : "bluetooth"; }
  catch { return "bluetooth"; }
}

/** La ejecución del reto y la hoja Robot comparten una única conexión física. */
export function useRobotLink() {
  const [transport, selectTransport] = useState(savedTransport);
  const [bluetooth] = useState(() => createBluetoothLink());
  const connection = useSyncExternalStore(bluetooth.subscribe, bluetooth.getSnapshot);
  const wifi = useWifiRobotLink(transport === "wifi");
  const [localError, setLocalError] = useState<string | null>(null);
  const toast = useToast();
  const isBluetooth = transport === "bluetooth";

  useEffect(() => {
    const leave = () => { void bluetooth.disconnect(); };
    window.addEventListener("pagehide", leave);
    return () => { window.removeEventListener("pagehide", leave); leave(); };
  }, [bluetooth]);

  useEffect(() => {
    if (isBluetooth && connection.error) toast(connection.error, { tone: "error" });
  }, [connection.error, isBluetooth, toast]);

  const setTransport = useCallback((next: RobotTransport) => {
    if (bluetooth.getSnapshot().busy) return;
    if (next === "wifi") void bluetooth.disconnect();
    setLocalError(null);
    selectTransport(next);
    try { localStorage.setItem(TRANSPORT_KEY, next); } catch { /* Preferencia solo en esta pantalla. */ }
  }, [bluetooth]);

  const send = useCallback(async (program: Program) => {
    if (!isBluetooth) { await wifi.send(program); return; }
    if (program.length === 0 || bluetooth.getSnapshot().state !== "on") return;
    setLocalError(null);
    try { await bluetooth.send(toRobotText(program)); }
    catch (error) {
      const message = userMessage(error, "No pudimos enviar el programa.");
      setLocalError(message); toast(message, { tone: "error" });
    }
  }, [bluetooth, isBluetooth, wifi, toast]);

  function programProblem(program: Program): string | null {
    if (!isBluetooth || !connection.commands || !program.length) return null;
    try { return bluetoothProgramProblem(toRobotText(program), connection.commands); }
    catch (error) { return userMessage(error, "El programa no es válido."); }
  }

  return {
    ...wifi,
    transport, setTransport, send, programProblem,
    state: isBluetooth ? connection.state : wifi.state,
    online: isBluetooth ? connection.state === "on" : wifi.online,
    busy: isBluetooth ? connection.busy : wifi.busy,
    error: isBluetooth ? localError ?? connection.error : wifi.error,
    problem: isBluetooth ? null : wifi.problem,
    supported: bluetooth.supported,
    bluetooth: connection,
    connect: bluetooth.connect,
    disconnect: bluetooth.disconnect,
    stop: bluetooth.stop,
  };
}
