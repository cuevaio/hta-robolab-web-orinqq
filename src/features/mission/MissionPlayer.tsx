import { type ReactNode, useEffect, useReducer, useRef, useState } from "react";
import { editorReducer, emptyEditor } from "@robolab/backend/domain/game/editor";
import { policyFor } from "@robolab/backend/domain/game/levels";
import { type Block, compile } from "@robolab/backend/domain/game/program";
import type { ExecutionState, ExecutionTrace, Mission } from "@robolab/backend/domain/mission/contracts";
import { executeMission } from "@robolab/backend/domain/mission/engine";
import { playSound, shouldStepSound } from "../../shared/sound/sounds";
import { Icon } from "../../shared/ui/Icon";
import { GuideAvatar, type Mood } from "../../shared/ui/Guide";
import { BlockEditor } from "../game/BlockEditor";
import "../explore/challenge.css";
import { MissionBoard } from "./MissionBoard";
import { outcomeMessage } from "./outcome";

/** Lo que dura cada paso del robot al reproducir el recorrido. */
export const STEP_MS = 450;
const WELCOME = "Programa a Robi para que llegue a la meta sin gastar más energía de la que tiene.";

export type Played = { readonly program: readonly Block[]; readonly runs: number; readonly ms: number };

type Props = {
  readonly mission: Mission;
  /** Se llama una vez cuando el programa llegó a la meta (el servidor lo vuelve a revisar). Si falla, el niño no pierde su logro en pantalla. */
  readonly onSolved?: (played: Played) => Promise<unknown> | void;
  /** Lo que va junto al resultado (por ejemplo, volver al inicio). */
  readonly after?: ReactNode;
};

/**
 * Jugar una misión del asistente: tablero con costos y energía, y la misma bandeja de
 * piezas de siempre (avanzar, retroceder y girar). El motor es el de Mission v1: el
 * mismo que usa el servidor para decidir si el niño la logró.
 */
export function MissionPlayer({ mission, onSolved, after }: Props) {
  const initial: ExecutionState = { position: mission.start, heading: mission.initialHeading, energyUsed: 0, visitedCheckpoints: [] };
  const policy = { ...policyFor("inicial"), palette: new Set(mission.allowedCommands) };
  const [editor, dispatch] = useReducer(editorReducer, emptyEditor);
  const [view, setView] = useState<ExecutionState>(initial);
  const [running, setRunning] = useState(false);
  const [solved, setSolved] = useState(false);
  const [runs, setRuns] = useState(0);
  const [guide, setGuide] = useState<{ mood: Mood; message: string }>({ mood: "idle", message: WELCOME });
  const [startedAt] = useState(() => Date.now());
  const timers = useRef<number[]>([]);
  const latest = useRef({ onSolved });
  useEffect(() => {
    latest.current = { onSolved };
  });
  const stopTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => stopTimers, []);

  function finish(trace: ExecutionTrace, blocks: readonly Block[], runCount: number) {
    setRunning(false);
    const ok = trace.outcome === "SUCCESS";
    playSound(ok ? "win" : "oops");
    setGuide({ mood: ok ? "happy" : trace.outcome === "COLLISION" || trace.outcome === "OUT_OF_BOUNDS" ? "surprised" : "thinking", message: outcomeMessage(trace.outcome, trace.failedStep) });
    if (!ok) return;
    setSolved(true);
    void Promise.resolve(latest.current.onSolved?.({ program: blocks, runs: runCount, ms: Date.now() - startedAt })).catch(() =>
      setGuide({ mood: "sad", message: "¡Lo lograste! Pero no pudimos guardar tu resultado; avisa a tu docente." }),
    );
  }

  function run() {
    if (running || solved || editor.blocks.length === 0) return;
    let trace: ExecutionTrace;
    try {
      trace = executeMission(mission, { schemaVersion: 1, commands: compile(editor.blocks) });
    } catch {
      setGuide({ mood: "surprised", message: "Tu programa es demasiado largo. Quita algunos pasos." });
      return;
    }
    stopTimers();
    const blocks = editor.blocks;
    const runCount = runs + 1;
    setRuns(runCount);
    setRunning(true);
    setView(initial);
    setGuide({ mood: "thinking", message: "Mira cómo se mueve Robi…" });
    playSound("play");
    trace.steps.forEach((step, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setView(step.state);
          if (shouldStepSound(i, trace.steps.length)) playSound("step");
        }, (i + 1) * STEP_MS),
      );
    });
    timers.current.push(window.setTimeout(() => finish(trace, blocks, runCount), (trace.steps.length + 1) * STEP_MS));
  }

  function clear() {
    stopTimers();
    setRunning(false);
    setView(initial);
  }

  const left = mission.energyBudget - view.energyUsed;
  return (
    <div className="game">
      <div className="board-column">
        <div className="goal-row">
          <section className="goal-card card" aria-label="Misión">
            <span className="badge">
              🧮 Misión · {mission.grade}.º grado
            </span>
            <div className="play-goal">
              <h1>{mission.title}.</h1>{" "}
              <span role="status" aria-live="polite">
                {guide.message}
              </span>
            </div>
          </section>
          <aside className="robi-card card" aria-label="Robi, tu guía">
            <GuideAvatar mood={guide.mood} size={56} />
          </aside>
        </div>

        <section className="board-panel card" aria-label="Tablero">
          <h2>Jardín</h2>
          <MissionBoard mission={mission} state={view} />
          <div className="mission-player-meter">
            <span>
              <span aria-hidden="true">🔋</span> Energía: {left} de {mission.energyBudget}
            </span>
            <meter min={0} max={mission.energyBudget} low={Math.ceil(mission.energyBudget / 3)} value={Math.max(0, left)} aria-label="Energía que queda" />
          </div>
        </section>

        {solved && (
          <section className="card stack-sm" aria-label="Resultado">
            <h2 className="proposal-grade">¡Misión lograda!</h2>
            <p>
              Usaste {view.energyUsed} de {mission.energyBudget} de energía.
            </p>
            {after}
          </section>
        )}
      </div>

      <section className="workspace card" aria-label="Espacio de trabajo">
        <BlockEditor
          policy={policy}
          state={editor}
          dispatch={dispatch}
          disabled={running || solved}
          onClear={clear}
          actions={
            <button className="btn btn-primary" type="button" disabled={running || solved || editor.blocks.length === 0} onClick={run}>
              <Icon name="play" /> Ejecutar
            </button>
          }
        />
      </section>
    </div>
  );
}
