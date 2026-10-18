import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@robolab/backend/convex/_generated/api";
import { THEMES, THEME_INFO, type Theme, generateMission } from "@robolab/backend/domain/lab/generate";
import { type Mission } from "@robolab/backend/domain/lab/mission";
import { validate } from "@robolab/backend/domain/lab/solve";
import { userMessage } from "../../shared/errors";
import { Icon } from "../../shared/ui/Icon";
import { useToast } from "../../shared/ui/Toast";
import { themeLabel } from "./LabListPage";
import { MissionThumb } from "./MissionThumb";
import { useDocumentTitle } from "./useDocumentTitle";
import "./lab.css";

const DEFAULT_PROMPT =
  "Quiero una actividad para 2.º, 3.º y 4.º de primaria donde practiquen secuencias, sumas y planificación de rutas, con presupuesto de energía y dos puntos obligatorios.";
const PROMPT_MAX = 400;
const STEPS = ["1. Describe", "2. Genera", "3. Valida", "4. Publica"];

/** /docente/laboratorio/nueva: describe el objetivo, genera tres niveles, valida y publica. */
export function LabCreatePage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [theme, setTheme] = useState<Theme>("escuela");
  const [seed, setSeed] = useState(0);
  const [mission, setMission] = useState<Mission | null>(null);
  const [selected, setSelected] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createMission = useMutation(api.lab.createMission);
  const publish = useMutation(api.lab.publish);
  const mine = useQuery(api.lab.listMine);
  const navigate = useNavigate();
  const toast = useToast();
  useDocumentTitle("Crear misión");

  const check = mission ? validate(mission) : null;
  const promptOk = prompt.trim().length > 0;
  const step = !mission ? 0 : check?.ok ? 2 : 1;

  function generate(nextSeed: number) {
    setSeed(nextSeed);
    setMission(generateMission(theme, nextSeed));
    setError(null);
  }

  async function publishAndPlay() {
    if (!mission || !check?.ok) return;
    setBusy(true);
    setError(null);
    try {
      const { missionId } = await createMission({ theme, prompt, seed });
      await publish({ missionId });
      toast("Misión publicada. Ahora la ves como la verían tus estudiantes.");
      navigate(`/laboratorio/${missionId}`);
    } catch (e) {
      setError(userMessage(e, "No pudimos publicar la misión. Intenta de nuevo."));
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Crear misión</h2>
          <p className="muted">Un objetivo docente, tres niveles de dificultad, un solo laboratorio compartido.</p>
        </div>
        <Link className="btn btn-ghost" to="/docente">
          Cancelar
        </Link>
      </div>

      <ol className="lab-steps" aria-label="Pasos">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} data-done={i < step || undefined}>
            {label}
          </li>
        ))}
      </ol>

      <div className="two-col" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
        <section className="card stack" aria-labelledby="describe-title">
          <span className="lab-eyebrow">Para el docente</span>
          <h3 id="describe-title" style={{ margin: 0 }}>
            ¿Qué quieres practicar hoy?
          </h3>
          <p className="small muted">Describe tu objetivo. El motor adapta la misma misión a tres grados o niveles de dificultad.</p>
          <div className="field">
            <label htmlFor="lab-prompt">Objetivo de clase</label>
            <textarea
              id="lab-prompt"
              className="input"
              rows={4}
              value={prompt}
              maxLength={PROMPT_MAX}
              onChange={(e) => setPrompt(e.target.value)}
              aria-invalid={!promptOk}
            />
            {!promptOk && (
              <span className="field-error">
                <Icon name="alert" size={16} /> Escribe el objetivo de la clase.
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="lab-theme">Contexto</label>
            <select
              id="lab-theme"
              className="select"
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value as Theme);
                setMission(null);
              }}
            >
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {THEME_INFO[t].label}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <button className="btn btn-primary" type="button" disabled={!promptOk} onClick={() => generate(seed + 1)}>
              ✦ Generar tres niveles
            </button>
            <span className="small muted">Plantillas locales</span>
          </div>
          <p className="alert alert-info small">
            El validador busca una ruta para cada nivel y rechaza cualquier misión sin solución. Funciona sin servicios externos.
          </p>
        </section>

        <section className="card stack" aria-labelledby="proposal-title">
          <div className="row spread">
            <h3 id="proposal-title" style={{ margin: 0 }}>
              Propuesta de misión
            </h3>
            <span className={mission ? "badge badge-ok" : "badge badge-muted"}>{mission ? "Generada" : "Pendiente"}</span>
          </div>
          {!mission ? (
            <p className="muted small">Presiona «Generar tres niveles» para crear y verificar una actividad.</p>
          ) : (
            <>
              <div className="lab-preview">
                <MissionThumb mission={mission} />
                <div className="stack-sm">
                  <strong>
                    <span aria-hidden="true">{mission.emoji} </span>
                    {mission.title}
                  </strong>
                  <span className="small muted">{themeLabel(theme)}</span>
                  <span className="small">{prompt.trim()}</span>
                </div>
              </div>
              <div className="lab-levels" role="group" aria-label="Niveles generados">
                {mission.levels.map((l, i) => (
                  <button key={l.name} type="button" className="lab-level" aria-pressed={i === selected} onClick={() => setSelected(i)}>
                    <span className="lab-level-num">Nivel {i + 1}</span>
                    <strong>{l.name}</strong>
                    <span className="small muted">{l.description}</span>
                    <span className="badge">{l.budget} energía</span>
                  </button>
                ))}
              </div>
              <div className="lab-validation" role="status">
                <div className="row spread">
                  <strong className="small">Validación automática</strong>
                  <span className={check?.ok ? "badge badge-ok" : "badge badge-warn"}>{check?.ok ? "✓ 3/3 rutas verificadas" : "No válida"}</span>
                </div>
                <p className="small muted">
                  {check?.ok
                    ? `El validador encontró una solución para cada nivel. Costos mínimos: ${check.solutions
                        .map((s, i) => `${mission.levels[i]!.name}: ${s.cost}`)
                        .join(" · ")}.`
                    : (check?.message ?? "Uno o más niveles no tiene ruta dentro del presupuesto.")}
                </p>
              </div>
            </>
          )}
          {error && (
            <p className="alert alert-error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button className="btn btn-primary" type="button" disabled={!check?.ok || busy} aria-busy={busy} onClick={() => void publishAndPlay()}>
              Publicar misión y probar como estudiante <Icon name="chevronRight" size={18} />
            </button>
            <button className="btn" type="button" disabled={!mission || busy} onClick={() => generate(seed + 1)}>
              Otra variante
            </button>
          </div>
        </section>
      </div>

      <section className="stack" aria-labelledby="mine-title">
        <h3 id="mine-title" style={{ margin: 0 }}>
          Tus misiones
        </h3>
        {mine === undefined ? (
          <p className="muted">Cargando…</p>
        ) : mine.length === 0 ? (
          <p className="muted small">Todavía no publicaste misiones.</p>
        ) : (
          <div className="grid-cards">
            {mine.map((m) => (
              <div key={m._id} className="card stack-sm">
                <div className="row spread">
                  <strong>{m.title}</strong>
                  <span className={m.visibility === "public" ? "badge badge-ok" : "badge badge-muted"}>{m.visibility === "public" ? "Publicada" : "Borrador"}</span>
                </div>
                <span className="small muted">
                  {themeLabel(m.theme)} · {m.plays} {m.plays === 1 ? "ejecución" : "ejecuciones"}
                </span>
                <div className="row">
                  <Link className="link-btn small" to={`/docente/laboratorio/${m._id}/resultados`}>
                    Resultados
                  </Link>
                  <Link className="link-btn small" to={`/laboratorio/${m._id}`}>
                    Jugar
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
