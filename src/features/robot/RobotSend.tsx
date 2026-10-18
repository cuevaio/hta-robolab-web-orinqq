import { useQuery } from "convex/react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { api } from "@robolab/backend/convex/_generated/api";
import type { Program } from "@robolab/backend/domain/game/program";
import { ROBOT_CODE_LENGTH, isValidRobotCode, normalizeRobotCode } from "@robolab/backend/domain/robot/protocol";
import { Icon } from "../../shared/ui/Icon";
import type { RobotSync, SyncState } from "./useRobotLink";
import "./robot.css";

const STEP_TEXT = {
  pending: "Esperando al robot…",
  sent: "El robot lo recogió…",
  received: "El robot recibió el programa.",
  running: "El robot lo está haciendo…",
  done: "¡El robot terminó!",
  failed: "El robot avisó un problema",
  replaced: "Se envió otro programa después.",
  expired: "El robot no respondió.",
} as const;

const ROBOT_ERRORS: Record<string, string> = {
  BAD_CHAR: "una letra no válida",
  TOO_LONG: "el programa es muy largo",
  BUSY: "estaba ocupado",
  MOTOR: "falla de motor",
};

/** Texto del chip RobotSync (F1) y del botón BtnRobot (F2) en cada estado. */
const CHIP: Record<SyncState, string> = { off: "Robot sin conectar", searching: "Buscando robot…", on: "Robot conectado" };
const BUTTON: Record<SyncState, string> = { off: "Robot", searching: "Buscando…", on: "Robot OK" };

const WIFI_STEPS = ["Enciende el robot", "Mira su código en la pantalla o en el monitor", "Escríbelo aquí"];
const BLUETOOTH_STEPS = ["Enciende el robot", "Empareja RoboLab en los ajustes Bluetooth de tu laptop", "Toca «Elegir robot» y selecciona su puerto"];

/** `showModal` atrapa el foco y bloquea el fondo; donde no existe (navegadores viejos) se abre sin modal. */
function openDialog(dialog: HTMLDialogElement) {
  if (dialog.open) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog: HTMLDialogElement) {
  if (!dialog.open) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

type Props = {
  readonly robot: RobotSync;
  readonly program: Program;
  readonly disabled: boolean;
};

/**
 * Botón "Robot" (sin conectar / Buscando… / Robot OK) que abre la hoja
 * "Sincronizar con robot". Bluetooth Classic SPP es la opción inicial;
 * wifi conserva el emparejamiento por código para firmware anterior.
 */
export function RobotSend({ robot, program, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open) {
      openDialog(el);
      (el.querySelector<HTMLElement>("input, [tabindex='-1']") ?? el).focus();
    } else {
      closeDialog(el);
    }
  }, [open]);

  return (
    <>
      <button
        className="btn robot-btn"
        type="button"
        data-state={robot.state}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${BUTTON[robot.state]}: ${CHIP[robot.state]}. Sincronizar con robot`}
        onClick={() => setOpen(true)}
      >
        <span className="robot-dot" aria-hidden="true" />
        {BUTTON[robot.state]}
      </button>
      {!open && robot.transport === "bluetooth" && robot.busy && (
        <button className="btn btn-danger" type="button" onClick={() => void robot.stop()}>Parar robot</button>
      )}
      <dialog ref={dialog} className="dialog sheet robot-sheet" aria-labelledby={titleId} onClose={() => {
        setOpen(false);
        if (robot.transport === "bluetooth" && robot.state === "searching") void robot.disconnect();
      }}>
        <span className="sheet-handle" aria-hidden="true" />
        <h2 id={titleId} tabIndex={-1} style={{ margin: 0 }}>
          Sincronizar con robot
        </h2>
        <p className="small muted">Opcional. Tu secuencia también se ejecutará en el robot.</p>
        <div className="row" role="group" aria-label="Conexión del robot">
          <button className="btn btn-sm" type="button" aria-pressed={robot.transport === "bluetooth"} disabled={robot.busy} onClick={() => robot.setTransport("bluetooth")}>Bluetooth</button>
          <button className="btn btn-sm" type="button" aria-pressed={robot.transport === "wifi"} disabled={robot.busy} onClick={() => robot.setTransport("wifi")}>Wifi</button>
        </div>
        <ol className="robot-steps">
          {(robot.transport === "bluetooth" ? BLUETOOTH_STEPS : WIFI_STEPS).map((step, i) => (
            <li key={step}>
              <span className="robot-step-n" aria-hidden="true">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <span className="robot-chip" data-state={robot.state} role="status">
          <span className="robot-dot" aria-hidden="true" />
          {CHIP[robot.state]}
        </span>
        {open && (robot.transport === "bluetooth"
          ? <BluetoothBody robot={robot} program={program} disabled={disabled} onDone={() => setOpen(false)} />
          : <SheetBody robot={robot} program={program} disabled={disabled} onDone={() => setOpen(false)} />)}
      </dialog>
    </>
  );
}

const BLUETOOTH_STEP = { sending: "Enviando programa…", received: "El robot recibió el programa.", running: "El robot lo está haciendo…", done: "¡El robot terminó!", failed: "El programa se detuvo." };

function BluetoothBody({ robot, program, disabled, onDone }: Props & { onDone: () => void }) {
  const problem = robot.programProblem(program);
  const last = robot.bluetooth.last;
  return <div className="stack">
    {!robot.supported && <p className="hint">Abre RoboLab en Chrome de laptop por HTTPS o localhost para usar Bluetooth Classic. También puedes conectar por Wifi.</p>}
    {robot.state !== "on" ? <div className="row sheet-actions">
      <button className="btn" type="button" onClick={() => { void robot.disconnect(); onDone(); }}>Cancelar</button>
      <button className="btn btn-primary" type="button" disabled={!robot.supported || robot.state === "searching"} onClick={() => void robot.connect()}>
        {robot.state === "searching" ? "Conectando…" : "Elegir robot"}
      </button>
    </div> : <>
      <p className="small muted">Bluetooth Classic conectado. {robot.bluetooth.turns === "arc" ? "Este robot hace giros en arco; calibra el recorrido físico." : "El robot gira sobre su centro."}</p>
      {problem && <p className="hint" role="status">{problem}</p>}
      {last && <p className="small muted" role="status"><span className="code">{last.letters}</span> · {BLUETOOTH_STEP[last.status]}</p>}
      <div className="row sheet-actions">
        {robot.busy ? <button className="btn btn-danger" type="button" onClick={() => void robot.stop()}>Parar robot</button> :
          <button className="btn" type="button" disabled={disabled || !program.length || !!problem} onClick={() => void robot.send(program)}><Icon name="play" /> Enviar al robot</button>}
        <button className="btn btn-primary" type="button" onClick={onDone}>Robot OK</button>
      </div>
      <button className="link-btn small" type="button" onClick={() => void robot.disconnect()}>Desconectar robot</button>
    </>}
    {robot.error && <p className="alert alert-error" role="alert">{robot.error}</p>}
  </div>;
}

function SheetBody({ robot, program, disabled, onDone }: Props & { onDone: () => void }) {
  const [changing, setChanging] = useState(false);
  if (!robot.code || changing) {
    return (
      <LinkForm
        robot={robot}
        onCancel={() => {
          setChanging(false);
          if (!robot.code) onDone();
        }}
        onLinked={() => setChanging(false)}
      />
    );
  }
  const last = robot.status?.lastCommand;
  return (
    <div className="stack">
      <div className="row spread">
        <span>
          <strong>{robot.status?.name ?? robot.code}</strong>
          {robot.status?.name && <span className="small muted"> · {robot.code}</span>}
        </span>
        <button className="link-btn small" type="button" onClick={() => setChanging(true)}>
          Cambiar de robot
        </button>
      </div>
      {robot.problem && <p className="hint">{robot.problem}</p>}
      {last && (
        <p className="small muted" role="status">
          <span className="code">{last.letters}</span> · {STEP_TEXT[last.status]}
          {last.status === "failed" && `: ${ROBOT_ERRORS[last.error ?? ""] ?? last.error ?? "sin detalle"}.`}
        </p>
      )}
      {robot.error && (
        <p className="alert alert-error" role="alert">
          {robot.error}
        </p>
      )}
      <div className="row sheet-actions">
        <button
          className="btn"
          type="button"
          disabled={disabled || robot.busy || program.length === 0 || robot.state !== "on"}
          aria-busy={robot.busy}
          onClick={() => void robot.send(program)}
        >
          <Icon name="play" /> Enviar al robot
        </button>
        <button className="btn btn-primary" type="button" onClick={onDone}>
          {robot.state === "on" ? "Robot OK" : "Cerrar"}
        </button>
      </div>
    </div>
  );
}

function LinkForm({ robot, onCancel, onLinked }: { robot: RobotSync; onCancel: () => void; onLinked: () => void }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const valid = isValidRobotCode(draft);
  // Apenas el código está completo, se busca ese robot en el servidor.
  const found = useQuery(api.robot.status, valid ? { code: draft } : "skip");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!found) {
      setError("No encontramos ese robot. Revisa el código de su etiqueta.");
      return;
    }
    robot.link(draft, found.name);
    onLinked();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor={`${id}-code`}>Código del robot</label>
        <input
          id={`${id}-code`}
          className="input code"
          value={draft}
          onChange={(e) => {
            setDraft(normalizeRobotCode(e.target.value).slice(0, ROBOT_CODE_LENGTH));
            setError(null);
          }}
          placeholder="K7Q4MZ"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        />
        <span id={`${id}-hint`} className="hint">
          Son {ROBOT_CODE_LENGTH} letras o números. El robot necesita wifi con internet.
        </span>
        {valid && found === undefined && (
          <span className="hint" role="status">
            Buscando robot…
          </span>
        )}
        {valid && found && (
          <span className="hint" role="status">
            Encontramos a <strong>{found.name}</strong>.
          </span>
        )}
        {error && (
          <span id={`${id}-error`} className="field-error" role="alert">
            {error}
          </span>
        )}
      </div>
      <div className="row sheet-actions">
        <button className="btn" type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" type="submit" disabled={!valid || found === undefined}>
          Conectar
        </button>
      </div>
    </form>
  );
}
