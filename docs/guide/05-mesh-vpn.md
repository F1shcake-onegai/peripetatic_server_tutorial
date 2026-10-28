# 5. Install Mesh Network Configurator

mesh-config[^1] is a mesh network configurator. It puts the Pi's built-in Broadcom Wi-Fi, `wlan0`, into ad-hoc mode, so that each Pi becomes a node of the mesh network. It also helps bridge other interfaces, such as `eth0` or `wlan1`, into the mesh. This is why chapter 4 creates a second network interface.

The design is based on Mesh Underground's Raspberry Pi mesh network guide.[^2]

## Install mesh-config { .step }

```bash
sudo apt install git
git clone https://github.com/F1shcake-onegai/rpi_mesh_autodns
cd rpi_mesh_autodns && ./mesh-config.sh install
```

## Open the menu { .step }

```bash
sudo mesh-config
```

This opens an interactive menu, like `raspi-config`.

!!! tip "Using the menu"
    Press ++arrow-up++ and ++arrow-down++ to move, ++space++ to select an option in a list, ++tab++ to jump to `<Ok>` or `<Cancel>`, and ++enter++ to confirm.

## Set the node identity { .step }

Select **1 Identity**.

1. Enter the group name. Every Pi in the same mesh uses the same group name.
2. Enter the node ID. Every Pi in the mesh needs a different one. Your web page is at `<group>.mesh/<id>/`.
3. Enter a display name, or press ++enter++ to leave it empty.
4. At "Create user `<id>`?", select `<Yes>`, enter a password for this user twice, and press ++enter++.

The group name and the node ID use only lowercase letters and numbers, and they must be different.

## Set the uplink role { .step }

Select **3 Uplink**.

1. At the interface name, press ++enter++ to keep `auto`. mesh-config then uses the second network interface from chapter 4.
2. Select the role for the second network interface:

| Role | What the second network interface does | Then |
|---|---|---|
| `external` | Connects to a Wi-Fi network and shares its internet inside the mesh network. | Select the connection: `auto`, or the profile you created in chapter 4. |
| `ap` | Broadcasts an open access point, so that laptops can join the mesh network. | Press ++enter++ to keep the access point name `<group>-mesh`, then press ++enter++ to keep the channel `auto`. |
| `off` | Nothing. Select this if you skipped chapter 4. | — |

Select **9 Finish** to close the menu.

??? info "Update mesh-config"

    ```bash
    sudo mesh-config update
    ```

    mesh-config compares the installed version with `version.txt` in the GitHub repository, and installs the newer version if there is one.

## Troubleshooting

| Error | Reason | Resolution |
|---|---|---|
| `caddy is not installed: connect to the internet and run install again` | The Pi couldn't download Caddy during install. | Connect the Pi to the internet and run `./mesh-config.sh install` again. |
| `caddy.service does not read /etc/caddy/Caddyfile` | Caddy was installed without `apt`, so it has no service, or its service reads a different config file. | Set Caddy up as a service with Caddy's [Manual Installation](https://caddyserver.com/docs/running#manual-installation) guide, with `--config /etc/caddy/Caddyfile` in `ExecStart`. Run `sudo systemctl daemon-reload`, then run `./mesh-config.sh install` again. |
| `/etc/caddy does not exist` | Caddy was installed without `apt`, and the folder for its config file was never created. | Run `sudo mkdir /etc/caddy`, then run `./mesh-config.sh install` again. |
| `ID <id> is already used by another node on the mesh` | Another Pi on the mesh already uses this ID. | Choose a different ID in the menu (Identity), then restart the mesh. |

## Not yet implemented

1. Mesh network encryption

[^1]: <https://github.com/F1shcake-onegai/rpi_mesh_autodns>
[^2]: <https://meshunderground.com/posts/raspberry-pi-mesh-network-guide-build-a-resilient-wireless-network/>
