# Installation

This guide tells you how to install the Windows Terminal, Git Bash, and MPV settings from this repository.

## Windows Terminal

### About the installer

`windows_terminal/install.ps1` copies the stored settings to Windows Terminal. This operation is a one-way restore from the repository to the system.

The script does these tasks:

1. The script selects Windows Terminal Stable by default.
2. The `-Preview` option selects Windows Terminal Preview.
3. The script makes sure that the stored settings and the Terminal data folder exist.
4. If live settings exist, the script creates a timestamped backup file.
5. The script replaces the live settings with `windows_terminal/settings.json`.
6. The optional `-InstallGitBashIntegration` switch adds the Git Bash integration to `.bashrc`.
7. If `.bashrc` already contains its marker, the script does not add the integration.

The script does not copy live settings into this repository. It does not install Windows Terminal, Git, PowerShell, Ubuntu, or the font.

### Included settings

- Git Bash is the default profile. It starts as an interactive login shell with `MSYSTEM=MINGW64`.
- PowerShell 7 starts with `pwsh.exe -NoLogo`.
- The settings contain a stored Ubuntu 24.04 profile.
- The terminal uses the Catppuccin Mocha color scheme.
- The terminal uses JetBrains Mono Nerd Font at 11 pt with semi-bold text.
- The terminal uses an acrylic background with 95% opacity.
- Copy-on-select copies plain text.
- The duplicate-pane action opens a copy of the current pane.
- `Shift+Enter` and `Alt+Enter` send separate terminal input codes.

The profile GUIDs in `settings.json` are stable identifiers. They do not contain a username, machine name, device ID, or system path.

### Requirements

- Windows Terminal Stable or Windows Terminal Preview
- Git for Windows
- PowerShell 7
- JetBrainsMono Nerd Font Mono

If you use the Ubuntu profile, install Ubuntu 24.04 through WSL.

### Prepare the system

1. Install the required software.
2. Start the selected Windows Terminal edition one time.
3. Close the selected Windows Terminal edition.
4. Open PowerShell in the root folder of this repository.

### Install for Windows Terminal Stable

Run this command to install the Stable settings and the Git Bash integration:

```powershell
.\windows_terminal\install.ps1 -InstallGitBashIntegration
```

Run this command to install only the Stable settings:

```powershell
.\windows_terminal\install.ps1
```

### Install for Windows Terminal Preview

Run this command to install the Preview settings and the Git Bash integration:

```powershell
.\windows_terminal\install.ps1 -Preview -InstallGitBashIntegration
```

Run this command to install only the Preview settings:

```powershell
.\windows_terminal\install.ps1 -Preview
```

### Preview the operation

Run this command to show the planned changes for Stable:

```powershell
.\windows_terminal\install.ps1 -InstallGitBashIntegration -WhatIf
```

Run this command to show the planned changes for Preview:

```powershell
.\windows_terminal\install.ps1 -Preview -InstallGitBashIntegration -WhatIf
```

The `-WhatIf` option does not replace the live settings. It also does not change `.bashrc`.

### Backup and recovery

If live settings exist, the script creates a backup file before it replaces them. The backup file stays in the same `LocalState` folder.

```text
settings.json.backup-20260823-143000
```

Use these steps to restore a backup file:

1. Close the applicable Windows Terminal edition.
2. Open its `LocalState` folder.
3. Select the required timestamped backup file.
4. Copy the backup file to `settings.json` in the same folder.

Start Windows Terminal after the installation or recovery is complete.

### Files

- `windows_terminal/settings.json` contains the profiles, appearance, and keyboard shortcuts.
- `windows_terminal/git-bash-integration.bash` reports the prompt and current folder to Windows Terminal.
- `windows_terminal/install.ps1` installs the settings for Stable or Preview and creates backup files.

The repository does not contain runtime state, command history, generated backup files, or shell history.

## Git Bash

### About the installer

`bash_setup/install.ps1` copies the stored settings to the current Windows user profile. This operation is a one-way restore from the repository to the system.

The script does these tasks:

1. The script makes sure that `.bash_profile`, `.bashrc`, and the helper folder exist in the repository.
2. If live startup files exist, the script creates timestamped backup files.
3. The script replaces the live `.bash_profile` and `.bashrc` files.
4. If `~/bash_scripts` does not exist, the script creates it.
5. If a helper script has the same name, the script creates a backup file.
6. The script copies each stored `.sh` file into `~/bash_scripts`.

The script does not copy live settings into this repository. It does not delete helper scripts that exist only in `~/bash_scripts`.

### Included settings

- Active Bash sessions share command history.
- Python uses UTF-8 mode.
- The zoxide settings exclude source-control, dependency, cache, and build folders.
- Zoxide supplies the `z` and `zi` commands.
- When a random ASCII file exists, interactive login shells show it with Fastfetch.
- Windows Terminal receives prompt, command, exit-status, and current-folder information.
- The alias file contains navigation, development, update, agent, and Terraform commands.
- The Codex aliases use Bun to run the installed Codex JavaScript file.

The `omnigit` alias contains generic name and email placeholders. Replace these placeholders before you use the alias.

### Requirements

- Git for Windows
- PowerShell
- zoxide
- Fastfetch

The settings can also use MPV, Bun, Codex, Claude, Cursor Agent, OpenCode, Pi, rejoin, Terraform, Maven, Rust, Go, Python, and yt-dlp.

If you use the MPV aliases, make sure that `mpv.exe` is available through `PATH`.

If you use random Fastfetch logos, store the text files in `~/.config/fastfetch/ascii`.

### Prepare the system

1. Install Git for Windows, PowerShell, zoxide, and Fastfetch.
2. Close all Git Bash windows.
3. Open PowerShell in the root folder of this repository.

### Install the Bash settings

Run this command:

```powershell
.\bash_setup\install.ps1
```

Start Git Bash after the installation is complete.

If Git Bash is open, run this command to load the new settings:

```bash
source ~/.bashrc
```

### Preview the operation

Run this command to show the planned changes:

```powershell
.\bash_setup\install.ps1 -WhatIf
```

The `-WhatIf` option does not replace startup files or helper scripts. It also does not create backup files.

### Backup and recovery

If a target file exists, the script creates a timestamped backup file before replacement. The backup file stays beside the target file.

The backup names use these patterns:

```text
.bashrc.backup-20260823-143000
.bash_profile.backup-20260823-143000
alias.sh.backup-20260823-143000
```

Use these steps to restore a backup file:

1. Close all Git Bash windows.
2. Select the required timestamped backup file.
3. Copy the backup file over the related live file.
4. Start Git Bash.

### Files

- `bash_setup/.bash_profile` starts login-shell tools and Fastfetch.
- `bash_setup/.bashrc` loads helper scripts and Windows Terminal integration.
- `bash_setup/scripts/alias.sh` contains aliases and command functions.
- `bash_setup/scripts/env.sh` contains history, encoding, path, and zoxide exclusion settings.
- `bash_setup/scripts/zoxide.sh` contains the generated zoxide shell integration.
- `bash_setup/install.ps1` installs the startup files and helper scripts.

The repository does not contain shell history, zoxide data, generated backup files, or application caches.

## MPV

### About the settings

The installed MPV build loads these settings from an `mpv` folder beside `mpv.exe`.

The folder contains these files:

- `mpv.conf` contains playback, window, subtitle, online-video, GIF, and GPU settings.
- `input.conf` contains menu, volume, subtitle, seek, playlist, aspect-ratio, and rotation keys.
- `fonts.conf` contains the Fontconfig settings supplied with the installed build.
- `LICENSE.quality-menu.md` contains the license for the quality-menu script.
- `scripts/quality-menu.lua` adds video-format and audio-format menus for online media.
- `script-opts/quality-menu.conf` contains the menu keys, style, columns, and sort order.

The quality-menu script is version 4.2.1. The script comes from [mpv-quality-menu](https://github.com/christoph-heinrich/mpv-quality-menu) and uses the GPL-2.0-only license.

### Requirements

- MPV 0.39.0 or later
- yt-dlp for online media and format menus
- A Vulkan-capable NVIDIA GPU for the `nvidia-quality` profile

### Install the MPV settings

1. Close MPV.
2. Open the folder that contains `mpv.exe`.
3. If an `mpv` settings folder exists, create a backup of that folder.
4. Create an `mpv` folder beside `mpv.exe`.
5. Copy `fonts.conf`, `input.conf`, `mpv.conf`, `LICENSE.quality-menu.md`, `script-opts`, and `scripts` into the new folder.
6. Start MPV.

If your MPV build uses a different settings folder, copy the same files into that folder.

If you use the `nvidia-quality` profile, replace `YOUR_NVIDIA_GPU_NAME` with the exact Vulkan device name. Then uncomment that line.

Start that profile with this command:

```powershell
mpv.exe --profile=nvidia-quality <MEDIA_FILE>
```

### Main keys

- `Shift+c` opens the chapter menu.
- `Ctrl+f` opens the video-format menu.
- `Ctrl+Alt+f` opens the audio-format menu.
- The arrow keys seek or change the volume.
- `Ctrl+MouseWheel` changes the subtitle size.
- `p` and `n` select the previous or next playlist item.

### Excluded data

The backup does not contain `watch_later`, playback history, caches, logs, executables, media files, or updater files.
