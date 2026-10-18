import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@robolab/backend/convex/_generated/api";
import type { Id } from "@robolab/backend/convex/_generated/dataModel";
import { LIVE_MAZES, type LiveMode } from "@robolab/backend/domain/live/maze";
import { useFocusOnMount } from "../../shared/useFocusOnMount";
import { usePageTitle } from "../../shared/usePageTitle";
import { Icon } from "../../shared/ui/Icon";
import { LiveRoomContent } from "./LiveRoomContent";
import { RoomList } from "./RoomList";
import { useLiveAction } from "./useLiveAction";
import "./live.css";

export function TeacherLivePage() {
  usePageTitle("Partidas en vivo");
  const focus = useFocusOnMount<HTMLHeadingElement>();
  const rooms = useQuery(api.liveRooms.listMine);
  const classrooms = useQuery(api.classrooms.listMine);
  const create = useMutation(api.liveRooms.create);
  const navigate = useNavigate();
  const { busy, error, perform } = useLiveAction();
  const [classroomId, setClassroomId] = useState("");
  const [mazeId, setMazeId] = useState(LIVE_MAZES[0]!.id);
  const [mode, setMode] = useState<LiveMode>("race");

  function submit(event: FormEvent) {
    event.preventDefault();
    void perform(async () => {
      const roomId = await create({ classroomId: classroomId as Id<"classrooms">, mazeId, mode });
      navigate(`/docente/en-vivo/${roomId}`);
    });
  }

  return (
    <div className="stack">
      <div className="page-head"><h1 ref={focus} tabIndex={-1}>Partidas en vivo</h1><span className="badge">Con tu clase</span></div>
      <p>Un mismo laberinto: compitan por llegar primero o resuélvanlo en equipo.</p>
      {classrooms === undefined || rooms === undefined ? <p className="muted">Cargando partidas…</p> : <>
        {classrooms.length === 0 ? <div className="card stack"><p>Primero crea una clase para invitar a tus alumnos.</p><Link className="btn btn-primary" to="/docente/clases/nueva">Crear una clase</Link></div> : (
          <form className="card stack" onSubmit={submit}>
            <h2>Nueva partida</h2>
            <div className="live-form-grid">
              <div className="field">
                <label htmlFor="live-classroom">Clase</label>
                <select id="live-classroom" className="select" value={classroomId} required disabled={busy} onChange={(e) => setClassroomId(e.target.value)}>
                  <option value="">Elige una clase</option>{classrooms.map((c) => <option key={c._id} value={c._id}>{c.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="live-maze">Laberinto</label>
                <select id="live-maze" className="select" value={mazeId} disabled={busy} onChange={(e) => setMazeId(e.target.value)}>
                  {LIVE_MAZES.map((maze) => <option key={maze.id} value={maze.id}>{maze.title}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="live-mode">Cómo jugar</label>
                <select id="live-mode" className="select" value={mode} disabled={busy} onChange={(e) => setMode(e.target.value as LiveMode)}>
                  <option value="race">Carrera · cada uno en su tablero</option><option value="cooperative">En equipo · tablero compartido</option>
                </select>
              </div>
            </div>
            <p className="small muted">{mode === "race" ? "Todos empiezan juntos. El servidor confirma quién llega primero." : "Los alumnos agregan movimientos a un programa compartido y lo prueban entre todos."}</p>
            {error && <p role="alert" className="alert alert-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={busy || !classroomId} aria-busy={busy}><Icon name="plus" /> Crear sala de espera</button>
          </form>
        )}
        <section className="stack-sm" aria-labelledby="live-history"><h2 id="live-history">Tus partidas recientes</h2><RoomList rooms={rooms} teacher /></section>
      </>}
    </div>
  );
}

export function TeacherLiveRoom() {
  const { roomId = "" } = useParams();
  const room = useQuery(api.liveRooms.teacherView, { roomId: roomId as Id<"liveRooms"> });
  if (room === undefined) return <p className="muted">Cargando partida…</p>;
  return <LiveRoomContent room={room} />;
}
