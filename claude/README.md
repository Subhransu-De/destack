# Claude Code

Global configuration for [Claude Code](https://code.claude.com), containing user settings, global instructions, a keybinding override, and a custom status line.

## What is included

- Default model, fallback model, subagent model, and reasoning effort selection
- `auto` permission mode with a custom environment, soft-deny, and hard-deny policy
- Extended thinking with thinking summaries shown
- Auto-compaction, and a 10-year transcript retention period
- Worktree defaults: `node_modules` and `.venv` symlinked, branched from a fresh base ref
- Global instructions applied to every project
- `shift+enter` bound to submit in the chat view
- A Bun-powered status line showing model, effort, service health, context window use, the 5-hour rate limit, path, Git branch, and session name

The export replaces the AWS profile name with `<aws-profile>` and uses `~` in place of a fixed user profile path. It does not contain credentials, OAuth tokens, chat history, project paths, usage statistics, or machine-generated caches.

## Requirements

- Claude Code
- [Bun](https://bun.sh), for the status line

## Install

Copy the files into `~/.claude/`:

```bash
mkdir -p ~/.claude
cp CLAUDE.md settings.json keybindings.json statusline.ts ~/.claude/
```

Back up an existing configuration first if you have one:

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak
```

Then edit `~/.claude/settings.json` and replace `<aws-profile>` with your own AWS profile name, or remove that line if you do not use the AWS CLI. Review the rest of the `autoMode` policy so it matches the tools and accounts on your machine — it grants and withholds permissions based on what is authenticated locally.

Restart Claude Code to load the new settings.

## Files

- `CLAUDE.md`: global instructions and the local developer CLI inventory
- `settings.json`: models, permissions, `autoMode` policy, and status line
- `keybindings.json`: chat submit binding
- `statusline.ts`: status line script

## Intentionally excluded

`.credentials.json`, OAuth tokens, `history.jsonl`, `projects/`, `sessions/`, `tasks/`, `teams/`, `shell-snapshots/`, `file-history/`, `backups/`, `plans/`, `stats-cache.json`, and other generated state.

The `hooks/` directory is empty on the source machine, so nothing is exported for it.

Skills under `skills/` are excluded. The plugin marketplace configuration under `plugins/` is also excluded, since it is restored by reinstalling the plugins.

The `statusline.js` file in the source directory is a superseded JavaScript version of `statusline.ts` and is not exported.
