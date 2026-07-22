# Lyra Vega - Enterprise Control Center

*[Leia em português](README.pt-br.md)*

Lyra Vega is a native control center for Linux: it brings together software,
hardware, kernel, network, backup, user, and service administration in a
single interface integrated with GNOME, instead of spreading these tasks
across `nmcli`, `systemctl`, config file editors, and a handful of
mismatched graphical tools. The goal isn't to replace GNOME Settings, but
to cover the range of system administration it leaves out — packages,
kernel, snapshots, firewall, users — with the same visual integration
quality.

The project is split into three parts. `vegad`, a separate daemon (Go),
runs as root and asks for your password via polkit — the same
authorization mechanism GNOME Settings uses — whenever an action actually
needs to touch the system: switching a driver, installing a package,
changing the network. Both interfaces talk to `vegad` through the same
well-defined D-Bus contract. On top of that shared backend there are two
interfaces, for two different contexts: `vega-gtk` (Rust +
GTK4/libadwaita), a graphical interface that runs as your regular user,
with no privileges; and `vega-cli` (bash + `dialog`), a terminal interface
for administering a server over SSH with no graphical environment at all.
Vega CLI has no application-menu launcher — it only runs from a terminal,
via `vega` — and always needs administrator privileges: if started without
them, it re-executes itself through `sudo`, which prompts for the user's
password.

Licensed under GPL-3.0. Code at [github.com/britors/Vega](https://github.com/britors/Vega).

## Features

- dashboard with system health and shortcuts;
- native software, Flatpak, and AUR, with updates and repositories;
- optional snapshots via Snapper or Timeshift, and backups via Restic;
- hardware, drivers, kernel, bootloader, storage, date and time;
- Wi-Fi, Bluetooth, firewall, VPN, proxy, and IPv4;
- users, services, logs, and an assistant with multiple AI providers;
- wallpaper picker, screen lock preferences, and a live system/process monitor.

## Installation

Same convenience installer for Arch, openSUSE Leap, Fedora, and
Ubuntu/Debian — it detects the distro automatically and downloads the
right package from the latest release:

```sh
curl -fsSL https://raw.githubusercontent.com/britors/Vega/main/scripts/install.sh | sudo bash
```

To pin a specific version: `VEGA_VERSION=v1.3.4 sudo -E bash install.sh`
(download the script first if you use this variant).

On a headless server managed only over SSH, skip the graphical interface
(and its GTK4/libadwaita dependency) and install just `vegad` + `vega-cli`:
`VEGA_CLI_ONLY=1 sudo -E bash install.sh` (or `sudo -E bash install.sh` if
downloaded first).

After installation, open Vega CLI in a terminal with `vega` — it has no
application-menu launcher and re-executes itself via `sudo` if not already
running as root.

None of the four distributions are in an official repository yet (no AUR,
OBS, Copr, or PPA), and packages aren't signed yet — privileged operations
should be validated carefully before each release.

## What already works

The graphical interface covers Dashboard, Software, Restore Points, Backup,
Hardware, Kernel, Storage, Date and Time, Screen (Wallpaper, Screen Lock),
System Monitor, Network/Firewall, Wi-Fi, Bluetooth, Users, Services, Logs,
Assistant, and About. Features that
depend on a tool that isn't installed (Snapper, firewalld, etc.) show up as
unavailable instead of breaking the screen.

`vega-cli`, the terminal interface, covers the same functional range minus
what doesn't make sense on a headless server: Dashboard, Software, Backup
and Restore Points, Hardware and Kernel, Users, Network and Firewall,
Services, Date/Time/Locale, Storage, System Log, and System Monitor
(values only, no graphs). Wi-Fi, Bluetooth, the AI Assistant, and Screen
are graphical-session concepts and are intentionally left out of this
interface.

## Tested distributions

Besides the four with an automated installer (Arch, Fedora, openSUSE Leap,
and Debian/Ubuntu, described in [Installation](#installation)), Vega has
been manually tested on:

- Fedora Workstation 44, Fedora KDE 44
- openSUSE Leap 16, openSUSE Tumbleweed
- Debian 13, Ubuntu 26.04
- MX Linux 25.2, Linux Mint 22.3, LMDE 7, Zorin OS 18.1, Pop!_OS 24.04,
  deepin 25 (Debian/Ubuntu derivatives)
- Rocky Linux 10, AlmaLinux 10 (RHEL derivatives)
- Arch Linux, CachyOS, EndeavourOS (Arch derivatives)

## Known limitations

- Software uses the distribution's package managers and Flatpak via
  subprocess; progress is reported per step, not per byte transferred.
- AUR (as an install origin inside the Software module) requires `yay` or
  `paru`, runs builds under the isolated `vega-build` user, and always shows
  the PKGBUILD before confirmation.
- Snapper and Timeshift are optional. Without one of these tools, Restore
  Points shows up as unavailable; advanced diff and retention features
  remain Snapper-specific.
- The NVIDIA driver on Fedora depends on RPM Fusion nonfree already being
  configured; Vega doesn't enable third-party repositories automatically.
- The Debian/Ubuntu backend doesn't manage PPAs via `add-apt-repository`
  yet. The firewall uses UFW when firewalld isn't present.

## Contributing

Want to run the project locally, understand the architecture, or open a
PR? See [`CONTRIBUTING.md`](CONTRIBUTING.md).
