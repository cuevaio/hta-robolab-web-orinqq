import { useSyncExternalStore } from "react";
import { isMuted, playSound, setMuted, subscribeMuted } from "./sounds";

/** Botón de silencio: visible en el modo de juego, con ícono y palabra, y recuerda la elección. */
export function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  return (
    <button
      type="button"
      className="btn btn-sm sound-toggle"
      aria-pressed={!muted}
      onClick={() => {
        setMuted(!muted);
        // Al encender, un «plop» confirma que suena.
        if (muted) playSound("place");
      }}
    >
      <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span> <span className="sound-toggle-label">Sonido</span>
    </button>
  );
}
