import type { ExecutionState, Mission } from "@robolab/backend/domain/mission/contracts";
import "./mission.css";

const key = (row: number, col: number) => `${row},${col}`;
const HEADING_WORD: Record<number, string> = { 0: "arriba", 90: "a la derecha", 180: "abajo", 270: "a la izquierda" };

type Props = { readonly mission: Mission; readonly state: ExecutionState };

/**
 * El tablero de una misión del asistente: obstáculos 💧, terreno difícil (con lo que cuesta pisarlo),
 * estaciones 📦 (✓ al visitarlas), la meta ⭐ y el robot, que se mueve a su casilla.
 */
export function MissionBoard({ mission, state }: Props) {
  const { rows, cols, cells } = mission.grid;
  const byPosition = new Map(cells.map((c) => [key(c.position.row, c.position.col), c]));
  const stations = new Map(mission.checkpoints.map((c) => [key(c.position.row, c.position.col), c.id]));
  const goal = key(mission.goal.row, mission.goal.col);
  const grid = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const k = key(row, col);
      const cell = byPosition.get(k);
      const station = stations.get(k);
      const visited = station !== undefined && state.visitedCheckpoints.includes(station);
      const kind = cell?.obstacle ? "wall" : k === goal ? "goal" : station !== undefined ? "station" : cell?.terrain === "rough" ? "rough" : undefined;
      grid.push(
        <span key={k} className="mb-cell" data-kind={kind} data-visited={visited || undefined}>
          {cell?.obstacle ? <span aria-hidden="true">💧</span> : null}
          {kind === "goal" && <span aria-hidden="true">⭐</span>}
          {station !== undefined && <span aria-hidden="true">{visited ? "✅" : "📦"}</span>}
          {kind === "rough" && <span className="mb-cost" aria-hidden="true">{cell?.cost}</span>}
        </span>,
      );
    }
  }
  const stationsLeft = mission.checkpoints.length - state.visitedCheckpoints.length;
  return (
    <div
      className="mb"
      style={{ ["--cols" as string]: cols, ["--rows" as string]: rows, ["--r" as string]: state.position.row, ["--c" as string]: state.position.col, ["--heading" as string]: `${state.heading}deg` }}
      role="img"
      aria-label={`Tablero de ${rows} por ${cols}. Robi está en la fila ${state.position.row + 1}, columna ${state.position.col + 1}, mirando ${HEADING_WORD[state.heading] ?? "adelante"}.${stationsLeft > 0 ? ` Faltan ${stationsLeft} ${stationsLeft === 1 ? "estación" : "estaciones"}.` : ""}`}
    >
      <div className="mb-grid">{grid}</div>
      <span className="mb-robot" aria-hidden="true">
        <span className="mb-robot-face">🤖</span>
        <span className="mb-robot-heading">▲</span>
      </span>
    </div>
  );
}
