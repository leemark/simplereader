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

    // Settings Modal State
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
                refreshItems(); // Refresh items if local storage changes
            }
        };
        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }, []);

    // Effect to re-filter items when selectedFeedId changes
    useEffect(() => {
        refreshItems();
    }, [selectedFeedId]); // Depend on selectedFeedId

    const loadData = async () => {
        const subs = await getSubscriptions();
        setSubscriptions(subs);
        refreshItems();
    };

    const refreshItems = async () => {
        const allItems = await getItems(selectedFeedId);
        // Sort by date desc
        allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
        setItems(allItems);
    }

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
            chrome.runtime.sendMessage({ type: 'ADD_FEED', url: url }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Runtime error:', chrome.runtime.lastError);
                    resolve(false);
                    return;
                }
                if (response && response.success) {
                    resolve(true);
                } else {
                    console.error('Background error:', response?.error);
                    resolve(false);
                }
            });
        });
    }

    const handleDeleteFeed = (id) => {
        if (!confirm('Are you sure you want to unsubscribe?')) return;
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
            // Sequential import to avoid rate limits or overwhelming background
            for (const feed of feeds) {
                setImportStatus(`Importing ${count + 1}/${feeds.length}: ${feed.title}`);
                await addFeedToBackground(feed.url);
                count++;
            }
            setImportStatus(`Import Complete! Imported ${count} feeds.`);
        } catch (err) {
            setImportStatus('Error parsing OPML');
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

    return (
        <div className="dashboard-container">
            {/* Sidebar */}
            <div className="sidebar">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>Feeds</h2>
                    <button
                        onClick={() => setShowSettings(true)}
                        style={{ width: 'auto', padding: '5px 10px', fontSize: '0.8rem', background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer' }}
                        title="Settings"
                    >
                        ⚙️
                    </button>
                </div>

                <form onSubmit={handleAddFeed}>
                    <input
                        type="url"
                        placeholder="https://example.com/rss"
                        value={newFeedUrl}
                        onChange={(e) => setNewFeedUrl(e.target.value)}
                    />
                    <button type="submit" disabled={loading}>
                        {loading ? 'Adding...' : '+ Add Subscription'}
                    </button>
                </form>
                <ul>
                    <li
                        className={!selectedFeedId ? 'active' : ''}
                        onClick={() => setSelectedFeedId(null)}
                    >
                        All Articles
                    </li>
                    {subscriptions.map(sub => (
                        <li
                            key={sub.id}
                            className={selectedFeedId === sub.id ? 'active' : ''}
                            onClick={() => setSelectedFeedId(sub.id)}
                        >
                            {sub.title}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Main Content */}
            <div className="main-content">
                <header>
                    <h2>{selectedFeedId ? subscriptions.find(s => s.id === selectedFeedId)?.title : 'Reading List'}</h2>
                </header>
                <div className="article-list">
                    {items.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '50px' }}>
                            <p style={{ fontSize: '1.2rem' }}>No articles found.</p>
                            <p>Add a trusted RSS feed (e.g., https://news.ycombinator.com/rss) or import an OPML file via Settings.</p>
                        </div>
                    )}
                    {items.map(item => {
                        const isExpanded = expandedItems.has(item.id);
                        return (
                            <div
                                key={item.id}
                                className={`article-card ${isExpanded ? 'expanded' : ''}`}
                                onClick={() => toggleExpand(item.id)}
                                style={{ cursor: 'pointer' }}
                            >
                                <h3 style={{ margin: '0 0 10px 0', fontSize: '1.25rem', color: 'var(--text-main)' }}>
                                    {item.title}
                                </h3>

                                <div className="article-meta" style={{ marginBottom: '12px' }}>
                                    <span>{item.pubDate ? new Date(item.pubDate).toLocaleDateString() : ''}</span>
                                    <span>•</span>
                                    <span>{subscriptions.find(s => s.id === item.feedId)?.title}</span>
                                </div>

                                {item.content && (
                                    <div
                                        className="article-content"
                                        style={{
                                            color: '#cbd5e1',
                                            fontSize: '0.95rem',
                                            lineHeight: '1.6',
                                            maxHeight: isExpanded ? 'none' : '150px',
                                            overflow: 'hidden',
                                            position: 'relative',
                                            maskImage: isExpanded ? 'none' : 'linear-gradient(to bottom, black 60%, transparent 100%)',
                                            WebkitMaskImage: isExpanded ? 'none' : 'linear-gradient(to bottom, black 60%, transparent 100%)',
                                            overflowWrap: 'break-word',
                                            wordWrap: 'break-word',
                                            wordBreak: 'break-word',
                                            maxWidth: '100%'
                                        }}
                                    >
                                        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.content, { ADD_TAGS: ['img', 'iframe'], ADD_ATTR: ['src', 'width', 'height', 'style'] }) }} />
                                    </div>
                                )}

                                {isExpanded && (
                                    <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                        <a
                                            href={item.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                display: 'inline-block',
                                                backgroundColor: 'var(--bg-hover)',
                                                color: 'white',
                                                padding: '8px 16px',
                                                borderRadius: '4px',
                                                textDecoration: 'none',
                                                fontSize: '0.9rem'
                                            }}
                                        >
                                            Read Full Article →
                                        </a>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 100,
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-card)', padding: '2rem', borderRadius: '8px',
                        width: '500px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto',
                        border: '1px solid var(--border)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <h2 style={{ margin: 0 }}>Settings</h2>
                            <button onClick={() => setShowSettings(false)} style={{ width: 'auto', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}>✕</button>
                        </div>

                        <div style={{ marginBottom: '2rem' }}>
                            <h3>OPML Management</h3>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                <button onClick={() => fileInputRef.current.click()} style={{ background: 'var(--accent)' }}>Import OPML</button>
                                <input
                                    type="file"
                                    accept=".opml,.xml"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={handleImportOPML}
                                />
                                <button onClick={handleExportOPML} style={{ background: 'var(--bg-hover)' }}>Export OPML</button>
                            </div>
                            {importStatus && <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{importStatus}</p>}
                        </div>

                        <div>
                            <h3>Manage Feeds</h3>
                            <ul style={{ listStyle: 'none', padding: 0 }}>
                                {subscriptions.map(sub => (
                                    <li key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid var(--border)' }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>{sub.title}</span>
                                        <button
                                            onClick={() => handleDeleteFeed(sub.id)}
                                            style={{ width: 'auto', padding: '5px 10px', background: 'tomato', fontSize: '0.8rem' }}
                                        >
                                            Delete
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;
