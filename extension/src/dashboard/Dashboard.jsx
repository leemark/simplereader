import React, { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import '../App.css';
import { getSubscriptions, saveSubscriptions, getItems, saveItems } from '../utils/storage';

function Dashboard() {
    const [subscriptions, setSubscriptions] = useState([]);
    const [items, setItems] = useState([]);
    const [newFeedUrl, setNewFeedUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedFeedId, setSelectedFeedId] = useState(null);
    const [expandedItems, setExpandedItems] = useState(new Set());

    useEffect(() => {
        loadData();

        // Listen for storage changes (sync)
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

    useEffect(() => {
        refreshItems();
    }, [selectedFeedId]);

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

        // Delegate to Background Worker to bypass CORS
        chrome.runtime.sendMessage({ type: 'ADD_FEED', url: newFeedUrl }, (response) => {
            setLoading(false);

            if (chrome.runtime.lastError) {
                console.error('Runtime error:', chrome.runtime.lastError);
                alert('Error connecting to background service. Please reload the extension.');
                return;
            }

            if (response && response.success) {
                setNewFeedUrl('');
            } else {
                console.error('Background error:', response?.error);
                alert(`Failed to add feed: ${response?.error || 'Unknown error'}`);
            }
        });
    };

    return (
        <div className="dashboard-container">
            <div className="sidebar">
                <h2>Feeds</h2>
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
            <div className="main-content">
                <header>
                    <h2>{selectedFeedId ? subscriptions.find(s => s.id === selectedFeedId)?.title : 'Reading List'}</h2>
                </header>
                <div className="article-list">
                    {items.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '50px' }}>
                            <p style={{ fontSize: '1.2rem' }}>No articles found.</p>
                            <p>Add a trusted RSS feed (e.g., https://news.ycombinator.com/rss) to verify.</p>
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

                                            /* Fix overflow */
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
                                            onClick={(e) => e.stopPropagation()} /* Prevent closing card */
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
        </div>
    );
}

export default Dashboard;
