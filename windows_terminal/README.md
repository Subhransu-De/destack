# Windows Terminal setup

A portable export of the Windows Terminal appearance, profiles, keyboard
shortcuts, and Git Bash shell integration.

## What is included

- Git Bash as the default profile
- PowerShell 7 profile
- Catppuccin Mocha colors
- JetBrains Mono Nerd Font, 11 pt, semi-bold
- Acrylic background at 95% opacity
- Copy-on-select and plain-text copy
- Duplicate-pane support that keeps the current Git Bash directory
- `Shift+Enter` and `Alt+Enter` terminal input mappings

The profile GUIDs in `settings.json` are stable application/profile identifiers.
They do not encode a username, machine name, device ID, or filesystem path.

## Requirements

- Windows Terminal
- Git for Windows
- PowerShell 7
- JetBrainsMono Nerd Font Mono

## Install

Close Windows Terminal, open PowerShell in this folder, and run:

```powershell
.\install.ps1 -InstallGitBashIntegration
```

The installer uses `%LOCALAPPDATA%` and `%USERPROFILE%` at runtime. It backs up
existing Terminal settings before replacing them and avoids adding the Git Bash
integration more than once.

For Windows Terminal Preview, use:

```powershell
.\install.ps1 -Preview -InstallGitBashIntegration
```

To inspect the operations without changing anything:

```powershell
.\install.ps1 -InstallGitBashIntegration -WhatIf
```

Restart Windows Terminal after installation.

## Files

- `settings.json`: portable Windows Terminal configuration
- `git-bash-integration.bash`: prompt and current-directory reporting for Git Bash
- `install.ps1`: backup-aware installer for stable or preview Terminal

Runtime files such as Terminal state, command history, generated backups, and
shell history are intentionally excluded.
