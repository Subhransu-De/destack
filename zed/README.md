# Zed

Portable user configuration for Zed on Windows, copied from the authored files under `%APPDATA%\Zed`.

## What is included

- `settings.json`: editor, formatter, appearance, panel, terminal, telemetry, trust, agent preferences, and automatic extension installation
- `keymap.json`: workspace, editor, and pane key bindings
- `AGENTS.md`: personal instructions for Zed's commit-message generation and agent context

The source `themes` folder is empty, and no user tasks or snippets are currently configured.

## Extensions

Zed automatically installs the current extension set declared in `settings.json`: Astro, Catppuccin, Catppuccin Icons, Dockerfile, Git Firefly, HTML, Java, LaTeX, Log, Make, PowerShell, SQL, Terraform, TOML, and XML.

## Install

Close Zed, back up the same-named files under `%APPDATA%\Zed`, copy these three configuration files there, and restart Zed.

## Intentionally excluded

The nested Git repository, `.gitignore`, configuration wiki and guide, downloaded extension packages and extension work data, account state, conversations, threads, databases, logs, crash-handler files, temporary files, language servers, external-agent state, and other generated runtime data are excluded.
