import { type ReactNode, useId, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { Topic } from "@robolab/backend/domain/explore/challenges";
import type { EducationLevel } from "@robolab/backend/domain/game/levels";
import { APP_NAME } from "../../shared/brand";
import { SoundToggle } from "../../shared/sound/SoundToggle";
import { Icon } from "../../shared/ui/Icon";
import { MOBILE_QUERY, useMediaQuery } from "../../shared/useMediaQuery";
import { usePageTitle } from "../../shared/usePageTitle";
import "./mobile.css";

/** Color de cada tópico (la línea bajo la tarjeta y su barra de avance): viene de los tokens de `styles.css`. */
export const TOPIC_COLOR: Record<Topic, string> = {
  ciencia: "var(--topic-ciencia)",
  tecnologia: "var(--topic-tecnologia)",
  ingenieria: "var(--topic-ingenieria)",
  artes: "var(--topic-artes)",
  matematicas: "var(--topic-matematicas)",
};

export const LEVEL_INFO: Record<EducationLevel, { name: string; ages: string; description: string; dots: number }> = {
  inicial: { name: "Inicial", ages: "3-5 años", description: "Primeros pasos con movimiento, formas y colores.", dots: 1 },
  primaria: { name: "Primaria", ages: "6-11 años", description: "Retos con más pasos y razonamiento.", dots: 2 },
  secundaria: { name: "Secundaria", ages: "12-16 años", description: "Variables, optimización y modelos.", dots: 3 },
};

type Props = {
  readonly children: ReactNode;
  /** Nombre de la página: va en la pestaña y, en el celular, en la cabecera ("← Tecnología"). */
  readonly title?: string;
  /** Adónde lleva la flecha de volver en el celular (páginas interiores). */
  readonly backTo?: string;
};

/**
 * Cabecera del modo abierto: se juega sin cuenta. En pantalla ancha, las
 * secciones van en línea; en el celular, "RoboLab ≡" abre un menú y las
 * páginas interiores muestran "← Título".
 */
export function ExploreLayout({ children, title, backTo }: Props) {
  usePageTitle(title);
  const mobile = useMediaQuery(MOBILE_QUERY);
  const { pathname } = useLocation();
  // El menú recuerda en qué página se abrió: al navegar, se cierra solo.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const menuId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);

  const close = () => setOpenAt(null);
  const sections = (
    <nav id={menuId} className="explore-nav" aria-label="Secciones" hidden={mobile && !open} onClick={close}>
      <NavLink to="/" end>
        Explorar retos
      </NavLink>
      <NavLink to="/mi-avance">Mi avance</NavLink>
      <NavLink to="/alumno">Unirme a una clase</NavLink>
      {mobile && <Link to="/docente">Soy docente</Link>}
    </nav>
  );

  return (
    <div className="explore">
      <header
        className="explore-header"
        data-open={open || undefined}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || !open) return;
          close();
          menuButton.current?.focus();
        }}
      >
        <div className="explore-header-inner">
          {mobile && backTo ? (
            <>
              <Link className="explore-back" to={backTo} aria-label="Volver">
                <Icon name="arrowLeft" size={22} />
              </Link>
              <span className="explore-title">{title}</span>
            </>
          ) : (
            <Link className="brand" to="/">
              {APP_NAME}
            </Link>
          )}
          {!mobile && sections}
          <SoundToggle />
          {!mobile && (
            <Link className="btn btn-sm" to="/docente">
              Soy docente
            </Link>
          )}
          {mobile && (
            <button
              ref={menuButton}
              className="icon-btn explore-menu-btn"
              type="button"
              aria-label="Menú"
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpenAt(open ? null : pathname)}
            >
              <Icon name={open ? "x" : "menu"} size={24} />
            </button>
          )}
        </div>
        {mobile && sections}
      </header>
      <main className="explore-main">{children}</main>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: readonly { label: string; to?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Estás en">
      {items.map((item, i) => (
        <span key={item.label}>
          {i > 0 && <span aria-hidden="true"> › </span>}
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}
