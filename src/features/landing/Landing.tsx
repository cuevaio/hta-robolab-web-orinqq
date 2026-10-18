import { Link } from "react-router-dom";
import { TOPICS } from "@robolab/backend/domain/explore/challenges";
import { topicProgress } from "@robolab/backend/domain/explore/progress";
import { Icon } from "../../shared/ui/Icon";
import { ExploreLayout } from "../explore/ExploreLayout";
import { TopicCard } from "../explore/TopicCard";
import { useExploreProgress } from "../explore/storage";

/** Portada: retos sin registrarse, y la entrada de alumnos con código y de docentes. */
export function Landing() {
  const { progress } = useExploreProgress();
  return (
    <ExploreLayout>
      <section className="stack" aria-labelledby="hero-title">
        <div>
          <h1 id="hero-title" className="hero-title">
            Resuelve retos STEAM
          </h1>
          <p className="muted">Ciencia, tecnología, ingeniería, artes y matemáticas. Sin registrarte: elige un tópico y empieza.</p>
        </div>
        <div className="steam-grid">
          {TOPICS.map((t) => (
            <TopicCard key={t.id} topic={t} progress={topicProgress(progress, t.id)} />
          ))}
        </div>
      </section>

      <section className="role-grid" aria-label="Entrar con una clase">
        <Link className="role-card" to="/alumno">
          <img src="/roles/alumno.svg" alt="" />
          <span className="stack-sm">
            <strong>¿Tu docente te dio un código?</strong>
            <span className="small muted">Entra a tu clase con su código y un apodo. No necesitas cuenta.</span>
            <span className="btn btn-primary btn-sm">
              Unirme a una clase <Icon name="chevronRight" size={18} />
            </span>
          </span>
        </Link>
        <Link className="role-card" to="/docente">
          <img src="/roles/docente.svg" alt="" />
          <span className="stack-sm">
            <strong>¿Eres docente?</strong>
            <span className="small muted">Crea retos para tu clase y sigue cómo aprende cada alumno.</span>
            <span className="btn btn-sm">
              Iniciar sesión <Icon name="chevronRight" size={18} />
            </span>
          </span>
        </Link>
      </section>

      <p className="small muted" style={{ textAlign: "center" }}>
        <Link to="/impacto">Ver el impacto en vivo: retos resueltos, personas que juegan y cómo les va</Link>
      </p>
    </ExploreLayout>
  );
}
