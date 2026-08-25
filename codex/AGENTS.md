# Instructions

- When I ask you to make a page or documentation, create a native Notion page unless I specifically ask for something different.
  - Use `<notion-parent-page-url>` as the fixed Notion parent.
  - Determine the project name from `git remote get-url origin`. If the current folder is not a Git repository or `origin` is missing, use the current folder name.
  - Under the fixed parent, look for a direct child page whose title exactly matches the project name. Reuse it when found. If it does not exist, create the project folder.
  - Create the requested page inside the project folder. Use native Notion blocks and the available Notion features that improve the document's presentation.
  - Open the finished Notion page URL in the default browser. In PowerShell use `Start-Process '<notion-page-url>'`. From Git Bash or another Bash-compatible shell use:

    ```bash
    notion_url='<notion-page-url>'
    case "$(uname -s)" in
      MINGW*|MSYS*|CYGWIN*) cmd.exe /c start "" "$notion_url" ;;
      Darwin*) open "$notion_url" ;;
      *) xdg-open "$notion_url" ;;
    esac
    ```

- For Python code prefer `httpx` instead of `requests`.
- For running Python code prefer `uv`, and for TypeScript or JavaScript prefer `bun`.
- After raising a PR, check for merge conflicts and solve them.
- After making a PR in GitHub, the Codex review bot will give a `👀` emoji. Keep checking the PR comments until it turns to `👍`. After finding a comment, fix it. After the fix, comment back with the fix in simple plain English. Do not include code in the reply; just describe the change made for the comment. If the comment is false, reply accordingly.
  - Do this check using a GPT-5.6 Luna model in a subagent. When it finds comments, it will provide the links.
- If a branch has an open PR, check its pipeline for failures after each push.
- When you create a worktree, always create it under `~/worktree/codex/...`.
- When you make a PR, do not include the `codex` prefix in the PR title.
- Keep the pull request description minimal. Include only what changed, in bullet points.
- In some sessions I will give you cookies, API keys, or other credentials. These will always be temporary credentials that I will remove after the work is done, so you do not need to invalidate them yourself.

# Local developer CLI inventory

These day-to-day developer CLIs are installed and available for coding-agent work on this machine:

- `git` — inspect repositories, diffs, branches, logs, and status.
- `gh` — GitHub issues, PRs, repositories, and authenticated GitHub automation.
- `xurl` — official X API CLI; OAuth 2.0 user authentication is configured under the `x-cli` app alias.
- `rg`, `fd` — fast code and text search and fast file discovery across repositories.
- `jq`, `yq` — JSON, YAML, TOML, and XML filtering and transformation.
- `file` — identify file types, encoding hints, and container formats.
- `uv`, `uvx` — fast Python project and tool management.
- `ruff` — Python linting and formatting.
- `node`, `npm`, `npx`, `pnpm` — JavaScript and TypeScript runtime, package scripts, and package execution.
- `bun`, `bunx` — JavaScript runtime, package manager, and global tool runner. Prefer this over Node.
- `prettier` — formatting for JavaScript, TypeScript, JSON, Markdown, and web files.
- `bat` — syntax-highlighted file previews.
- `delta`, `difft` — improved Git diffs and syntax-aware structural diffs (`difft` is Difftastic).
- `go`, `gopls`, `staticcheck` — Go build and test tooling, language server, and static analysis.
- `cargo`, `rustc`, `rustup`, `rustfmt`, `rust-analyzer` — Rust build and test tooling, toolchain, formatting, and language tooling.
- `java`, `javac`, `gradle`, `mvn` — Java and JVM runtime, compiler, builds, and tests. `java` and `javac` resolve to Azul Zulu OpenJDK `25.0.3`.
- `gcc`, `g++`, `make` — C and C++ compilation and Make-based builds.
- `docker`, `docker compose` — containers, local services, and reproducible development environments.
- `shellcheck`, `shfmt` — shell script linting and formatting.
- `hadolint` — Dockerfile linting.
- `actionlint` — GitHub Actions workflow linting.
- `snyk` — security scanning and vulnerability management CLI. If it is unauthenticated, trigger `snyk auth`.
- `terraform`, `tflint` — infrastructure-as-code validation, planning, and linting.
- `aws` — AWS CLI; authenticated on this machine. Use it for AWS information gathering.
- `gcloud` — Google Cloud CLI; authenticated on this machine.
- `psql` — PostgreSQL CLI. Local PostgreSQL works with `psql -w -U postgres -d postgres`.
- `mongodump`, `mongoexport` — MongoDB database export and backup tooling.
- `sonar` — SonarQube CLI for scans, issue listing, and code-quality checks.
- `k6`, `hyperfine` — load and performance testing and command benchmarking.
- `sqlite3`, `duckdb` — inspect and query local SQLite files, CSV, JSON, Parquet, and log data.
- `exiftool` — extract image, PDF, EPUB, document, and camera or app metadata.
- `magick`, `identify` — ImageMagick image metadata, validation warnings, conversion, and reference comparison.
- `vipsheader` — fast image metadata inspection for large images.
- `dssim` — perceptual reference-based image difference scoring.
- `7z`, `unzip` — validate and inspect archive and container formats such as EPUB, DOCX, ODT, CBZ, and CBR.
- `pdfinfo`, `pdffonts`, `pdfimages`, `pdftotext` — Poppler PDF metadata, font, image, and text extraction tools.
- `qpdf` — PDF structural validation and repair checks.
- `pandoc` — convert and extract document and ebook formats to plain text or Markdown.
- `xmllint`, `tidy` — XML, XHTML, and HTML validation and cleanup checks.
- `ssh`, `scp`, `sftp` — remote access and file transfer.
- `ffmpeg`, `ffprobe`, `MediaInfo`, `yt-dlp` — media download, conversion, probing, and metadata validation.
- `playwright-cli` — local browser automation CLI. The user agent can be changed through `run-code` and `page.setExtraHTTPHeaders({ 'User-Agent': ... })`.

# Running Claude Code non-interactively

- Run Claude Code with `claude -p` through the managed background command runner. Do not run it in the foreground with a predicted task timeout.
- Start the Claude process exactly once from the target repository.
- If the runner returns `Script running with cell ID ...`, save that cell ID and continue waiting on the same cell until the process reaches a terminal result.
- Poll the background cell in intervals of no more than 60 seconds so progress can still be reported.
- No new output means Claude is still working. It is not a timeout or failure.
- Never launch a replacement Claude process merely because the existing process is taking a long time.
- Retry only after the background process has returned a terminal failure.
- If the command API requires a timeout value, use a large safety ceiling rather than estimating how long the task should take.

## Command construction

- Put long prompts in a PowerShell here-string:

  ```powershell
  $claudePrompt = @'
  Put the complete task here.

  State the scope, whether changes are allowed, required evidence,
  expected output, and anything Claude must not do.
  '@
  ```

- Use this command form:

  ```powershell
  claude -p `
    --model claude-opus-5 `
    --effort high `
    --tools "Read,Glob,Grep" `
    --no-session-persistence `
    --output-format json `
    $claudePrompt
  ```

- When a particular model is requested, use its exact canonical identifier. For Opus 5, use `--model claude-opus-5`. Do not use the `opus` alias, because it can resolve to another model.
- Use `--effort high` with `claude-opus-5`. Do not use `--effort max` unless thinking has been explicitly enabled and verified.
- For read-only repository analysis, use `--tools "Read,Glob,Grep"`.
- For reasoning that requires no repository access, use `--tools ""`.
- Use `--no-session-persistence` for independent one-shot requests. Omit it when a later request will continue the conversation with `--resume <session-id>`.
- Use `--output-format json`. After completion, verify:
  - The process exit code is zero.
  - `is_error` is false.
  - `terminal_reason` is `completed`.
  - `modelUsage` contains the requested `canonicalModel`.
  - The final answer is taken from the `result` field.
- Do not trust only the model name written in the response; the JSON `modelUsage` metadata is the authoritative verification.
