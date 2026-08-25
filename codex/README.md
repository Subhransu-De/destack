# Codex

Portable global configuration for Codex CLI and the Codex desktop app, containing authored settings and global agent instructions.

## What is included

- Luna as the default model with medium reasoning effort and a pragmatic personality
- Never-ask approval with danger-full-access permissions
- Live web search, Code mode, multi-agent support, network proxying, and idle-sleep prevention
- Exa MCP configuration that reads its API key from the `EXA_API_KEY` environment variable
- Disabled feedback, OpenTelemetry export, and memories
- Nord TUI theme, rate-limit and context status fields, and extra newline keybindings
- Git Bash as the integrated desktop terminal, Cursor as the default editor, Catppuccin code themes, and custom light and dark chrome colors
- Global agent instructions and a local developer CLI inventory

The export replaces the Notion parent page URL with `<notion-parent-page-url>`. It does not contain credentials, OAuth tokens, chat or transcription history, project trust entries, personal project paths, connector identifiers, or generated runtime paths.

## Requirements

- Codex CLI or the Codex desktop app
- Git Bash for the configured integrated terminal
- Cursor for the configured default open-in target
- The `EXA_API_KEY` environment variable if you use the Exa MCP server

## Install

Back up the existing files first if they exist, then copy the configuration into `~/.codex/`:

```bash
mkdir -p ~/.codex
cp ~/.codex/config.toml ~/.codex/config.toml.bak 2>/dev/null || true
cp ~/.codex/AGENTS.md ~/.codex/AGENTS.md.bak 2>/dev/null || true
cp config.toml AGENTS.md ~/.codex/
```

Edit `~/.codex/AGENTS.md` and replace `<notion-parent-page-url>` with the Notion page URL you want documentation placed under, or remove that instruction if you do not use Notion.

Restart Codex to load the new configuration.

## Files

- `config.toml`: model, permissions, feature flags, MCP, TUI, desktop, telemetry, and memory settings
- `AGENTS.md`: global instructions and the local developer CLI inventory

## Intentionally excluded

`auth.json`, histories, sessions, attachments, generated images, databases, logs, caches, memories, secrets, browser state, computer-use state, runtime binaries, temporary files, installed skills, installed plugins, and marketplace state are excluded.

The source `config.toml` also contains machine-generated project trust records, managed desktop MCP paths, ControlFreak's versioned executable path, app connector approvals, hook trust hashes, per-project editor choices, and runtime browser hashes. Those sections are not portable and are not exported. Reinstall or reconfigure those integrations on the target machine.
