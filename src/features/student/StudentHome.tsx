import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@robolab/backend/convex/_generated/api";
import { Icon } from "../../shared/ui/Icon";
import { usePageTitle } from "../../shared/usePageTitle";
import { ExploreLayout, LEVEL_INFO } from "../explore/ExploreLayout";
import { emojiFor, kindLabel } from "../explore/catalog";
import { warmUpRecognizer } from "../vision/recognizer";
import { speak } from "./speech";
import "./join.css";

type Props = { token: string; onSignOut: () => void };

/** Portada del alumno: su clase y los retos que le asignó su docente. */
export function StudentHome({ token, onSignOut }: Props) {
  usePageTitle("Mi clase");
  const home = useQuery(api.student.home, { token });
  const signOut = useMutation(api.student.signOut);
  const navigate = useNavigate();

  const challenges = home?.classChallenges ?? [];
  const name = home?.displayName;
  useEffect(() => {
    if (name) speak(`¡Hola, ${name}!`);
  }, [name]);
  // Si tiene retos de Inicial, el modelo de gestos se baja desde ya, antes de abrir el reto.
  const hasInicial = challenges.some((c) => c.level === "inicial");
  useEffect(() => {
    if (hasInicial) warmUpRecognizer();
  }, [hasInicial]);

  // Al salir vuelve a la portada, donde se elige un tópico o "Unirme a una clase".
  async function leave() {
    await signOut({ token }).catch(() => undefined);
    onSignOut();
    navigate("/");
  }

  return (
    <ExploreLayout>
      {home === undefined ? (
        <p className="muted">Cargando…</p>
      ) : (
        <div className="kid stack" style={{ maxWidth: 720, width: "100%", margin: "0 auto" }}>
          <div className="row spread" style={{ alignItems: "flex-start" }}>
            <div className="stack-sm">
              <h1 style={{ margin: 0 }}>¡Hola, {home.displayName}!</h1>
              <span className="class-tag">
                <Icon name="users" size={16} /> {home.joinCode ? `Clase ${home.joinCode} · ` : ""}
                {home.classroomLabel}
              </span>
            </div>
            <button className="btn btn-ghost" type="button" onClick={() => void leave()}>
              <Icon name="logOut" /> Salir
            </button>
          </div>

          <Link className="btn btn-primary" to="/alumno/en-vivo"><Icon name="play" /> Jugar en vivo</Link>

          <section className="card stack" aria-labelledby="class-challenges-title">
            <h2 id="class-challenges-title" style={{ margin: 0 }}>
              Retos de tu clase
            </h2>
            {challenges.length === 0 ? (
              <div className="empty">
                <Icon name="clipboard" size={32} />
                <p>Tu docente todavía no asignó retos. Mientras tanto puedes explorar.</p>
                <Link className="btn" to="/">
                  Explorar retos
                </Link>
              </div>
            ) : (
              <ul className="class-challenges">
                {challenges.map((c) => {
                  return (
                    <li key={c.assignmentId}>
                      <Link className="class-challenge" to={`/reto/${c.challengeId}`} data-solved={c.solved || undefined}>
                        <span className="class-challenge-art" aria-hidden="true">
                          {emojiFor(c.challengeId)}
                        </span>
                        <span className="class-challenge-info">
                          <strong>{c.title}</strong>
                          <span className="small muted">
                            {LEVEL_INFO[c.level].name} · {kindLabel(c.kind)}
                          </span>
                        </span>
                        {c.solved ? (
                          <span className="badge badge-ok">
                            <Icon name="check" size={14} /> Logrado
                          </span>
                        ) : (
                          <Icon name="chevronRight" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </ExploreLayout>
  );
}
