---
name: qbittorrent-search-plugin-maintenance
description: |
  Audit, update, install, repair, runtime-test, and safely remove qBittorrent search plugins through the qBittorrent WebAPI. Use when a user asks whether search plugins are current or working, wants unofficial plugins added, wants credential-dependent or broken plugins removed, asks to inspect plugin Python files for malicious or phone-home behavior, or wants plugin timeouts and parser errors diagnosed through qBittorrent rather than direct site probes. Do not use for ordinary torrent searching, download selection, transfer management, or general WebAPI documentation.
---

# qBittorrent Search Plugin Maintenance

## Contract

Maintain qBittorrent search plugins with evidence from qBittorrent's own WebAPI execution path. Discover the connection without a hardcoded port, ask for connection credentials before live access, audit source before installing it, distinguish legitimate empty results from runtime failures, apply narrow repairs, and mutate plugin state only with explicit authorization.

## Preconditions and authorization

- Use this skill only for search-plugin maintenance. Route content searches and download management to a torrent-search skill; route broad API questions to a general qBittorrent WebAPI skill.
- Treat the qBittorrent instance, plugin directory, and logs as live state. Inventory them again on every run.
- Ask before installing, enabling, disabling, updating, modifying, or uninstalling plugins unless the user's request already explicitly authorizes that exact action.
- Do not create backups unless the user asks for them. Never delete an existing backup unless the user explicitly authorizes deletion.
- Never extract, crack, or print a stored password hash. Never place a password in a command argument, source file, fixture, report, or log.
- Use unofficial plugins at the user's risk and remind them to follow applicable laws. Python search plugins execute code and must be reviewed before installation.

## Phase 1: Discover and confirm the connection

1. Run the read-only discovery command:

   ```text
   bun run scripts/discover-qbittorrent.ts
   ```

2. The script checks an explicit `QBT_BASE_URL` first, then platform-appropriate qBittorrent configuration files. It does not assume a default port and does not scan arbitrary ports.
3. Before any live API request, ask the user for all three items:
   - qBittorrent WebUI username;
   - qBittorrent WebUI password, allowing an explicitly blank password;
   - confirmation of the discovered port, or the correct port/base URL when discovery was unavailable or ambiguous.
4. Do not proceed until the user responds. Use `--blank-password` only when the user explicitly confirms the password is blank. Otherwise allow the command's hidden terminal prompt or provide the password through the `QBT_PASSWORD` environment variable using a secret-safe execution facility.
5. Probe the confirmed endpoint and authenticate:

   ```text
   bun run scripts/qbt-search-plugins.ts probe --base <confirmed-base-url> --username <username>
   ```

6. If discovery finds several candidates, present them and ask which one to use. If the endpoint is remote, do not replace its host with loopback.

## Phase 2: Inventory and source acquisition

1. Inventory `/api/v2/search/plugins` through qBittorrent:

   ```text
   bun run scripts/qbt-search-plugins.ts inventory --base <base-url> --username <username>
   ```

2. Record internal name, display name, enabled state, URL, installed Python file, adjacent configuration files, and whether the engine loaded successfully.
3. Check the current official qBittorrent search-plugin repository and unofficial-plugin catalog. Do not rely on a saved list because links, versions, domains, and warnings change.
4. Classify candidates before installation:
   - public and credential-free;
   - private or credential-dependent;
   - duplicate or equivalent to an installed engine;
   - marked broken, harmful, stale, or missing by the catalog;
   - unavailable download link.
5. Download candidate source to a temporary location, audit it, and install it through `/api/v2/search/installPlugin`. Do not treat a successful HTTP response alone as proof that the engine loaded; refresh the qBittorrent inventory.
6. Update installed plugins through `/api/v2/search/updatePlugins`, then re-inventory and compare source/version evidence. Preserve a locally newer or intentionally repaired plugin unless the user authorizes replacing it.

## Phase 3: Audit plugin source

Run the deterministic scanner against the engine directory or downloaded candidates:

```text
bun run scripts/audit-plugin-source.ts <plugin-directory>
```

The scanner flags command execution, dynamic code, disabled TLS verification, credential placeholders, file writes, remote configuration, plain HTTP, and outbound hosts that differ from the plugin's declared site. It is a triage tool, not a proof that code is safe or malicious.

Manually review every flag and the full Python file. Specifically trace:

- all outbound domains, runtime mirror lists, APIs, telemetry, webhooks, raw-hosted configuration, and redirect services;
- subprocess, shell, `eval`, `exec`, dynamic imports, native-library loading, and persistence;
- files written, deleted, cached, or logged;
- credentials, cookies, tokens, and whether any are logged or stored unencrypted;
- base64 or compressed blobs, distinguishing icons/static data from executable payloads;
- TLS verification changes and custom certificate handling.

Report expected search-site traffic separately from unexplained third-party traffic. Do not label code malicious without a concrete execution or data-flow finding.

## Phase 4: Test through qBittorrent

All pass/fail runtime tests must start through `/api/v2/search/start`. This preserves qBittorrent's proxy, VPN, split-tunnel, Python, and helper environment. A direct request to the target site may help inspect changed HTML after a qBittorrent failure, but it must never be used as the evidence that a plugin passes.

1. Build a JSON plan with one content-appropriate query per plugin:

   ```json
   [
     {"plugin":"example_engine","query":"representative title","category":"all"}
   ]
   ```

2. Run at most five jobs concurrently:

   ```text
   bun run scripts/qbt-search-plugins.ts test --base <base-url> --username <username> --plan <plan.json> --timeout-ms 180000
   ```

3. The runner deletes only the jobs it created. It never clears unrelated searches.
4. Use a narrow, site-appropriate second query before classifying a clean zero-result response as failure.
5. Correlate each test with qBittorrent's current and rotated logs. Classify evidence as:
   - pass: valid results and no corresponding runtime error;
   - partial: valid results followed by a parser/thread/runtime error;
   - credential-required: explicit login, token, cookie, API-key, or local-service requirement;
   - network/DNS/TLS: resolver, route, reset, certificate, timeout, or unreachable-host failure;
   - site protection: HTTP denial, Cloudflare, JavaScript challenge, proof-of-work, or rate limit;
   - stale parser/API: changed URL, markup, response schema, helper API, or redirect behavior;
   - legitimate zero or inconclusive: no error but no result for the tested query.

## Phase 5: Measure timeouts and diagnose errors

- Treat the audit runner's deadline as a harness limit, not a qBittorrent timeout.
- For a slow plugin, test it alone, allow a generous deadline, and measure from job creation until qBittorrent reports `Stopped`.
- Repeat enough times to distinguish a stable slow response from a dead endpoint. Use the slowest credible successful time plus a modest safety margin when a plugin has its own request timeout.
- Never increase a timeout to hide permanent DNS, routing, certificate, authorization, or challenge failures.
- For runtime errors, trace the qBittorrent log to the exact plugin line and inspect the corresponding response assumption. Prefer one guard or parser correction that resolves the root cause.

## Phase 6: Repair and verify

- Keep edits narrow and generic. Common repairs include changed domains/routes, flexible HTML attributes, missing optional fields, empty-response guards, current helper APIs, finite pagination, and browser-compatible headers.
- Do not disable TLS verification as a convenience fix.
- Use only Python's standard library inside qBittorrent plugins unless the target qBittorrent environment explicitly guarantees another dependency.
- Do not print diagnostics to stdout because plugins use stdout for result transport; use stderr when temporary diagnostics are essential and remove them after diagnosis.
- Parse/compile the edited Python file, reload or reinstall it through qBittorrent, and rerun the same qBittorrent WebAPI search. A direct script execution is an additional check, not the runtime acceptance test.
- Run the source-risk scan again after every edit.

## Phase 7: Remove only with authorization

- Credential-dependent plugins: explain the missing requirement and remove only when the user requests removal.
- Persistent network/site failures: retest after a user-reported VPN, proxy, DNS, or region change. Remove only after the qBittorrent-routed retry still fails and the user authorizes removal.
- Broken plugins: remove through `/api/v2/search/uninstallPlugin`, then confirm both the API inventory and exact engine files are gone.
- Mutation commands are dry-run by default. Add `--apply` only after authorization:

  ```text
  bun run scripts/qbt-search-plugins.ts uninstall --base <base-url> --username <username> --names <name1,name2> --apply
  ```

## Failure and fallback behavior

- No discoverable port: ask for the port or complete base URL; do not probe a guessed default.
- Authentication failure: stop and ask the user to verify the username/password or WebUI bypass rules.
- Search API unavailable: report the qBittorrent/WebAPI versions and stop plugin mutation.
- Engine directory unavailable: continue API inventory/testing, but mark source audit as blocked.
- Catalog entry unavailable: report the dead link; do not substitute an unreviewed mirror.
- Ambiguous empty result: keep the plugin and report it as inconclusive until a second suitable query or log evidence resolves it.

## Output format

Report:

```text
Connection: <confirmed base URL, qBittorrent version, WebAPI version>
Inventory: <installed/enabled/disabled/loaded counts>
Changed: <updated/installed/repaired/removed plugins>
Source audit: <files/LOC, high-risk findings, review findings, outbound-host summary>
Runtime: <pass/partial/failed/inconclusive counts>
Timeouts: <plugin, measured qBittorrent time, applied timeout if changed>
Remaining issues:
| Plugin | qBittorrent test | Classification | Root cause | Recommended decision |
Verification: <re-inventory, file checks, source scan, active jobs>
Skipped or blocked: <item and reason>
```

## Known limits

- Static scanning cannot prove the absence of malicious behavior.
- qBittorrent's Search API returns result/status data but not every plugin diagnostic; local log access may be necessary for exact exceptions.
- Catalog health labels and remote sites are volatile and must be checked live.
