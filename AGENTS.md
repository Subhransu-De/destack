# Information

This repository contains configurations from my personal setup.

## Instructions for copying configurations

- Inspect the software's folders and identify the configuration files.
- Copy the exact configuration, preserving its structure, into a folder named after the software.
  - If the software's name contains spaces, replace them with underscores.
- If the configuration contains personal information, replace it with generic placeholders.
- In the copied configuration folder's `README.md`, add instructions explaining how to install the configuration on another machine.

## Formatting rules

- Do not hard-wrap prose or Markdown to a fixed line length. Keep each paragraph and list item on a single line unless the syntax requires a line break.

## Before-commit rules

- Check that no personal, system-specific, or sensitive information is being committed.
- If any is found, stop and report it to me.

## After-push rules

- If the GitHub Actions workflow fails, determine whether the cause is a genuine security finding or a pipeline issue.
- If it is a security issue, remove the offending commit from the remote and undo the commit locally. Then report it to me.
