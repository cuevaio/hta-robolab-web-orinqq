import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@robolab/backend/convex/_generated/api";
import { Icon } from "../../../../shared/ui/Icon";
import { usePageTitle } from "../../../../shared/usePageTitle";
import "../retos.css";

export const GAME_PATH = "/docente/retos/nuevo/juego";
export const ASSISTANT_PATH = "/docente/retos/nuevo/asistente";

/** G1: dos caminos para crear un reto. El asistente puede usar la nube o una Jetson local. */
export function NewRetoChoice() {
  usePageTitle("Nuevo reto");
  const status = useQuery(api.agent.status);
  // Mientras carga se ofrece: un docente no debe ver parpadear un aviso de «no activado».
  const available = status?.configured !== false;
  return (
    <section className="stack way" aria-labelledby="way-title">
      <h1 id="way-title" className="creator-title">
        ¿Cómo quieres crear el reto?
      </h1>
      <div className="way-grid">
        <article className="card way-card stack">
          <span className="way-emoji" aria-hidden="true">
            🎮
          </span>
          <h2>Elegir un juego ya hecho</h2>
          <p>Tópico, nivel y juego. Listo en tres pasos para Inicial y Primaria.</p>
          <div>
            <Link className="btn" to={GAME_PATH}>
              Empecemos <Icon name="chevronRight" size={16} />
            </Link>
          </div>
        </article>
        <article className="card way-card way-card-ai stack">
          <span className="way-emoji" aria-hidden="true">
            ✨
          </span>
          <span className="badge badge-ok way-badge">IA</span>
          <h2>Crear una misión con el asistente</h2>
          {(
            <>
              <p>Cuéntale qué quieres que aprendan y propone misiones de Primaria (2.º a 4.º). El servidor comprueba que se puedan resolver.</p>
              <div>
                <Link className="btn btn-primary" to={ASSISTANT_PATH}>
                  Crear con el asistente <Icon name="chevronRight" size={16} />
                </Link>
              </div>
            </>
          )}
          {!available && <p className="small" role="status">La nube aún no está activada. Puedes generar con una Jetson conectada por USB.</p>}
        </article>
      </div>
      <p className="way-note">
        <Icon name="info" size={18} /> <span>El asistente propone; tú decides. Nada se publica sin que lo revises.</span>
      </p>
    </section>
  );
}
