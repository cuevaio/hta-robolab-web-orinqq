import { useMutation } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@robolab/backend/convex/_generated/api";
import { capacityText, evidenceForMission } from "@robolab/backend/domain/curriculum/competencias";
import { topicInfo } from "@robolab/backend/domain/explore/challenges";
import { type Execution, type LabError, type LabStep, execute, messageFor, nextHint } from "@robolab/backend/domain/lab/execute";
import { ARROW, DIRS, DIR_LABEL, type Dir, MAX_ARROWS, type Mission, cellKey, missionById } from "@robolab/backend/domain/lab/mission";
import { arrowsToProgram, headingAfter } from "@robolab/backend/domain/lab/robot";
import { countVisited, solve } from "@robolab/backend/domain/lab/solve";
import { Guide, type Mood } from "../../shared/ui/Guide";
import { Icon } from "../../shared/ui/Icon";
import { deviceId, useExploreProgress } from "../explore/storage";
import { LEVEL_INFO } from "../explore/ExploreLayout";
import { RobotSend } from "../robot/RobotSend";
import { useRobotLink } from "../robot/useRobotLink";
import { useStudentToken } from "../student/session";
import { LabBoard, LabLegend } from "./LabBoard";
import "./lab.css";

/**
 * Partida de clase de un alumno con sesión. La agrega el paquete A+B al backend;
 * se nombra por su ruta para que esta web compile aunque el paquete instalado
 * todavía no la traiga. Si el servidor no la tiene, la llamada falla y se avisa
 * por consola; la partida anónima igual queda registrada.
 */
const recordChallengePlayRef = makeFunctionReference<
  "mutation",
  { token: string; challengeId: string; arrows: Dir[]; runs: number; hints: number; ms: number },
  { solved: boolean }
>("student:recordChallengePlay");

type Stats = { readonly runs: number; readonly hints: number; readonly ms: number; readonly arrows: readonly Dir[] };

type Props = {
  readonly mission: Mission;
  /** Con qué id se registra la partida: el de `MISSIONS` o el de la misión publicada por un docente. */
  readonly missionId: string;
  readonly back: { readonly to: string; readonly label: string };
};

const MOOD_FOR: Record<LabError, Mood> = {
  "Fuera del tablero": "surprised",
  "El robot chocó con una pared": "surprised",
  "Presupuesto de energía superado": "sad",
  "No llegó a la meta": "thinking",
  "Faltan estaciones obligatorias": "thinking",
};

const warn = (error: unknown) => console.warn("No se pudo registrar la partida", error);
/** Hora del reloj; solo se lee en manejadores de eventos, nunca al renderizar. */
const now = () => Date.now();

/** Jugador de misiones de Primaria: ficha, tres subniveles, flechas, energía, pistas y robot físico. */
export function LabPlayer({ mission, missionId, back }: Props) {
  const [phase, setPhase] = useState<"intro" | "play">("intro");
  const [level, setLevel] = useState(0);
  const { record } = useExploreProgress();
  const [token] = useStudentToken();
  const recordChallengePlay = useMutation(recordChallengePlayRef);

  function solved(stats: Stats) {
    // El avance local solo conoce las misiones del modo abierto.
    if (missionById(mission.id)) record(mission.id, { solved: true, runs: stats.runs, hints: stats.hints, ms: stats.ms });
    if (token) {
      recordChallengePlay({ token, challengeId: mission.id, arrows: [...stats.arrows], runs: stats.runs, hints: stats.hints, ms: stats.ms }).catch(warn);
    }
  }

  if (phase === "intro") return <Intro mission={mission} back={back} onStart={() => setPhase("play")} />;

  return (
    <div className="stack">
      <div className="lab-levels" role="group" aria-label="Nivel">
        {mission.levels.map((l, i) => (
          <button key={l.name} type="button" className="lab-level" aria-pressed={i === level} onClick={() => setLevel(i)}>
            <span className="lab-level-num">Nivel {i + 1}</span>
            <strong>{l.name}</strong>
            <span className="small muted">{l.description}</span>
            <span className="badge">
              🔋 {l.budget} energía · {l.need} {l.need === 1 ? "estación" : "estaciones"}
            </span>
          </button>
        ))}
      </div>
      <LevelPlay
        key={level}
        mission={mission}
        missionId={missionId}
        level={level}
        onSolved={solved}
        onNextLevel={level + 1 < mission.levels.length ? () => setLevel(level + 1) : null}
      />
    </div>
  );
}

function Intro({ mission, back, onStart }: { mission: Mission; back: Props["back"]; onStart: () => void }) {
  const topic = topicInfo(mission.topic);
  return (
    <div className="intro-grid">
      <section className="card stack">
        <span className="badge" style={{ justifySelf: "start" }}>
          {topic ? `${topic.emoji} ${topic.name} · ` : ""}
          {LEVEL_INFO.primaria.name}
        </span>
        <h1 style={{ margin: 0 }}>
          <span aria-hidden="true">{mission.emoji} </span>
          {mission.title}
        </h1>
        <p>{mission.story}</p>
        <div className="row" style={{ gap: 8 }}>
          <span className="chip">🎯 3 niveles</span>
          <span className="chip">
            🚩 {mission.stations.length} {mission.stations.length === 1 ? "estación" : "estaciones"}
          </span>
          <span className="chip">🔋 Energía limitada</span>
          <span className="chip">💡 3 pistas</span>
        </div>
        <details className="small">
          <summary className="muted">Competencias del Currículo Nacional que evidencia</summary>
          <ul className="evidence">
            {evidenceForMission().map((e) => (
              <li key={`${e.competency}-${e.capacity}`}>
                <strong>Competencia {e.competency}</strong> · {capacityText(e)}
                <span className="muted"> — {e.how}</span>
              </li>
            ))}
          </ul>
        </details>
        <div className="row">
          <button className="btn btn-primary" type="button" onClick={onStart}>
            <Icon name="play" /> Empezar la misión
          </button>
          <Link className="link-btn" to={back.to}>
            {back.label}
          </Link>
        </div>
      </section>
      <section className="card stack preview" aria-label="Así empieza">
        <span className="small muted" style={{ textAlign: "center" }}>
          Así empieza
        </span>
        <LabBoard mission={mission} robot={{ cell: mission.start, heading: headingAfter([]) }} mood="idle" stepMs={STEP_MS_MAX} />
        <Guide message="¡Hola! Soy Robi. Elige tu nivel y arma la ruta con flechas. Si te trabas, pídeme una pista." />
      </section>
    </div>
  );
}

const STEP_MS_MIN = 120;
const STEP_MS_MAX = 450;
/** Toda la animación dura unos dos segundos, sin pasar de medio segundo por casilla. */
const stepMsFor = (steps: number) => Math.max(STEP_MS_MIN, Math.min(STEP_MS_MAX, Math.floor(2400 / Math.max(1, steps))));

type LevelProps = {
  readonly mission: Mission;
  readonly missionId: string;
  readonly level: number;
  readonly onSolved: (stats: Stats) => void;
  readonly onNextLevel: (() => void) | null;
};

/** Un subnivel. Se monta de nuevo al cambiar de nivel (estado limpio). */
function LevelPlay({ mission, missionId, level, onSolved, onNextLevel }: LevelProps) {
  const cfg = mission.levels[level]!;
  const [arrows, setArrows] = useState<Dir[]>([]);
  const [trace, setTrace] = useState<readonly LabStep[]>([]);
  const [stepMs, setStepMs] = useState(STEP_MS_MAX);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [lastError, setLastError] = useState<LabError | null>(null);
  const [boardMood, setBoardMood] = useState<"idle" | "error" | "success">("idle");
  const [hints, setHints] = useState(0);
  const [guide, setGuide] = useState<{ mood: Mood; message: string }>({ mood: "idle", message: cfg.description });
  const hintsSinceRun = useRef(0);
  const runs = useRef(0);
  const [startedAt] = useState(() => Date.now());
  const timers = useRef<number[]>([]);
  const recordPlay = useMutation(api.lab.recordPlay);
  const robotLink = useRobotLink();

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const say = (mood: Mood, message: string) => setGuide({ mood, message });
  const current = trace.at(-1);
  const robot = { cell: current?.cell ?? mission.start, heading: headingAfter(current?.dir ? [current.dir] : []) };
  const visited = new Set(trace.map((s) => cellKey(s.cell)));
  const energy = current?.cost ?? 0;
  const stations = countVisited(current?.mask ?? 0);
  const failedIndex = !running && lastError && !completed ? trace.length - 1 : null; // la flecha que falló (0-based), si falló en el camino

  function invalidate() {
    setTrace([]);
    setCompleted(false);
    setBoardMood("idle");
  }

  function add(dir: Dir) {
    if (arrows.length >= MAX_ARROWS) {
      say("thinking", `Límite de ${MAX_ARROWS} instrucciones por programa.`);
      return;
    }
    setArrows([...arrows, dir]);
    invalidate();
  }

  function removeAt(index: number) {
    setArrows(arrows.filter((_, i) => i !== index));
    invalidate();
  }

  function undo() {
    setArrows(arrows.slice(0, -1));
    invalidate();
  }

  function clear() {
    setArrows([]);
    invalidate();
    say("idle", "Programa limpio. Prueba otra estrategia.");
  }

  function run() {
    const result = execute(mission, level, arrows);
    runs.current += 1;
    const ms = stepMsFor(result.steps.length);
    setStepMs(ms);
    setRunning(true);
    setCompleted(false);
    setTrace([]);
    setBoardMood("idle");
    say("thinking", "Ejecutando tu programa…");
    result.steps.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setTrace(result.steps.slice(0, i + 1)), i * ms));
    });
    timers.current.push(window.setTimeout(() => finish(result), result.steps.length * ms + 200));
    // El servidor vuelve a ejecutar y anota; la animación no espera por la red.
    recordPlay({
      missionId,
      level,
      deviceId: deviceId(),
      arrows,
      hints: hintsSinceRun.current,
      runs: runs.current,
      ms: now() - startedAt,
    }).catch(warn);
    hintsSinceRun.current = 0;
  }

  function finish(result: Execution) {
    setRunning(false);
    setLastError(result.error);
    setCompleted(result.ok);
    setBoardMood(result.ok ? "success" : result.error === "El robot chocó con una pared" || result.error === "Fuera del tablero" ? "error" : "idle");
    say(result.ok ? "happy" : MOOD_FOR[result.error!], messageFor(result));
    if (result.ok) onSolved({ runs: runs.current, hints, ms: now() - startedAt, arrows });
  }

  function askHint() {
    say("thinking", nextHint(mission, hints, lastError));
    setHints((n) => n + 1);
    hintsSinceRun.current += 1;
  }

  function showSolution() {
    const solution = solve(mission, level);
    if (!solution) return;
    setArrows([...solution.path]);
    invalidate();
    say("idle", `Ruta verificada por el validador: ${solution.path.length} pasos y ${solution.cost} de energía. Pulsa Ejecutar para comprobarla.`);
  }

  return (
    <div className="game">
      <div className="stack">
        <p className="play-goal">
          <strong>{mission.title}.</strong> {cfg.description} Cada paso normal cuesta 1; un terreno amarillo cuesta 3.
        </p>
        <LabBoard mission={mission} robot={robot} visited={visited} mood={boardMood} stepMs={stepMs} />
        <LabLegend />
      </div>
      <div className="stack">
        <Guide mood={guide.mood} message={guide.message}>
          <button className="btn btn-sm" type="button" onClick={askHint} disabled={running}>
            💡 Pista{hints > 0 ? ` (${hints})` : ""}
          </button>
        </Guide>

        <section className="card stack" aria-labelledby={`program-title-${level}`}>
          <h2 id={`program-title-${level}`} style={{ margin: 0, fontSize: "1.15rem" }}>
            Programa al robot
          </h2>
          <div className="lab-arrows" role="group" aria-label="Bloques de flechas">
            {DIRS.map((dir) => (
              <button key={dir} type="button" className="lab-arrow" aria-label={DIR_LABEL[dir]} disabled={running} onClick={() => add(dir)}>
                {ARROW[dir]}
              </button>
            ))}
          </div>
          <div className="stack-sm">
            <span className="label" id={`program-label-${level}`}>
              Tus bloques (toca para borrar)
            </span>
            <div className="lab-program">
              {arrows.length === 0 && <span className="muted small">Pulsa una flecha para empezar…</span>}
              {/* Lista real: un <button role="listitem"> no le dice al lector de pantalla que el paso se puede quitar. */}
              <ul className="lab-steps" aria-labelledby={`program-label-${level}`}>
                {arrows.map((dir, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="lab-cmd"
                      data-state={failedIndex !== null && i === failedIndex ? "error" : undefined}
                      disabled={running}
                      aria-label={`Paso ${i + 1}: ${DIR_LABEL[dir]}. Toca para quitar.`}
                      onClick={() => removeAt(i)}
                    >
                      {ARROW[dir]} ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="lab-meters" role="status">
            <span className="chip" data-over={energy > cfg.budget || undefined}>
              🔋 Energía {energy} / {cfg.budget}
            </span>
            <span className="chip" data-done={stations >= cfg.need && cfg.need > 0 ? true : undefined}>
              🚩 Estaciones {stations} / {cfg.need}
            </span>
          </div>
          <div className="row">
            <button className="btn btn-primary" type="button" style={{ flex: 1 }} disabled={running || arrows.length === 0} onClick={run}>
              <Icon name="play" /> Ejecutar
            </button>
            <button className="btn" type="button" disabled={running || arrows.length === 0} onClick={undo}>
              <Icon name="arrowLeft" /> Deshacer
            </button>
            <button className="btn btn-ghost" type="button" disabled={running || arrows.length === 0} onClick={clear}>
              <Icon name="rotate" /> Limpiar
            </button>
          </div>
          <button className="link-btn small" type="button" disabled={running} onClick={showSolution}>
            Ver solución verificada
          </button>
        </section>

        {completed && (
          <div className="row">
            {onNextLevel && (
              <button className="btn btn-primary" type="button" onClick={onNextLevel}>
                Siguiente nivel <Icon name="chevronRight" size={18} />
              </button>
            )}
            <button className="btn" type="button" onClick={clear}>
              <Icon name="rotate" /> Otra ruta
            </button>
          </div>
        )}
        <div className="row">
          <RobotSend robot={robotLink} program={arrowsToProgram(arrows)} disabled={!completed || running} />
        </div>
        {!completed && <span className="hint">El robot físico recibe la ruta cuando la misión está completada.</span>}
      </div>
    </div>
  );
}
