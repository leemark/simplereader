import React, { useEffect, useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import '../App.css';
import { getSubscriptions, getItems } from '../utils/storage';
import { parseOPML, generateOPML } from '../utils/opml';

function Dashboard() {
    const [subscriptions, setSubscriptions] = useState([]);
    const [items, setItems] = useState([]);
    const [newFeedUrl, setNewFeedUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedFeedId, setSelectedFeedId] = useState(null);
    const [expandedItems, setExpandedItems] = useState(new Set());

    const [showSettings, setShowSettings] = useState(false);
    const [importStatus, setImportStatus] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => {
        loadData();

        const handleStorageChange = (changes, area) => {
            if (area === 'sync' && changes.subscriptions) {
                setSubscriptions(changes.subscriptions.newValue || []);
            }
            if (area === 'local' && changes.items) {
                refreshItems();
            }
        };
        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }, []);

    useEffect(() => {
        refreshItems();
    }, [selectedFeedId]);

    const loadData = async () => {
        const subs = await getSubscriptions();
        setSubscriptions(subs);
        refreshItems();
    };

    const refreshItems = async () => {
        const allItems = await getItems(selectedFeedId);
        allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
        setItems(allItems);
    };

    const toggleExpand = (itemId) => {
        const newSet = new Set(expandedItems);
        if (newSet.has(itemId)) {
            newSet.delete(itemId);
        } else {
            newSet.add(itemId);
        }
        setExpandedItems(newSet);
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

    const formatDate = (pubDate) => {
        if (!pubDate) return '';
        return new Date(pubDate).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    const sectionTitle = selectedFeedId
        ? subscriptions.find(s => s.id === selectedFeedId)?.title
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

                    {items.map(item => {
                        const isExpanded = expandedItems.has(item.id);
                        const feedTitle = subscriptions.find(s => s.id === item.feedId)?.title;
                        return (
                            <article
                                key={item.id}
                                className={`article-item ${isExpanded ? 'expanded' : ''}`}
                                onClick={() => toggleExpand(item.id)}
                            >
                                <h2 className="article-title">{item.title}</h2>

                                <div className="article-meta">
                                    {feedTitle && <span className="feed-source">{feedTitle}</span>}
                                    {feedTitle && item.pubDate && <span className="meta-sep">·</span>}
                                    {item.pubDate && (
                                        <time className="article-date">{formatDate(item.pubDate)}</time>
                                    )}
                                </div>

                                {item.content && (
                                    <div className={`article-excerpt ${isExpanded ? 'expanded' : ''}`}>
                                        <div
                                            className="article-body"
                                            dangerouslySetInnerHTML={{
                                                __html: DOMPurify.sanitize(item.content, {
                                                    ADD_TAGS: ['img', 'iframe'],
                                                    ADD_ATTR: ['src', 'width', 'height', 'style']
                                                })
                                            }}
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
                    })}
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
