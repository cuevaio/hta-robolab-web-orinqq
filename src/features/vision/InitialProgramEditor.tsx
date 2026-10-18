import { type ComponentProps, type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { playSound } from "../../shared/sound/sounds";
import { MAX_BLOCKS, type Command, countBlocks } from "@robolab/backend/domain/game/program";
import { type BlockEditor, ProgramHead, PieceTray, Sequence } from "../game/BlockEditor";
import type { GestureHints } from "../game/BlockEditor";
import { PieceFrame } from "../game/PieceFrame";
import { GESTURES } from "./gestureGate";
import { VisionControls } from "./VisionControls";

/** El gesto de cada pieza (solo las de movimiento; el pulgar es «Ejecutar»). */
const GESTURE_HINTS: GestureHints = Object.fromEntries(
  GESTURES.flatMap((g) => (g.action === "confirm" ? [] : [[g.action, { emoji: g.emoji, prompt: g.prompt }]])),
);
const THUMB = GESTURES.find((g) => g.action === "confirm")!;

type EditorProps = ComponentProps<typeof BlockEditor>;
type Mode = "gestures" | "buttons";

type Props = Omit<EditorProps, "actions" | "headerActions" | "readOnly"> & {
  onExecute: () => void;
  /** Lo que va junto a «Gestos / Botones» arriba a la derecha (el botón del robot). */
  headerActions?: ReactNode;
  /** Lo que va abajo a la derecha del cuadro del programa, junto a la papelera («Ejecutar»). */
  actions?: ReactNode;
  /** Dónde dibujar la cámara (la columna del tablero). Sin lugar, va debajo de las piezas. */
  cameraHost?: HTMLElement | null;
};

/**
 * Programar en Inicial. «Gestos» viene elegido: las piezas son las manos que las
 * piden y la cámara se enciende sola junto al tablero. «Botones» las cambia por
 * flechas y apaga la cámara. Las dos formas arman el mismo programa. Si la cámara
 * no se puede encender, vuelve a «Botones» y lo dice.
 */
export function InitialProgramEditor({ onExecute, headerActions, actions, cameraHost, ...editor }: Props) {
  const [mode, setMode] = useState<Mode>("gestures");
  const [seen, setSeen] = useState<Command | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const gestures = mode === "gestures";

  const choose = (next: Mode) => {
    setNotice(null);
    setSeen(null);
    setMode(next);
  };

  const camera = gestures && (
    <VisionControls
      disabled={editor.disabled}
      canConfirm={editor.state.blocks.length > 0}
      full={countBlocks(editor.state.blocks) >= MAX_BLOCKS}
      onCommand={(command) => {
        editor.dispatch({ type: "add", command });
        playSound("place");
      }}
      onConfirm={onExecute}
      onCandidate={setSeen}
      onUnavailable={(reason) => {
        setNotice(reason);
        setSeen(null);
        setMode("buttons");
      }}
    />
  );

  return (
    <section className="program-workspace" aria-label="Programar el robot">
      <ProgramHead>
        {headerActions}
        <div className="mode-toggle" role="group" aria-label="Cómo programar">
          <button type="button" className="btn btn-sm" aria-pressed={gestures} data-active={gestures || undefined} onClick={() => choose("gestures")}>
            <span aria-hidden="true">🖐️</span> Gestos
          </button>
          <button type="button" className="btn btn-sm" aria-pressed={!gestures} data-active={!gestures || undefined} onClick={() => choose("buttons")}>
            <span aria-hidden="true">🔘</span> Botones
          </button>
        </div>
      </ProgramHead>
      {notice && (
        <p className="small" role="alert">
          {notice}
        </p>
      )}
      <Sequence state={editor.state} dispatch={editor.dispatch} disabled={editor.disabled} active={editor.active} onClear={editor.onClear} actions={actions} />
      <PieceTray
        policy={editor.policy}
        state={editor.state}
        dispatch={editor.dispatch}
        disabled={editor.disabled}
        {...(gestures
          ? {
              gestures: GESTURE_HINTS,
              currentCommand: seen,
              trailing: (
                <PieceFrame label="Ejecutar" detail={THUMB.prompt}>
                  <span className="block-btn piece-hand piece-thumb" role="img" aria-label={`Ejecutar: ${THUMB.prompt.toLowerCase()}`}>
                    {THUMB.emoji}
                  </span>
                </PieceFrame>
              ),
            }
          : {})}
      />
      {camera && (cameraHost ? createPortal(camera, cameraHost) : camera)}
    </section>
  );
}
