# 7-a. Download Website Files (Static)

Your website files are hosted at `/home/<id>/public` on the Pi. Caddy serves `index.html` by default. Replace `<id>` with your node ID from chapter 5.

=== "Using git (Recommended)"

    ## Clone your repository { .step }

    ```bash
    sudo -u <id> git clone <repository-url> /home/<id>/public
    ```

    Replace `<repository-url>` with the address of your GitHub repository, e.g. `https://github.com/<github-username>/<repository>`.

    ??? info "Update your website files"

        ```bash
        sudo -u <id> git -C /home/<id>/public pull
        ```

        This downloads the latest version of your repository.

=== "Using scp"

    ## Copy the folder to the Pi { .step }

    On your computer, open Terminal (macOS, Linux) or PowerShell (Windows), and run:

    ```bash
    scp -r <folder> <username>@<hostname>.local:
    ```

    Replace `<folder>` with the path to your website folder, and `<username>` and `<hostname>` with the ones you set in chapter 1. The folder is copied to your home folder on the Pi.

    ## Move the files into your website folder { .step }

    On the Pi, run:

    ```bash
    sudo cp -r ~/<folder-name>/. /home/<id>/public/
    sudo chown -R <id>: /home/<id>/public
    ```

    Replace `<folder-name>` with the name of the folder you copied.

    To update your website, repeat both steps.

## Make website files readable { .step }

```bash
sudo chmod 711 /home/<id>
```

## Start the mesh { .step }

!!! warning
    Starting the mesh takes `wlan0` away from your Wi-Fi network. If you are connected to the Pi over Wi-Fi, the connection drops. Start the mesh from a keyboard and screen, or over Ethernet.

```bash
sudo mesh-config
```

Select **2 Mesh**, then **1 Start**. When the mesh is on, the menu shows "Mesh is on" and the Pi's address in the mesh network.

Select **9 Finish** to close the menu.

??? info "Stop the mesh"

    ```bash
    sudo mesh-config
    ```

    Select **2 Mesh**, then **2 Stop**. The menu shows "Mesh is off", and `wlan0` reconnects to your Wi-Fi network.

??? info "Start the mesh automatically at startup"

    ```bash
    sudo mesh-config
    ```

    Select **2 Mesh**, then:

    - **4 Enable** to start the mesh every time the Pi starts. The menu shows "Mesh enabled at boot".
    - **5 Disable** to stop starting it automatically. The menu shows "Mesh disabled at boot".
