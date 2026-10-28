# 3. Configure zram

Since Raspberry Pi OS Trixie (released 2 October 2025), zram is built in. The `rpi-swap` package sets up compressed swap on `/dev/zram0` automatically at boot.[^1]<br>
The `zram-tools` method sets up its own zram swap and conflicts with `rpi-swap`. Instead, configure zram with a drop-in file as shown below.

## Remove zram-tools (optional) { .step-0 }

If you tried installing `zram-tools`, run:

```bash
sudo apt purge zram-tools
```

## Drop-in file structure

`rpi-swap` reads its defaults from `/etc/rpi/swap.conf`. To avoid your changes being overridden and accidentally breaking setups, create a drop-in file in `/etc/rpi/swap.conf.d/` instead of editing the main file. Drop-ins override the main file and are read in filename order. If more than one drop-in sets the same property, the file read last takes precedence. The `90-` prefix makes `90-local.conf` load after lower-numbered files.[^2]

A drop-in has up to three sections. Include only the sections and properties you want to change; everything else keeps its default.

```ini
[Main]
Mechanism=...

[Zram]
FixedSizeMiB=...

[File]
FixedSizeMiB=...
```

### [Main]

| Property | Values | Default | Meaning |
|----------|--------|---------|---------|
| `Mechanism` | `auto`, `swapfile`, `zram`, `zram+file`, `none` | `auto` | Which kind of swap to use. `auto` lets `rpi-swap` choose. `zram+file` uses compressed RAM and writes idle pages to a file on disk. `zram` uses RAM only. `swapfile` is a traditional swap file. `none` disables swap. |

### [Zram]

| Property | Default | Meaning |
|----------|---------|---------|
| `RamMultiplier` | `1` | zram capacity as a multiple of your RAM. `1` means a capacity equal to your RAM. |
| `MaxSizeMiB` | `2048` | Upper limit on the size that `RamMultiplier` calculates |
| `FixedSizeMiB` | *(unset)* | Exact capacity in MiB. Overrides `RamMultiplier` and `MaxSizeMiB`. |
| `WritebackTrigger` | `auto` | How idle pages are moved to the file: `timer`, `manual` or `auto`. `auto` lets `rpi-swap` choose. |
| `WritebackInitialDelay` | `180min` | Wait after boot before the first writeback |
| `WritebackPeriodicInterval` | `24h` | Time between writebacks |

### [File]

The file at `/var/swap` stores the idle pages that zram writes back.

| Property | Default | Meaning |
|----------|---------|---------|
| `Path` | `/var/swap` | Location of the file |
| `RamMultiplier` | `1` | File size as a multiple of your RAM |
| `MaxSizeMiB` | `2048` | Upper limit on the file size |
| `MaxDiskPercent` | `50` | Upper limit as a percentage of available disk space |
| `FixedSizeMiB` | *(unset)* | Exact file size in MiB. Overrides the settings above. |

## Choosing a size

`FixedSizeMiB` is how much data zram can hold **before** compression. Because zram compresses that data 2–3×, a full zram uses much less real RAM:

```text
Real RAM used when full ≈ FixedSizeMiB ÷ 2 to 3
```

For example, a full 8192 MiB (8 GB) zram uses about 8 ÷ 3 to 8 ÷ 2 ≈ 2.7–4 GB of real RAM.

This is a chart of suggested zram size versus real RAM used when full. You can check your physical RAM size with:

```bash
free -h
```

| Pi RAM | Suggested `FixedSizeMiB` (1× RAM) | Real RAM used when full |
|--------|-----------------------------------|-------------------------|
| 1 GB | `1024` | about 0.3–0.5 GB |
| 2 GB | `2048` | about 0.7–1 GB |
| 4 GB | `4096` | about 1.3–2 GB |
| 8 GB | `8192` | about 2.7–4 GB |
| 16 GB | `16384` | about 5.3–8 GB |

!!! warning
    Values above 2× your RAM are not recommended, because poorly compressible data could then fill all of your memory.[^2] This will thrash the system instead of benefiting it.

## Create the drop-in { .step }

The example below is for an 8 GB Pi. Replace `8192` with the value for your Pi from the table above, and replace the parameters with those of your choice.

Create the directory and open the drop-in in nano:

```bash
sudo mkdir -p /etc/rpi/swap.conf.d
sudo nano /etc/rpi/swap.conf.d/90-local.conf
```

!!! tip "Using nano"
    nano is a simple text editor that runs in the terminal. Type or paste the text, then press ++ctrl+o++ and ++enter++ to save, and ++ctrl+x++ to exit.

Add these lines:

```ini
[Main]
Mechanism=zram+file

[Zram]
FixedSizeMiB=8192
```

(Optional) To make the file at `/var/swap` larger than its 2 GB default, add a `[File]` section with its own `FixedSizeMiB` to the same file, for example:

```ini
[File]
FixedSizeMiB=4096
```

## Reload system service { .step }

```bash
sudo systemctl daemon-reload
```

## Verify the configuration { .step }

After reloading, run:

```bash
zramctl
swapon --show
```

You should see `/dev/zram0` using `zstd`, with `DISKSIZE` matching the size you set (`8G` in the example above). You don't need to set `zstd` anywhere: it's already in use, and `rpi-swap` has no setting for the algorithm.

??? info "Advanced: Kernel parameters to make better use of zram"
    The Linux kernel can be tuned and tweaked to make better use of zram.[^5]

    ### Kernel parameters[^4]

    | Parameter | Default | Meaning |
    |-----------|---------|---------|
    | `vm.swappiness` | `60` | The relative I/O cost of swapping compared with dropping file cache, from `0` to `200`. At `100`, both are treated as equally costly. Higher values make the kernel prefer swapping. For in-memory swap such as zram, values above `100` can be considered. |
    | `vm.page-cluster` | `3` | How many consecutive pages are read from swap at once, as a power of 2 (`3` = 8 pages). `0` reads one page at a time, which disables swap readahead and lowers latency. `rpi-swap` already sets this to `0`. |
    | `vm.vfs_cache_pressure` | `100` | How readily the kernel reclaims memory used to cache directory and inode objects. Higher values reclaim it sooner; lower values keep it longer. `0` never reclaims it and can easily lead to out-of-memory conditions. Values significantly above `100` may hurt performance. |
    | `vm.dirty_background_ratio` | `10` | The percentage of available memory that can hold "dirty" pages (modified data not yet written to disk) before background threads start writing them to disk. |
    | `vm.dirty_ratio` | `20` | The percentage of available memory that can hold dirty pages before a process that is writing to disk must write them out itself. |
    | `vm.watermark_boost_factor` | `15000` | How much extra memory the kernel reclaims when memory becomes fragmented, in units of 1/10,000 of the high watermark (`15000` = 150%). `0` disables this. |
    | `vm.watermark_scale_factor` | `10` | How early the background reclaim thread (`kswapd`) wakes up, in units of 1/10,000 of memory (`10` = 0.1%). The maximum is `3000` (30%). Higher values start reclaiming earlier. |

    To check a value on your Pi, run `sysctl` with the parameter name, for example:

    ```bash
    sysctl vm.swappiness
    ```

    !!! note
        Debian 13 (and Raspberry Pi OS Trixie) no longer reads `/etc/sysctl.conf`. Put kernel parameters in a file under `/etc/sysctl.d/` instead.[^3]

    ### Create the configuration file { .step }

    Create `/etc/sysctl.d/99-zram.conf` with `sudo nano /etc/sysctl.d/99-zram.conf` and add these lines:

    ```ini
    vm.vfs_cache_pressure = 500
    vm.swappiness = 100
    vm.dirty_background_ratio = 1
    vm.dirty_ratio = 50
    vm.watermark_boost_factor = 0
    vm.watermark_scale_factor = 125
    vm.page-cluster = 0
    ```

    ### Apply the parameters { .step }

    Reboot your system, or enable the new parameters with:

    ```bash
    sudo sysctl --system
    ```

## Next

Continue with the track for your setup:

[Student Kit](04-second-interface.md){ .md-button } [School Server](04-ai-hat.md){ .md-button }

[^1]: <https://github.com/raspberrypi/rpi-swap>
[^2]: `man swap.conf`, also at <https://github.com/raspberrypi/rpi-swap/blob/main/man/man5/swap.conf.5>
[^3]: <https://www.debian.org/releases/trixie/release-notes/issues.en.html#etc-sysctl-conf-is-no-longer-honored>
[^4]: <https://www.kernel.org/doc/html/v6.12/admin-guide/sysctl/vm.html>
[^5]: <https://github.com/garyexplains/examples/blob/master/how_to_enable_ZRAM_Raspberry_Pi.md>
