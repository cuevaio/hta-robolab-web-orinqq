import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@robolab/backend/convex/_generated/api";
import { topicInfo } from "@robolab/backend/domain/explore/challenges";
import { Icon } from "../../../shared/ui/Icon";
import { usePageTitle } from "../../../shared/usePageTitle";
import { LEVEL_INFO } from "../../explore/ExploreLayout";
import { emojiFor } from "../../explore/catalog";
import { useCopyCode } from "../classes/CodeChip";
import { useEnsureJoinCodes } from "../classes/useEnsureJoinCodes";
import "./home.css";

const SHOWN_CHALLENGES = 6;

/** Inicio del docente (T2): tres cifras, los retos disponibles y sus clases con su código. */
export function HomePage() {
  usePageTitle("Inicio");
  const home = useQuery(api.teacherHome.home);
  const copy = useCopyCode();
  const available = useQuery(api.assignments.available);
  useEnsureJoinCodes(home?.classes.some((c) => c.joinCode === null) ?? false);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row spread" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <h1 className="home-greeting" style={{ margin: 0 }}>
          {home?.firstName ? `Hola, ${home.firstName}` : "Hola"}
        </h1>
      </div>

      <div className="stat-grid" role="group" aria-label="Resumen">
        <Stat value={home?.activeClasses} label={home?.activeClasses === 1 ? "clase activa" : "clases activas"} />
        <Stat value={home?.students} label={home?.students === 1 ? "estudiante" : "estudiantes"} />
        <Stat value={home?.availableChallenges} label="retos disponibles" />
      </div>

      <div className="home-grid">
        <section className="card stack" aria-labelledby="available-title">
          <div className="row spread">
            <h3 id="available-title" style={{ margin: 0 }}>
              Retos disponibles
            </h3>
            <Link className="link-btn small" to="/docente/retos/nuevo">
              <Icon name="plus" size={16} /> Crear reto
            </Link>
          </div>
          {available === undefined ? (
            <p className="muted">Cargando…</p>
          ) : available.length === 0 ? (
            <div className="empty">
              <Icon name="clipboard" size={32} />
              <p>Todavía no hay retos listos.</p>
            </div>
          ) : (
            <ul className="home-list">
              {available.slice(0, SHOWN_CHALLENGES).map((c) => (
                <li key={c.challengeId} className="home-item">
                  <span className="home-item-art" aria-hidden="true">
                    {emojiFor(c.challengeId)}
                  </span>
                  <span className="home-item-text">
                    <Link to={`/reto/${c.challengeId}`}>{c.title}</Link>
                    <span className="small muted">
                      {topicInfo(c.topic)?.name ?? c.topic} · {LEVEL_INFO[c.level].name}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {available !== undefined && available.length > SHOWN_CHALLENGES && (
            <Link className="link-btn small" to="/docente/retos/nuevo">
              Ver los {available.length} retos <Icon name="chevronRight" size={16} />
            </Link>
          )}
        </section>

        <section className="card stack" aria-labelledby="classes-title">
          <div className="row spread">
            <h3 id="classes-title" style={{ margin: 0 }}>
              Mis clases
            </h3>
            <Link className="link-btn small" to="/docente/clases/nueva">
              <Icon name="plus" size={16} /> Nueva clase
            </Link>
          </div>
          {home === undefined ? (
            <p className="muted">Cargando…</p>
          ) : home.classes.length === 0 ? (
            <div className="empty">
              <Icon name="users" size={32} />
              <p>Todavía no tienes clases. Crea la primera: tus alumnos entran con su código.</p>
              <Link className="btn btn-primary" to="/docente/clases/nueva">
                <Icon name="plus" /> Crear clase
              </Link>
            </div>
          ) : (
            <ul className="home-list">
              {home.classes.map((c) => (
                <li key={c._id} className="home-item home-class">
                  <span className="home-item-text">
                    <Link to={`/docente/clases/${c._id}`}>{c.label}</Link>
                    <span className="small muted">
                      {c.studentCount} {c.studentCount === 1 ? "estudiante" : "estudiantes"} · {LEVEL_INFO[c.level].name}
                    </span>
                  </span>
                  {c.joinCode === null ? (
                    <span className="badge badge-muted">Generando código…</span>
                  ) : (
                    <span className="home-code">
                      <span className="badge code-badge">Código {c.joinCode}</span>
                      <button type="button" className="btn btn-sm" aria-label={`Copiar el código ${c.joinCode}`} onClick={() => void copy(c.joinCode!)}>
                        <Icon name="copy" size={16} /> Copiar
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="stack" aria-labelledby="active-title">
        <div className="row spread">
          <h3 id="active-title" style={{ margin: 0 }}>
            Retos activos
          </h3>
          <span className="row">
            <Link className="link-btn small" to="/docente/retos">
              Ver todos
            </Link>
            <Link className="link-btn small" to="/docente/retos/nuevo">
              <Icon name="plus" size={16} /> Nuevo reto
            </Link>
          </span>
        </div>
        {home?.activeRetos === undefined ? (
          <p className="muted">Cargando…</p>
        ) : home.activeRetos.length === 0 ? (
          <div className="empty">
            <Icon name="clipboard" size={32} />
            <p>Todavía no tienes retos activos.</p>
          </div>
        ) : (
          <div className="grid-cards">
            {home.activeRetos.map((r) => (
              <Link key={r.assignmentId} className="card card-link" to={`/docente/retos/${r.assignmentId}`}>
                <strong>{r.title}</strong>
                <span className="muted small">{r.classroomLabel}</span>
                <div className="meter" role="img" aria-label={`${r.solvedPercent} % de la clase lo logró`}>
                  <span style={{ ["--value" as string]: r.solvedPercent / 100 }} />
                </div>
                <span className="small">
                  <strong>
                    {r.studentsSolved} de {r.studentCount}
                  </strong>{" "}
                  lo lograron
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div className="card stat-card">
      <strong>{value ?? "…"}</strong>
      <span className="small muted">{label}</span>
    </div>
  );
}
