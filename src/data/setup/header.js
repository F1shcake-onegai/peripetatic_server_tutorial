// @ts-check
// The Raspberry Pi 40-pin GPIO header. Raspberry Pi 5 and Raspberry Pi Zero 2 W use the
// same layout ("the standard Raspberry Pi pin layout for Raspberry Pi B+ and later, and
// for all Zero models").
// Source: https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#gpio
// (table "Pin functions"; the functions below use its wording, shortened).

/** @typedef {'3v3' | '5v' | 'gnd' | 'gpio'} PinKind */

/**
 * @typedef {object} HeaderPin
 * @property {number} pin          Physical pin, 1-40
 * @property {PinKind} kind
 * @property {number} [gpio]       BCM GPIO number
 * @property {string[]} functions  What the pin is also used for, as the documentation lists it
 * @property {boolean} [reserved]  Not offered for wiring
 * @property {string} [note]
 */

/** @type {HeaderPin[]} */
export const HEADER = [
  { pin: 1, kind: '3v3', functions: [] },
  { pin: 2, kind: '5v', functions: [] },
  { pin: 3, kind: 'gpio', gpio: 2, functions: ['I2C SDA'], note: '1.8 kΩ pull-up to 3.3 V on the board' },
  { pin: 4, kind: '5v', functions: [] },
  { pin: 5, kind: 'gpio', gpio: 3, functions: ['I2C SCL'], note: '1.8 kΩ pull-up to 3.3 V on the board' },
  { pin: 6, kind: 'gnd', functions: [] },
  { pin: 7, kind: 'gpio', gpio: 4, functions: ['GPCLK0'] },
  { pin: 8, kind: 'gpio', gpio: 14, functions: ['UART TXD'] },
  { pin: 9, kind: 'gnd', functions: [] },
  { pin: 10, kind: 'gpio', gpio: 15, functions: ['UART RXD'] },
  { pin: 11, kind: 'gpio', gpio: 17, functions: ['SPI CE1'] },
  { pin: 12, kind: 'gpio', gpio: 18, functions: ['PCM CLK', 'SPI CE0'] },
  { pin: 13, kind: 'gpio', gpio: 27, functions: [] },
  { pin: 14, kind: 'gnd', functions: [] },
  { pin: 15, kind: 'gpio', gpio: 22, functions: [] },
  { pin: 16, kind: 'gpio', gpio: 23, functions: [] },
  { pin: 17, kind: '3v3', functions: [] },
  { pin: 18, kind: 'gpio', gpio: 24, functions: [] },
  { pin: 19, kind: 'gpio', gpio: 10, functions: ['SPI MOSI'] },
  { pin: 20, kind: 'gnd', functions: [] },
  { pin: 21, kind: 'gpio', gpio: 9, functions: ['SPI MISO'] },
  { pin: 22, kind: 'gpio', gpio: 25, functions: [] },
  { pin: 23, kind: 'gpio', gpio: 11, functions: ['SPI SCLK'] },
  { pin: 24, kind: 'gpio', gpio: 8, functions: ['SPI CE0'] },
  { pin: 25, kind: 'gnd', functions: [] },
  { pin: 26, kind: 'gpio', gpio: 7, functions: ['SPI CE1'] },
  { pin: 27, kind: 'gpio', gpio: 0, functions: ['ID_SD'], reserved: true, note: 'Reserved for HAT identification' },
  { pin: 28, kind: 'gpio', gpio: 1, functions: ['ID_SC'], reserved: true, note: 'Reserved for HAT identification' },
  { pin: 29, kind: 'gpio', gpio: 5, functions: [] },
  { pin: 30, kind: 'gnd', functions: [] },
  { pin: 31, kind: 'gpio', gpio: 6, functions: [] },
  { pin: 32, kind: 'gpio', gpio: 12, functions: ['PWM0'] },
  { pin: 33, kind: 'gpio', gpio: 13, functions: ['PWM1'] },
  { pin: 34, kind: 'gnd', functions: [] },
  { pin: 35, kind: 'gpio', gpio: 19, functions: ['PCM FS', 'SPI MISO'] },
  { pin: 36, kind: 'gpio', gpio: 16, functions: ['SPI CE2'] },
  { pin: 37, kind: 'gpio', gpio: 26, functions: [] },
  { pin: 38, kind: 'gpio', gpio: 20, functions: ['PCM DIN'] },
  { pin: 39, kind: 'gnd', functions: [] },
  { pin: 40, kind: 'gpio', gpio: 21, functions: ['PCM DOUT'] },
];

/**
 * @typedef {object} MipiConnector   A camera/display ribbon connector
 * @property {string} name
 * @property {boolean} camera
 * @property {boolean} display
 */

/**
 * @typedef {object} Board
 * @property {string} name
 * @property {HeaderPin[]} header
 * @property {number} pcie              PCIe connectors
 * @property {MipiConnector[]} mipi     Camera/display connectors
 * @property {number} usb               USB ports for devices
 * @property {string[]} sources
 * @property {string} [note]
 */

/** @type {Record<'rpi5' | 'rpi-zero-2-w', Board>} */
export const BOARDS = {
  // "PCIe 2.0 x1 interface", "2 × 4-lane MIPI camera/display transceivers" ("Camera and DSI
  // display connectors are interchangeable"), "2 × USB 3.0 ports", "2 × USB 2.0 ports"
  rpi5: {
    name: 'Raspberry Pi 5',
    header: HEADER,
    pcie: 1,
    mipi: [
      { name: 'CAM/DISP 0', camera: true, display: true },
      { name: 'CAM/DISP 1', camera: true, display: true },
    ],
    usb: 4,
    sources: ['https://www.raspberrypi.com/products/raspberry-pi-5/'],
  },
  // "CSI-2 camera connector", "micro USB On-The-Go (OTG) port"; no display connector or
  // PCIe is listed.
  'rpi-zero-2-w': {
    name: 'Raspberry Pi Zero 2 W',
    header: HEADER,
    pcie: 0,
    mipi: [{ name: 'Camera', camera: true, display: false }],
    usb: 1,
    sources: ['https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/'],
    note: 'On some Zero models, the GPIO header comes without pins attached.',
  },
};

/** Free GPIOs are handed out tier by tier: pins without other functions first, then
 *  clock/PWM/PCM, then UART, then I2C, then SPI0, so buses stay free as long as possible.
 *  Within the allowed tiers, a module's pins are kept close together on the header. */
export const GPIO_TIERS = [
  [5, 6, 22, 23, 24, 25, 26, 27], // no other function
  [4, 12, 13, 16, 17, 18, 19, 20, 21], // GPCLK0, PWM, PCM, extra SPI chip enables
  [14, 15], // UART
  [2, 3], // I2C (pull-ups on the board)
  [7, 8, 9, 10, 11], // SPI0
];
export const GPIO_PREFERENCE = GPIO_TIERS.flat();

/** @param {number} gpio */
export function pinOfGpio(gpio) {
  const p = HEADER.find((h) => h.kind === 'gpio' && h.gpio === gpio);
  return p ? p.pin : undefined;
}

/** Distance between two physical pins on the header: 20 rows of 2 pins, odd pins in one
 *  column, even pins in the other. Pins 15 and 16 are 1 apart; pins 15 and 19 are 2.
 *  @param {number} a @param {number} b */
export function pinDistance(a, b) {
  const row = (/** @type {number} */ p) => Math.ceil(p / 2);
  return Math.abs(row(a) - row(b)) + Math.abs((a % 2) - (b % 2));
}
