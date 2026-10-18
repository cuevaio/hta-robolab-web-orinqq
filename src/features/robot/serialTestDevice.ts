import { vi } from "vitest";

/** Puerto USB para pruebas con streams reales y una nueva sesión en cada apertura. */
export function serialTestDevice({ bootHellos = 0, onFrame }: {
  bootHellos?: number;
  onFrame?: (frame: string, reply: (text: string) => void) => void;
} = {}) {
  const frames: string[] = [], writes: string[] = [];
  let input: ReadableStreamDefaultController<Uint8Array> | null = null;
  let hellos = 0;
  const receive = (text: string) => input?.enqueue(new TextEncoder().encode(text));
  const port = {
    readable: null as ReadableStream<Uint8Array> | null,
    writable: null as WritableStream<Uint8Array> | null,
    open: vi.fn(async () => {
      let pending = "";
      port.readable = new ReadableStream({ start(controller) { input = controller; }, cancel() { input = null; } });
      port.writable = new WritableStream<Uint8Array>({ write(data) {
        const text = new TextDecoder().decode(data); writes.push(text); pending += text;
        while (pending.includes("\n")) {
          const end = pending.indexOf("\n") + 1;
          const frame = pending.slice(0, end); pending = pending.slice(end); frames.push(frame);
          if (frame === "HELLO\n" && ++hellos > bootHellos) receive("ROBO/1 ADZ ARC\n");
          if (frame === "PING\n") receive("PONG\n");
          onFrame?.(frame, receive);
        }
      } });
    }),
    close: vi.fn(async () => { input = null; }),
  };
  return { port, serial: { requestPort: vi.fn(async () => port) }, frames, writes, receive,
    unplug() { input?.error(new DOMException("USB unplugged", "NetworkError")); input = null; },
  };
}
