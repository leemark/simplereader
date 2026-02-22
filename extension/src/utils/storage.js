/**
 * storage.js
 * Unified wrapper for chrome.storage to handle Sync vs Local separation.
 */

const STORAGE_KEYS = {
    SETTINGS: 'settings',
    SUBSCRIPTIONS: 'subscriptions',
    FEED_META: 'feedMeta',
    ITEMS: 'items' // Stored in local
};

/**
 * Get Settings from Sync Storage
 */
export async function getSettings() {
    const data = await chrome.storage.sync.get([STORAGE_KEYS.SETTINGS]);
    return data[STORAGE_KEYS.SETTINGS] || {
        refreshInterval: 30, // minutes
        theme: 'system',
        fontSize: 'medium',
        showUnreadOnly: false
    };
}

/**
 * Save Settings to Sync Storage
 */
export async function saveSettings(settings) {
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

/**
 * Get Subscriptions from Sync Storage
 */
export async function getSubscriptions() {
    const data = await chrome.storage.sync.get([STORAGE_KEYS.SUBSCRIPTIONS]);
    return data[STORAGE_KEYS.SUBSCRIPTIONS] || [];
}

/**
 * Save Subscriptions to Sync Storage
 */
export async function saveSubscriptions(subscriptions) {
    await chrome.storage.sync.set({ [STORAGE_KEYS.SUBSCRIPTIONS]: subscriptions });
}

/**
 * Get Items (Articles) from Local Storage
 * Items are stored per-feed under keys like "items_<feedId>".
 * @param {string} feedId - Optional, filter by feedId
 */
export async function getItems(feedId = null) {
    if (feedId) {
        const key = `items_${feedId}`;
        const data = await chrome.storage.local.get([key]);
        return Object.values(data[key] || {});
    }

    // Fetch all subscriptions to know which per-feed keys exist
    const subs = await getSubscriptions();
    if (subs.length === 0) return [];

    const keys = subs.map(s => `items_${s.id}`);
    const data = await chrome.storage.local.get(keys);
    return keys.flatMap(key => Object.values(data[key] || {}));
}

const MAX_ITEMS_PER_FEED = 200;

/**
 * Save New Items to Local Storage
 * Reads and writes only the affected feed's key, not the entire items collection.
 * Trims to MAX_ITEMS_PER_FEED most recent items to prevent unbounded storage growth.
 */
export async function saveItems(newItems) {
    if (newItems.length === 0) return;

    // Items passed in a single call always share the same feedId
    const feedId = newItems[0].feedId;
    const key = `items_${feedId}`;
    const data = await chrome.storage.local.get([key]);
    const currentItems = data[key] || {};

    newItems.forEach(item => {
        if (!currentItems[item.id]) {
            currentItems[item.id] = item;
        }
    });

    // Trim to the most recent MAX_ITEMS_PER_FEED items
    const allValues = Object.values(currentItems);
    if (allValues.length > MAX_ITEMS_PER_FEED) {
        allValues.sort((a, b) => new Date(b.pubDate || b.fetchedAt) - new Date(a.pubDate || a.fetchedAt));
        const trimmed = allValues.slice(0, MAX_ITEMS_PER_FEED);
        const trimmedObj = {};
        trimmed.forEach(item => { trimmedObj[item.id] = item; });
        await chrome.storage.local.set({ [key]: trimmedObj });
    } else {
        await chrome.storage.local.set({ [key]: currentItems });
    }
}

/**
 * Mark Item as Read/Unread
 */
export async function markItemRead(itemId, feedId, isRead = true) {
    const key = `items_${feedId}`;
    const data = await chrome.storage.local.get([key]);
    const currentItems = data[key] || {};

    if (currentItems[itemId]) {
        currentItems[itemId].read = isRead;
        await chrome.storage.local.set({ [key]: currentItems });
    }
}

/**
 * Get all cached HTTP validators (ETag / Last-Modified) for every feed.
 * Returns a plain object keyed by feedId: { [feedId]: { etag, lastModified } }
 */
export async function getFeedValidators() {
    const data = await chrome.storage.local.get([STORAGE_KEYS.FEED_META]);
    return data[STORAGE_KEYS.FEED_META] || {};
}

/**
 * Persist the full validators map in a single write.
 * @param {{ [feedId]: { etag: string|null, lastModified: string|null } }} validators
 */
export async function saveFeedValidators(validators) {
    await chrome.storage.local.set({ [STORAGE_KEYS.FEED_META]: validators });
}

/**
 * Get the ISO timestamp of the last successful feed refresh from Local Storage
 */
export async function getLastRefreshed() {
    const data = await chrome.storage.local.get(['lastRefreshedAt']);
    return data.lastRefreshedAt || null;
}

/**
 * Save the ISO timestamp of the last successful feed refresh to Local Storage
 */
export async function saveLastRefreshed(ts) {
    await chrome.storage.local.set({ lastRefreshedAt: ts });
}

/**
 * Clear all data (Debugging/Reset)
 */
export async function clearAllData() {
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
}
