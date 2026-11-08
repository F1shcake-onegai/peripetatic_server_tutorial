// @ts-check
// Hardware the GPIO planner knows. Every value comes from the source listed with the device.
// GPIO numbers are BCM numbers on the Raspberry Pi side.

/**
 * @typedef {object} Signal
 * @property {string} id
 * @property {string} label
 * @property {string} devicePin   The pin's name on the device, e.g. 'IO3', 'DOUT', 'RST'
 * @property {'gpio' | 'power' | 'ground' | 'analog'} type
 *   gpio: needs a Raspberry Pi GPIO. power/ground: a 3V3/5V/GND pin.
 *   analog: an analog output; the Raspberry Pi has no analog inputs, so it is never wired.
 * @property {'3v3' | '5v'} [power]   The supply a power signal uses by default
 * @property {('3v3' | '5v')[]} [supplies]  Supplies a power signal can run on. The viewer can
 *   switch between them, and when every pin of the default supply is taken by a plug, it uses
 *   the next one.
 * @property {number} [pin]        Header pin a power or ground signal must use (a plug's wire)
 * @property {number} [pullUp]     Ohms of the pull-up resistor to 3.3 V it needs: one leg in the
 *   same breadboard hole as its wire, the other in the + rail (3V3 from the Pi)
 * @property {number} [fixed]      GPIO the signal must use
 * @property {number} [default]    GPIO used unless the viewer moves it (movable signals only)
 * @property {number[]} [exclude]  GPIOs a movable signal may never use
 * @property {string} [bus]        Signals on the same bus may share a GPIO (e.g. 'i2c')
 * @property {number} [preferredPin]  Physical pin for a power or ground signal
 */

/**
 * @typedef {object} HeaderCoverage   For boards that sit on the 40-pin header
 * @property {boolean} covers       Sits on the header
 * @property {boolean} passthrough  Extension pins keep the header usable above it
 */

/**
 * @typedef {object} DevicePin   A pin on the device's own headers (for wiring steps)
 * @property {string} header
 * @property {number} no
 * @property {string} name
 * @property {number} [gpio]
 * @property {string} [function]
 */

/**
 * @typedef {object} Uses   Connectors other than the GPIO header
 * @property {number} [pcie]
 * @property {number} [camera]   Camera/display connectors used as a camera
 * @property {number} [display]  Camera/display connectors used as a display
 * @property {number} [usb]
 */

/**
 * @typedef {object} Device
 * @property {string} id
 * @property {string} name
 * @property {string} short              Short name shown next to pins, e.g. 'GPS Module'
 * @property {string} [versions]        Board versions covered, shown next to the name
 * @property {('student' | 'server')[]} tracks
 * @property {'network' | 'hat' | 'sensor' | 'camera' | 'display'} category
 * @property {string} [oneOf]          Only one device with the same value can be chosen
 * @property {string[]} [boards]        Boards it works with; all when not set
 * @property {HeaderCoverage} [header]
 * @property {Uses} [uses]
 * @property {boolean} [unverified]     Not yet checked against the maker's documentation
 * @property {string} [protocol]       How it talks to the Pi, for "Not enough GPIO pins for <protocol>"
 *   (not set for plain digital pins)
 * @property {Record<string, {label: string, protocol?: string, signals: Signal[]}>} [modes]  Choose one, e.g. SPI or SDIO
 * @property {Signal[]} [signals]
 * @property {DevicePin[]} [pinout]  The device's own headers, for the wiring steps
 * @property {{pins: number[], steps: string[]}} [plug]  A plug that sits on the header: the
 *   pins it covers (its power and ground signals name their pin with `pin`; nothing else can
 *   use any of them), and the text of its wiring step
 * @property {string[]} [connect]   Text of the wiring step for its ribbon cable, instead of the
 *   plain one; {connector} becomes the connector's name
 * @property {string[]} [fit]       It sits on the breadboard, so the breadboard is required with it:
 *   the text of the wiring step that fits it there. Its wires start beside its pins.
 * @property {string[]} sources
 * @property {string[]} [notes]
 */

// rpi_init.sh refuses GPIO 7-11 for the ESP control pins: SPI0 owns them.
const SPI0 = [7, 8, 9, 10, 11];

/** @param {string} id @param {string} label @param {string} devicePin @param {number} gpio */
const fixed = (id, label, devicePin, gpio) => ({ id, label, devicePin, type: /** @type {const} */ ('gpio'), fixed: gpio });
/** @param {string} devicePin @param {number} [preferredPin] */
const ground = (devicePin = 'GND', preferredPin) => ({
  id: 'gnd', label: 'Ground', devicePin, type: /** @type {const} */ ('ground'), ...(preferredPin ? { preferredPin } : {}),
});
const vcc33 = { id: 'vcc', label: 'Power', devicePin: 'VCC', type: /** @type {const} */ ('power'), power: /** @type {const} */ ('3v3') };
/** @param {string} pin @param {string} [label] */
const dout = (pin, label = 'Digital output') => ({ id: pin.toLowerCase(), label, devicePin: pin, type: /** @type {const} */ ('gpio') });
/** @param {string} [pin] */
const aout = (pin = 'AOUT') => ({ id: pin.toLowerCase(), label: 'Analog output', devicePin: pin, type: /** @type {const} */ ('analog') });

/** @type {Device[]} */
export const DEVICES = [
  {
    id: 'esp32-c5-devkitc-1',
    name: 'ESP32-C5-DevKitC-1',
    short: 'ESP32-C5',
    versions: 'v1.2 or later',
    tracks: ['student'],
    category: 'network',
    oneOf: 'second network interface',
    uses: { usb: 1 },
    // Wiring from ESP-Hosted-Linux's Raspberry Pi guide; the three SPI control pins can
    // move (rpi_init.sh: resetgpio, handshakegpio, datareadygpio). The ESP32 stays on a
    // USB port of the Pi for power and flashing, so only ground is wired.
    // Pull-ups (ESP-Hosted-Linux docs/getting-started/hardware-setup.md): "A pull-up of at
    // least 10 kΩ on chip select" for SPI; "CMD and DAT0-DAT3 require pull-ups", 10 kΩ in its
    // diagram, for SDIO. The DevKitC-1 v1.2 schematic has none on these pins. The DevKit sits
    // on the breadboard, and each resistor shares the hole of its wire.
    modes: {
      spi: {
        label: 'SPI',
        protocol: 'SPI',
        signals: [
          { ...fixed('cs', 'CS', 'IO10', 8), pullUp: 10000 },
          fixed('sclk', 'SCLK', 'IO6', 11),
          fixed('miso', 'MISO', 'IO2', 9),
          fixed('mosi', 'MOSI', 'IO7', 10),
          { id: 'handshake', label: 'Handshake', devicePin: 'IO3', type: 'gpio', default: 22, exclude: SPI0 },
          { id: 'dataready', label: 'Data Ready', devicePin: 'IO4', type: 'gpio', default: 27, exclude: SPI0 },
          { id: 'reset', label: 'Reset', devicePin: 'RST', type: 'gpio', default: 6, exclude: SPI0 },
          ground('GND', 25),
        ],
      },
      sdio: {
        label: 'SDIO',
        protocol: 'SDIO',
        signals: [
          { ...fixed('dat3', 'DAT3', 'IO13', 27), pullUp: 10000 },
          fixed('clk', 'CLK', 'IO9', 22),
          { ...fixed('cmd', 'CMD', 'IO10', 23), pullUp: 10000 },
          { ...fixed('dat0', 'DAT0', 'IO8', 24), pullUp: 10000 },
          { ...fixed('dat1', 'DAT1', 'IO7', 25), pullUp: 10000 },
          { ...fixed('dat2', 'DAT2', 'IO14', 26), pullUp: 10000 },
          fixed('reset', 'Reset', 'RST', 6),
          ground('GND', 39),
        ],
      },
    },
    // Header blocks J1 and J3 of v1.2 or later (boards from PW-2025-04-0446 on). v1.1
    // orders the pins differently and isn't supported.
    pinout: [
      { header: 'J1', no: 1, name: '3V3', function: '3.3 V power supply' },
      { header: 'J1', no: 2, name: 'RST', function: 'High: enables the chip; Low: disables the chip.' },
      { header: 'J1', no: 3, name: 'IO2', gpio: 2, function: 'MTMS, GPIO2, LP_GPIO2, LP_UART_RTSN, LP_I2C_SDA, ADC1_CH1, FSPIQ' },
      { header: 'J1', no: 4, name: 'IO3', gpio: 3, function: 'MTDI, GPIO3, LP_GPIO3, LP_UART_CTSN, LP_I2C_SCL, ADC1_CH2' },
      { header: 'J1', no: 5, name: 'IO0', gpio: 0, function: 'GPIO0, XTAL_32K_P, LP_GPIO0, LP_UART_DTRN' },
      { header: 'J1', no: 6, name: 'IO1', gpio: 1, function: 'GPIO1, XTAL_32K_N, LP_GPIO1, LP_UART_DSRN, ADC1_CH0' },
      { header: 'J1', no: 7, name: 'IO6', gpio: 6, function: 'GPIO6, LP_GPIO6, ADC1_CH5, FSPICLK' },
      { header: 'J1', no: 8, name: 'IO7', gpio: 7, function: 'GPIO7, FSPID, SDIO_DATA1' },
      { header: 'J1', no: 9, name: 'IO8', gpio: 8, function: 'GPIO8, PAD_COMP0, SDIO_DATA0' },
      { header: 'J1', no: 10, name: 'IO9', gpio: 9, function: 'GPIO9, PAD_COMP1, SDIO_CLK' },
      { header: 'J1', no: 11, name: 'IO10', gpio: 10, function: 'GPIO10, FSPICS0, SDIO_CMD' },
      { header: 'J1', no: 12, name: 'IO26', gpio: 26, function: 'GPIO26' },
      { header: 'J1', no: 13, name: 'IO25', gpio: 25, function: 'GPIO25' },
      { header: 'J1', no: 14, name: '5V', function: '5 V power supply' },
      { header: 'J1', no: 15, name: 'GND', function: 'Ground' },
      { header: 'J1', no: 16, name: 'NC', function: 'No connection' },
      { header: 'J3', no: 1, name: 'GND', function: 'Ground' },
      { header: 'J3', no: 2, name: 'TX', gpio: 11, function: 'U0TXD, GPIO11' },
      { header: 'J3', no: 3, name: 'RX', gpio: 12, function: 'U0RXD, GPIO12' },
      { header: 'J3', no: 4, name: 'IO24', gpio: 24, function: 'GPIO24' },
      { header: 'J3', no: 5, name: 'IO23', gpio: 23, function: 'GPIO23' },
      { header: 'J3', no: 6, name: 'NC/15', gpio: 15, function: 'No connection/GPIO15 (used by PSRAM on modules with PSRAM)' },
      { header: 'J3', no: 7, name: 'IO27', gpio: 27, function: 'GPIO27 (drives the RGB LED)' },
      { header: 'J3', no: 8, name: 'IO4', gpio: 4, function: 'MTCK, GPIO4, LP_GPIO4, LP_UART_RXD, ADC1_CH3, FSPIHD' },
      { header: 'J3', no: 9, name: 'IO5', gpio: 5, function: 'MTDO, GPIO5, LP_GPIO5, LP_UART_TXD, ADC1_CH4, FSPIWP' },
      { header: 'J3', no: 10, name: 'NC', function: 'No connection' },
      { header: 'J3', no: 11, name: 'IO28', gpio: 28, function: 'GPIO28' },
      { header: 'J3', no: 12, name: 'GND', function: 'Ground' },
      { header: 'J3', no: 13, name: 'IO14', gpio: 14, function: 'GPIO14, USB_D+, SDIO_DATA2' },
      { header: 'J3', no: 14, name: 'IO13', gpio: 13, function: 'GPIO13, USB_D-, SDIO_DATA3' },
      { header: 'J3', no: 15, name: 'GND', function: 'Ground' },
      { header: 'J3', no: 16, name: 'NC', function: 'No connection' },
    ],
    fit: [
      'Push the DevKit into the breadboard across the middle gap, with its pins in columns b and i.',
      'Columns a and j stay free. Each wire to the Pi starts in the hole beside its pin.',
    ],
    sources: [
      'https://github.com/espressif/esp-hosted-linux/blob/master/docs/reference/raspberry-pi.md',
      'https://github.com/espressif/esp-hosted-linux/blob/master/docs/getting-started/hardware-setup.md',
      'https://github.com/espressif/esp-hosted-linux/blob/master/host/rpi_init.sh',
      'https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c5/esp32-c5-devkitc-1/user_guide.html',
      'https://dl.espressif.com/dl/schematics/SCH_ESP32-C5-DevkitC-1_V1.2_20250211.pdf',
    ],
    notes: [
      'Strapping pins: MTMS (IO2), MTDI (IO3), IO7, IO25, IO26, IO27, IO28.',
      'IO13 and IO14 are the USB D- and D+ pins; SDIO uses them for DAT3 and DAT2.',
    ],
  },
  {
    id: 'wifi-dongle',
    name: 'Plug-and-play Wi-Fi dongle',
    short: 'Wi-Fi Dongle',
    tracks: ['student'],
    category: 'network',
    oneOf: 'second network interface',
    uses: { usb: 1 },
    signals: [],
    sources: ['https://f1shcake-onegai.github.io/peripetatic_server_tutorial/guide/04-second-interface/'],
    notes: ['A USB Wi-Fi dongle whose driver is built into the Linux kernel, so it works without installing anything.'],
  },
  {
    id: 'ai-hat-plus-2',
    name: 'AI HAT+ 2',
    short: 'AI HAT+ 2',
    tracks: ['server'],
    category: 'hat',
    boards: ['rpi5'],
    header: { covers: true, passthrough: false },
    uses: { pcie: 1 },
    // Like every HAT+, it has an ID EEPROM on ID_SD/ID_SC (GPIO0/GPIO1), which the firmware
    // reads over I2C at boot; those pins are reserved on the header anyway.
    signals: [],
    sources: [
      'https://www.raspberrypi.com/documentation/accessories/ai-hat-plus.html',
      'https://www.raspberrypi.com/documentation/computers/ai.html',
      'https://pip.raspberrypi.com/documents/RP-009655-MM-raspberry-pi-ai-hat-plus-2-product-brief.pdf',
      'https://datasheets.raspberrypi.com/hat/hat-plus-specification.pdf',
    ],
    notes: [
      'Connects to the PCIe connector of a Raspberry Pi 5 with its ribbon cable. PCIe Gen 3.0 is enabled in raspi-config.',
      'Supplied with a 16 mm stacking header.',
    ],
  },
  {
    id: 'waveshare-2in13-touch-epaper-hat',
    name: '2.13inch Touch e-Paper HAT',
    short: 'e-Paper HAT',
    tracks: ['student'],
    category: 'hat',
    header: { covers: true, passthrough: false },
    protocol: 'SPI and I2C',
    signals: [
      { id: 'vcc', label: 'Power', devicePin: 'VCC', type: 'power', power: '3v3' },
      ground(),
      fixed('din', 'DIN (SPI MOSI)', 'DIN', 10),
      fixed('clk', 'CLK (SPI SCLK)', 'CLK', 11),
      fixed('cs', 'CS (SPI CE0)', 'CS', 8),
      fixed('dc', 'DC', 'DC', 25),
      fixed('rst', 'e-Paper reset', 'RST', 17),
      fixed('busy', 'BUSY', 'BUSY', 24),
      fixed('int', 'Touch interrupt', 'INT', 27),
      { id: 'scl', label: 'Touch I2C SCL', devicePin: 'SCL', type: 'gpio', fixed: 3, bus: 'i2c' },
      { id: 'sda', label: 'Touch I2C SDA', devicePin: 'SDA', type: 'gpio', fixed: 2, bus: 'i2c' },
      fixed('trst', 'Touch reset', 'TRST', 22),
    ],
    sources: [
      'https://www.waveshare.com/2.13inch-touch-e-paper-hat.htm',
      'https://www.waveshare.com/wiki/2.13inch_Touch_e-Paper_HAT_Manual',
    ],
    notes: ['Touch controller on I2C address 0x14.'],
  },

  {
    id: 'pimoroni-inky-impression-7in3',
    name: 'Inky Impression 7.3"',
    short: 'Inky Impression',
    tracks: ['student'],
    category: 'hat',
    header: { covers: true, passthrough: false },
    protocol: 'SPI and I2C',
    // Pins from Pimoroni's inky library (inky_e673.py, inky_ac073tc1a.py and
    // examples/spectra6/buttons.py, commit a4264856): the same on the Spectra 6 and the
    // original 7-colour panel.
    signals: [
      fixed('mosi', 'SPI MOSI', 'MOSI', 10),
      fixed('sclk', 'SPI SCLK', 'SCLK', 11),
      fixed('cs', 'SPI CS', 'CS0', 8),
      fixed('dc', 'DC', 'DC', 22),
      fixed('reset', 'Reset', 'RESET', 27),
      fixed('busy', 'Busy', 'BUSY', 17),
      fixed('button-a', 'Button A', 'SW_A', 5),
      fixed('button-b', 'Button B', 'SW_B', 6),
      fixed('button-c', 'Button C', 'SW_C', 16),
      fixed('button-d', 'Button D', 'SW_D', 24),
      { id: 'sda', label: 'EEPROM I2C SDA', devicePin: 'SDA', type: 'gpio', fixed: 2, bus: 'i2c' },
      { id: 'scl', label: 'EEPROM I2C SCL', devicePin: 'SCL', type: 'gpio', fixed: 3, bus: 'i2c' },
    ],
    sources: [
      'https://shop.pimoroni.com/products/inky-impression-7-3',
      'https://learn.pimoroni.com/article/getting-started-with-inky-impression',
      'https://github.com/pimoroni/inky',
    ],
    notes: [
      'Plugs onto the 40-pin header; a 40-pin extension header is included for full-size Raspberry Pi boards.',
      'The ID EEPROM is on the I2C bus (GPIO2/GPIO3) at address 0x50.',
    ],
  },
  {
    id: 'rpi-camera-module-3',
    name: 'Camera Module 3',
    short: 'Camera Module 3',
    tracks: ['student', 'server'],
    category: 'camera',
    uses: { camera: 1 },
    signals: [],
    sources: [
      'https://www.raspberrypi.com/products/camera-module-3/',
      'https://www.raspberrypi.com/documentation/accessories/camera.html',
    ],
    notes: [
      'Supplied with a 200 mm, 15-pin 1 mm FPC cable. Raspberry Pi Zero models need a Zero camera cable.',
    ],
  },
  {
    id: 'rpi-touch-display-2',
    name: 'Raspberry Pi Touch Display 2',
    short: 'Display',
    versions: '5" or 7"',
    tracks: ['student'],
    category: 'display',
    uses: { display: 1 },
    // Raspberry Pi documentation, Touch Display 2 (documentation/asciidoc/accessories/
    // touch-display-2/about.adoc in raspberrypi/documentation): the 5" and 7" models come with
    // a 22-way to 15-way cable for the Raspberry Pi 5 and a 15-way to 15-way cable for
    // Raspberry Pi 4 and earlier, and don't work with the Zero series. The GPIO power cable's
    // 3-pin plug sits on pins 2, 4 and 6: red (5 V) on pin 2, black (ground) on pin 6.
    signals: [
      { id: 'vcc', label: 'Power', devicePin: 'Red', type: 'power', power: '5v', pin: 2 },
      { id: 'gnd', label: 'Ground', devicePin: 'Black', type: 'ground', pin: 6 },
    ],
    plug: {
      pins: [2, 4, 6],
      steps: [
        'Plug the small end of the power cable into J1 on the display.',
        'Fit the 3-pin end onto Pi pins 2, 4 and 6: red on pin 2 (5V power), black on pin 6 (Ground).',
        'Connecting it the wrong way can damage the display.',
      ],
    },
    connect: [
      'Use the 22-way to 15-way ribbon cable. The 15-way to 15-way cable is for Raspberry Pi 4 and earlier.',
      'Plug the larger end into the display, with the metal contacts facing away from the display.',
      "Plug the smaller end into the Pi's {connector} connector, with the metal contacts facing the Ethernet and USB ports.",
    ],
    sources: [
      'https://www.raspberrypi.com/documentation/accessories/touch-display-2.html',
      'https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/accessories/touch-display-2/about.adoc',
    ],
    notes: [
      'The Raspberry Pi 5 detects it on either CAM/DISP connector.',
      'It takes its power from the GPIO header; its plug also covers pin 4, the other 5V pin.',
    ],
  },
  {
    id: 'adafruit-mini-pir-4871',
    name: 'Mini PIR Motion Sensor (Adafruit 4871)',
    short: 'PIR Sensor',
    tracks: ['student'],
    category: 'sensor',
    // "power it from 3 to 12V DC, there's an onboard regulator"; "Digital signal output is
    // 3.3V high/low". Powered from 5V, its output still stays at 3.3 V. 5V by default, which
    // keeps the 3V3 pins for the sensors that need them; 3V3 when the viewer chooses it, or
    // when a plug (the Touch Display 2's) takes the 5V pins.
    signals: [
      { id: 'vcc', label: 'Power', devicePin: '+', type: 'power', power: '5v', supplies: ['5v', '3v3'] },
      ground('-'),
      dout('O', 'Motion output'),
    ],
    sources: [
      'https://www.pishop.ca/product/breadboard-friendly-mini-pir-motion-sensor-with-3-pin-header/',
      'https://www.adafruit.com/product/4871',
    ],
    notes: [
      'Pins: #1 ground (-), #2 output (O), #3 power (+).',
      'The output stays high for 2 seconds after motion.',
      'Keep it away from the Raspberry Pi to avoid false triggers.',
    ],
  },

  {
    id: 'ublox-neo-6m-gps',
    name: 'u-blox NEO-6M GPS Receiver Module (52Pi)',
    short: 'GPS Module',
    tracks: ['student'],
    category: 'sensor',
    protocol: 'UART',
    // u-blox NEO-6 data sheet GPS.G6-HW-09005-E: VCC 2.7-3.6 V for the NEO-6M, digital I/O
    // at VCC level, Serial Port 1 (TxD1/RxD1) at 9600 baud, 8N1, NMEA. On the Raspberry Pi
    // it uses the UART: module TX to Pi RXD (GPIO15), module RX to Pi TXD (GPIO14).
    signals: [
      vcc33,
      ground(),
      { id: 'tx', label: 'GPS TX (to Pi RXD)', devicePin: 'TX', type: 'gpio', fixed: 15 },
      { id: 'rx', label: 'GPS RX (from Pi TXD)', devicePin: 'RX', type: 'gpio', fixed: 14 },
    ],
    sources: [
      'https://ca.robotshop.com/products/u-blox-neo-6m-gps-receiver-module',
      'https://content.u-blox.com/sites/default/files/products/documents/NEO-6_DataSheet_(GPS.G6-HW-09005).pdf',
    ],
    notes: [
      'UART at 9600 baud, 8 data bits, no parity, 1 stop bit (NMEA).',
      'The board says it works with 3.3 V and 5 V; it is powered from 3V3 so its TX stays at 3.3 V.',
      'The 1PPS time pulse output is not used.',
      'Check the pin labels printed on the 52Pi board; the data sheet names them TxD1 and RxD1.',
    ],
  },

  // Waveshare Sensors Pack (https://www.waveshare.com/sensors-pack.htm), without the
  // Moisture, UV and Liquid Level sensors: they only have an analog output, and the
  // Raspberry Pi has no analog inputs. Without the MQ-5 Gas Sensor for now: its board boosts
  // VCC to 5 V, and DOUT is pulled up to that 5 V through its LED and 1 kΩ (Waveshare's
  // schematic). Every other module accepts 3.3 V, so it is powered from 3V3, and its digital
  // output is pulled up to VCC on its own board, so it stays at 3.3 V (Raspberry Pi GPIOs
  // are not 5 V tolerant). No module here needs a pull-up resistor on the breadboard.
  {
    id: 'waveshare-color',
    name: 'Color Sensor (TCS3200)',
    short: 'Color Sensor',
    tracks: ['student'],
    category: 'sensor',
    signals: [
      vcc33,
      ground(),
      dout('OUT', 'Color output (frequency)'),
      dout('S0', 'Output scaling S0'),
      dout('S1', 'Output scaling S1'),
      dout('S2', 'Photodiode select S2'),
      dout('S3', 'Photodiode select S3'),
      dout('LED', 'White LEDs'),
    ],
    sources: ['https://www.waveshare.com/product/Color-Sensor.htm'],
    notes: ['Power: 2.7 V to 5.5 V.'],
  },
  {
    id: 'waveshare-flame',
    name: 'Flame Sensor',
    short: 'Flame Sensor',
    tracks: ['student'],
    category: 'sensor',
    signals: [vcc33, ground(), dout('DOUT'), aout()],
    sources: ['https://www.waveshare.com/wiki/Flame_Sensor'],
    notes: ['Power: 3.3 V to 5.3 V.'],
  },
  {
    id: 'waveshare-hall',
    name: 'Hall Sensor',
    short: 'Hall Sensor',
    tracks: ['student'],
    category: 'sensor',
    signals: [vcc33, ground(), dout('DOUT'), aout()],
    sources: ['https://www.waveshare.com/wiki/Hall_Sensor'],
    notes: ['Power: 2.3 V to 5.3 V.'],
  },
  {
    id: 'waveshare-infrared-reflective',
    name: 'Infrared Reflective Sensor',
    short: 'IR Sensor',
    tracks: ['student'],
    category: 'sensor',
    signals: [vcc33, ground(), dout('DOUT'), aout()],
    sources: ['https://www.waveshare.com/wiki/Infrared_Reflective_Sensor'],
    notes: ['Power: 3.0 V to 5.3 V.'],
  },
  {
    id: 'waveshare-laser',
    name: 'Laser Sensor',
    short: 'Laser Sensor',
    tracks: ['student'],
    category: 'sensor',
    signals: [vcc33, ground(), dout('DOUT')],
    sources: ['https://www.waveshare.com/product/Laser-Sensor.htm'],
    notes: ['Power: 2.5 V to 5.0 V.'],
  },
  {
    id: 'waveshare-rotation',
    name: 'Rotation Sensor',
    short: 'Rotation Sensor',
    tracks: ['student'],
    category: 'sensor',
    signals: [vcc33, ground(), dout('SIA', 'Output A'), dout('SIB', 'Output B'), dout('SW', 'Button')],
    sources: ['https://www.waveshare.com/product/Rotation-Sensor.htm'],
    notes: ['Power: 3.0 V to 5.3 V.'],
  },
  {
    id: 'waveshare-sound',
    name: 'Sound Sensor (LM386)',
    short: 'Sound Sensor',
    tracks: ['student'],
    category: 'sensor',
    signals: [vcc33, ground(), dout('DOUT'), aout()],
    sources: ['https://www.waveshare.com/wiki/Sound_Sensor'],
    notes: ['Power: 3.3 V to 5.3 V.'],
  },
  {
    id: 'waveshare-dht11',
    name: 'Temperature-Humidity Sensor (DHT11)',
    short: 'Temp & Humidity Sensor',
    tracks: ['student'],
    category: 'sensor',
    signals: [vcc33, ground(), dout('DOUT', 'Data (single-wire)')],
    sources: ['https://www.waveshare.com/wiki/DHT11_Temperature-Humidity_Sensor'],
    notes: ['Power: 3.3 V to 5.5 V.'],
  },
  {
    id: 'waveshare-tilt',
    name: 'Tilt Sensor',
    short: 'Tilt Sensor',
    tracks: ['student'],
    category: 'sensor',
    signals: [vcc33, ground(), dout('DOUT')],
    sources: ['https://www.waveshare.com/wiki/Tilt_Sensor'],
    notes: ['Power: 3.0 V to 5.5 V.'],
  },
];
