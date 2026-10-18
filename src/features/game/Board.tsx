import type { Topic } from "@robolab/backend/domain/explore/challenges";
import { type Cell, type GameMap, cellKey } from "@robolab/backend/domain/game/map";
import type { RobotState } from "@robolab/backend/domain/game/simulator";
import "./board.css";
import "./topics.css";

type Props = {
  readonly map: GameMap;
  readonly robot: RobotState;
  readonly mood: "idle" | "error" | "success";
  readonly stepMs: number;
  /** Retos de predecir: las casillas del camino se pueden tocar. */
  readonly onPick?: (cell: Cell) => void;
  readonly picked?: Cell | null;
  /** Casilla correcta, cuando ya se reveló. */
  readonly answer?: Cell | null;
  /** Ambienta el tablero (colores y marcas); sin tópico se ve como el jardín de siempre. */
  readonly topic?: Topic;
};

const ROBOT_IMAGE = { idle: "/robot/robot.svg", error: "/robot/robot-error.svg", success: "/robot/robot-exito.svg" };
// La imagen del robot mira hacia abajo; se gira para que coincida con su orientación.
const IMAGE_OFFSET_DEG = 180;

const PADDING_PX = 10; // igual que .board en styles.css
const GAP_PX = 4;

/** Posición y tamaño de una celda dentro del tablero, con su relleno y separaciones. */
const along = (index: number, count: number) => {
  const fixed = 2 * PADDING_PX + (count - 1) * GAP_PX;
  const size = `((100% - ${fixed}px) / ${count})`;
  return { offset: `calc(${PADDING_PX}px + ${index} * (${size} + ${GAP_PX}px))`, size: `calc${size}` };
};

const KIND: Record<string, string> = { "#": "grass", W: "water" };

/** Qué dibuja cada ambiente en la casilla de agua (el obstáculo del tópico) y junto a la meta. */
const TOPIC_MARKS: Record<Topic, { readonly water: string; readonly goal: string }> = {
  tecnologia: { water: "💧", goal: "🌻" },
  ciencia: { water: "💧", goal: "🧪" },
  ingenieria: { water: "🛢️", goal: "⚙️" },
  artes: { water: "🎨", goal: "🖼️" },
  matematicas: { water: "💧", goal: "🔢" },
};

export function Board({ map, robot, mood, stepMs, onPick, picked, answer, topic }: Props) {
  const x = along(robot.cell.col, map.cols);
  const y = along(robot.cell.row, map.rows);
  const isPicked = (cell: Cell) => picked != null && cellKey(picked) === cellKey(cell);
  const isAnswer = (cell: Cell) => answer != null && cellKey(answer) === cellKey(cell);

  return (
    <div
      className="board"
      data-topic={topic}
      // Las casillas no pasan de ~140 px: un mapa chico no ocupa media pantalla.
      style={{ gridTemplateColumns: `repeat(${map.cols}, 1fr)`, maxWidth: `min(100%, 72vh, ${map.cols * 140}px)`, ["--step-ms" as string]: `${stepMs}ms` }}
      role={onPick ? "group" : "img"}
      aria-label={
        onPick
          ? "Tablero: toca la casilla donde crees que termina Robi."
          : `Mapa de ${map.rows} por ${map.cols}. ${map.goal ? "Robi debe llegar a la estrella." : ""}${map.stops.length ? ` Pasa por ${map.stops.length} banderas.` : ""}`
      }
    >
      {map.layout.flatMap((line, row) =>
        [...line].map((ch, col) => {
          const cell = { row, col };
          const walkable = map.walkable.has(cellKey(cell));
          const content = (
            <>
              {ch === "G" && <img className="star" src="/estrella.svg" alt="" />}
              {ch === "G" && topic && (
                <span className="goal-mark" aria-hidden="true">
                  {TOPIC_MARKS[topic].goal}
                </span>
              )}
              {ch === "P" && (
                <span className="tile-mark" aria-hidden="true">
                  🚩
                </span>
              )}
              {ch === "W" && (
                <span className="tile-mark" aria-hidden="true">
                  {topic ? TOPIC_MARKS[topic].water : "💧"}
                </span>
              )}
            </>
          );
          const common = {
            className: "tile",
            "data-walkable": walkable,
            "data-kind": KIND[ch],
            "data-goal": ch === "G" || undefined,
            "data-picked": isPicked(cell) || undefined,
            "data-answer": isAnswer(cell) || undefined,
          };
          return onPick && walkable ? (
            <button
              key={`${row}-${col}`}
              type="button"
              {...common}
              onClick={() => onPick(cell)}
              aria-label={`Fila ${row + 1}, columna ${col + 1}`}
              aria-pressed={isPicked(cell)}
            >
              {content}
            </button>
          ) : (
            <div key={`${row}-${col}`} {...common}>
              {content}
            </div>
          );
        }),
      )}
      <div
        className="robot"
        style={{
          left: x.offset,
          top: y.offset,
          width: x.size,
          height: y.size,
          transform: `rotate(${robot.heading + IMAGE_OFFSET_DEG}deg)`,
        }}
      >
        <img src={ROBOT_IMAGE[mood]} alt="" />
      </div>
    </div>
  );
}
