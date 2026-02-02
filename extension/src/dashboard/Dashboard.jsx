import React, { useEffect, useState } from 'react';
import '../App.css';
import { getSubscriptions, saveSubscriptions, getItems, saveItems } from '../utils/storage';
// REMOVED: import { fetchFeed } from '../utils/fetcher'; - Fetching must happen in Background

function Dashboard() {
    const [subscriptions, setSubscriptions] = useState([]);
    const [items, setItems] = useState([]);
    const [newFeedUrl, setNewFeedUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedFeedId, setSelectedFeedId] = useState(null);

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


    const handleAddFeed = async (e) => {
        e.preventDefault();
        if (!newFeedUrl) return;

        setLoading(true);

        // Delegate to Background Worker to bypass CORS
        chrome.runtime.sendMessage({ type: 'ADD_FEED', url: newFeedUrl }, (response) => {
            setLoading(false);

            // Handle connection errors (e.g. background script asleep or updated)
            if (chrome.runtime.lastError) {
                console.error('Runtime error:', chrome.runtime.lastError);
                alert('Error connecting to background service. Please reload the extension.');
                return;
            }

            if (response && response.success) {
                setNewFeedUrl('');
                // UI updates automatically via storage listener
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
                            <p style={{ fontSize: '0.8rem', marginTop: '10px' }}>Note: If fetch fails, ensure the URL is correct and valid XML.</p>
                        </div>
                    )}
                    {items.map(item => (
                        <div key={item.id} className="article-card">
                            <a href={item.link} target="_blank" rel="noopener noreferrer">
                                {item.title}
                            </a>
                            <div className="article-meta">
                                <span>{item.pubDate ? new Date(item.pubDate).toLocaleDateString() : ''}</span>
                                <span>•</span>
                                <span>{subscriptions.find(s => s.id === item.feedId)?.title}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
