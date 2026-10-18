import { useAction, useMutation, useQuery } from "convex/react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@robolab/backend/convex/_generated/api";
import type { Id } from "@robolab/backend/convex/_generated/dataModel";
import { agentChallengeId } from "@robolab/backend/domain/classroom/agentItem";
import { userMessage } from "../../../../shared/errors";
import { Icon } from "../../../../shared/ui/Icon";
import { usePageTitle } from "../../../../shared/usePageTitle";
import { MissionPlayer } from "../../../mission/MissionPlayer";
import { CreatorStepper } from "../CreatorStepper";
import { GAME_PATH } from "./NewRetoChoice";
import { MissionPreview } from "./MissionPreview";
import "../retos.css";

type Grade = 2 | 3 | 4;
type Difficulty = "guided" | "balanced" | "challenge";
type Generated = Extract<Awaited<ReturnType<ReturnType<typeof useAction<typeof api.agent.generate>>>>, { status: "ok" }>;
type Proposal = Generated["proposals"][number];
type FailureCode = Generated["failed"][number]["code"];

const GRADES: readonly Grade[] = [2, 3, 4];
const DIFFICULTIES: readonly { id: Difficulty; label: string }[] = [
  { id: "guided", label: "Guiada" },
  { id: "balanced", label: "Equilibrada" },
  { id: "challenge", label: "Desafío" },
];
const STEPS = ["Describe", "Revisa", "Publica"] as const;
export const OBJECTIVE_MAX = 800;
const OBJECTIVE_MIN = 10;

/** Lo que ve el docente cuando algo no sale a la primera (G4): el texto sale del código, nunca del proveedor. */
const FAILURE: Record<"busy" | "slow" | "incomplete" | "down", { emoji: string; title: string; text: string }> = {
  busy: { emoji: "🚦", title: "Hay muchas solicitudes", text: "Espera un minuto y vuelve a intentar. No se perdió lo que escribiste." },
  slow: { emoji: "⏳", title: "No pudimos generar a tiempo", text: "El asistente tardó demasiado. No se perdió lo que escribiste: puedes intentarlo otra vez." },
  incomplete: {
    emoji: "⚠️",
    title: "La respuesta llegó incompleta",
    text: "Probamos de nuevo y no pudimos arreglarla. Cambia un poco el aprendizaje e inténtalo otra vez.",
  },
  down: { emoji: "🔌", title: "El asistente no está disponible", text: "Avisa a quien administra RoboLab. Mientras, puedes elegir un juego ya hecho." },
};

function failureKind(code: FailureCode): keyof typeof FAILURE {
  if (code === "PROVIDER_RATE_LIMIT") return "busy";
  if (code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE") return "slow";
  if (code === "PROVIDER_AUTH" || code === "PROVIDER_NOT_CONFIGURED") return "down";
  return "incomplete";
}

const gradeName = (g: number) => `${g}.º`;
const list = (grades: readonly number[]) => grades.map(gradeName).join(", ").replace(/, ([^,]*)$/, " y $1");

/** G2 → G3 → guardar: el asistente propone misiones, el servidor las verifica y el docente elige cuáles guardar. */
export function AssistantPage() {
  usePageTitle("Asistente de misiones");
  const navigate = useNavigate();
  const status = useQuery(api.agent.status);
  const generate = useAction(api.agent.generate);
  const save = useMutation(api.agent.save);
  const createReto = useMutation(api.assignments.create);
  const classes = useQuery(api.classrooms.listMine);

  const [objective, setObjective] = useState("");
  const [grades, setGrades] = useState<readonly Grade[]>([2, 3]);
  const [difficulty, setDifficulty] = useState<Difficulty>("balanced");
  const [phase, setPhase] = useState<"describe" | "loading" | "review" | "saved">("describe");
  const [proposals, setProposals] = useState<readonly Proposal[]>([]);
  const [chosen, setChosen] = useState<ReadonlySet<Grade>>(new Set());
  const [missing, setMissing] = useState<readonly Grade[]>([]);
  const [failure, setFailure] = useState<keyof typeof FAILURE | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<readonly Grade[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<readonly Id<"agentMissions">[]>([]);
  const [trying, setTrying] = useState<Proposal | null>(null);
  const [classId, setClassId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string | null>(null);

  const text = objective.trim();
  const valid = text.length >= OBJECTIVE_MIN && objective.length <= OBJECTIVE_MAX && grades.length >= 1 && grades.length <= 3;

  const toggleGrade = (g: Grade) => setGrades((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g].sort() as Grade[]));

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setPhase("loading");
    setError(null);
    setFailure(null);
    try {
      const result = await generate({ objective: text, grades: [...grades], difficulty });
      if (result.status === "not_configured") {
        setFailure("down");
        setPhase("describe");
        return;
      }
      if (result.proposals.length === 0) {
        setFailure(failureKind(result.failed[0]?.code ?? "SCHEMA_INVALID"));
        setPhase("describe");
        return;
      }
      setProposals(result.proposals);
      setChosen(new Set(result.proposals.map((p) => p.grade)));
      setMissing(result.failed.map((f) => f.grade));
      setPhase("review");
    } catch (e) {
      setError(userMessage(e, "No pudimos pedirle misiones al asistente. Intenta de nuevo."));
      setPhase("describe");
    }
  }

  async function another(grade: Grade) {
    setAsking((cur) => [...cur, grade]);
    setError(null);
    try {
      const result = await generate({ objective: text, grades: [grade], difficulty });
      const fresh = result.status === "ok" ? result.proposals[0] : undefined;
      if (fresh) setProposals((cur) => cur.map((p) => (p.grade === grade ? fresh : p)));
      else setError(`No pudimos armar otra misión verificada para ${gradeName(grade)} grado. Conservamos la anterior.`);
    } catch (e) {
      setError(userMessage(e, "No pudimos pedir otra propuesta. Intenta de nuevo."));
    } finally {
      setAsking((cur) => cur.filter((g) => g !== grade));
    }
  }

  async function saveChosen() {
    setSaving(true);
    setError(null);
    const ids: Id<"agentMissions">[] = [];
    try {
      for (const p of proposals.filter((x) => chosen.has(x.grade))) ids.push(await save({ mission: p.mission }));
      setSavedIds(ids);
      setPhase("saved");
    } catch (e) {
      setError(`${userMessage(e)}${ids.length > 0 ? ` Ya se guardaron ${ids.length}.` : ""}`);
    } finally {
      setSaving(false);
    }
  }

  async function assignSaved(event: FormEvent) {
    event.preventDefault();
    if (!classId || assigning) return;
    setAssigning(true);
    setError(null);
    let done = 0;
    try {
      for (const id of savedIds) {
        await createReto({ challengeId: agentChallengeId(id), visibility: "class", classroomId: classId as Id<"classrooms"> });
        done++;
      }
      setAssignedTo(classes?.find((c) => c._id === classId)?.label ?? "tu clase");
    } catch (e) {
      setError(`${userMessage(e)}${done > 0 ? ` Ya se asignaron ${done}.` : ""}`);
    } finally {
      setAssigning(false);
    }
  }

  const stepIndex = phase === "review" ? 1 : phase === "saved" ? 2 : 0;

  if (status?.configured === false) {
    return (
      <section className="stack" aria-labelledby="assistant-title">
        <h1 id="assistant-title" className="creator-title">
          El asistente aún no está activado
        </h1>
        <p>Pide a quien administra RoboLab que lo active. Mientras, puedes elegir un juego ya hecho.</p>
        <div>
          <Link className="btn" to={GAME_PATH}>
            Elegir un juego <Icon name="chevronRight" size={16} />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="stack creator" aria-labelledby="assistant-title" role="group">
      <CreatorStepper current={stepIndex as 0 | 1 | 2} labels={STEPS} />

      {trying ? (
        <section className="stack" aria-label="Probar la misión">
          <p className="small muted">Estás probando la misión. Esta partida no cuenta en ningún resultado.</p>
          <MissionPlayer mission={trying.mission} />
          <div>
            <button type="button" className="btn" onClick={() => setTrying(null)}>
              <Icon name="arrowLeft" size={16} /> Volver a las propuestas
            </button>
          </div>
        </section>
      ) : phase === "saved" ? (
        <section className="stack" aria-live="polite">
          <h1 id="assistant-title" className="creator-title">
            {savedIds.length === 1 ? "Guardamos tu misión" : `Guardamos tus ${savedIds.length} misiones`}
          </h1>
          {assignedTo ? (
            <>
              <p>
                Tus alumnos de <strong>{assignedTo}</strong> ya pueden jugar{savedIds.length === 1 ? " la misión" : " las misiones"}. Verás sus resultados en Retos y en Progreso.
              </p>
              <div className="row">
                <Link className="btn btn-primary" to="/docente/retos">
                  Ir a Retos
                </Link>
              </div>
            </>
          ) : (
            <form className="card stack assistant-form" onSubmit={assignSaved} aria-label="Asignar a una clase">
              <p>Elige una clase para que tus alumnos las jueguen, o déjalas como borradores tuyos.</p>
              {classes === undefined ? (
                <p className="muted small">Cargando tus clases…</p>
              ) : classes.length === 0 ? (
                <p className="hint">
                  Todavía no tienes clases. <Link to="/docente/clases/nueva">Crea una</Link> y vuelve a asignar desde Retos.
                </p>
              ) : (
                <div className="field">
                  <label htmlFor="assign-class">Clase</label>
                  <select id="assign-class" className="select" value={classId} onChange={(e) => setClassId(e.target.value)} required>
                    <option value="">Elige una clase</option>
                    {classes.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {error && (
                <p className="alert alert-error" role="alert">
                  {error}
                </p>
              )}
              <div className="row">
                <button type="submit" className="btn btn-primary" disabled={!classId || assigning} aria-busy={assigning}>
                  {assigning ? "Asignando…" : "Asignar a la clase"}
                </button>
                <Link className="link-btn" to="/docente/retos">
                  Dejar como borradores
                </Link>
              </div>
            </form>
          )}
        </section>
      ) : phase === "review" ? (
        <section className="stack" aria-labelledby="assistant-title">
          <div className="stack-sm">
            <h1 id="assistant-title" className="creator-title">
              Revisa las propuestas
            </h1>
            <p className="small muted">
              El servidor ya comprobó que cada misión se puede resolver. Elige cuáles guardar.
              {missing.length > 0 && ` Solo pudimos verificar misiones para ${list(proposals.map((p) => p.grade))}: puedes volver y probar de nuevo para ${list(missing)}.`}
            </p>
          </div>
          <ul className="proposal-grid" aria-label="Propuestas">
            {proposals.map((p) => {
              const on = chosen.has(p.grade);
              const busy = asking.includes(p.grade);
              return (
                <li key={p.grade} className="card proposal-card stack-sm" aria-label={`${gradeName(p.grade)} grado: ${p.mission.title}`}>
                  <div className="row spread">
                    <h2 className="proposal-grade">{gradeName(p.grade)} grado</h2>
                    <span className="badge badge-ok">
                      <Icon name="check" size={14} /> Resuelta por el servidor
                    </span>
                  </div>
                  <p className="proposal-title">{p.mission.title}</p>
                  <MissionPreview mission={p.mission} />
                  <p className="small proposal-energy">
                    <span aria-hidden="true">🔋</span> Energía mínima {p.metrics.minimumEnergy ?? "—"} de {p.mission.energyBudget}{p.alternativeCost !== null && ` · otra ruta cuesta ${p.alternativeCost}`}
                  </p>
                  <div className="row">
                    <button
                      type="button"
                      className={on ? "btn btn-primary" : "btn"}
                      aria-pressed={on}
                      onClick={() =>
                        setChosen((cur) => {
                          const next = new Set(cur);
                          if (on) next.delete(p.grade);
                          else next.add(p.grade);
                          return next;
                        })
                      }
                    >
                      {on && <Icon name="check" size={16} />} Usar
                    </button>
                    <button type="button" className="btn" onClick={() => setTrying(p)}>
                      <Icon name="play" size={16} /> Probar
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} aria-busy={busy} aria-label={`Pedir otra propuesta para ${gradeName(p.grade)} grado`} onClick={() => void another(p.grade)}>
                      <Icon name="rotate" size={16} /> {busy ? "Pensando…" : "Otra"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {error && (
            <p className="alert alert-error" role="alert">
              {error}
            </p>
          )}
          <div className="row creator-actions">
            <button type="button" className="link-btn" onClick={() => setPhase("describe")}>
              <Icon name="arrowLeft" size={16} /> Atrás
            </button>
            <span className="small" aria-live="polite">
              {chosen.size === 1 ? "1 misión elegida" : `${chosen.size} misiones elegidas`}
            </span>
            <button type="button" className="btn btn-primary" disabled={chosen.size === 0 || saving} aria-busy={saving} onClick={() => void saveChosen()}>
              {saving ? "Guardando…" : "Guardar y asignar a una clase"}
            </button>
          </div>
        </section>
      ) : (
        <form className="stack" onSubmit={ask} aria-labelledby="assistant-title" noValidate>
          <div className="stack-sm">
            <h1 id="assistant-title" className="creator-title">
              Cuéntale al asistente qué quieres que aprendan
            </h1>
            <p className="small muted">Propone una misión por grado. Tú la revisas antes de usarla.</p>
          </div>
          <div className="card assistant-form stack">
            <div className="field">
              <label htmlFor="objective">Aprendizaje</label>
              <textarea
                id="objective"
                className="input"
                rows={3}
                maxLength={OBJECTIVE_MAX}
                value={objective}
                disabled={phase === "loading"}
                onChange={(e) => setObjective(e.target.value)}
                aria-describedby="objective-count"
              />
              <span id="objective-count" className="small muted assistant-count">
                {objective.length} de {OBJECTIVE_MAX} letras
              </span>
            </div>
            <div className="assistant-options">
              <fieldset className="field chip-group">
                <legend>Grados (de 1 a 3)</legend>
                <div className="row">
                  {GRADES.map((g) => (
                    <button key={g} type="button" className="chip-btn" aria-pressed={grades.includes(g)} disabled={phase === "loading"} onClick={() => toggleGrade(g)}>
                      {grades.includes(g) && <Icon name="check" size={14} />} {gradeName(g)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="field chip-group">
                <legend>Dificultad</legend>
                <div className="row">
                  {DIFFICULTIES.map((d) => (
                    <button key={d.id} type="button" className="chip-btn" aria-pressed={difficulty === d.id} disabled={phase === "loading"} onClick={() => setDifficulty(d.id)}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>

          {phase === "loading" && (
            <div className="card stack-sm" role="status">
              <h2 className="proposal-grade">
                <span aria-hidden="true">⏳</span> Pensando la misión de {list(grades)}…
              </h2>
              <p className="small">Tarda unos segundos; puedes esperar aquí.</p>
              <progress aria-label="Pensando" />
            </div>
          )}
          {failure && (
            <div className="card stack-sm" role="alert">
              <h2 className="proposal-grade">
                <span aria-hidden="true">{FAILURE[failure].emoji}</span> {FAILURE[failure].title}
              </h2>
              <p className="small">{FAILURE[failure].text}</p>
              {failure === "down" && (
                <div>
                  <Link className="btn btn-sm" to={GAME_PATH}>
                    Elegir un juego <Icon name="chevronRight" size={16} />
                  </Link>
                </div>
              )}
            </div>
          )}
          {error && (
            <p className="alert alert-error" role="alert">
              {error}
            </p>
          )}

          <div className="row creator-actions">
            <button type="button" className="link-btn" onClick={() => navigate("/docente/retos/nuevo")}>
              Cancelar
            </button>
            <span className="small muted">Tarda unos segundos. Hasta 3 intentos por grado.</span>
            <button type="submit" className="btn btn-primary" disabled={!valid || phase === "loading"} aria-busy={phase === "loading"}>
              {phase === "loading" ? "Pensando…" : failure && failure !== "down" ? "Reintentar" : "Proponer misiones"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
