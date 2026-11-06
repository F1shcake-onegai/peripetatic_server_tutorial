# 0. Hardware Preparation

Connect the hardware before you set up Raspberry Pi OS in chapter 1. Disconnect the Pi from power before you connect anything.

**Student Kit**

- [ESP32 DevKit](#esp32-devkit) (chapter 4, optional)

**School Server**

- [AI HAT+ 2](#ai-hat-2) (chapter 4)

## ESP32 DevKit { #esp32-devkit }

Only for the ESP32 DevKit option in chapter 4.

!!! warning
    Raspberry Pi GPIO pins use 3.3 V logic. Do not connect ESP signals to 5 V pins.

ESP-Hosted-Linux supports these chips:[^1]

| Chip | Wi-Fi | Transport | Bluetooth | Thread / 802.15.4 |
|---|---|---|---|---|
| ESP32 | 2.4 GHz, b/g/n | SDIO (see the warning below), SPI | Classic + BLE | — |
| ESP32-S2 | 2.4 GHz, b/g/n | SPI | — | — |
| ESP32-S3 | 2.4 GHz, b/g/n | SPI | BLE | — |
| ESP32-S31 | 2.4 GHz, b/g/n | SPI, USB | Classic + BLE | Yes (on by default in firmware) |
| ESP32-C2 | 2.4 GHz, b/g/n | SPI | BLE | — |
| ESP32-C3 | 2.4 GHz, b/g/n | SPI | BLE | — |
| ESP32-C5 | 2.4 / 5 GHz, a/b/g/n/ac/ax | SDIO, SPI | BLE | — |
| ESP32-C6 | 2.4 GHz, b/g/n/ax | SDIO, SPI | BLE | Yes (must be enabled in firmware) |
| ESP32-C61 | 2.4 GHz, b/g/n/ax | SDIO, SPI | BLE | — |

!!! warning "ESP32 over SDIO"
    On ESP32 modules and DevKits with 3.3 V flash, such as the ESP32-DevKitC, GPIO12 (MTDI) selects the flash voltage and must be pulled low at reset. SDIO needs a pull-up on DAT2, which is GPIO12, so the two are incompatible. The fix is to burn an eFuse, which can't be undone. Read [Conflicts Between Bootstrap and SDIO on DAT2](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/sd_pullup_requirements.html#conflicts-between-bootstrap-and-sdio-on-dat2) before using SDIO with an ESP32.

### Wire the DevKit to the Pi[^2]

=== "SPI"

    | Function | ESP32 | ESP32-S2/S3 | ESP32-S31 | ESP32-C2/C3/C5/C6 | ESP32-C61 | Pi physical pin |
    |---|---|---|---|---|---|---|
    | CS | IO15 | IO10 | IO23 | IO10 | IO8 | 24 |
    | SCLK | IO14 | IO12 | IO20 | IO6 | IO6 | 23 |
    | MISO | IO12 | IO13 | IO22 | IO2 | IO2 | 21 |
    | MOSI | IO13 | IO11 | IO21 | IO7 | IO7 | 19 |
    | Handshake | IO2 | IO2 | IO3 | IO3 | IO3 | 15 |
    | Data Ready | IO4 | IO4 | IO4 | IO4 | IO4 | 13 |
    | Reset | EN | RST | RST | RST | RST | 31 |
    | Ground | GND | GND | GND | GND | GND | 25 |

    CS requires a pull-up of at least 10 kΩ to 3.3 V, which keeps the line from floating during reset or boot.

=== "SDIO"

    | Function | ESP32 | ESP32-C5 | ESP32-C6 | ESP32-C61 | Pi physical pin |
    |---|---|---|---|---|---|
    | DAT3 | IO13 | IO13 | IO23 | IO23 | 13 |
    | CLK | IO14 | IO9 | IO19 | IO26 | 15 |
    | CMD | IO15 | IO10 | IO18 | IO25 | 16 |
    | DAT0 | IO2 | IO8 | IO20 | IO27 | 18 |
    | DAT1 | IO4 | IO7 | IO21 | IO28 | 22 |
    | DAT2 | IO12 | IO14 | IO22 | IO22 | 37 |
    | Reset | EN | RST | RST | RST | 31 |
    | Ground | GND | GND | GND | GND | 39 |

    CMD and DAT0–DAT3 require 10 kΩ pull-ups. Keep the wires below 10 cm, and avoid putting the SDIO jumper wires too close together. Otherwise both capacitance and mutual capacitance increase, which causes signal degradation and crosstalk, or, in severe cases, stops SDIO from working at all.

    !!! warning
        On an ESP32, read the "ESP32 over SDIO" warning above before fitting the pull-up on DAT2 (IO12).

## AI HAT+ 2 { #ai-hat-2 }

### Mount the AI HAT+ 2[^3]

1. **Active Cooler (recommended):** remove the protective paper from its thermal pads. Align the two white push pins with the two heatsink holes on the Pi, then press them down until they click. Plug the fan cable into the Pi's fan connector.
2. **AI HAT+ 2 heatsink (recommended):** remove the protective paper from the thermal pads under it. Align the two black push pins with the holes in opposite corners of the AI HAT+ 2, then press them down until they click.
3. **AI HAT+ 2:**
    1. Screw the four spacers to the Pi with the four long screws.
    2. Push the GPIO stacking header onto the Pi's GPIO pins.
    3. Take the ribbon cable out of the AI HAT+ 2: slide out the clips on both sides of its connector, then pull the cable out.
    4. Insert one end of the cable into the Pi's PCIe connector, with the metal contacts facing the USB ports. Push the clips back in on both sides.
    5. Screw the AI HAT+ 2 onto the spacers with the four short screws, with its components facing up.
    6. Insert the other end of the cable into the AI HAT+ 2's PCIe connector. Push the clips back in on both sides.

[^1]: <https://github.com/espressif/esp-hosted-linux/blob/master/docs/reference/supported-hardware.md>
[^2]: <https://github.com/espressif/esp-hosted-linux/blob/master/docs/reference/raspberry-pi.md>
[^3]: <https://www.raspberrypi.com/documentation/accessories/ai-hat-plus.html>
