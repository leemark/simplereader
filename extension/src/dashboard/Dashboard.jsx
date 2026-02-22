import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import DOMPurify from 'dompurify';
import '../App.css';
import {
    getSubscriptions, saveSubscriptions,
    getItems,
    getLastRefreshed,
    getSettings, saveSettings,
    markItemRead
} from '../utils/storage';
import { parseOPML, generateOPML } from '../utils/opml';

const PAGE_SIZE = 50;

// Strip HTML tags for collapsed plain-text previews — no DOMPurify needed.
function stripHtml(html) {
    const stripped = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const ta = document.createElement('textarea');
    ta.innerHTML = stripped;
    return ta.value;
}

function applyAppearance(cfg) {
    const dark = cfg.theme === 'dark' ||
        (cfg.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-fontsize', cfg.fontSize || 'medium');
}

// Memoized per-article component. Only re-renders when its own props change,
// so expanding one article doesn't re-render all others.
const ArticleItem = React.memo(function ArticleItem({ item, feedTitle, isExpanded, isFocused, onToggle }) {
    const ref = useRef(null);

    useEffect(() => {
        if (isFocused && ref.current) ref.current.scrollIntoView({ block: 'nearest' });
    }, [isFocused]);

    // Plain text excerpt for collapsed view — computed once, no sanitization.
    const textExcerpt = useMemo(() => {
        if (!item.content) return '';
        return stripHtml(item.content).slice(0, 300);
    }, [item.content]);

    // Sanitize only when expanded, and only once per item (memoized by isExpanded + content).
    const sanitizedContent = useMemo(() => {
        if (!isExpanded || !item.content) return null;
        return DOMPurify.sanitize(item.content, {
            ADD_TAGS: ['img', 'iframe'],
            ADD_ATTR: ['src', 'width', 'height', 'style']
        });
    }, [isExpanded, item.content]);

    const pubDate = item.pubDate
        ? new Date(item.pubDate).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        })
        : '';

    return (
        <article
            ref={ref}
            className={`article-item${isExpanded ? ' expanded' : ''}${isFocused ? ' focused' : ''}`}
            onClick={() => onToggle(item.id, item.feedId)}
        >
            <h2 className="article-title">{item.title}</h2>

            <div className="article-meta">
                {feedTitle && <span className="feed-source">{feedTitle}</span>}
                {feedTitle && pubDate && <span className="meta-sep">·</span>}
                {pubDate && <time className="article-date">{pubDate}</time>}
            </div>

            {/* Collapsed: cheap plain-text preview, no sanitization */}
            {!isExpanded && textExcerpt && (
                <p className="article-preview">{textExcerpt}</p>
            )}

            {/* Expanded: full HTML, sanitized once and memoized */}
            {isExpanded && sanitizedContent && (
                <div className="article-excerpt expanded">
                    <div
                        className="article-body"
                        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
                    />
                </div>
            )}

            {isExpanded && item.link && (
                <div className="article-actions">
                    <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="read-more-link"
                    >
                        Read full article →
                    </a>
                </div>
            )}
        </article>
    );
});

function Dashboard() {
    const [subscriptions, setSubscriptions] = useState([]);
    const [items, setItems] = useState([]);
    const [newFeedUrl, setNewFeedUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedFeedId, setSelectedFeedId] = useState(null);
    const [expandedItems, setExpandedItems] = useState(new Set());
    const [page, setPage] = useState(1);
    const [settings, setSettings] = useState({ theme: 'system', fontSize: 'medium' });
    const [focusedIndex, setFocusedIndex] = useState(null);

    const [showSettings, setShowSettings] = useState(false);
    const [importStatus, setImportStatus] = useState('');
    const fileInputRef = useRef(null);

    const [searchQuery, setSearchQuery] = useState('');

    const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [, setTickCount] = useState(0);

    // O(1) feed title lookup instead of O(n) find() called once per rendered item.
    const subMap = useMemo(
        () => Object.fromEntries(subscriptions.map(s => [s.id, s.title])),
        [subscriptions]
    );

    // Filter and sort items based on selected feed — all items always loaded for accurate unread counts.
    const displayItems = useMemo(() => {
        let filtered = selectedFeedId
            ? items.filter(i => i.feedId === selectedFeedId)
            : items;

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            filtered = filtered.filter(i => {
                if ((i.title || '').toLowerCase().includes(q)) return true;
                if (i.content) return stripHtml(i.content).toLowerCase().includes(q);
                return false;
            });
        }

        return [...filtered].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    }, [items, selectedFeedId, searchQuery]);

    // Per-feed unread counts, computed from full items list.
    const unreadByFeed = useMemo(() => {
        const counts = {};
        items.forEach(item => {
            if (!item.read) counts[item.feedId] = (counts[item.feedId] || 0) + 1;
        });
        return counts;
    }, [items]);

    const totalUnread = useMemo(() => items.filter(i => !i.read).length, [items]);

    // Starred feeds float to the top of the sidebar.
    const sortedSubscriptions = useMemo(() => [
        ...subscriptions.filter(s => s.starred),
        ...subscriptions.filter(s => !s.starred),
    ], [subscriptions]);

    // Only the slice of items for the current page goes into the DOM.
    const visibleItems = useMemo(
        () => displayItems.slice(0, page * PAGE_SIZE),
        [displayItems, page]
    );

    const hasMore = visibleItems.length < displayItems.length;

    // useCallback makes the reference stable so ArticleItem's React.memo works correctly.
    const toggleExpand = useCallback((itemId, feedId) => {
        setExpandedItems(prev => {
            const next = new Set(prev);
            next.has(itemId) ? next.delete(itemId) : next.add(itemId);
            return next;
        });
        markItemRead(itemId, feedId);
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, read: true } : i));
    }, []);

    const toggleStar = useCallback(async (feedId) => {
        const updated = subscriptions.map(s =>
            s.id === feedId ? { ...s, starred: !s.starred } : s
        );
        setSubscriptions(updated);
        await saveSubscriptions(updated);
    }, [subscriptions]);

    useEffect(() => {
        loadData();

        const handleStorageChange = (changes, area) => {
            if (area === 'sync' && changes.subscriptions) {
                setSubscriptions(changes.subscriptions.newValue || []);
            }
            if (area === 'local') {
                if (changes.lastRefreshedAt) {
                    setLastRefreshedAt(changes.lastRefreshedAt.newValue || null);
                }
                refreshItems();
            }
        };
        chrome.storage.onChanged.addListener(handleStorageChange);

        // Tick every minute so the relative-time label stays current
        const ticker = setInterval(() => setTickCount(n => n + 1), 60000);

        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
            clearInterval(ticker);
        };
    }, []);

    useEffect(() => {
        setPage(1);
        setFocusedIndex(null);
    }, [selectedFeedId]);

    useEffect(() => {
        setPage(1);
        setFocusedIndex(null);
    }, [searchQuery]);

    // Keyboard navigation: j/k or arrows to move focus, Enter to expand/collapse.
    useEffect(() => {
        const handler = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'j' || e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedIndex(prev => Math.min((prev ?? -1) + 1, visibleItems.length - 1));
            } else if (e.key === 'k' || e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedIndex(prev => Math.max((prev ?? visibleItems.length) - 1, 0));
            } else if (e.key === 'Enter' && focusedIndex !== null) {
                const item = visibleItems[focusedIndex];
                if (item) toggleExpand(item.id, item.feedId);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [focusedIndex, visibleItems, toggleExpand]);

    const loadData = async () => {
        const [subs, ts, cfg] = await Promise.all([
            getSubscriptions(), getLastRefreshed(), getSettings()
        ]);
        setSubscriptions(subs);
        setLastRefreshedAt(ts);
        setSettings(cfg);
        applyAppearance(cfg);
        refreshItems();
    };

    const handleSaveSettings = async (patch) => {
        const updated = { ...settings, ...patch };
        setSettings(updated);
        await saveSettings(updated);
        applyAppearance(updated);
    };

    const refreshItems = async () => {
        const allItems = await getItems();
        setItems(allItems);
    };

    const relativeTime = (isoTs) => {
        if (!isoTs) return null;
        const diffMs = Date.now() - new Date(isoTs).getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin} min ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        return `${Math.floor(diffHr / 24)}d ago`;
    };

    const handleManualRefresh = () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        chrome.runtime.sendMessage({ type: 'REFRESH_FEEDS' }, () => {
            setIsRefreshing(false);
        });
    };

    const handleAddFeed = async (e) => {
        e.preventDefault();
        if (!newFeedUrl) return;
        setLoading(true);
        addFeedToBackground(newFeedUrl).then(success => {
            setLoading(false);
            if (success) setNewFeedUrl('');
        });
    };

    const addFeedToBackground = (url) => {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'ADD_FEED', url }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Runtime error:', chrome.runtime.lastError);
                    resolve(false);
                    return;
                }
                resolve(response?.success ?? false);
            });
        });
    };

    const handleDeleteFeed = (id) => {
        if (!confirm('Unsubscribe from this feed?')) return;
        chrome.runtime.sendMessage({ type: 'DELETE_FEED', feedId: id });
    };

    const handleImportOPML = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        try {
            const feeds = parseOPML(text);
            setImportStatus(`Found ${feeds.length} feeds. Importing...`);
            let count = 0;
            for (const feed of feeds) {
                setImportStatus(`Importing ${count + 1}/${feeds.length}: ${feed.title}`);
                await addFeedToBackground(feed.url);
                count++;
            }
            setImportStatus(`Done — ${count} feeds imported.`);
        } catch (err) {
            setImportStatus('Error parsing OPML file.');
            console.error(err);
        }
    };

    const handleExportOPML = () => {
        const xml = generateOPML(subscriptions);
        const blob = new Blob([xml], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'subscriptions.opml';
        a.click();
    };

    const sectionTitle = selectedFeedId
        ? subMap[selectedFeedId] ?? 'Feed'
        : 'Reading List';

    return (
        <div className="dashboard-container">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-masthead">
                    <span className="masthead-title">SimpleReader</span>
                    <button className="settings-btn" onClick={() => setShowSettings(true)} title="Settings">
                        ⚙
                    </button>
                </div>

                <form className="add-feed-form" onSubmit={handleAddFeed}>
                    <input
                        type="url"
                        className="feed-url-input"
                        placeholder="https://example.com/rss"
                        value={newFeedUrl}
                        onChange={(e) => setNewFeedUrl(e.target.value)}
                    />
                    <button type="submit" className="subscribe-btn" disabled={loading}>
                        {loading ? 'Adding...' : '+ Subscribe'}
                    </button>
                </form>

                <nav className="feed-nav">
                    <ul className="feed-list">
                        <li
                            className={`feed-item ${!selectedFeedId ? 'active' : ''}`}
                            onClick={() => setSelectedFeedId(null)}
                        >
                            <span className="feed-item-title">All Articles</span>
                            {totalUnread > 0 && <span className="feed-unread">{totalUnread}</span>}
                        </li>
                        {sortedSubscriptions.map(sub => (
                            <li
                                key={sub.id}
                                className={`feed-item ${selectedFeedId === sub.id ? 'active' : ''}`}
                                onClick={() => setSelectedFeedId(sub.id)}
                            >
                                <span className="feed-item-title">{sub.title}</span>
                                {unreadByFeed[sub.id] > 0 && (
                                    <span className="feed-unread">{unreadByFeed[sub.id]}</span>
                                )}
                                <button
                                    className={`feed-item-star ${sub.starred ? 'starred' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); toggleStar(sub.id); }}
                                    title={sub.starred ? 'Unpin' : 'Pin to top'}
                                >
                                    {sub.starred ? '★' : '☆'}
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="main-content">
                <header className="content-header">
                    <h1 className="section-title">{sectionTitle}</h1>
                    {displayItems.length > 0 && (
                        <span className="article-count">{displayItems.length} articles</span>
                    )}
                    <div className="header-refresh">
                        <input
                            type="search"
                            className="search-input"
                            placeholder="Search…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {isRefreshing ? (
                            <span className="last-updated">Refreshing…</span>
                        ) : lastRefreshedAt ? (
                            <span className="last-updated">Updated {relativeTime(lastRefreshedAt)}</span>
                        ) : null}
                        <button
                            className="refresh-btn"
                            onClick={handleManualRefresh}
                            disabled={isRefreshing}
                            title="Refresh feeds"
                        >
                            ↻
                        </button>
                    </div>
                </header>

                <div className="article-list">
                    {displayItems.length === 0 && (
                        <div className="empty-state">
                            <p className="empty-headline">Nothing here yet.</p>
                            <p className="empty-body">
                                Add an RSS feed above, or import an OPML file via Settings.
                            </p>
                        </div>
                    )}

                    {visibleItems.map((item, index) => (
                        <ArticleItem
                            key={item.id}
                            item={item}
                            feedTitle={subMap[item.feedId]}
                            isExpanded={expandedItems.has(item.id)}
                            isFocused={focusedIndex === index}
                            onToggle={toggleExpand}
                        />
                    ))}

                    {hasMore && (
                        <div className="load-more-container">
                            <button className="load-more-btn" onClick={() => setPage(p => p + 1)}>
                                Load more — {displayItems.length - visibleItems.length} remaining
                            </button>
                        </div>
                    )}
                </div>
            </main>

            {/* Settings Modal */}
            {showSettings && (
                <div className="modal-overlay" onClick={() => setShowSettings(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Settings</h2>
                            <button className="modal-close" onClick={() => setShowSettings(false)}>✕</button>
                        </div>

                        <section className="modal-section">
                            <h3 className="modal-section-title">Appearance</h3>
                            <p className="modal-section-title" style={{ marginBottom: 8 }}>Theme</p>
                            <div className="modal-actions" style={{ marginBottom: 16 }}>
                                {['light', 'dark', 'system'].map(t => (
                                    <button key={t}
                                        className={`modal-btn ${settings.theme === t ? 'primary' : 'secondary'}`}
                                        onClick={() => handleSaveSettings({ theme: t })}>
                                        {t[0].toUpperCase() + t.slice(1)}
                                    </button>
                                ))}
                            </div>
                            <p className="modal-section-title" style={{ marginBottom: 8 }}>Font Size</p>
                            <div className="modal-actions">
                                {['small', 'medium', 'large'].map(s => (
                                    <button key={s}
                                        className={`modal-btn ${settings.fontSize === s ? 'primary' : 'secondary'}`}
                                        onClick={() => handleSaveSettings({ fontSize: s })}>
                                        {s[0].toUpperCase() + s.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section className="modal-section">
                            <h3 className="modal-section-title">OPML</h3>
                            <div className="modal-actions">
                                <button className="modal-btn primary" onClick={() => fileInputRef.current.click()}>
                                    Import OPML
                                </button>
                                <input
                                    type="file"
                                    accept=".opml,.xml"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={handleImportOPML}
                                />
                                <button className="modal-btn secondary" onClick={handleExportOPML}>
                                    Export OPML
                                </button>
                            </div>
                            {importStatus && <p className="import-status">{importStatus}</p>}
                        </section>

                        <section className="modal-section">
                            <h3 className="modal-section-title">Subscriptions</h3>
                            <ul className="subscription-list">
                                {subscriptions.map(sub => (
                                    <li key={sub.id} className="subscription-item">
                                        <span className="subscription-title">{sub.title}</span>
                                        <button
                                            className="delete-btn"
                                            onClick={() => handleDeleteFeed(sub.id)}
                                        >
                                            Remove
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;
