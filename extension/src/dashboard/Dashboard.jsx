import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import DOMPurify from 'dompurify';
import '../App.css';
import { getSubscriptions, getItems, getLastRefreshed } from '../utils/storage';
import { parseOPML, generateOPML } from '../utils/opml';

const PAGE_SIZE = 50;

// Strip HTML tags for collapsed plain-text previews — no DOMPurify needed.
function stripHtml(html) {
    const stripped = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const ta = document.createElement('textarea');
    ta.innerHTML = stripped;
    return ta.value;
}

// Memoized per-article component. Only re-renders when its own props change,
// so expanding one article doesn't re-render all others.
const ArticleItem = React.memo(function ArticleItem({ item, feedTitle, isExpanded, onToggle }) {
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
            className={`article-item ${isExpanded ? 'expanded' : ''}`}
            onClick={() => onToggle(item.id)}
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

    const [showSettings, setShowSettings] = useState(false);
    const [importStatus, setImportStatus] = useState('');
    const fileInputRef = useRef(null);

    const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [, setTickCount] = useState(0);

    // O(1) feed title lookup instead of O(n) find() called once per rendered item.
    const subMap = useMemo(
        () => Object.fromEntries(subscriptions.map(s => [s.id, s.title])),
        [subscriptions]
    );

    // Only the slice of items for the current page goes into the DOM.
    const visibleItems = useMemo(
        () => items.slice(0, page * PAGE_SIZE),
        [items, page]
    );

    const hasMore = visibleItems.length < items.length;

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
        refreshItems();
    }, [selectedFeedId]);

    const loadData = async () => {
        const [subs, ts] = await Promise.all([getSubscriptions(), getLastRefreshed()]);
        setSubscriptions(subs);
        setLastRefreshedAt(ts);
        refreshItems();
    };

    const refreshItems = async () => {
        const allItems = await getItems(selectedFeedId);
        allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
        setItems(allItems);
    };

    // useCallback makes the reference stable so ArticleItem's React.memo works correctly.
    const toggleExpand = useCallback((itemId) => {
        setExpandedItems(prev => {
            const next = new Set(prev);
            next.has(itemId) ? next.delete(itemId) : next.add(itemId);
            return next;
        });
    }, []);

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
                            All Articles
                        </li>
                        {subscriptions.map(sub => (
                            <li
                                key={sub.id}
                                className={`feed-item ${selectedFeedId === sub.id ? 'active' : ''}`}
                                onClick={() => setSelectedFeedId(sub.id)}
                            >
                                {sub.title}
                            </li>
                        ))}
                    </ul>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="main-content">
                <header className="content-header">
                    <h1 className="section-title">{sectionTitle}</h1>
                    {items.length > 0 && (
                        <span className="article-count">{items.length} articles</span>
                    )}
                    <div className="header-refresh">
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
                    {items.length === 0 && (
                        <div className="empty-state">
                            <p className="empty-headline">Nothing here yet.</p>
                            <p className="empty-body">
                                Add an RSS feed above, or import an OPML file via Settings.
                            </p>
                        </div>
                    )}

                    {visibleItems.map(item => (
                        <ArticleItem
                            key={item.id}
                            item={item}
                            feedTitle={subMap[item.feedId]}
                            isExpanded={expandedItems.has(item.id)}
                            onToggle={toggleExpand}
                        />
                    ))}

                    {hasMore && (
                        <div className="load-more-container">
                            <button className="load-more-btn" onClick={() => setPage(p => p + 1)}>
                                Load more — {items.length - visibleItems.length} remaining
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
