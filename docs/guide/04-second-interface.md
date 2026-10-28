# 4. Create a Second Network Interface (Optional)

A second network interface lets the Pi connect to two networks at once: the mesh network and a Wi-Fi network (WLAN). You need it to:

- **Host what's inside the mesh network on the WLAN**, so that devices on the Wi-Fi network can reach services running inside the mesh network.
- **Access the internet via the WLAN and share it inside the mesh network**, so that devices in the mesh network can get online through the Pi.

=== "Using a Plug-and-Play Wi-Fi Dongle"

    A plug-and-play dongle has its driver built into the Linux kernel, so it works without installing anything.

    ## Plug in the dongle { .step }

    Plug the Wi-Fi dongle into a USB port on the Pi.

    ## Find the new interface { .step }

    ```bash
    nmcli device
    ```

    A new `wifi` device appears, usually named `wlan1`. Use this name in the next steps. If no new `wifi` device appears, the dongle's driver is not built in, and the dongle is not plug-and-play on Raspberry Pi OS.

=== "Using an ESP32 DevKit via GPIO"

    ESP-Hosted-Linux[^1] turns an ESP32 DevKit into a Wi-Fi interface for the Pi. The DevKit runs the ESP-Hosted-Linux firmware, and a driver on the Pi shows it as a normal Wi-Fi interface that NetworkManager can manage.

    !!! warning
        Raspberry Pi GPIO pins use 3.3 V logic. Do not connect ESP signals to 5 V pins.

    ESP-Hosted-Linux supports these chips:[^2]

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

    ## Wire the DevKit to the Pi[^3] { .step }

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

    ## Install the ESP-IDF prerequisites { .step }

    ```bash
    sudo apt update
    sudo apt install git wget flex bison gperf python3 python3-pip python3-venv cmake ninja-build ccache libffi-dev libssl-dev dfu-util libusb-1.0-0
    ```

    ## Download ESP-Hosted-Linux { .step }

    ```bash
    cd ~
    git clone https://github.com/espressif/esp-hosted-linux.git
    ```

    ## Prepare ESP-IDF[^4] { .step }

    ```bash
    cd ~/esp-hosted-linux/esp/esp_driver
    ./setup.sh
    . ./esp-idf/export.sh
    ```

    ## Build and flash the firmware { .step }

    ```bash
    cd network_adapter
    idf.py set-target <target>
    idf.py menuconfig
    ```

    Replace `<target>` with your chip's name in lowercase without the hyphen, e.g. `esp32c5`. For the ESP32-S31, use `idf.py --preview set-target esp32s31` instead.

    In the menu, go to **Example Configuration** > **Transport layer**, select **SPI interface** or **SDIO interface**, then save and exit using the keys shown at the bottom of the menu.

    Connect the DevKit to a USB port on the Pi with a USB cable, then find its serial port:

    ```bash
    ls /dev/ttyUSB* /dev/ttyACM*
    ```

    Build and flash, replacing `/dev/ttyUSB0` with the port you found:

    ```bash
    idf.py -p /dev/ttyUSB0 build flash
    ```

    ## Configure the Pi { .step }

    ```bash
    sudo nano /boot/firmware/config.txt
    ```

    Add this line at the end, then save and exit:

    === "SPI"

        ```text
        dtparam=spi=on
        ```

    === "SDIO"

        ```text
        dtoverlay=sdio,poll_once=off
        ```

    Reboot to apply it:

    ```bash
    sudo reboot
    ```

    ## Build and load the driver { .step }

    ```bash
    cd ~/esp-hosted-linux/host
    ```

    === "SPI"

        ```bash
        ./rpi_init.sh spi
        ```

    === "SDIO"

        ```bash
        ./rpi_init.sh sdio
        ```

    ## Find the new interface { .step }

    ```bash
    nmcli device
    ```

    A new `wifi` device appears, usually named `wlan1`. Use this name in the next steps.

    ## Load the driver at boot { .step }

    Create a service that loads the driver at every boot:

    ```bash
    sudo nano /etc/systemd/system/esp-hosted-linux.service
    ```

    Add these lines. Replace `<username>` with your username, and replace `spi` with `sdio` if you use SDIO:

    ```ini
    [Unit]
    Description=ESP-Hosted-Linux driver

    [Service]
    Type=oneshot
    RemainAfterExit=yes
    Environment=ESP_HOSTED_INCREMENTAL=1
    ExecStart=/home/<username>/esp-hosted-linux/host/rpi_init.sh spi

    [Install]
    WantedBy=multi-user.target
    ```

    `ESP_HOSTED_INCREMENTAL=1` makes the script reuse the driver you built in the previous step instead of building it again. It only recompiles when something has changed, such as after a kernel update.

    Enable the service and reboot:

    ```bash
    sudo systemctl daemon-reload
    sudo systemctl enable esp-hosted-linux.service
    sudo reboot
    ```

    After the reboot, check that the service ran and that `wlan1` is back:

    ```bash
    systemctl status esp-hosted-linux.service
    nmcli device
    ```

    To reload the driver later, run `sudo systemctl restart esp-hosted-linux.service`.

## Connect to the Wi-Fi network { .step }

These steps use `wlan1`. Replace it with your interface name if it's different.

List the networks the interface can see:

```bash
nmcli device wifi list ifname wlan1
```

Connect to your network, replacing `<SSID>` and `<password>` with its name and password:

```bash
sudo nmcli device wifi connect "<SSID>" password "<password>" ifname wlan1
```

NetworkManager saves the connection and reconnects automatically after a reboot.

## Verify the connection { .step }

```bash
nmcli device
```

`wlan1` should show `connected`, followed by the network name.

??? info "(Optional) Create a profile for quicker connection"
    A profile stores a network's settings under a name of your choice, so you can connect with a single command.

    ### Profile properties[^5]

    Wi-Fi networks are either **Personal** (one shared password, e.g. home Wi-Fi or a phone hotspot) or **Enterprise** (a personal login, e.g. eduroam or a company network).

    | Property | Used for | What to fill in |
    |----------|----------|-----------------|
    | `con-name` | All networks | A name for the profile, used later to connect |
    | `ifname` | All networks | The interface to use, e.g. `wlan1` |
    | `ssid` | All networks | The name of the Wi-Fi network |
    | `wifi-sec.key-mgmt` | All networks | The security type: `wpa-psk` for Personal networks, `wpa-eap` for Enterprise networks |
    | `wifi-sec.psk` | Personal | The Wi-Fi password |
    | `802-1x.eap` | Enterprise | The EAP authentication method, e.g. `peap` or `ttls` |
    | `802-1x.phase2-auth` | Enterprise | The inner authentication method, e.g. `mschapv2` |
    | `802-1x.identity` | Enterprise | Your login, usually your institutional username or email address |
    | `802-1x.anonymous-identity` | Enterprise | The outer identity, sent unencrypted, e.g. `anonymous@<institution-domain>` |
    | `802-1x.password` | Enterprise | Your institutional password |
    | `802-1x.ca-cert` | Enterprise | The path to your institution's CA certificate |
    | `802-1x.domain-suffix-match` | Enterprise | The domain name of your institution's authentication server |

    ### Example 1: Regular home Wi-Fi

    ```bash
    sudo nmcli connection add type wifi ifname wlan1 con-name <profile> ssid "<SSID>" \
      wifi-sec.key-mgmt wpa-psk \
      wifi-sec.psk "<password>"
    ```

    ### Example 2: eduroam

    ```bash
    sudo nmcli connection add type wifi ifname wlan1 con-name <profile> ssid eduroam \
      wifi-sec.key-mgmt wpa-eap \
      802-1x.eap peap \
      802-1x.phase2-auth mschapv2 \
      802-1x.identity "<username>" \
      802-1x.anonymous-identity "anonymous@<institution-domain>" \
      802-1x.password "<password>" \
      802-1x.ca-cert "<path-to-ca-cert>" \
      802-1x.domain-suffix-match "<server-domain>"
    ```

    !!! note
        The EAP method, inner authentication method, certificate and server domain differ between institutions. Consult the IT department for the eduroam settings and certificate at your institution.

    ### Connect with the profile

    ```bash
    sudo nmcli connection up <profile>
    ```

[^1]: <https://github.com/espressif/esp-hosted-linux>
[^2]: <https://github.com/espressif/esp-hosted-linux/blob/master/docs/reference/supported-hardware.md>
[^3]: <https://github.com/espressif/esp-hosted-linux/blob/master/docs/reference/raspberry-pi.md>
[^4]: <https://github.com/espressif/esp-hosted-linux/blob/master/docs/getting-started/build-and-flash.md>
[^5]: <https://networkmanager.dev/docs/api/latest/nm-settings-nmcli.html>
