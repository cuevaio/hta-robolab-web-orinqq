import { Blobatar } from "@blobatar/react";
import "blobatar/motion.css";
import { happy, idle, sad, surprised, thinking, wink } from "blobatar/expression";
import { type ReactNode, useEffect, useId, useState } from "react";
import { MOBILE_QUERY, useMediaQuery } from "../useMediaQuery";
import "./guide.css";

/** En el celular el globo se esconde solo: ahí tapa el juego. Tocar la cara lo vuelve a abrir. */
export const AUTO_FOLD_MS = 10_000;

/**
 * Robi, la guía de los retos. La dibuja blobatar en el
 * mismo navegador, sin pedir nada a internet. Siempre es la misma porque sale
 * de un nombre fijo; la expresión acompaña lo que pasa en el juego.
 */
export const GUIDE_NAME = "Robi";

const LOOK = { name: "nub", traits: { shape: 0.74 }, hue: 150 } as const;

const EXPRESSIONS = { idle, happy, thinking, surprised, sad, wink } as const;
export type Mood = keyof typeof EXPRESSIONS;

export function GuideAvatar({ mood = "idle", size = 88 }: { mood?: Mood; size?: number }) {
  return (
    <Blobatar
      {...LOOK}
      animate="always"
      expression={EXPRESSIONS[mood]}
      width={size}
      height={size}
      aria-hidden="true"
      className="guide-avatar"
    />
  );
}

type Props = {
  readonly mood?: Mood;
  readonly message: string;
  readonly children?: ReactNode;
};

/**
 * Robi como asistente flotante en la esquina inferior derecha: su globo con
 * el mensaje y, si la pantalla lo pide, el botón de pista. Tocar su cara
 * esconde el globo (queda solo ella); un mensaje nuevo lo vuelve a abrir. En el
 * celular el globo se esconde solo a los 10 s, porque ahí tapa el juego. El
 * mensaje se anuncia a los lectores de pantalla aunque el globo esté escondido.
 */
export function Guide({ mood = "idle", message, children }: Props) {
  // Se recuerda cuál mensaje se escondió: al llegar otro, el globo reaparece sin efectos.
  const [foldedMessage, setFoldedMessage] = useState<string | null>(null);
  const folded = foldedMessage === message;
  const bubbleId = useId();
  const mobile = useMediaQuery(MOBILE_QUERY);

  useEffect(() => {
    if (!mobile) return;
    const timer = window.setTimeout(() => setFoldedMessage(message), AUTO_FOLD_MS);
    return () => window.clearTimeout(timer);
  }, [mobile, message]);

  return (
    <aside className="guide" data-mood={mood} data-folded={folded || undefined} aria-label={`${GUIDE_NAME}, tu guía`}>
      <div className="guide-bubble" id={bubbleId}>
        <strong className="guide-name">{GUIDE_NAME}</strong>
        <p role="status" aria-live="polite">
          {message}
        </p>
        {/* Escondido, el botón de pista no se muestra ni recibe el foco. */}
        {!folded && children}
      </div>
      <button
        type="button"
        className="guide-face"
        aria-expanded={!folded}
        aria-controls={bubbleId}
        aria-label={folded ? "Mostrar el mensaje de Robi" : "Esconder el mensaje de Robi"}
        onClick={() => setFoldedMessage(folded ? null : message)}
      >
        <GuideAvatar mood={mood} size={72} />
      </button>
    </aside>
  );
}
