import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { KIND_LABEL, challengesFor, topicInfo } from "@robolab/backend/domain/explore/challenges";
import { ACTIVE_LEVELS, type EducationLevel } from "@robolab/backend/domain/game/levels";
import { missionsFor } from "@robolab/backend/domain/lab/mission";
import { Icon } from "../../shared/ui/Icon";
import { MissionThumb } from "../lab/MissionThumb";
import { warmUpRecognizer } from "../vision/recognizer";
import { countLabel, openCountFor } from "./catalog";
import { Breadcrumbs, ExploreLayout, LEVEL_INFO } from "./ExploreLayout";
import { useExploreProgress } from "./storage";

const isLevel = (value: string): value is EducationLevel => (ACTIVE_LEVELS as readonly string[]).includes(value);

/** Los retos de un tópico y nivel: en Primaria son misiones (tablero con energía); en los demás, retos de bloques. */
export function ChallengeListPage() {
  const { topic: topicId = "", level = "" } = useParams();
  // Los retos de Inicial usan la cámara: el modelo de gestos (~12 MB) se baja mientras el niño elige.
  useEffect(() => {
    if (level === "inicial") warmUpRecognizer();
  }, [level]);
  const topic = topicInfo(topicId);
  const { progress } = useExploreProgress();
  if (!topic || !topic.available || !isLevel(level)) return <Navigate to="/" replace />;
  const challenges = challengesFor(topic.id, level);
  const isMissions = level === "primaria";
  const missions = isMissions ? missionsFor(topic.id) : [];

  return (
    <ExploreLayout title={topic.name} backTo={`/explorar/${topic.id}`}>
      <Breadcrumbs
        items={[{ label: "Explorar", to: "/" }, { label: topic.name, to: `/explorar/${topic.id}` }, { label: LEVEL_INFO[level].name }]}
      />
      <div className="page-head">
        <h1 style={{ margin: 0 }}>
          {isMissions ? "Misiones" : "Retos"} de {topic.name} · {LEVEL_INFO[level].name}
        </h1>
        <div className="segmented" role="group" aria-label="Nivel">
          {ACTIVE_LEVELS.map((l) =>
            openCountFor(topic.id, l) > 0 ? (
              <Link key={l} to={`/explorar/${topic.id}/${l}`} aria-current={l === level ? "page" : undefined} className="segmented-link">
                {LEVEL_INFO[l].name}
              </Link>
            ) : null,
          )}
        </div>
      </div>
      <p className="small muted">{countLabel(level, openCountFor(topic.id, level))}</p>
      {isMissions ? (
        missions.length === 0 ? (
          <div className="empty">
            <Icon name="clipboard" size={32} />
            <p>Estas misiones están en preparación. ¡Vuelve pronto!</p>
          </div>
        ) : (
          <div className="challenge-grid">
            {missions.map((m) => {
              const done = progress.records[m.id]?.solved;
              return (
                <Link key={m.id} className="challenge-card mission-card" to={`/reto/${m.id}`} data-done={done || undefined}>
                  <span className="challenge-art">
                    <MissionThumb mission={m} />
                  </span>
                  <span className="challenge-info">
                    <strong>
                      <span aria-hidden="true">{m.emoji} </span>
                      {m.title}
                    </strong>
                    <span className="small muted">3 niveles · {m.stations.length} estaciones</span>
                    {done && (
                      <span className="badge badge-ok">
                        <Icon name="check" size={14} /> Hecho
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )
      ) : challenges.length === 0 ? (
        <div className="empty">
          <Icon name="clipboard" size={32} />
          <p>Estos retos están en preparación. ¡Vuelve pronto!</p>
        </div>
      ) : (
        <div className="challenge-grid">
          {challenges.map((c) => {
            const done = progress.records[c.id]?.solved;
            return (
              <Link key={c.id} className="challenge-card" to={`/reto/${c.id}`} data-done={done || undefined}>
                <span className="challenge-art" aria-hidden="true">
                  {c.emoji}
                </span>
                <span className="challenge-info">
                  <strong>{c.title}</strong>
                  <span className="small muted">
                    Nivel {c.difficulty} · {KIND_LABEL[c.kind]}
                  </span>
                  {done && (
                    <span className="badge badge-ok">
                      <Icon name="check" size={14} /> Hecho
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </ExploreLayout>
  );
}
