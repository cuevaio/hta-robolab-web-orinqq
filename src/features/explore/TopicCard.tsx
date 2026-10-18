import { Link } from "react-router-dom";
import type { Topic, TopicInfo } from "@robolab/backend/domain/explore/challenges";
import type { ProgressSummary } from "@robolab/backend/domain/explore/progress";
import { ProgressChip } from "./ProgressChip";
import "./steam-cards.css";

/** La letra de STEAM de cada tópico: S de Ciencia, T de Tecnología, E de Ingeniería, A de Artes, M de Matemáticas. */
const LETTER: Record<Topic, string> = { ciencia: "S", tecnologia: "T", ingenieria: "E", artes: "A", matematicas: "M" };

/** Los adornos de la escena de cada tópico (solo decoración): emojis y texto; su lugar lo da el CSS (`.d1`, `.d2`…). */
const DECO: Record<Topic, readonly string[]> = {
  ciencia: ["🧪", "⚛\uFE0E", "🔬", "✨", "✨", "🫧"],
  tecnologia: ["</>", "📶", "0101", "🖥️", "{ }", "10"],
  ingenieria: ["🔧", "⚙️", "⚙️", "🔩", "⛑️", "📐"],
  artes: ["", "", "", "", "", "🎨", "🖌️"],
  matematicas: ["+", "×", "÷", "=", "π", "√", "7", "9²", "12", "−"],
};

/**
 * La tarjeta de un tópico en la portada: la letra de STEAM grande y translúcida al centro, con
 * los elementos del tema alrededor, y abajo solo el nombre. La escena es decorativa; el lector de
 * pantalla oye el nombre, la bajada y el avance.
 */
export function TopicCard({ topic, progress }: { topic: TopicInfo; progress: ProgressSummary }) {
  const body = (
    <>
      <span className="steam-scene" aria-hidden="true">
        {topic.id === "matematicas" && <span className="steam-cloud" />}
        {DECO[topic.id].map((glyph, i) => (
          <span key={i} className={`steam-deco d${i + 1}`}>
            {glyph}
          </span>
        ))}
        <span className="steam-letter">{LETTER[topic.id]}</span>
      </span>
      <strong className="steam-name">{topic.name}</strong>
      <span className="steam-sr sr-only">
        <span>{topic.tagline}. </span>
        {topic.available ? <ProgressChip solved={progress.solved} total={progress.total} /> : <span>Próximamente</span>}
      </span>
    </>
  );
  return topic.available ? (
    <Link className="steam-card" data-topic={topic.id} to={`/explorar/${topic.id}`}>
      {body}
    </Link>
  ) : (
    <div className="steam-card" data-topic={topic.id} aria-disabled="true">
      {body}
    </div>
  );
}
