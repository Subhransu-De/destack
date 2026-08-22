# qBittorrent WebAPI v2 Reference

Base: `http://localhost:2200/api/v2`
Auth: None. Session via `SID` cookie (set on first request).

---

## Application

| Method | Endpoint               | Description                                                   |
| ------ | ---------------------- | ------------------------------------------------------------- |
| GET    | `/app/version`         | App version (e.g. `v5.1.4`). Also initializes session cookie. |
| GET    | `/app/webapiVersion`   | WebAPI version (e.g. `2.11.4`)                                |
| GET    | `/app/buildInfo`       | Qt, libtorrent, OpenSSL, platform versions                    |
| GET    | `/app/preferences`     | All app settings (download path, speed limits, etc.)          |
| POST   | `/app/setPreferences`  | Update settings. Body: `json={"key":"value"}`                 |
| GET    | `/app/defaultSavePath` | Default download directory                                    |
| POST   | `/app/shutdown`        | Shut down qBittorrent                                         |

---

## Search

| Method | Endpoint                  | Params                                                                   | Description                                                                                    |
| ------ | ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| POST   | `/search/start`           | `pattern`, `plugins` (`all`/name), `category` (`all`/`movies`/`tv`/etc.) | Start a search job. Returns `{"id": 123}`                                                      |
| GET    | `/search/status`          | `id` (optional)                                                          | Status of all jobs or specific job. `Running` or `Stopped`. Also returns `total` result count. |
| GET    | `/search/results`         | `id`, `limit` (max 500), `offset`                                        | Fetch results for a job. Returns `{results:[...], status, total}`                              |
| POST   | `/search/stop`            | `id`                                                                     | Stop a running search job                                                                      |
| DELETE | `/search/delete`          | `id`                                                                     | Delete a search job and its results                                                            |
| GET    | `/search/plugins`         | —                                                                        | List all installed search plugins with name, enabled, categories, version                      |
| POST   | `/search/installPlugin`   | `sources` (URL or file path)                                             | Install a new search plugin                                                                    |
| POST   | `/search/uninstallPlugin` | `names`                                                                  | Uninstall plugins by name                                                                      |
| POST   | `/search/enablePlugin`    | `names`, `enable` (true/false)                                           | Enable or disable plugins                                                                      |
| POST   | `/search/updatePlugins`   | —                                                                        | Update all plugins                                                                             |

### Search result object fields

```json
{
  "descrLink": "https://...",
  "engineName": "plugin_name",
  "fileName": "Torrent Name Here",
  "fileSize": 1234567890,
  "fileUrl": "magnet:?xt=...",
  "nbLeechers": 5,
  "nbSeeders": 12,
  "pubDate": 1700000000,
  "siteUrl": "https://..."
}
```

---

## Torrents

### Listing & Info

| Method | Endpoint                | Key Params                                                                  | Description                                                                                                       |
| ------ | ----------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET    | `/torrents/info`        | `filter`, `category`, `tag`, `sort`, `reverse`, `limit`, `offset`, `hashes` | List torrents. Filter: `all`/`downloading`/`seeding`/`completed`/`paused`/`active`/`inactive`/`stalled`/`errored` |
| GET    | `/torrents/properties`  | `hash`                                                                      | Detailed properties of one torrent                                                                                |
| GET    | `/torrents/trackers`    | `hash`                                                                      | Trackers and their status                                                                                         |
| GET    | `/torrents/webseeds`    | `hash`                                                                      | HTTP seeds                                                                                                        |
| GET    | `/torrents/files`       | `hash`, `indexes`                                                           | Files in the torrent                                                                                              |
| GET    | `/torrents/pieceStates` | `hash`                                                                      | Piece download states array                                                                                       |
| GET    | `/torrents/pieceHashes` | `hash`                                                                      | SHA1 hashes of pieces                                                                                             |

### Torrent info object key fields

```json
{
  "hash": "abc123...",
  "name": "Torrent Name",
  "state": "downloading|seeding|stoppedDL|stoppedUP|metaDL|stalledDL|...",
  "size": 1073741824,
  "progress": 0.75,
  "dlspeed": 1048576,
  "upspeed": 102400,
  "num_seeds": 5,
  "num_leechs": 2,
  "eta": 3600,
  "save_path": "C:\\Downloads\\",
  "category": "Movies",
  "tags": "hd,english",
  "added_on": 1700000000,
  "completion_on": 1700003600
}
```

### Torrent states

| State         | Meaning                           |
| ------------- | --------------------------------- |
| `metaDL`      | Fetching metadata from peers      |
| `stoppedDL`   | Paused, not complete              |
| `stoppedUP`   | Paused, complete (seeding paused) |
| `downloading` | Actively downloading              |
| `seeding`     | Complete, uploading               |
| `stalledDL`   | No peers, waiting                 |
| `checkingDL`  | Verifying pieces                  |
| `errored`     | Tracker/file error                |

### Adding Torrents

| Method | Endpoint        | Body Params                                                                                                                                   | Description                               |
| ------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| POST   | `/torrents/add` | `urls` (magnet/URL, newline-separated), `savepath`, `category`, `tags`, `paused` (`true`/`false`), `sequentialDownload`, `firstLastPiecePrio` | Add torrent(s). Returns `Ok.` on success. |

Example:

```bash
curl -s -b "$env:TEMP/qbt_cookies.txt" \
  -X POST http://localhost:2200/api/v2/torrents/add \
  --data-urlencode "urls=magnet:?xt=urn:btih:HASH&dn=Name" \
  --data-urlencode "savepath=C:\\Downloads\\Movies" \
  --data-urlencode "category=Movies" \
  --data-urlencode "paused=false"
```

### Managing Torrents

| Method | Endpoint                      | Params                               | Description                                         |
| ------ | ----------------------------- | ------------------------------------ | --------------------------------------------------- |
| POST   | `/torrents/pause`             | `hashes` (pipe-sep or `all`)         | Pause torrent(s)                                    |
| POST   | `/torrents/resume`            | `hashes`                             | Resume torrent(s)                                   |
| POST   | `/torrents/delete`            | `hashes`, `deleteFiles` (true/false) | Delete torrent(s), optionally with data             |
| POST   | `/torrents/recheck`           | `hashes`                             | Force recheck pieces                                |
| POST   | `/torrents/reannounce`        | `hashes`                             | Re-announce to trackers                             |
| POST   | `/torrents/setCategory`       | `hashes`, `category`                 | Assign category                                     |
| POST   | `/torrents/addTags`           | `hashes`, `tags`                     | Add tags                                            |
| POST   | `/torrents/removeTags`        | `hashes`, `tags`                     | Remove tags                                         |
| POST   | `/torrents/setAutoManagement` | `hashes`, `enable`                   | Toggle auto-management                              |
| POST   | `/torrents/setSuperSeeding`   | `hashes`, `value`                    | Toggle super-seeding                                |
| POST   | `/torrents/setForceStart`     | `hashes`, `value`                    | Force start                                         |
| POST   | `/torrents/setDownloadLimit`  | `hashes`, `limit` (bytes/s)          | Per-torrent download speed limit                    |
| POST   | `/torrents/setUploadLimit`    | `hashes`, `limit`                    | Per-torrent upload speed limit                      |
| POST   | `/torrents/setLocation`       | `hashes`, `location`                 | Move save path                                      |
| POST   | `/torrents/rename`            | `hash`, `name`                       | Rename torrent                                      |
| POST   | `/torrents/renameFile`        | `hash`, `oldPath`, `newPath`         | Rename a file inside torrent                        |
| POST   | `/torrents/filePrio`          | `hash`, `id`, `priority`             | Set file priority (0=skip, 1=normal, 6=high, 7=max) |
| POST   | `/torrents/topPrio`           | `hashes`                             | Move to top of queue                                |
| POST   | `/torrents/bottomPrio`        | `hashes`                             | Move to bottom of queue                             |
| POST   | `/torrents/increasePrio`      | `hashes`                             | Increase queue priority                             |
| POST   | `/torrents/decreasePrio`      | `hashes`                             | Decrease queue priority                             |
| POST   | `/torrents/addTrackers`       | `hash`, `urls`                       | Add trackers to a torrent                           |
| POST   | `/torrents/editTracker`       | `hash`, `origUrl`, `newUrl`          | Edit a tracker URL                                  |
| POST   | `/torrents/removeTrackers`    | `hash`, `urls`                       | Remove trackers                                     |

### Categories & Tags

| Method | Endpoint                     | Params                 | Description                    |
| ------ | ---------------------------- | ---------------------- | ------------------------------ |
| GET    | `/torrents/categories`       | —                      | All categories with save paths |
| POST   | `/torrents/createCategory`   | `category`, `savePath` | Create category                |
| POST   | `/torrents/editCategory`     | `category`, `savePath` | Edit category save path        |
| POST   | `/torrents/removeCategories` | `categories`           | Delete categories              |
| GET    | `/torrents/tags`             | —                      | All tags                       |
| POST   | `/torrents/createTags`       | `tags`                 | Create tags                    |
| POST   | `/torrents/deleteTags`       | `tags`                 | Delete tags                    |

---

## Transfer / Network

| Method | Endpoint                          | Description                                                                                                                                              |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/transfer/info`                  | Global speed stats: `dl_info_speed`, `up_info_speed`, `dl_info_data`, `up_info_data`, `dl_rate_limit`, `up_rate_limit`, `dht_nodes`, `connection_status` |
| GET    | `/transfer/speedLimitsMode`       | `1` if alternative speed limits active, `0` otherwise                                                                                                    |
| POST   | `/transfer/toggleSpeedLimitsMode` | Toggle alternative speed limits                                                                                                                          |
| POST   | `/transfer/setDownloadLimit`      | `limit` (bytes/s, 0=unlimited)                                                                                                                           | Set global download limit |
| POST   | `/transfer/setUploadLimit`        | `limit`                                                                                                                                                  | Set global upload limit   |
| GET    | `/transfer/downloadLimit`         | Current global download limit                                                                                                                            |
| GET    | `/transfer/uploadLimit`           | Current global upload limit                                                                                                                              |
| POST   | `/transfer/banPeers`              | `peers` (`ip:port` pipe-sep)                                                                                                                             | Ban peers globally        |

---

## Sync

| Method | Endpoint             | Params                                 | Description                                                                  |
| ------ | -------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/sync/maindata`     | `rid` (0 for full, last rid for delta) | Full or incremental state snapshot: torrents, categories, tags, server state |
| GET    | `/sync/torrentPeers` | `hash`, `rid`                          | Peer list for a torrent (delta-capable)                                      |

---

## Log

| Method | Endpoint     | Params                                                                  | Description             |
| ------ | ------------ | ----------------------------------------------------------------------- | ----------------------- |
| GET    | `/log/main`  | `normal`, `info`, `warning`, `critical` (bool filters), `last_known_id` | Application log entries |
| GET    | `/log/peers` | `last_known_id`                                                         | Peer log                |

---

## RSS

| Method | Endpoint                | Description                                                   |
| ------ | ----------------------- | ------------------------------------------------------------- |
| POST   | `/rss/addFolder`        | Add RSS folder                                                |
| POST   | `/rss/addFeed`          | Add RSS feed (`url`, `path`)                                  |
| POST   | `/rss/removeItem`       | Remove feed/folder                                            |
| POST   | `/rss/moveItem`         | Move/rename feed                                              |
| GET    | `/rss/items`            | All RSS feeds and items (`withData=true` to include articles) |
| POST   | `/rss/markAsRead`       | Mark article/feed as read                                     |
| POST   | `/rss/refreshItem`      | Force refresh a feed                                          |
| POST   | `/rss/setRule`          | Create/update auto-download rule                              |
| POST   | `/rss/renameRule`       | Rename rule                                                   |
| POST   | `/rss/removeRule`       | Delete rule                                                   |
| GET    | `/rss/rules`            | All auto-download rules                                       |
| GET    | `/rss/matchingArticles` | Test which articles match a rule                              |
