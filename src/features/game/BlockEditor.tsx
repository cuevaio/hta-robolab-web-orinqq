import { type Dispatch, type ReactNode, useId } from "react";
import type { EditorAction, EditorState } from "@robolab/backend/domain/game/editor";
import { COMMANDS, type BlockPath, type Command, MAX_REPEAT, MIN_REPEAT } from "@robolab/backend/domain/game/program";
import type { LevelPolicy } from "@robolab/backend/domain/game/levels";
import { Icon } from "../../shared/ui/Icon";
import { IconButton } from "../../shared/ui/IconButton";
import { speak } from "../student/speech";
import { BLOCK_LOOK, MIN_SLOTS, REPEAT_LOOK } from "./blocks";
import { PieceFrame } from "./PieceFrame";
import "./palette.css";

type EditorProps = {
  readonly policy: LevelPolicy;
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
  readonly disabled: boolean;
};

type Props = EditorProps & {
  /** Bloque que se ejecuta ahora o el que falló, para resaltarlo. */
  readonly active?: { path: BlockPath; tone: "active" | "error" } | null;
  /** Solo muestra el programa (retos de predecir): sin paleta y sin quitar bloques. */
  readonly readOnly?: boolean;
  /** Qué hacer al tocar la papelera además de vaciar la secuencia (por ejemplo, devolver al robot al inicio). */
  readonly onClear?: () => void;
  /** Lo que va abajo a la derecha del cuadro del programa, junto a la papelera («Ejecutar»). */
  readonly actions?: ReactNode;
};

/** El gesto con el que se agrega cada pieza: en su lugar se ve solo la mano; el nombre del gesto sale al pasar el mouse o enfocarla. */
export type GestureHints = Partial<Record<Command, { readonly emoji: string; readonly prompt: string }>>;

const samePath = (a: BlockPath, b: BlockPath) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * La bandeja de piezas ("Piezas"): cada una se muestra solo con su ícono. En
 * Inicial con gestos, `gestures` cambia el ícono de cada pieza por la mano que
 * la agrega y `currentCommand` resalta la pieza del gesto que la cámara está
 * viendo. `trailing` va al final, tras un separador (por ejemplo, el pulgar).
 */
export function PieceTray({
  policy,
  state,
  dispatch,
  disabled,
  gestures,
  currentCommand = null,
  trailing,
}: EditorProps & { readonly gestures?: GestureHints; readonly currentCommand?: Command | null; readonly trailing?: ReactNode }) {
  const commands = COMMANDS.filter((c) => policy.palette.has(c));
  const label = `${useId()}-piezas`;
  return (
    <div className="stack-sm piece-tray">
      <span className="editor-label" id={label}>
        Piezas
      </span>
      <div className="palette" role="group" aria-labelledby={label}>
        {commands.map((command) => {
          const gesture = gestures?.[command];
          return (
            <PieceFrame key={command} label={BLOCK_LOOK[command].label} {...(gesture ? { detail: gesture.prompt } : {})}>
              <button
                type="button"
                className="block-btn"
                data-piece={command}
                data-current={currentCommand === command || undefined}
                disabled={disabled}
                aria-label={BLOCK_LOOK[command].label}
                onClick={() => {
                  dispatch({ type: "add", command });
                  // En Gestos los comandos van en silencio; con Botones se dicen para quien aún no lee.
                  if (!gestures) speak(BLOCK_LOOK[command].label);
                }}
              >
                {gesture ? (
                  <span className="piece-hand" aria-hidden="true">
                    {gesture.emoji}
                  </span>
                ) : (
                  <img src={BLOCK_LOOK[command].icon} alt="" />
                )}
              </button>
            </PieceFrame>
          );
        })}
        {policy.palette.has("repeat") && (
          <PieceFrame label={REPEAT_LOOK.label}>
            <button
              type="button"
              className="block-btn"
              data-piece="repeat"
              disabled={disabled || state.openRepeat !== null}
              aria-label={REPEAT_LOOK.label}
              onClick={() => dispatch({ type: "addRepeat" })}
            >
              <img src={REPEAT_LOOK.icon} alt="" />
            </button>
          </PieceFrame>
        )}
        {trailing && (
          <>
            <span className="palette-sep" aria-hidden="true" />
            {trailing}
          </>
        )}
      </div>
    </div>
  );
}

/** Encabezado del espacio de trabajo: «Tu programa» y, a la derecha, lo que la pantalla ponga (Robot, Gestos / Botones). */
export function ProgramHead({ children }: { readonly children?: ReactNode }) {
  return (
    <div className="program-head">
      <h2 className="program-title">Tu programa</h2>
      {children && <div className="program-head-actions">{children}</div>}
    </div>
  );
}

/**
 * La secuencia que arma el alumno. Es una lista real (`<ul>/<li>`) con un botón
 * dentro de cada paso: el lector de pantalla cuenta los pasos y sabe que cada
 * uno se puede quitar.
 */
export function Sequence({
  state,
  dispatch,
  disabled: busy,
  active,
  readOnly = false,
  onClear,
  actions,
}: Pick<EditorProps, "state" | "dispatch" | "disabled"> & Pick<Props, "active" | "readOnly" | "onClear" | "actions">) {
  const disabled = busy || readOnly;
  const toneOf = (path: BlockPath) => (active && samePath(active.path, path) ? active.tone : undefined);
  // Número de paso visible de cada bloque raíz (los bucles no cuentan como paso).
  const stepNumbers = state.blocks.reduce<number[]>((acc, block) => {
    const last = acc.length === 0 ? 0 : acc[acc.length - 1]!;
    acc.push(block.kind === "move" ? last + 1 : last);
    return acc;
  }, []);
  const emptySlots = readOnly ? 0 : Math.max(1, MIN_SLOTS - state.blocks.length);
  const sequenceLabel = `${useId()}-secuencia`;

  const clear = () => {
    dispatch({ type: "clear" });
    onClear?.();
  };

  return (
    <div className="stack-sm sequence" data-editable={readOnly ? undefined : true}>
      {/* El título visible de lo que se arma es «Tu programa» (ProgramHead); aquí solo nombra la lista. */}
      <span className={readOnly ? "editor-label" : "sr-only"} id={sequenceLabel}>
        {readOnly ? "Programa de Robi" : "Tu secuencia"}
      </span>
      <ul className="program" aria-labelledby={sequenceLabel} data-readonly={readOnly || undefined}>
        {state.blocks.map((block, i) => {
          if (block.kind === "move") {
            const stepNumber = stepNumbers[i];
            return (
              <PieceFrame key={i} as="li" label={BLOCK_LOOK[block.command].label}>
                <button
                  type="button"
                  className="program-block"
                  data-piece={block.command}
                  data-state={toneOf([i])}
                  disabled={disabled}
                  aria-label={`Paso ${stepNumber}: ${BLOCK_LOOK[block.command].label}.${readOnly ? "" : " Toca para quitar."}`}
                  onClick={() => dispatch({ type: "remove", path: [i] })}
                >
                  <span className="step-n" aria-hidden="true">
                    {stepNumber}
                  </span>
                  <img src={BLOCK_LOOK[block.command].icon} alt="" />
                </button>
              </PieceFrame>
            );
          }
          const open = state.openRepeat === i;
          return (
            <li key={i} className="repeat-block" data-piece="repeat">
              <PieceFrame label={REPEAT_LOOK.label}>
                <img className="repeat-icon" src={REPEAT_LOOK.icon} alt="" />
                <span className="sr-only">Repetir</span>
              </PieceFrame>
              <select
                className="select repeat-times"
                value={block.times}
                disabled={disabled}
                aria-label="Veces"
                onChange={(e) => dispatch({ type: "setTimes", index: i, times: Number(e.target.value) })}
              >
                {Array.from({ length: MAX_REPEAT - MIN_REPEAT + 1 }, (_, k) => k + MIN_REPEAT).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <ul className="repeat-body" aria-label="Dentro de repetir">
                {block.body.map((child, j) =>
                  child.kind === "move" ? (
                    <PieceFrame key={j} as="li" label={BLOCK_LOOK[child.command].label}>
                      <button
                        type="button"
                        className="program-block"
                        data-piece={child.command}
                        data-state={toneOf([i, j])}
                        disabled={disabled}
                        aria-label={`${BLOCK_LOOK[child.command].label} dentro de repetir.${readOnly ? "" : " Toca para quitar."}`}
                        onClick={() => dispatch({ type: "remove", path: [i, j] })}
                      >
                        <img src={BLOCK_LOOK[child.command].icon} alt="" />
                      </button>
                    </PieceFrame>
                  ) : null,
                )}
              </ul>
              {readOnly ? null : open ? (
                <button className="btn btn-sm" type="button" disabled={disabled} onClick={() => dispatch({ type: "closeRepeat" })}>
                  Cerrar
                </button>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={disabled}
                  aria-label="Quitar repetir"
                  onClick={() => dispatch({ type: "remove", path: [i] })}
                >
                  <Icon name="x" />
                </button>
              )}
            </li>
          );
        })}
        {Array.from({ length: emptySlots }, (_, k) => (
          <li key={`empty-${k}`} className="slot-empty" aria-hidden="true" />
        ))}
      </ul>
      {!readOnly && state.blocks.length === 0 && <span className="small muted">Toca las piezas para armar tu secuencia.</span>}
      {!readOnly && (
        <div className="program-actions">
          <IconButton icon="trash" label="Borrar la secuencia" disabled={disabled || state.blocks.length === 0} onClick={clear} />
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * Secuencia y paleta juntas (Primaria y retos que no usan cámara): «Tu programa»
 * con `headerActions` a la derecha, el cuadro de la secuencia con su papelera y
 * `actions`, y debajo las piezas. Solo lectura (retos de predecir): solo el programa.
 */
export function BlockEditor({ policy, state, dispatch, disabled, active, readOnly = false, onClear, actions, headerActions }: Props & { readonly headerActions?: ReactNode }) {
  if (readOnly) return <Sequence state={state} dispatch={dispatch} disabled={disabled} active={active} readOnly onClear={onClear} />;
  return (
    <div className="stack editor">
      <ProgramHead>{headerActions}</ProgramHead>
      <Sequence state={state} dispatch={dispatch} disabled={disabled} active={active} onClear={onClear} actions={actions} />
      <PieceTray policy={policy} state={state} dispatch={dispatch} disabled={disabled} />
    </div>
  );
}
