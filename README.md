# SimpleReader — Local RSS Reader

Privacy-focused, local-first RSS reader. No account required.

[![GitHub Pages](https://img.shields.io/badge/docs-leemark.github.io%2Fsimplereader-blue)](https://leemark.github.io/simplereader/)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-install-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/simplereader-local-rss/icenfcokggjpkcdcadgkpbbaiokfmgjg)

---

## Features

- Reads **RSS 2.0, Atom, and RSS 1.0 (RDF)** feeds
- Article content stored **locally in Chrome**
- Subscriptions and settings use **Chrome Sync** and may sync across your signed-in devices when Chrome Sync is enabled
- **OPML import and export** — bring your existing subscriptions
- **Dark mode** and font-size settings
- **Full-text search** across all loaded articles
- **Keyboard navigation** (j/k or arrow keys, Enter to expand)
- **Starred/pinned feeds** float to the top of the sidebar
- **Efficient conditional HTTP fetching** (ETag / Last-Modified)

---

## Installation

### Chrome Web Store

Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/simplereader-local-rss/icenfcokggjpkcdcadgkpbbaiokfmgjg).

### Load from source

Use Node.js 20.19+ or 22.12+ (a current supported LTS release is recommended).

1. Clone this repo and install dependencies:
   ```bash
   cd extension
   npm install
   npm run build
   ```
2. Open `chrome://extensions` in Chrome and enable **Developer Mode**
3. Click **"Load unpacked"** and select the `extension/dist/` folder

---

## Starter Feeds

Not sure what to subscribe to? **[HN Popular Blogs 2025](https://gist.github.com/emschwartz/e6d2bf860ccc367fe37ff953ba6de66b)** is a curated OPML of 95 tech blogs that appeared most on Hacker News. Download the [raw OPML](https://gist.githubusercontent.com/emschwartz/e6d2bf860ccc367fe37ff953ba6de66b/raw/hn-popular-blogs-2025.opml) and import it via **Settings → Import OPML**.

---

## Privacy

Article content is stored in `chrome.storage.local`. Subscriptions and settings use `chrome.storage.sync`, so Chrome may sync them across your signed-in devices when Chrome Sync is enabled. Feeds are fetched directly from the domains you subscribe to. See the full [Privacy Policy](https://leemark.github.io/simplereader/privacy.html).

---

## Permissions

| Permission | Reason |
|---|---|
| `storage` + `unlimitedStorage` | Store articles locally and subscriptions/settings in Chrome Sync storage |
| `alarms` | Periodic background feed refresh (every 30 minutes by default) |
| `host_permissions: *://*/*` | Fetch RSS feeds from any domain the user subscribes to |

---

## Development

All commands run from the `extension/` directory:

```bash
npm run dev      # Vite dev server — hot reload for popup/dashboard UI
npm run build    # Production build to extension/dist/
npm run lint     # ESLint
npm test         # Feed parsing, storage migration, and concurrency regressions
```

**Note:** The background service worker does not hot-reload. After changes to `src/background/`, run `npm run build` and reload the extension in Chrome.

### Architecture overview

- **Popup** (`src/App.jsx`) — single "Open Reader" button that opens the dashboard tab
- **Dashboard** (`src/dashboard/Dashboard.jsx`) — sidebar feed list, article list, settings modal
- **Background worker** (`src/background/index.js`) — all feed fetching and storage writes; updates the badge with the unread count
- **Storage** — `chrome.storage.sync` for settings/subscriptions, `chrome.storage.local` for articles
- **Subscription migration** — Existing subscription lists migrate automatically to individual sync records, preserving feed IDs and cached articles. Chrome's overall sync capacity and write-rate limits still apply; failed operations are reported in the reader.
- **Feed limits** — Fetches have a 10-second deadline through body download and a 5 MiB maximum body size. Feeds declaring a DOCTYPE are rejected to prevent custom XML entity processing.
- **Feed parsing** — `fast-xml-parser` handles RSS 2.0, Atom, RSS 1.0 (RDF)
- **Content safety** — HTML from feeds sanitized with `DOMPurify` before rendering

---

## License

MIT — see [LICENSE](LICENSE)
