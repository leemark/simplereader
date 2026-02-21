# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the `extension/` directory:

```bash
npm run dev      # Start Vite dev server (hot reload for popup/dashboard UI only)
npm run build    # Build the extension to dist/
npm run lint     # Run ESLint
npm run preview  # Preview the production build
```

To load the extension in Chrome after building: open `chrome://extensions`, enable Developer Mode, and load `extension/dist/` as an unpacked extension.

## Architecture

This is a Chrome Manifest V3 extension built with React + Vite using the `@crxjs/vite-plugin` for bundling.

**Two HTML entry points:**
- `index.html` → `src/main.jsx` → `src/App.jsx`: The browser action popup. Contains only a single "Open Reader" button that opens `dashboard.html` as a new tab.
- `dashboard.html` → `src/dashboard/main.jsx` → `src/dashboard/Dashboard.jsx`: The full reading interface with sidebar feed list, article list, and settings modal.

**Background service worker** (`src/background/index.js`): Handles all feed fetching and storage writes. Listens for `ADD_FEED` and `REFRESH_FEEDS` messages from the UI, runs a periodic alarm (`refresh_feeds`) every 30 minutes (configurable), and updates the extension badge with the unread count. The UI never writes feed data directly — it always delegates to the background via `chrome.runtime.sendMessage`.

**Storage split** (`src/utils/storage.js`):
- `chrome.storage.sync`: Settings and subscriptions (synced across devices). Subscriptions are stored as an array of `{ id, url, title, addedAt }`.
- `chrome.storage.local`: Article items (too large for sync). Items are stored as a flat object keyed by item ID for O(1) deduplication.

**Feed parsing** (`src/utils/fetcher.js`): Uses `fast-xml-parser` to handle RSS 2.0, Atom, and RSS 1.0 (RDF) formats. Called only from the background service worker.

**OPML** (`src/utils/opml.js`): Import/export using `fast-xml-parser`/`XMLBuilder`. Handles nested folder structures by flattening them. Called from `Dashboard.jsx` for the settings modal import/export buttons.

**Article rendering**: HTML content from feeds is sanitized with `DOMPurify` before being rendered via `dangerouslySetInnerHTML`. Articles expand inline on click; a "Read Full Article" link is shown when expanded.

**Note on `npm run dev`**: The Vite dev server only applies to the popup/dashboard UI. The background service worker does not hot-reload — after changes to background code, you must run `npm run build` and reload the extension in Chrome.
