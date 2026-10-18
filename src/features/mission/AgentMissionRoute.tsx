import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@robolab/backend/convex/_generated/api";
import type { Id } from "@robolab/backend/convex/_generated/dataModel";
import { agentIdOf } from "@robolab/backend/domain/classroom/agentItem";
import type { Mission } from "@robolab/backend/domain/mission/contracts";
import { ExploreLayout } from "../explore/ExploreLayout";
import { useStudentToken } from "../student/session";
import { MissionPlayer, type Played } from "./MissionPlayer";
import "./mission.css";

/**
 * /reto/ia:<id>: una misión que el docente armó con el asistente. La juega un alumno con
 * sesión (si su clase la tiene abierta) o el propio docente para probarla (no cuenta).
 */
export function AgentMissionRoute({ challengeId }: { challengeId: string }) {
  const [token] = useStudentToken();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const record = useMutation(api.student.recordChallengePlay);
  const teacher = !token && isAuthenticated;
  const raw = agentIdOf(challengeId);
  const asStudent = useQuery(api.student.agentMission, token ? { token, challengeId } : "skip");
  const asTeacher = useQuery(api.agent.get, teacher && raw ? { id: raw as Id<"agentMissions"> } : "skip");
  const mission = (token ? asStudent : asTeacher ? asTeacher.mission : asTeacher) as Mission | null | undefined;
  const loading = token ? asStudent === undefined : teacher ? asTeacher === undefined : isLoading;

  if (loading) {
    return (
      <ExploreLayout title="Misión" backTo="/">
        <p className="muted">Cargando…</p>
      </ExploreLayout>
    );
  }
  if (!mission) {
    return (
      <ExploreLayout title="Misión" backTo="/">
        <section className="stack">
          <h1>No encontramos esta misión</h1>
          <p>{token || teacher ? "Puede que tu docente la haya cerrado o que no sea de tu clase." : "Entra con el código de tu clase para jugarla."}</p>
          <div>
            <Link className="btn btn-primary" to="/">
              Volver al inicio
            </Link>
          </div>
        </section>
      </ExploreLayout>
    );
  }
  const save = token
    ? (played: Played) => record({ token, challengeId, program: played.program, runs: played.runs, hints: 0, ms: played.ms })
    : undefined;
  return (
    <ExploreLayout title={mission.title} backTo="/">
      {teacher && <p className="small muted">Vista del docente: esta partida no cuenta en los resultados.</p>}
      <MissionPlayer
        key={challengeId}
        mission={mission}
        {...(save ? { onSolved: save } : {})}
        after={
          <Link className="btn" to="/">
            Volver al inicio
          </Link>
        }
      />
    </ExploreLayout>
  );
}
