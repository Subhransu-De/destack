# Instructions

1. When I ask you to create a plan create it in a HTML file. After the creation is done trigger it open in the default browser.
2. Always use evidence based research.
3. For Python code prefer `httpx` instead of `requests`.
4. For running python code prefer `uv` and for typescript or javacript prefer `bun`
5. After raising a PR check for merge conflict and solve it.
6. After making a PR in github Codex review bot will give a `👀` emoji. Keep checking the PR comments until it turns to `👍`. After finding a comment fix it. After fix comment back with the fix done in simple plain English language. No code in reply. Just the change done for the comment. If the comment is false then comment accordingly.
7. If a branch has a open PR then after each push check its pipeline for failures.
8. When you create a worktree always create it under ~/worktree/claude/...

# Local developer CLI inventory

These day-to-day developer CLIs are installed and available for coding-agent work on this machine:

- `git` — inspect repos, diffs, branches, logs, status.
- `gh` — GitHub issues, PRs, repos, and authenticated GitHub automation.
- `rg`, `fd` — fast code/text search and fast file discovery across repositories.
- `jq`, `yq` — JSON/YAML/TOML/XML filtering and transformation.
- `file` — identify file types, encoding hints, and container formats.
- `python`, `py`, `pip` — Python scripts, tests, package operations.
- `uv`, `uvx` — fast Python project/tool management.
- `ruff` — Python linting and formatting.
- `node`, `npm`, `npx`, `pnpm` — JavaScript/TypeScript runtime, package scripts, and package execution.
- `bun`, `bunx` — JavaScript runtime, package manager, and global tool runner. (Prefer this over node)
- `prettier` — formatting for JS/TS, JSON, Markdown, and web files.
- `bat` — syntax-highlighted file previews.
- `delta`, `difft` — improved Git diffs and syntax-aware structural diffs (`difft` is Difftastic).
- `go`, `gopls`, `staticcheck` — Go build/test tooling, language server, and static analysis.
- `cargo`, `rustc`, `rustup`, `rustfmt`, `rust-analyzer` — Rust build/test, toolchain, formatting, and language tooling.
- `java`, `javac`, `gradle`, `mvn` — Java/JVM runtime, compiler, builds, and tests. `java`/`javac` resolve to Azul Zulu OpenJDK `25.0.3`.
- `gcc`, `g++`, `make` — C/C++ compilation and make-based builds.
- `docker`, `docker compose` — containers, local services, and reproducible dev environments.
- `shellcheck`, `shfmt` — shell script linting and formatting.
- `hadolint` — Dockerfile linting.
- `actionlint` — GitHub Actions workflow linting.
- `trivy` — vulnerability/security scanning for dependencies, containers, and IaC.
- `snyk` — security scanning and vulnerability management CLI.
- `terraform`, `tflint` — infrastructure-as-code validation, planning, and linting.
- `aws` — AWS CLI; authenticated on this machine. Use it for AWS information gathering.
- `gcloud` — Google Cloud CLI; authenticated on this machine.
- `psql` — PostgreSQL CLI. Local PostgreSQL works with `psql -w -U postgres -d postgres`.
- `mongodump`, `mongoexport` — MongoDB database export/backup tooling.
- `sonar` — SonarQube CLI for scans, issue listing, and code-quality checks.
- `k6`, `hyperfine` — load/performance testing and command benchmarking.
- `just` — project task runner for repeatable dev commands.
- `sqlite3`, `duckdb` — inspect/query local SQLite files, CSV/JSON/Parquet/log data.
- `exiftool` — extract image, PDF, EPUB, document, and camera/app metadata.
- `magick`, `identify` — ImageMagick image metadata, validation warnings, conversion, and reference comparison.
- `vipsheader` — fast image metadata inspection for large images.
- `dssim` — perceptual reference-based image difference scoring.
- `7z`, `unzip` — validate and inspect archive/container formats such as EPUB, DOCX, ODT, CBZ, and CBR.
- `pdfinfo`, `pdffonts`, `pdfimages`, `pdftotext` — Poppler PDF metadata, font, image, and text extraction tools.
- `qpdf` — PDF structural validation and repair checks.
- `pandoc` — convert/extract document and ebook formats to plain text or Markdown.
- `xmllint`, `tidy` — XML/XHTML/HTML validation and cleanup checks.
- `ssh`, `scp`, `sftp` — remote access and file transfer.
- `ffmpeg`, `ffprobe`, `MediaInfo`, `yt-dlp` — media download, conversion, probing, and metadata validation.
- `playwright-cli` — local browser automation CLI (UA can be changed via `run-code` + `page.setExtraHTTPHeaders({ 'User-Agent': ... })`).
