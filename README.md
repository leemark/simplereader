# SimpleReader — Local RSS Reader

Privacy-focused, local-first RSS reader. No account required.

[![GitHub Pages](https://img.shields.io/badge/docs-leemark.github.io%2Fsimplereader-blue)](https://leemark.github.io/simplereader/)

> **Chrome Web Store listing coming soon.**

---

## Features

- Reads **RSS 2.0, Atom, and RSS 1.0 (RDF)** feeds
- All data stored **locally in Chrome** — nothing leaves your browser
- **Cross-device sync** via Chrome's built-in Sync (no account needed beyond your Google account)
- **OPML import and export** — bring your existing subscriptions
- **Dark mode** and font-size settings
- **Full-text search** across all loaded articles
- **Keyboard navigation** (j/k or arrow keys, Enter to expand)
- **Starred/pinned feeds** float to the top of the sidebar
- **Efficient conditional HTTP fetching** (ETag / Last-Modified)

---

## Installation

### Chrome Web Store *(coming soon)*

A listing will be available once submitted for review.

### Load from source

1. Clone this repo and install dependencies:
   ```bash
   cd extension
   npm install
   npm run build
   ```
2. Open `chrome://extensions` in Chrome and enable **Developer Mode**
3. Click **"Load unpacked"** and select the `extension/dist/` folder

---

## Privacy

SimpleReader does not collect, transmit, or sell any personal data. All articles and subscriptions live in your browser's local storage. See the full [Privacy Policy](https://leemark.github.io/simplereader/privacy.html).

---

## Permissions

| Permission | Reason |
|---|---|
| `storage` + `unlimitedStorage` | Store subscriptions, articles, and settings locally |
| `alarms` | Periodic background feed refresh (every 30 minutes by default) |
| `host_permissions: *://*/*` | Fetch RSS feeds from any domain the user subscribes to |

---

## Development

All commands run from the `extension/` directory:

```bash
npm run dev      # Vite dev server — hot reload for popup/dashboard UI
npm run build    # Production build to extension/dist/
npm run lint     # ESLint
```

**Note:** The background service worker does not hot-reload. After changes to `src/background/`, run `npm run build` and reload the extension in Chrome.

### Architecture overview

- **Popup** (`src/App.jsx`) — single "Open Reader" button that opens the dashboard tab
- **Dashboard** (`src/dashboard/Dashboard.jsx`) — sidebar feed list, article list, settings modal
- **Background worker** (`src/background/index.js`) — all feed fetching and storage writes; updates the badge with the unread count
- **Storage** — `chrome.storage.sync` for settings/subscriptions, `chrome.storage.local` for articles
- **Feed parsing** — `fast-xml-parser` handles RSS 2.0, Atom, RSS 1.0 (RDF)
- **Content safety** — HTML from feeds sanitized with `DOMPurify` before rendering

---

## License

MIT — see [LICENSE](LICENSE)
