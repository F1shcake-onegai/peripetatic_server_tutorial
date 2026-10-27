# 1. Set Up Raspberry Pi OS

=== "Using Raspberry Pi Imager"

    **Step 1: Install Raspberry Pi Imager**[^1]

    Download the installer for your computer's OS from <https://www.raspberrypi.com/software/>.

    - **Windows:** run the downloaded `imager_*.exe` and follow the installer.
    - **macOS:** open the downloaded `imager_*.dmg` and drag **Raspberry Pi Imager** into **Applications**.
    - **Linux (x86_64):** make the downloaded AppImage executable, then run it in the terminal:

        ```bash
        chmod +x imager_*_amd64.AppImage
        ./imager_*_amd64.AppImage
        ```

    **Step 2: Insert the microSD card**

    Insert the microSD card into your computer's card slot, or into a USB card reader connected to the computer.

    **Step 3: Launch Raspberry Pi Imager**

    **Step 4: Select the device**

    On the **Device** tab, select your Raspberry Pi model, then select **Next**.

    **Step 5: Select the operating system**

    On the **OS** tab, select the operating system, then select **Next**.

    ??? question "What OS do I need to install?"
        If you have a Raspberry Pi 4, 4B, etc., and want the benefit of a graphical interface, choose the recommended **Raspberry Pi OS (64-bit)**.

        If you have a Raspberry Pi Zero 2 W, or wish to run it as a headless server, go to **Raspberry Pi OS (Other)** > select **Raspberry Pi OS Lite (64-bit)**.

        For other devices, choose the one with the corresponding architecture.

    **Step 6: Select the storage**

    On the **Storage** tab, select the microSD card, then select **Next**. Identify the card by its size, and keep **Exclude system drives** turned on to avoid erasing your computer's own drive by mistake.

    **Step 7: Customize the OS (recommended)**

    This step is recommended to skip first-time customization during boot. It is a necessary step if you wish to use this Raspberry Pi headless without peripherals.

    - **Hostname:** enter a name using only letters, numbers and hyphens. Other devices can reach the Pi at `<hostname>.local`.
    - **Localisation:** choose a capital city. Imager fills in the time zone and keyboard layout, which you can change separately. The city also sets the Wi-Fi regulatory domain.
    - **User:** enter a username and password. The username must be lowercase and can contain letters, numbers, underscores and hyphens.
    - **Wi-Fi:** choose a secure or open network and enter the **SSID**. For a secure network, enter the password. Turn on **Hidden SSID** if the network doesn't broadcast its name.

        !!! note
            eduroam requires separate logins and certificates on top of the SSID and password. It cannot be configured via Raspberry Pi Imager.

            It can be configured later in the terminal, but the Pi needs another way to connect first:

            - **Another Wi-Fi network**, such as a home network or a phone hotspot, entered in the Wi-Fi settings above
            - **An Ethernet cable** connected to a router
            - **A keyboard and monitor** connected directly to the Pi

            Consult the IT department for the eduroam settings and certificate at your institution.

    - **Remote Access:** turn on **Enable SSH**, then choose password authentication or public key authentication. For a public key, paste it in or select **Browse** to find the key file.

    **Step 8: Write the image and validate**

    After all settings are configured, you can review a summary of your choices in the **Writing** tab. If this information is correct, select **Write** in the bottom-right corner of Imager. When Imager warns that all data on the card will be erased, select **I understand, erase and write**. If you see a prompt asking for administrator permission, grant the permissions to proceed.

    This process will take a few minutes based on the speed of the card reader you are using.

    **Step 9: Finish**

    When the **Done** tab appears, select **Finish** and remove the microSD card.

=== "Using Rufus (Windows)"

=== "Using dd (Linux / macOS)"

[^1]: <https://www.raspberrypi.com/documentation/computers/getting-started.html>
