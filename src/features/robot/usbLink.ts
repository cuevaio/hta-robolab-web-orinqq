import { createBluetoothLink } from "./bluetoothLink";

/** Puentes USB–UART usados en placas ESP32: CH340, CP210x, FTDI y USB Espressif. */
export function createUsbLink(options: NonNullable<Parameters<typeof createBluetoothLink>[0]> = {}) {
  return createBluetoothLink({
    ...options,
    portFilters: [{ usbVendorId: 0x1a86 }, { usbVendorId: 0x10c4 }, { usbVendorId: 0x0403 }, { usbVendorId: 0x303a }],
    handshakeMs: options.handshakeMs ?? 8000,
    helloRetryMs: options.helloRetryMs ?? 400,
    // NUL invalida una trama parcial antes de LF; STOP apaga el recorrido anterior.
    helloFrame: "\0\nSTOP\nHELLO\n",
    unsupportedMessage: "USB necesita Chrome con Web Serial y HTTPS o localhost.",
    openFailureMessage: "No pudimos abrir USB. Revisa el cable y cierra el monitor serie de Arduino u otras pestañas que usen el robot.",
    handshakeFailureMessage: "El robot no confirmó la conexión USB. Revisa el cable y que tenga el firmware USB de RoboLab.",
  });
}
