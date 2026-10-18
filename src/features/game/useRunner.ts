import { useCallback, useEffect, useRef, useState } from "react";
import type { GameMap } from "@robolab/backend/domain/game/map";
import { type BlockPath, type Program, compileWithSource } from "@robolab/backend/domain/game/program";
import { type Outcome, type RobotState, simulate } from "@robolab/backend/domain/game/simulator";

export const STEP_MS = 450;

export type RunnerState = {
  readonly robot: RobotState;
  readonly running: boolean;
  readonly activePath: BlockPath | null;
  readonly outcome: Outcome | null;
  readonly errorPath: BlockPath | null;
};

/**
 * Anima la simulación paso a paso. La simulación se calcula completa al
 * inicio (es determinista); la animación solo la reproduce.
 */
export function useRunner(map: GameMap, onFinish: (outcome: Outcome) => void, onStep?: (index: number, total: number) => void) {
  const initial: RobotState = { cell: map.start, heading: map.startHeading };
  const [state, setState] = useState<RunnerState>({
    robot: initial,
    running: false,
    activePath: null,
    outcome: null,
    errorPath: null,
  });
  const timers = useRef<number[]>([]);
  const finish = useRef(onFinish);
  const stepped = useRef(onStep);
  useEffect(() => {
    finish.current = onFinish;
    stepped.current = onStep;
  });

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  const reset = useCallback(() => {
    clearTimers();
    setState({ robot: { cell: map.start, heading: map.startHeading }, running: false, activePath: null, outcome: null, errorPath: null });
  }, [map]);

  const run = useCallback(
    (program: Program) => {
      clearTimers();
      const steps = compileWithSource(program);
      const simulation = simulate(map, steps.map((s) => s.command));
      setState({ robot: simulation.initial, running: true, activePath: null, outcome: null, errorPath: null });

      simulation.steps.forEach((step, i) => {
        timers.current.push(
          window.setTimeout(() => {
            setState((s) => ({ ...s, robot: step.state, activePath: steps[i]?.source ?? null }));
            stepped.current?.(i, simulation.steps.length);
          }, (i + 1) * STEP_MS),
        );
      });
      const outcome = simulation.outcome;
      const errorPath = outcome.kind === "OFF_PATH" ? steps[outcome.failedStep - 1]?.source ?? null : null;
      timers.current.push(
        window.setTimeout(
          () => {
            setState((s) => ({ ...s, running: false, activePath: null, outcome, errorPath }));
            finish.current(outcome);
          },
          (simulation.steps.length + 1) * STEP_MS,
        ),
      );
    },
    [map],
  );

  return { state, run, reset };
}
