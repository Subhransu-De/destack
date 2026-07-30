# Bash setup

A portable Git Bash configuration containing startup files, aliases, environment
settings, zoxide initialization, and Windows Terminal shell integration.

## What is included

- Shared command history between active Bash sessions
- UTF-8 mode for Python
- zoxide-powered directory navigation
- Fastfetch on interactive login when installed
- Development, agent, language-update, and Terraform aliases
- Windows Terminal prompt and current-directory reporting
- Backup-aware PowerShell installer

The export uses `$HOME`, `$LOCALAPPDATA`, and command discovery at runtime. It
does not contain a username, machine name, personal Git identity, fixed user
profile path, credentials, or shell history.

## Requirements

- Git for Windows
- PowerShell
- Optional: zoxide, Fastfetch, JetBrains Mono Nerd Font, and the CLIs referenced
  by aliases

## Install

Close Git Bash, open PowerShell in this folder, and run:

```powershell
.\install.ps1
```

Existing `.bash_profile`, `.bashrc`, and matching helper scripts are backed up
with a timestamp before replacement.

Preview the operations without changing anything:

```powershell
.\install.ps1 -WhatIf
```

After installation, restart Git Bash or run:

```bash
source ~/.bashrc
```

## Files

- `.bash_profile`: login-shell startup
- `.bashrc`: helper loading and Windows Terminal integration
- `scripts/aliases.sh`: aliases and command helpers
- `scripts/env.sh`: history, encoding, and portable PATH setup
- `scripts/zoxide.sh`: zoxide initialization
- `install.ps1`: backup-aware installer

Shell history, Git identity, tokens, generated zoxide data, and application
caches are intentionally excluded.
