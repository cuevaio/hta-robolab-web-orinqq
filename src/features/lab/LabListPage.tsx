import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@robolab/backend/convex/_generated/api";
import { type Theme, THEME_INFO, isTheme } from "@robolab/backend/domain/lab/generate";
import { Icon } from "../../shared/ui/Icon";
import { ExploreLayout } from "../explore/ExploreLayout";
import { MissionThumb } from "./MissionThumb";
import { useDocumentTitle } from "./useDocumentTitle";
import "./lab.css";

export const themeLabel = (theme: string): string => (isTheme(theme) ? THEME_INFO[theme as Theme].label : theme);

/** /laboratorio: vitrina de las misiones publicadas por docentes y la entrada al creador. */
export function LabListPage() {
  const missions = useQuery(api.lab.listPublic);
  useDocumentTitle("Laboratorio de misiones");

  return (
    <ExploreLayout>
      <div className="lab-hero">
        <div>
          <h1 style={{ margin: 0 }}>Laboratorio de misiones</h1>
          <p className="muted">
            Misiones creadas por docentes: un tablero de 6 × 6, tres niveles (2.º, 3.º y 4.º) y un solo robot para toda el aula.
          </p>
        </div>
        <Link className="btn btn-primary" to="/docente/laboratorio/nueva">
          <Icon name="plus" /> Crear misión
        </Link>
      </div>

      {missions === undefined ? (
        <p className="muted">Cargando…</p>
      ) : missions.length === 0 ? (
        <div className="empty">
          <Icon name="clipboard" size={32} />
          <p>Todavía no hay misiones publicadas. Si eres docente, crea la primera.</p>
          <Link className="btn btn-primary" to="/docente/laboratorio/nueva">
            <Icon name="plus" /> Crear misión
          </Link>
        </div>
      ) : (
        <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {missions.map((m) => (
            <Link key={m._id} className="card card-link lab-mission-card" to={`/laboratorio/${m._id}`}>
              <MissionThumb mission={m.mission} />
              <span className="stack-sm">
                <strong>
                  <span aria-hidden="true">{m.emoji} </span>
                  {m.title}
                </strong>
                <span className="small muted">{themeLabel(m.theme)}</span>
                <span className="small">{m.prompt}</span>
                <span className="row">
                  {m.levels.map((l) => (
                    <span key={l.name} className="badge">
                      {l.name} · {l.budget} 🔋
                    </span>
                  ))}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <p className="small muted">
        Las misiones del modo abierto están en cada tópico, nivel Primaria: por ejemplo,{" "}
        <Link to="/explorar/tecnologia/primaria">Tecnología · Primaria</Link>.
      </p>
    </ExploreLayout>
  );
}
