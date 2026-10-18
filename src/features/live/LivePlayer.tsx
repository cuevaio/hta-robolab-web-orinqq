import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@robolab/backend/convex/_generated/api";
import { MAX_LIVE_COMMANDS, mazeFor } from "@robolab/backend/domain/live/maze";
import { COMMANDS, type Command } from "@robolab/backend/domain/game/program";
import { Board } from "../game/Board";
import { BLOCK_LOOK } from "../game/blocks";
import type { RoomView } from "./types";
import { useLiveAction } from "./useLiveAction";

export function LivePlayer({ room, token }: { room: RoomView; token: string }) {
  const run = useMutation(api.liveRooms.run);
  const editShared = useMutation(api.liveRooms.editShared);
  const [draft, setDraft] = useState<Command[]>(() => [...(room.me?.program ?? [])]);
  const { busy, error, perform } = useLiveAction();
  const cooperative = room.mode === "cooperative";
  const result = cooperative ? room.shared : room.me;
  if (!result) return null;
  const program = cooperative ? room.shared.program : draft;
  const finished = result.finishedAt !== null;
  const disabled = busy || room.status !== "running" || finished;
  const place = room.participants.find((p) => p.studentId === room.me?.studentId)?.place;
  const listLabel = cooperative ? "Programa del equipo" : "Tu programa";

  function edit(action: "append" | "undo" | "clear", command?: Command) {
    if (disabled) return;
    if (cooperative) {
      void perform(() => editShared({ token, roomId: room.roomId, revision: room.shared.revision, action,
        ...(command ? { command } : {}),
      }));
    } else {
      setDraft((previous) => action === "clear" ? [] : action === "undo" ? previous.slice(0, -1)
        : command && previous.length < MAX_LIVE_COMMANDS ? [...previous, command] : previous);
    }
  }

  function execute() {
    const common = { token, roomId: room.roomId, requestId: crypto.randomUUID() };
    void perform(() => run(cooperative ? { ...common, revision: room.shared.revision } : { ...common, program: draft }));
  }

  const message = finished
    ? cooperative ? "¡Lo lograron en equipo!" : `¡Laberinto resuelto! Llegaste en el puesto ${place ?? "—"}.`
    : result.outcome === "OFF_PATH" ? "Robi salió del camino. Cambia tu programa."
    : result.outcome === "INCOMPLETE" ? "Todavía falta llegar a la estrella."
    : result.outcome === "EMPTY" ? "Agrega movimientos y vuelve a ejecutar." : "Arma los movimientos para llegar a la estrella.";

  return (
    <section className="live-game" aria-label={cooperative ? "Tablero compartido" : "Tu tablero"}>
      <div className="stack">
        <Board map={mazeFor(room.mazeId)} robot={result.state} mood={finished ? "success" : result.outcome === "OFF_PATH" ? "error" : "idle"} stepMs={0} />
        <p className={finished ? "alert alert-ok" : "live-feedback"} role="status">{message}</p>
        <p className="small muted">Ejecuciones confirmadas: {result.runs}. Cada ejecución empieza desde la salida.</p>
      </div>
      <div className="stack">
        <h2>{listLabel}</h2>
        {cooperative && <p className="small muted">Los cambios se comparten al instante. Cualquiera del equipo puede ejecutar.</p>}
        <fieldset className="live-controls" disabled={disabled}>
          <legend className="sr-only">Agregar movimientos</legend>
          <div className="live-palette">{COMMANDS.map((command) => (
            <button key={command} className="btn" type="button" disabled={program.length >= MAX_LIVE_COMMANDS} onClick={() => edit("append", command)}>
              <img src={BLOCK_LOOK[command].icon} width="30" height="30" alt="" />{BLOCK_LOOK[command].label}
            </button>
          ))}</div>
        </fieldset>
        <ol className="live-program" aria-label={listLabel}>
          {program.map((command, i) => <li key={`${i}-${command}`}><img src={BLOCK_LOOK[command].icon} width="24" height="24" alt="" /><span>{i + 1}. {BLOCK_LOOK[command].label}</span></li>)}
        </ol>
        {program.length === 0 && <p className="muted">Tu programa empieza con un movimiento.</p>}
        <span className="small muted">{program.length} de {MAX_LIVE_COMMANDS} movimientos</span>
        <div className="row">
          <button type="button" className="btn" disabled={disabled || program.length === 0} onClick={() => edit("undo")}>Quitar último</button>
          <button type="button" className="btn btn-ghost" disabled={disabled || program.length === 0} onClick={() => edit("clear")}>Borrar programa</button>
        </div>
        <button type="button" className="btn btn-primary" disabled={disabled || program.length === 0} aria-busy={busy} onClick={execute}>Ejecutar programa</button>
        {room.status === "closed" && <p>La partida terminó. Tu resultado está guardado.</p>}
        {error && <p className="alert alert-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
