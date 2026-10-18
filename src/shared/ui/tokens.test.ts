import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(path, "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Los tokens de `:root` de styles.css: nombre → valor (hex). Un token puede apuntar a otro con var(). */
function tokens(): Map<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(read(join(SRC, "shared", "ui", "styles.css")))![1]!;
  return new Map([...root.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

function hex(name: string): string {
  let value = tokens().get(name);
  for (let hops = 0; value?.startsWith("var("); hops++) value = tokens().get(/var\((--[\w-]+)\)/.exec(value)![1]!);
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`El token ${name} no es un color hex: ${value}`);
  return value;
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Razón de contraste WCAG entre dos tokens. */
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(hex(a)), luminance(hex(b))].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("paleta única: todo color sale de los tokens de styles.css", () => {
  it("ningún CSS ni componente trae colores hex propios (así portada, alumno y docente leen la misma paleta)", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (!/\.(css|tsx)$/.test(file) || /\.test\./.test(file)) continue;
      // El código QR es negro sobre blanco por necesidad; la impresión de tarjetas va en blanco y negro.
      if (file.endsWith("QrCode.tsx")) continue;
      let text = read(file);
      if (file.endsWith("styles.css")) {
        text = text.replace(/:root\s*\{[^}]*\}/, "").replace(/@media print\s*\{[\s\S]*?\n\}\n/, "");
      }
      for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) offenders.push(`${file.slice(SRC.length + 1)}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("el modo abierto no pinta su propio fondo: usa el mismo de toda la app", () => {
    const css = read(join(SRC, "shared", "ui", "styles.css"));
    const explore = /\n\.explore\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(explore).not.toMatch(/background/);
    expect(hex("--c-bg")).toBe("#fff8d6");
  });
});

describe("contraste de los tokens (WCAG 2.2 AA)", () => {
  const TEXT = 4.5;
  const GRAPHIC = 3;

  it.each([
    ["nombre del tópico (tinta) sobre la franja de Ciencia", "--c-ink", "--steam-ciencia-wash", TEXT],
    ["nombre del tópico (tinta) sobre la franja de Tecnología", "--c-ink", "--steam-tecnologia-wash", TEXT],
    ["nombre del tópico (tinta) sobre la franja de Ingeniería", "--c-ink", "--steam-ingenieria-wash", TEXT],
    ["nombre del tópico (tinta) sobre la franja de Artes", "--c-ink", "--steam-artes-wash", TEXT],
    ["nombre del tópico (tinta) sobre la franja de Matemáticas", "--c-ink", "--steam-matematicas-wash", TEXT],
    ["texto de marca (enlaces, tabs, migas) sobre el fondo", "--c-brand-strong", "--c-bg", TEXT],
    ["texto de marca sobre las tarjetas", "--c-brand-strong", "--c-surface", TEXT],
    ["texto de marca sobre su fondo suave (badges, tab activa)", "--c-brand-strong", "--c-brand-soft", TEXT],
    ["verde (reglas de contraseña, 'En vivo') sobre el fondo", "--c-ok", "--c-bg", TEXT],
    ["verde sobre su fondo suave", "--c-ok", "--c-ok-soft", TEXT],
    ["verde en el nombre de Robi", "--c-ok", "--c-surface", TEXT],
    ["aviso sobre su fondo suave", "--c-warn", "--c-warn-soft", TEXT],
    ["error sobre su fondo suave", "--c-error", "--c-error-soft", TEXT],
    ["error sobre el fondo", "--c-error", "--c-bg", TEXT],
    ["texto atenuado sobre el fondo", "--c-muted", "--c-bg", TEXT],
    ["texto atenuado sobre las tarjetas", "--c-muted", "--c-surface", TEXT],
    ["placeholder de los campos", "--c-placeholder", "--c-surface", TEXT],
    ["texto de botón principal (amarillo con tinta)", "--c-action-ink", "--c-action", TEXT],
    ["texto de botón principal al pasar el mouse", "--c-action-ink", "--c-action-strong", TEXT],
    ["texto sobre lo azul (selecciones, insignias de marca)", "--c-brand-ink", "--c-brand", TEXT],
    ["la tinta sobre el fondo", "--c-ink", "--c-bg", TEXT],
    ["la tinta sobre el amarillo de la barra superior", "--c-ink", "--c-action", TEXT],
    ["texto atenuado sobre el encabezado de las tablas", "--c-muted", "--c-surface-2", TEXT],
    ["el borde de tinta contra el fondo (se ve como contorno)", "--c-ink", "--c-bg", GRAPHIC],
    ["letra de la meta en el mapa de misiones", "--c-goal-ink", "--c-goal", TEXT],
    ["borde del camino contra el pasto del tablero", "--c-path-edge", "--c-grass", GRAPHIC],
    ["borde del camino contra el camino", "--c-path-edge", "--c-path", GRAPHIC],
  ] as const)("%s", (_name, fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});
