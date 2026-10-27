# 2. Update and Upgrade

**Step 1: Update the package list**

```bash
sudo apt update
```

This downloads the latest list of available packages and versions. It doesn't install anything yet.

**Step 2: Upgrade the installed packages**

```bash
sudo apt full-upgrade
```

When prompted `Do you want to continue? [Y/n]`, press ++y++ and then ++enter++. This also updates the Linux kernel and firmware. Use `full-upgrade` rather than `upgrade`, because Raspberry Pi OS changes package dependencies more often than Debian does.[^1]

!!! note "Not enough disk space?"
    If `full-upgrade` reports that it needs more space, check your free space with:

    ```bash
    df -h
    ```

    To make room, delete old downloaded package files with:

    ```bash
    sudo apt clean
    ```

**Step 3: Reboot**

```bash
sudo reboot
```

[^1]: <https://www.raspberrypi.com/documentation/computers/os.html>
