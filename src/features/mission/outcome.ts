import type { ExecutionOutcome } from "@robolab/backend/domain/mission/contracts";

/** Lo que Wayra le dice al niño según cómo terminó su programa. Sin culpas: dice qué pasó y en qué paso. */
export function outcomeMessage(outcome: ExecutionOutcome, failedStep?: number): string {
  const step = failedStep === undefined ? "" : ` en el paso ${failedStep}`;
  switch (outcome) {
    case "SUCCESS":
      return "¡Llegaste a la meta! Tu programa funcionó.";
    case "COLLISION":
      return `Kusi chocó con un obstáculo${step}. Prueba otro camino.`;
    case "OUT_OF_BOUNDS":
      return `Kusi se salió del tablero${step}. Cambia ese paso.`;
    case "ENERGY_EXCEEDED":
      return `Se acabó la energía${step}. Busca un camino que cueste menos.`;
    case "MISSING_CHECKPOINTS":
      return "Llegaste a la meta, pero faltan estaciones por visitar.";
    case "INCOMPLETE":
      return "Tu programa terminó antes de llegar a la meta. Agrega más pasos.";
  }
}
