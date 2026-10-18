import { createBluetoothLink, type SerialApi, type SerialPortLike } from "./bluetoothLink";

// Contrato BLE UART del firmware. Los mensajes conservan el protocolo ROBO/1.
const SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const RECEIVE = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const TRANSMIT = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const CHUNK_BYTES = 20; // Funciona también con el MTU mínimo de BLE (23).

export interface BleNotifications extends EventTarget {
  readonly value?: DataView;
  startNotifications(): Promise<unknown>;
}
export interface BleWriter {
  writeValueWithResponse(value: Uint8Array): Promise<void>;
}
interface BleService {
  getCharacteristic(uuid: string): Promise<unknown>;
}
export interface BleServer {
  readonly connected: boolean;
  connect(): Promise<BleServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BleService>;
}
export interface BleDevice extends EventTarget {
  readonly gatt?: BleServer;
}
export interface WebBluetoothApi {
  requestDevice(options: { filters: { namePrefix: string; services: string[] }[] }): Promise<BleDevice>;
}
const serialApis = new WeakMap<WebBluetoothApi, SerialApi>();
type Options = Omit<NonNullable<Parameters<typeof createBluetoothLink>[0]>, "serial"> & {
  bluetooth?: WebBluetoothApi | null;
};

/** Cada intento obtiene servicios nuevos: Chrome invalida los anteriores al desconectar. */
function blePort(device: BleDevice): SerialPortLike {
  let server: BleServer | undefined;
  let tx: BleNotifications | undefined;
  let input: ReadableStreamDefaultController<Uint8Array> | null = null;
  let lost = false, closed = false;
  const disconnected = () => {
    lost = true;
    input?.error(new DOMException("Se perdió la conexión BLE.", "NetworkError"));
    input = null;
  };
  const notification = () => {
    const value = tx?.value;
    if (value && input) input.enqueue(new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice());
  };
  const assertConnected = () => {
    if (closed || lost || !server?.connected) throw new DOMException("Se perdió la conexión BLE.", "NetworkError");
  };
  const port = {
    readable: null as ReadableStream<Uint8Array> | null,
    writable: null as WritableStream<Uint8Array> | null,
    async open() {
      if (!device.gatt) throw new Error("El dispositivo no ofrece una conexión BLE.");
      device.addEventListener("gattserverdisconnected", disconnected);
      try {
        server = await device.gatt.connect();
        assertConnected();
        const service = await server.getPrimaryService(SERVICE);
        assertConnected();
        const rx = await service.getCharacteristic(RECEIVE) as BleWriter;
        assertConnected();
        tx = await service.getCharacteristic(TRANSMIT) as BleNotifications;
        assertConnected();
        port.readable = new ReadableStream<Uint8Array>({
          start(controller) { input = controller; },
          cancel() { input = null; },
        });
        tx.addEventListener("characteristicvaluechanged", notification);
        await tx.startNotifications();
        assertConnected();
        port.writable = new WritableStream<Uint8Array>({
          async write(data) {
            for (let offset = 0; offset < data.length; offset += CHUNK_BYTES) {
              if (closed || lost || !server?.connected) throw new DOMException("El robot BLE está desconectado.", "NetworkError");
              // WritableStream serializa las operaciones GATT, incluidos STOP y los latidos.
              await rx.writeValueWithResponse(data.slice(offset, offset + CHUNK_BYTES));
            }
          },
        });
      } catch (error) {
        await port.close();
        throw error;
      }
    },
    cancelOpen() {
      closed = true;
      device.gatt?.disconnect();
    },
    async close() {
      closed = true;
      tx?.removeEventListener("characteristicvaluechanged", notification);
      device.removeEventListener("gattserverdisconnected", disconnected);
      input?.close(); input = null;
      // También aborta un intento GATT que haya quedado a medias.
      device.gatt?.disconnect();
    },
  };
  return port;
}

/** Chrome elige el periférico BLE directamente; no solicita puertos del sistema. */
export function createBleLink({
  bluetooth = typeof navigator === "undefined" ? null : (navigator as Navigator & { bluetooth?: WebBluetoothApi }).bluetooth ?? null,
  ...options
}: Options = {}) {
  let serial: SerialApi | null = bluetooth ? serialApis.get(bluetooth) ?? null : null;
  if (bluetooth && !serial) {
    serial = {
      async requestPort() {
        // Se ejecuta antes de cualquier await para conservar el gesto del usuario.
        const device = await bluetooth.requestDevice({ filters: [{ namePrefix: "RoboLab", services: [SERVICE] }] });
        return blePort(device);
      },
    };
    // Comparte la espera del cierre físico al cambiar de pantalla.
    serialApis.set(bluetooth, serial);
  }
  return createBluetoothLink({
    ...options, serial,
    unsupportedMessage: "Bluetooth BLE necesita Chrome con Web Bluetooth habilitado y HTTPS o localhost.",
    openFailureMessage: "No pudimos conectar por BLE. Comprueba que RoboLab esté encendido y cerca. Cierra su conexión en otras pestañas o equipos y vuelve a elegirlo.",
  });
}
