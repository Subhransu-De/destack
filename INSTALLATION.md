# Installation

This guide tells you how to install the Codex, Claude Code, Windows Terminal, Git Bash, Fastfetch, and MPV settings from this repository.

## Codex

### About the settings

Codex loads global configuration from `%USERPROFILE%\.codex` on Windows. The repository contains the portable authored configuration and excludes credentials, histories, project trust records, runtime-generated paths, installed plugins, caches, and other machine state.

The settings include:

- Luna as the default model with medium reasoning effort
- Never-ask approval with danger-full-access permissions
- Live web search and Code mode
- Exa MCP using the `EXA_API_KEY` environment variable
- Nord TUI styling and additional newline keys
- Git Bash, Cursor, Catppuccin code themes, and custom desktop colors
- Disabled feedback, telemetry export, and memories
- Global agent instructions and the local developer CLI inventory

### Requirements

- Codex CLI or the Codex desktop app
- Git Bash for the configured integrated terminal
- Cursor for the configured default open-in target
- An `EXA_API_KEY` environment variable if you use the Exa MCP server

### Install the Codex settings

1. Close Codex.
2. Open `%USERPROFILE%` in File Explorer.
3. If the `.codex` folder does not exist, create it.
4. If `%USERPROFILE%\.codex\config.toml.backup` exists, rename that older backup.
5. If `%USERPROFILE%\.codex\AGENTS.md.backup` exists, rename that older backup.
6. If `config.toml` exists, copy it to `config.toml.backup` in the same folder.
7. If `AGENTS.md` exists, copy it to `AGENTS.md.backup` in the same folder.
8. Copy `codex/config.toml` and `codex/AGENTS.md` from this repository into `%USERPROFILE%\.codex`.
9. Open the installed `AGENTS.md` and replace `<notion-parent-page-url>` with the required Notion parent URL, or remove the Notion instruction if it is not needed.
10. Start Codex.

Machine-managed MCP servers, app connectors, plugins, and per-project editor choices must be installed or configured separately on the target machine.

### Files

- `codex/config.toml` contains the portable model, permission, feature, MCP, TUI, desktop, telemetry, and memory settings.
- `codex/AGENTS.md` contains global instructions and the local developer CLI inventory.
- `codex/README.md` documents the export boundaries and shell-based installation option.

## Claude Code

### About the settings

Claude Code loads global configuration from `%USERPROFILE%\.claude` on Windows. The repository contains the authored settings and excludes credentials, histories, sessions, project state, caches, installed skills, and plugin state.

The settings include:

- Opus with a Sonnet fallback and high reasoning effort
- Bypass-permissions mode and retained `autoMode` safety policies
- Disabled automatic memory and Claude AI connectors
- Auto-compaction and a 10-year cleanup period
- Worktree, checkpointing, terminal progress, and agent-team preferences
- A Bun-powered status line and a chat submit keybinding
- Global instructions with imported Codex CLI background-run guidance

### Requirements

- Claude Code
- Bun for the status line
- Codex CLI if you use the imported Codex execution and review instructions

### Install the Claude Code settings

1. Close Claude Code.
2. Open `%USERPROFILE%` in File Explorer.
3. If the `.claude` folder does not exist, create it.
4. Back up any same-named `CLAUDE.md`, `codex-cli.md`, `settings.json`, `keybindings.json`, and `statusline.ts` files in `%USERPROFILE%\.claude`.
5. Copy those five files from the repository's `claude` folder into `%USERPROFILE%\.claude`.
6. Open the installed `settings.json` and replace `<aws-profile>` with the AWS profile to use, or remove that environment line if AWS is not used.
7. Review the permission and `autoMode` policies because they describe authenticated tools and live infrastructure.
8. Start Claude Code.

### Files

- `claude/CLAUDE.md` contains global instructions and imports `codex-cli.md`.
- `claude/codex-cli.md` contains non-interactive Codex CLI execution and review guidance.
- `claude/settings.json` contains model, permission, safety, worktree, and interface preferences.
- `claude/keybindings.json` contains the chat submit binding.
- `claude/statusline.ts` contains the custom status line.
- `claude/README.md` documents the export boundaries and shell-based installation option.

## Windows Terminal

### About the settings

Windows Terminal loads `settings.json` from the `LocalState` folder for the installed Terminal edition.

Use this folder for Windows Terminal Stable:

```text
%LOCALAPPDATA%\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState
```

Use this folder for Windows Terminal Preview:

```text
%LOCALAPPDATA%\Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState
```

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
4. Open the `windows_terminal` folder in this repository.

### Install for Windows Terminal Stable

1. Open the Stable `LocalState` folder shown in the About the settings section.
2. If `settings.json.backup` exists, rename that older backup file.
3. If `settings.json` exists, copy it to `settings.json.backup` in the same folder.
4. Copy `windows_terminal/settings.json` from this repository into the `LocalState` folder.
5. If Windows asks to replace the file, select **Replace the file in the destination**.
6. Start Windows Terminal Stable.

### Install for Windows Terminal Preview

1. Open the Preview `LocalState` folder shown in the About the settings section.
2. If `settings.json.backup` exists, rename that older backup file.
3. If `settings.json` exists, copy it to `settings.json.backup` in the same folder.
4. Copy `windows_terminal/settings.json` from this repository into the `LocalState` folder.
5. If Windows asks to replace the file, select **Replace the file in the destination**.
6. Start Windows Terminal Preview.

### Install only the Git Bash integration

If you do not install `bash_setup/.bashrc`, use these steps. The Git Bash settings already contain the Windows Terminal integration.

1. Close all Git Bash windows.
2. Open `%USERPROFILE%` in File Explorer.
3. If `.bashrc` exists, copy it to `.bashrc.backup` in the same folder.
4. If `.bashrc` does not exist, create an empty `.bashrc` file.
5. Open `.bashrc` in a text editor.
6. Add one blank line at the end of the file.
7. Copy all text from `windows_terminal/git-bash-integration.bash` to the end of `.bashrc`.
8. Save `.bashrc`.
9. Start Git Bash in Windows Terminal.

### Backup and recovery

The manual installation steps create a backup file before you replace the live settings. The backup file stays in the same `LocalState` folder.

```text
settings.json.backup
```

Use these steps to restore a backup file:

1. Close the applicable Windows Terminal edition.
2. Open its `LocalState` folder.
3. Select `settings.json.backup`.
4. Copy the backup file to `settings.json` in the same folder.

Start Windows Terminal after the installation or recovery is complete.

### Files

- `windows_terminal/settings.json` contains the profiles, appearance, and keyboard shortcuts.
- `windows_terminal/git-bash-integration.bash` reports the prompt and current folder to Windows Terminal.

The repository does not contain runtime state, command history, generated backup files, or shell history.

## Git Bash

### About the settings

Git Bash loads `.bash_profile` and `.bashrc` from `%USERPROFILE%`. The `.bashrc` file loads all readable `.sh` files from `%USERPROFILE%\bash_scripts`.

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
- zoxide
- Fastfetch

The settings can also use MPV, Bun, Codex, Claude, Cursor Agent, OpenCode, Pi, rejoin, Terraform, Maven, Rust, Go, Python, and yt-dlp.

If you use the MPV aliases, make sure that `mpv.exe` is available through `PATH`.

The Fastfetch settings in this repository contain the random logos that `.bash_profile` uses.

### Prepare the system

1. Install Git for Windows, zoxide, and Fastfetch.
2. Close all Git Bash windows.
3. Open the `bash_setup` folder in this repository.

### Install the Bash settings

If a backup name already exists, rename that older backup file before you continue.

1. Open `%USERPROFILE%` in File Explorer.
2. If `.bash_profile` exists, copy it to `.bash_profile.backup` in the same folder.
3. If `.bashrc` exists, copy it to `.bashrc.backup` in the same folder.
4. Copy `bash_setup/.bash_profile` from this repository into `%USERPROFILE%`.
5. Copy `bash_setup/.bashrc` from this repository into `%USERPROFILE%`.
6. If Windows asks to replace a startup file, select **Replace the file in the destination**.
7. If `%USERPROFILE%\bash_scripts` does not exist, create the folder.
8. Open `bash_setup/scripts` in this repository.
9. Back up each same-named file that exists in `%USERPROFILE%\bash_scripts`.
10. Copy `alias.sh`, `env.sh`, and `zoxide.sh` into `%USERPROFILE%\bash_scripts`.
11. Start Git Bash.

The installation does not delete helper scripts that exist only in `%USERPROFILE%\bash_scripts`.

### Backup and recovery

The manual installation steps create backup files before you replace the live files. Each backup stays beside its live file.

The backup files use these names:

```text
.bashrc.backup
.bash_profile.backup
alias.sh.backup
```

Use these steps to restore a backup file:

1. Close all Git Bash windows.
2. Select the required backup file.
3. Copy the backup file over the related live file.
4. Start Git Bash.

### Files

- `bash_setup/.bash_profile` starts login-shell tools and Fastfetch.
- `bash_setup/.bashrc` loads helper scripts and Windows Terminal integration.
- `bash_setup/scripts/alias.sh` contains aliases and command functions.
- `bash_setup/scripts/env.sh` contains history, encoding, path, and zoxide exclusion settings.
- `bash_setup/scripts/zoxide.sh` contains the generated zoxide shell integration.

The repository does not contain shell history, zoxide data, generated backup files, or application caches.

## Fastfetch

### About the settings

Fastfetch loads these settings from `~/.config/fastfetch`.

The folder contains these files:

- `config.jsonc` contains the logo colors, layout, and system-information modules.
- `ascii.txt` contains the default logo.
- `ascii` contains 31 logos for random selection in Git Bash.
- `tools` contains optional Python tools and reference images for the logos.

The portable logo path uses `%USERPROFILE%`. When Fastfetch loads the settings, it expands this Windows environment variable.

### Requirements

- Fastfetch
- Git Bash for the random-logo code in `bash_setup/.bash_profile`
- Python, uv, and Pillow for the optional logo tools

### Install the Fastfetch settings

1. Close all Git Bash windows.
2. Open `%USERPROFILE%` in File Explorer.
3. If the `.config` folder does not exist, create it.
4. Open `%USERPROFILE%\.config`.
5. If `fastfetch.backup` exists, rename that older backup folder.
6. If `fastfetch` exists, copy it to `fastfetch.backup` in the same folder.
7. If `fastfetch` does not exist, create the folder.
8. Copy `fastfetch/config.jsonc` from this repository into the target folder.
9. Copy `fastfetch/ascii.txt` from this repository into the target folder.
10. Copy the `fastfetch/ascii` folder from this repository into the target folder.
11. Copy the `fastfetch/tools` folder from this repository into the target folder.
12. Start Git Bash.

You can also run `fastfetch` from another terminal.

### Backup and recovery

The manual installation steps create a complete backup of the current Fastfetch folder.

The backup folder uses this name:

```text
fastfetch.backup
```

Use these steps to restore the backup:

1. Close programs that use Fastfetch.
2. Open `%USERPROFILE%\.config`.
3. Rename the current `fastfetch` folder.
4. Rename the required backup folder to `fastfetch`.
5. Start a new terminal.

### Optional logo tools

Run the tools from the `fastfetch` folder. Read `fastfetch/tools/README.md` for the available commands.

### Excluded data

The backup does not contain `.ruff_cache`, shell history, zoxide data, application caches, or installed programs.

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
