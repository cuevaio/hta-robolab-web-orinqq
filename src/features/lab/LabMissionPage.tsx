import { useQuery } from "convex/react";
import { Link, useParams } from "react-router-dom";
import { api } from "@robolab/backend/convex/_generated/api";
import { Icon } from "../../shared/ui/Icon";
import { Breadcrumbs, ExploreLayout } from "../explore/ExploreLayout";
import { LabPlayer } from "./LabPlayer";
import { themeLabel } from "./LabListPage";
import { useDocumentTitle } from "./useDocumentTitle";

/** /laboratorio/:id: una misión publicada por un docente, para jugarla como estudiante. */
export function LabMissionPage() {
  const { id = "" } = useParams();
  const data = useQuery(api.lab.get, { id });
  useDocumentTitle(data?.title ?? "Laboratorio de misiones");

  return (
    <ExploreLayout>
      <Breadcrumbs items={[{ label: "Explorar", to: "/" }, { label: "Laboratorio de misiones", to: "/laboratorio" }, { label: data?.title ?? "Misión" }]} />
      {data === undefined ? (
        <p className="muted">Cargando…</p>
      ) : data === null ? (
        <div className="empty">
          <Icon name="alert" size={32} />
          <p role="alert">No encontramos esa misión. Puede que todavía no esté publicada.</p>
          <Link className="btn" to="/laboratorio">
            Ver las misiones publicadas
          </Link>
        </div>
      ) : (
        <>
          {data.mine && (
            <div className="alert alert-info row spread">
              <span>Esta misión es tuya ({themeLabel(data.theme)}).</span>
              <Link className="link-btn" to={`/docente/laboratorio/${data._id}/resultados`}>
                Ver resultados <Icon name="chevronRight" size={18} />
              </Link>
            </div>
          )}
          <LabPlayer key={data._id} mission={data.mission} missionId={data._id} back={{ to: "/laboratorio", label: "Volver al laboratorio" }} />
        </>
      )}
    </ExploreLayout>
  );
}
