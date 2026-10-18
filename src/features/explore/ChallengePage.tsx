import { useMutation } from "convex/react";
import { useEffect, useReducer, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api } from "@robolab/backend/convex/_generated/api";
import { capacityText, evidenceFor } from "@robolab/backend/domain/curriculum/competencias";
import { type Challenge, KIND_LABEL, challengeById, topicInfo } from "@robolab/backend/domain/explore/challenges";
import { type CheckResult, checkPrediction, checkProgram } from "@robolab/backend/domain/explore/check";
import { editorReducer } from "@robolab/backend/domain/game/editor";
import { policyFor } from "@robolab/backend/domain/game/levels";
import type { Cell } from "@robolab/backend/domain/game/map";
import { type Program, countBlocks } from "@robolab/backend/domain/game/program";
import { missionById } from "@robolab/backend/domain/lab/mission";
import { ActionBar } from "../../shared/ui/ActionBar";
import { Guide, GuideAvatar, type Mood } from "../../shared/ui/Guide";
import { Icon } from "../../shared/ui/Icon";
import { useFocusOnMount } from "../../shared/useFocusOnMount";
import { MissionRoute } from "../lab/MissionRoute";
import { BlockEditor } from "../game/BlockEditor";
import { warmUpRecognizer } from "../vision/recognizer";
import { InitialProgramEditor } from "../vision/InitialProgramEditor";
import { Board } from "../game/Board";
import { RobotSend } from "../robot/RobotSend";
import { useRobotLink, type RobotSync } from "../robot/useRobotLink";
import { STEP_MS, useRunner } from "../game/useRunner";
import { useStudentToken } from "../student/session";
import { speak } from "../student/speech";
import { ChallengeDone } from "./ChallengeDone";
import { Breadcrumbs, ExploreLayout, LEVEL_INFO } from "./ExploreLayout";
import { deviceId, useExploreProgress } from "./storage";
import { listPath } from "./paths";
import "./challenge.css";

type Stats = { readonly runs: number; readonly hints: number; readonly ms: number };
type Submission = { readonly program?: Program; readonly pick?: Cell };

const INSTRUCTION: Record<Challenge["kind"], string> = {
  sequence: "Arma el programa para que Wayra llegue a la estrella.",
  predict: "Lee el programa y toca la casilla donde terminará Wayra.",
  fix: "Este programa tiene un error. Quita o cambia bloques para arreglarlo.",
  stops: "Pasa por todas las banderas 🚩 y después llega a la estrella.",
  efficient: "Llega a la estrella usando pocos bloques.",
};

const MOOD_FOR: Record<Exclude<CheckResult, { ok: true }>["reason"], Mood> = {
  EMPTY: "idle",
  OFF_PATH: "surprised",
  INCOMPLETE: "thinking",
  MISSED_STOPS: "thinking",
  TOO_MANY_BLOCKS: "wink",
  WRONG_CELL: "sad",
  BLOCKS: "sad",
};

function Intro({ challenge, onStart }: { challenge: Challenge; onStart: () => void }) {
  const topic = topicInfo(challenge.topic)!;
  // Los retos de Inicial arrancan con Gestos: mientras lee la ficha se baja y se prepara el modelo de la cámara.
  useEffect(() => {
    if (challenge.level === "inicial" && challenge.kind !== "predict") warmUpRecognizer();
  }, [challenge]);
  return (
    <div className="intro-grid">
      <section className="card stack">
        <span className="badge" style={{ justifySelf: "start" }}>
          {topic.emoji} {topic.name} · {LEVEL_INFO[challenge.level].name}
        </span>
        <h1 style={{ margin: 0 }}>{challenge.title}</h1>
        <p>{challenge.story}</p>
        <div className="row" style={{ gap: 8 }}>
          <span className="chip">
            <span aria-hidden="true">⏱</span> {challenge.minutes}
          </span>
          <span className="chip">
            <span aria-hidden="true">🧠</span> {challenge.skill}
          </span>
          <span className="chip">
            <span aria-hidden="true">💡</span> 3 pistas
          </span>
          <span className="chip">{KIND_LABEL[challenge.kind]}</span>
        </div>
        <details className="small">
          <summary className="muted">Competencias del Currículo Nacional que evidencia</summary>
          <ul className="evidence">
            {evidenceFor(challenge).map((e) => (
              <li key={`${e.competency}-${e.capacity}`}>
                <strong>Competencia {e.competency}</strong> · {capacityText(e)}
                <span className="muted"> — {e.how}</span>
              </li>
            ))}
          </ul>
        </details>
        <div className="row">
          <button className="btn btn-primary" type="button" onClick={onStart}>
            <Icon name="play" /> Empezar el reto
          </button>
          <Link className="link-btn" to={listPath(challenge)}>
            Volver a la lista
          </Link>
        </div>
      </section>
      <section className="card stack preview" aria-label="Así empieza">
        <span className="small muted" style={{ textAlign: "center" }}>
          Así empieza
        </span>
        <Board
          map={challenge.map}
          robot={{ cell: challenge.map.start, heading: challenge.map.startHeading }}
          mood="idle"
          stepMs={STEP_MS}
          topic={challenge.topic}
        />
        <Guide message={`¡Hola! Soy Wayra. Si te trabas, pídeme una pista: tienes 3.`} />
      </section>
    </div>
  );
}

function Play({ challenge, robot, onSolved }: { challenge: Challenge; robot: RobotSync; onSolved: (stats: Stats, submission: Submission) => void }) {
  const policy = policyFor(challenge.level);
  const [startedAt] = useState(() => Date.now());
  const [editor, dispatch] = useReducer(editorReducer, undefined, () => ({
    blocks: challenge.kind === "fix" ? challenge.given : [],
    openRepeat: null,
  }));
  const [runs, setRuns] = useState(0);
  const [hints, setHints] = useState(0);
  const [guide, setGuide] = useState<{ mood: Mood; message: string }>({ mood: "idle", message: INSTRUCTION[challenge.kind] });
  const [boardMood, setBoardMood] = useState<"idle" | "error" | "success">("idle");
  const [picked, setPicked] = useState<Cell | null>(null);
  const [solved, setSolved] = useState(false);
  const [cameraHost, setCameraHost] = useState<HTMLElement | null>(null);
  const ranProgram = useRef<Program>([]);
  // Al empezar (o repetir) el reto el foco va al título: el lector de pantalla anuncia en qué reto está.
  const focusTitle = useFocusOnMount<HTMLHeadingElement>();

  const say = (mood: Mood, message: string) => {
    setGuide({ mood, message });
    if (challenge.level === "inicial") speak(message);
  };

  const finish = (submission: Submission) => {
    setSolved(true);
    // Un momento para ver a Wayra en la estrella antes de pasar al resultado.
    window.setTimeout(() => onSolved({ runs: Math.max(runs, 1), hints, ms: Date.now() - startedAt }, submission), 1200);
  };

  const { state: runner, run, reset } = useRunner(challenge.map, () => {
    if (challenge.kind === "predict") {
      setBoardMood("success");
      finish({ pick: picked ?? challenge.map.start });
      return;
    }
    const { result } = checkProgram(challenge, ranProgram.current);
    if (result.ok) {
      setBoardMood("success");
      say("happy", result.message);
      finish({ program: ranProgram.current });
    } else {
      setBoardMood(result.reason === "OFF_PATH" ? "error" : "idle");
      say(MOOD_FOR[result.reason], result.message);
    }
  });

  function execute() {
    if (runner.running || solved || robot.busy || editor.blocks.length === 0) return;
    ranProgram.current = editor.blocks;
    setRuns((n) => n + 1);
    setBoardMood("idle");
    setGuide({ mood: "thinking", message: "Mira cómo se mueve Wayra…" });
    run(editor.blocks);
    // Si hay un robot conectado, hace el mismo recorrido.
    if (robot.state === "on") void robot.send(editor.blocks);
  }

  function checkPick() {
    if (challenge.kind !== "predict" || !picked) return;
    setRuns((n) => n + 1);
    const result = checkPrediction(challenge, picked);
    if (result.ok) {
      say("happy", `${result.message} Mira cómo llega.`);
      run(challenge.given);
    } else {
      say(MOOD_FOR[result.reason], runs >= 1 && hints === 0 ? `${result.message} Puedes pedirme una pista.` : result.message);
    }
  }

  function askHint() {
    if (hints >= challenge.hints.length) return;
    say("thinking", `Pista ${hints + 1}: ${challenge.hints[hints]}`);
    setHints((n) => n + 1);
  }

  const busy = runner.running || solved || robot.busy;
  const used = countBlocks(editor.blocks);
  const highlight = runner.activePath
    ? { path: runner.activePath, tone: "active" as const }
    : runner.errorPath
      ? { path: runner.errorPath, tone: "error" as const }
      : null;

  const topic = topicInfo(challenge.topic)!;
  const readOnlyProgram = { blocks: challenge.kind === "predict" ? challenge.given : [], openRepeat: null };
  const clearAndReset = () => {
    setBoardMood("idle");
    reset();
  };
  const robotButton = <RobotSend robot={robot} program={editor.blocks} disabled={busy} />;
  const executeButton = (
    <button className="btn btn-primary" type="button" disabled={busy || editor.blocks.length === 0} onClick={execute}>
      <Icon name="play" /> Ejecutar
    </button>
  );
  const hintsLeft = hints < challenge.hints.length;
  const withCamera = challenge.level === "inicial" && challenge.kind !== "predict";
  const efficientCount = challenge.kind === "efficient" && (
    <p className="small" data-over={used > challenge.maxBlocks || undefined}>
      Bloques: <strong>{used}</strong> de {challenge.maxBlocks} como máximo
    </p>
  );

  return (
    <div className={challenge.kind === "predict" ? "game has-action-bar" : "game"}>
      <div className="board-column">
        <div className="goal-row">
          <section className="goal-card card" aria-label="Reto">
            <span className="badge">
              {topic.emoji} {topic.name} · {LEVEL_INFO[challenge.level].name}
            </span>
            <div className="play-goal">
              <h1 tabIndex={-1} ref={focusTitle}>
                {/[.?!]$/.test(challenge.title) ? challenge.title : `${challenge.title}.`}
              </h1>{" "}
              <span role="status" aria-live="polite">
                {guide.message}
              </span>
            </div>
          </section>
          <aside className="wayra-card card" aria-label="Wayra, tu guía">
            <GuideAvatar mood={guide.mood} size={56} />
            <button
              className="btn btn-sm"
              type="button"
              onClick={askHint}
              disabled={busy || !hintsLeft}
              aria-label={`Pista ${hints}/${challenge.hints.length}: ${hintsLeft ? "pedir una pista" : "ya usaste todas las pistas"}`}
            >
              <Icon name="lightbulb" size={16} /> Pista {hints}/{challenge.hints.length}
            </button>
          </aside>
        </div>

        <aside className="board-panel card" aria-label="Tablero">
          <h2>{topic.place}</h2>
          <Board
            map={challenge.map}
            robot={runner.robot}
            mood={boardMood}
            stepMs={STEP_MS}
            topic={challenge.topic}
            {...(challenge.kind === "predict" && !busy ? { onPick: setPicked, picked } : { picked })}
          />
          <p className="small muted">
            Nivel {LEVEL_INFO[challenge.level].name} · {challenge.map.rows * challenge.map.cols} casillas
          </p>
        </aside>

        {withCamera && <div className="camera-slot" ref={setCameraHost} />}
      </div>

      <section className="workspace card" aria-label="Espacio de trabajo">
        {challenge.kind === "predict" ? (
          <>
            <BlockEditor policy={policy} state={readOnlyProgram} dispatch={() => undefined} disabled readOnly active={highlight} />
            <ActionBar>
              <button className="btn btn-primary" type="button" disabled={busy || !picked} onClick={checkPick}>
                <Icon name="check" /> {picked ? "Comprobar" : "Toca una casilla"}
              </button>
            </ActionBar>
          </>
        ) : withCamera ? (
          <>
            <InitialProgramEditor
              policy={policy}
              state={editor}
              dispatch={dispatch}
              disabled={busy}
              active={highlight}
              onExecute={execute}
              onClear={clearAndReset}
              headerActions={robotButton}
              actions={executeButton}
              cameraHost={cameraHost}
            />
            {efficientCount}
          </>
        ) : (
          <>
            <BlockEditor policy={policy} state={editor} dispatch={dispatch} disabled={busy} active={highlight} onClear={clearAndReset} headerActions={robotButton} actions={executeButton} />
            {efficientCount}
          </>
        )}
      </section>
    </div>
  );
}

function ChallengePage({ challenge }: { challenge: Challenge }) {
  // El resultado virtual puede llegar antes que DONE del robot físico.
  // Mantener el enlace aquí conserva la parada y los latidos entre fases.
  const robot = useRobotLink();
  const [phase, setPhase] = useState<"intro" | "play" | "done">("intro");
  const [stats, setStats] = useState<Stats | null>(null);
  const [round, setRound] = useState(0);
  const { record } = useExploreProgress();
  const recordPlay = useMutation(api.explore.recordPlay);
  const recordClassPlay = useMutation(api.student.recordChallengePlay);
  const [token] = useStudentToken();
  const topic = topicInfo(challenge.topic)!;

  // Cada fase nueva (ficha, juego, resultado) empieza arriba: la anterior pudo ser más larga.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase, round]);

  function solved(result: Stats, submission: Submission) {
    record(challenge.id, { solved: true, ...result });
    setStats(result);
    setPhase("done");
    // Solo estadística anónima: si no hay internet, el niño igual ve su resultado.
    recordPlay({ deviceId: deviceId(), challengeId: challenge.id, ...submission, ...result }).catch((error: unknown) =>
      console.warn("No se pudo registrar la partida", error),
    );
    // Con sesión de alumno, la partida también cuenta para su clase (el servidor la vuelve a revisar).
    if (token) {
      recordClassPlay({ token, challengeId: challenge.id, ...submission, ...result }).catch((error: unknown) =>
        console.warn("No se pudo registrar la partida en la clase", error),
      );
    }
  }

  return (
    <ExploreLayout title={challenge.title} backTo={listPath(challenge)}>
      <Breadcrumbs
        items={[
          { label: "Explorar", to: "/" },
          { label: topic.name, to: `/explorar/${topic.id}` },
          { label: LEVEL_INFO[challenge.level].name, to: listPath(challenge) },
          { label: challenge.title },
        ]}
      />
      {phase === "intro" && (
        <Intro
          challenge={challenge}
          onStart={() => {
            setPhase("play");
            if (challenge.level === "inicial") speak(challenge.story);
          }}
        />
      )}
      {phase === "play" && <Play key={round} challenge={challenge} robot={robot} onSolved={solved} />}
      {phase === "done" && stats && (
        <ChallengeDone
          challenge={challenge}
          stats={stats}
          onRepeat={() => {
            setRound((r) => r + 1);
            setPhase("play");
          }}
        />
      )}
      {phase === "done" && robot.transport === "bluetooth" && robot.state === "on" && (
        <div className="stack robot-result">
          {robot.busy && <p className="small" role="status">El robot físico sigue ejecutando el programa.</p>}
          <div className="row"><RobotSend robot={robot} program={[]} disabled /></div>
        </div>
      )}
    </ExploreLayout>
  );
}

/** /reto/:id: un reto de bloques (Inicial) o una misión (Primaria). Cambiar de reto monta una pantalla nueva (estado limpio). */
export function ChallengeRoute() {
  const { id = "" } = useParams();
  const mission = missionById(id);
  if (mission) return <MissionRoute key={mission.id} mission={mission} />;
  const challenge = challengeById(id);
  if (!challenge) return <Navigate to="/" replace />;
  return <ChallengePage key={challenge.id} challenge={challenge} />;
}
