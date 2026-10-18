import type { Heading } from "@robolab/backend/domain/game/map";
import { type Cell, type Mission, ROUGH_COST, cellKey, cellSet, sameCell, stationIndex, stationLetter } from "@robolab/backend/domain/lab/mission";
import "./lab.css";

type Props = {
  readonly mission: Mission;
  readonly robot: { readonly cell: Cell; readonly heading: Heading };
  /** Claves (`cellKey`) de las casillas por las que ya pasó el robot en esta ejecución. */
  readonly visited?: ReadonlySet<string>;
  readonly mood: "idle" | "error" | "success";
  readonly stepMs: number;
};

export type TileKind = "wall" | "rough" | "station" | "goal" | "start";

/** Dónde cae una casilla del tablero, en palabras: "arriba a la izquierda", "abajo a la derecha", "en el centro"… */
export function placeOf([row, col]: Cell): string {
  const vertical = row <= 1 ? "arriba" : row >= 4 ? "abajo" : "en el medio";
  const horizontal = col <= 1 ? "a la izquierda" : col >= 4 ? "a la derecha" : "al centro";
  return vertical === "en el medio" && horizontal === "al centro" ? "en el centro" : `${vertical} ${horizontal}`;
}

/** Qué es cada casilla; una estación sobre el inicio o la meta no se da (parseMission lo impide). */
export function tileKind(mission: Mission, cell: Cell, walls = cellSet(mission.walls), rough = cellSet(mission.rough)): TileKind | undefined {
  const key = cellKey(cell);
  if (walls.has(key)) return "wall";
  if (rough.has(key)) return "rough";
  if (stationIndex(mission, cell) >= 0) return "station";
  if (sameCell(cell, mission.goal)) return "goal";
  if (sameCell(cell, mission.start)) return "start";
  return undefined;
}

const ROBOT_IMAGE = { idle: "/robot/robot.svg", error: "/robot/robot-error.svg", success: "/robot/robot-exito.svg" };
// La imagen del robot mira hacia abajo; se gira para que coincida con su orientación.
const IMAGE_OFFSET_DEG = 180;

const PADDING_PX = 10; // igual que .lab-board en lab.css
const GAP_PX = 4;

/** Posición y tamaño de una celda dentro del tablero, con su relleno y separaciones. */
const along = (index: number, count: number) => {
  const fixed = 2 * PADDING_PX + (count - 1) * GAP_PX;
  const size = `((100% - ${fixed}px) / ${count})`;
  return { offset: `calc(${PADDING_PX}px + ${index} * (${size} + ${GAP_PX}px))`, size: `calc${size}` };
};

/** El tablero de una misión: paredes, terreno difícil, estaciones (A, B…), meta y el robot. */
export function LabBoard({ mission, robot, visited, mood, stepMs }: Props) {
  const walls = cellSet(mission.walls);
  const rough = cellSet(mission.rough);
  const x = along(robot.cell[1], mission.size);
  const y = along(robot.cell[0], mission.size);
  const rows = Array.from({ length: mission.size }, (_, row) => row);

  return (
    <div
      className="lab-board"
      role="img"
      aria-label={`Tablero de ${mission.size} por ${mission.size} con ${mission.walls.length} paredes y ${mission.stations.length} estaciones. El terreno amarillo cuesta ${ROUGH_COST}. Robi empieza ${placeOf(mission.start)} y debe terminar en la meta, ${placeOf(mission.goal)}.`}
      style={{ gridTemplateColumns: `repeat(${mission.size}, 1fr)`, ["--step-ms" as string]: `${stepMs}ms` }}
    >
      {rows.flatMap((row) =>
        rows.map((col) => {
          const cell: Cell = [row, col];
          const kind = tileKind(mission, cell, walls, rough);
          return (
            <div key={`${row}-${col}`} className="lab-tile" data-kind={kind} data-visited={visited?.has(cellKey(cell)) || undefined}>
              {kind === "rough" && (
                <span className="lab-mark" aria-hidden="true">
                  ≋
                </span>
              )}
              {kind === "station" && <span className="lab-mark">{stationLetter(stationIndex(mission, cell))}</span>}
              {kind === "goal" && <img className="lab-star" src="/estrella.svg" alt="" />}
            </div>
          );
        }),
      )}
      <div
        className="robot"
        style={{ left: x.offset, top: y.offset, width: x.size, height: y.size, transform: `rotate(${robot.heading + IMAGE_OFFSET_DEG}deg)` }}
      >
        <img src={ROBOT_IMAGE[mood]} alt="" />
      </div>
    </div>
  );
}

/** Leyenda del tablero, como en el prototipo. */
export function LabLegend() {
  return (
    <div className="lab-legend" aria-label="Leyenda">
      <span className="chip" style={{ ["--swatch" as string]: "var(--c-wall)" }}>
        Pared
      </span>
      <span className="chip" style={{ ["--swatch" as string]: "var(--c-brand-soft)", ["--swatch-ring" as string]: "inset 0 0 0 1px var(--c-brand)" }}>
        A / B Estaciones
      </span>
      <span className="chip" style={{ ["--swatch" as string]: "var(--c-ok-soft)", ["--swatch-ring" as string]: "inset 0 0 0 1px var(--c-ok)" }}>
        Meta
      </span>
      <span className="chip" style={{ ["--swatch" as string]: "var(--c-warn-soft)", ["--swatch-ring" as string]: "inset 0 0 0 1px var(--c-warn-edge)" }}>
        ≋ Terreno +{ROUGH_COST}
      </span>
    </div>
  );
}
