# Information

This repository contains configurations from my personal setup.

## Instructions for copying configurations

- Inspect the software's folders and identify the configuration files.
- Copy the exact configuration, preserving its structure, into a folder named after the software.
  - If the software's name contains spaces, replace them with underscores.
- If the configuration contains personal information, replace it with generic placeholders.
- When a new configuration is copied or existing is changed, checkthe `./INSTALLATION.md` file. Update it accordingly.

## Instructions of about the skills folder

- When a skill is created in the `./skills` folder here, you will also install it for Codex, Claude and pi immediately. Symlink to install for them.
- When proposing name for the skills use simple names which are easy to remember and quick to sound/write.

## Formatting rules

- Do not hard-wrap prose or Markdown to a fixed line length. Keep each paragraph and list item on a single line unless the syntax requires a line break.

## Before-commit rules

- Check that no personal, system-specific, or sensitive information is being committed.
- If any is found, stop and report it to me.

## After-push rules

- If the GitHub Actions workflow fails, determine whether the cause is a genuine security finding or a pipeline issue.
- If it is a security issue, remove the offending commit from the remote and undo the commit locally. Then report it to me.
- You can push to main directly for this repo.
