# Codex CLI — exec and review (background usage)

Codex CLI is installed through Bun and authenticated through ChatGPT auth in `~/.codex/auth.json`.

## `codex exec` — non-interactive agent run

Run in the background through the Bash tool's `run_in_background: true`, or from a shell with `&` and `disown`:

```bash
codex exec "<prompt>" \
  --sandbox workspace-write \
  --skip-git-repo-check \
  -C "<working-dir>" \
  -o "<output-last-message-file>" \
  --json > "<jsonl-log-file>" 2>&1
```

Relevant flags:

- `--sandbox workspace-write` allows file edits and commands without per-action approval. Use `danger-full-access` only when the task must reach outside the working directory.
- `--skip-git-repo-check` is required when the working directory is not a Git repository.
- `-C <DIR>` sets the working directory root for the task.
- `-o, --output-last-message <FILE>` writes the agent's final message to a file. Read this after the background job completes.
- `--json` streams JSONL events to stdout. Redirect it to a file to inspect progress without blocking on a TUI.
- `-m, --model <MODEL>` optionally overrides the configured default model.

Manual shell backgrounding outside Claude Code:

```bash
codex exec "<prompt>" --sandbox workspace-write -o out.txt --json > run.jsonl 2>&1 &
disown
```

## `codex review` — non-interactive code review

```bash
codex review --uncommitted
codex review --base <branch>
codex review --commit <sha>
```

Relevant flags:

- `--uncommitted` reviews staged, unstaged, and untracked changes.
- `--base <BRANCH>` reviews changes against a base branch.
- `--commit <SHA>` reviews the changes introduced by a single commit.
- `--title <TITLE>` optionally supplies the commit title shown in the review summary.

`review` has no `-o` or `--json` flag. Redirect stdout to a file to capture it in the background:

```bash
codex review --uncommitted > review-output.txt 2>&1 &
disown
```
