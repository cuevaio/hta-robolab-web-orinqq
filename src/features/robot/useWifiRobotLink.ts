import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@robolab/backend/convex/_generated/api";
import type { Program } from "@robolab/backend/domain/game/program";
import { userMessage } from "../../shared/errors";
import { useToast } from "../../shared/ui/Toast";

const ROBOT_KEY = "robolab.robot";
/** El robot consulta cada medio segundo; si no aparece en 10 s, está apagado o sin wifi. */
export const ONLINE_MS = 10_000;

function readLinked(): string {
  try {
    return window.localStorage.getItem(ROBOT_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Id por envío. `randomUUID` no existe en http://192.168… (sin https): se usa un reemplazo. */
const requestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function writeLinked(code: string) {
  try {
    if (code) window.localStorage.setItem(ROBOT_KEY, code);
    else window.localStorage.removeItem(ROBOT_KEY);
  } catch {
    // Sin almacenamiento, el robot queda vinculado solo mientras dure la pestaña.
  }
}

/** Los tres estados del chip RobotSync del Figma (F1). */
export type SyncState = "off" | "searching" | "on";

/**
 * Vínculo con el robot físico (ESP32 por wifi): el código guardado en este
 * dispositivo, lo que el servidor sabe de ese robot y el envío de programas.
 * Lo comparten el botón "Robot" de la pantalla y la hoja "Sincronizar con robot".
 */
export function useWifiRobotLink(enabled: boolean) {
  const [code, setCode] = useState(readLinked);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const sendMutation = useMutation(api.robot.send);
  const status = useQuery(api.robot.status, enabled && code ? { code } : "skip");

  // Reloj para saber si el robot sigue dando señal.
  useEffect(() => {
    if (!enabled || !code) return;
    const timer = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(timer);
  }, [code, enabled]);

  const online = status != null && status.lastSeenAt != null && now - status.lastSeenAt < ONLINE_MS;
  const expired = status != null && status.codeExpiresAt <= now;
  const state: SyncState = !code ? "off" : status === undefined ? "searching" : online && !expired ? "on" : "off";

  /** Por qué no está conectado, en palabras para el usuario (null si está conectado o buscando). */
  const problem =
    state !== "off" || !code
      ? null
      : status === null
        ? "No encontramos ese robot. Revisa el código de su etiqueta."
        : expired
          ? "El robot muestra un código nuevo cada 12 horas. Toca «Cambiar de robot» y escríbelo."
          : "El robot no responde. Revisa que esté encendido y con wifi.";

  const link = useCallback(
    (next: string, name: string) => {
      writeLinked(next);
      setCode(next);
      setError(null);
      toast(`Conectado a ${name}.`);
    },
    [toast],
  );

  const unlink = useCallback(() => {
    writeLinked("");
    setCode("");
    setError(null);
  }, []);

  const send = useCallback(
    async (program: Program) => {
      if (!code || program.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        // Un id por envío: si la red reintenta, el robot no lo hace dos veces.
        const result = await sendMutation({ code, program: [...program], requestId: requestId() });
        toast(`Enviado a ${result.robotName}: ${result.letters}`);
      } catch (e) {
        const message = userMessage(e, "No pudimos enviar el programa al robot.");
        setError(message);
        toast(message, { tone: "error" });
      } finally {
        setBusy(false);
      }
    },
    [code, sendMutation, toast],
  );

  return { code, status, state, online, expired, problem, busy, error, link, unlink, send };
}
