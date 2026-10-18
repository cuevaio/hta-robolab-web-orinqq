export class LocalGenerationError extends Error {}
const BASE_URL = "http://127.0.0.1:8765";
type LocalRequest = { objective: string; grades: number[]; difficulty?: string };
export type LocalResult = { missions: unknown[]; failed: { grade: 2 | 3 | 4; code: string }[] };
async function localJson(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(path === "/health" ? 7000 : 560_000);
  try {
    const response = await fetch(`${BASE_URL}${path}`, { ...init, credentials: "omit", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (response.status === 409) throw new LocalGenerationError("La Jetson está generando otra misión. Espera a que termine.");
    if (!response.ok) throw new LocalGenerationError("El conector local no pudo generar. Revisa la conexión con la Jetson.");
    const reader = response.body?.getReader();
    if (!reader) throw new LocalGenerationError("La respuesta local llegó vacía.");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 256 * 1024) throw new LocalGenerationError("La respuesta local es demasiado grande.");
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new LocalGenerationError("La respuesta local no es válida."); }
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new LocalGenerationError("La Jetson tardó demasiado. Conservamos tu aprendizaje; puedes reintentar.", { cause: error });
    if (error instanceof TypeError) throw new LocalGenerationError("No encontramos el conector local. Revisa el USB y permite el acceso a la red local si el navegador lo solicita.", { cause: error });
    throw error;
  }
}
export async function checkLocalModel(signal?: AbortSignal): Promise<boolean> {
  const data = await localJson("/health", { method: "GET" }, signal);
  return !!data && typeof data === "object" && "ready" in data && data.ready === true;
}
/** La respuesta es un borrador: solo reviewLocal de Convex puede convertirla en propuestas. */
export async function requestLocalMissions(request: LocalRequest, signal?: AbortSignal): Promise<LocalResult> {
  const data = await localJson("/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }, signal);
  if (!data || typeof data !== "object" || !("missions" in data) || !Array.isArray(data.missions) || data.missions.length > 3 || !("failed" in data) || !Array.isArray(data.failed) || data.failed.length > 3 || data.failed.some(f => !f || ![2, 3, 4].includes(f.grade) || typeof f.code !== "string")) {
    throw new LocalGenerationError("La respuesta del conector local no es válida.");
  }
  return { missions: data.missions, failed: data.failed };
}
