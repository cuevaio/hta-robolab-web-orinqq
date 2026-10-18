/** Dónde queda guardado el modelo de gestos en el equipo (cambiar el nombre obliga a bajarlo otra vez). */
export const MODEL_CACHE = "robolab-gestos-v1";

type Deps = { fetch: typeof fetch; caches: CacheStorage | undefined };
/** Cuánto lleva bajado y cuánto pesa en total, en bytes. */
export type Progress = (loaded: number, total: number) => void;

const defaults = (): Deps => ({
  fetch: (input, init) => fetch(input, init),
  caches: typeof caches === "undefined" ? undefined : caches,
});

/** Lee el cuerpo por partes para avisar el avance; si no se sabe el tamaño, lo lee de una vez. */
async function read(response: Response, onProgress?: Progress): Promise<Uint8Array<ArrayBuffer>> {
  const total = Number(response.headers.get("Content-Length"));
  if (!onProgress || !response.body || !Number.isFinite(total) || total <= 0) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress?.(bytes.byteLength, bytes.byteLength);
    return bytes;
  }
  const bytes = new Uint8Array(total);
  let loaded = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes.set(value, loaded);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  return loaded === total ? bytes : bytes.slice(0, loaded);
}

/**
 * Trae el modelo de gestos (~8 MB). La primera vez lo baja y lo guarda en el
 * equipo; las siguientes lo lee de ahí sin internet, aunque la caché normal del
 * navegador ya lo haya soltado (el servidor del modelo solo la permite una hora).
 * Si no se puede guardar (sin espacio, navegador sin caché), igual lo devuelve.
 */
export async function loadModel(url: string, deps: Deps = defaults(), onProgress?: Progress): Promise<Uint8Array<ArrayBuffer>> {
  const cache = await deps.caches?.open(MODEL_CACHE).catch(() => undefined);
  const saved = await cache?.match(url).catch(() => undefined);
  if (saved) {
    const bytes = new Uint8Array(await saved.arrayBuffer());
    onProgress?.(bytes.byteLength, bytes.byteLength);
    return bytes;
  }
  const response = await deps.fetch(url);
  if (!response.ok) throw new Error(`No se pudo bajar el modelo de gestos (${response.status}).`);
  const bytes = await read(response, onProgress);
  await cache?.put(url, new Response(bytes)).catch(() => undefined);
  return bytes;
}
