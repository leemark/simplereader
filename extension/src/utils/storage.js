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
 * @param {string} feedId - Optional, filter by feedId
 */
export async function getItems(feedId = null) {
    const data = await chrome.storage.local.get([STORAGE_KEYS.ITEMS]);
    const items = data[STORAGE_KEYS.ITEMS] || {};

    if (feedId) {
        return Object.values(items).filter(item => item.feedId === feedId);
    }
    return Object.values(items);
}

/**
 * Save New Items to Local Storage
 * Merges with existing items, keyed by ID.
 */
export async function saveItems(newItems) {
    const data = await chrome.storage.local.get([STORAGE_KEYS.ITEMS]);
    const currentItems = data[STORAGE_KEYS.ITEMS] || {};

    newItems.forEach(item => {
        // Basic deduplication or update logic
        if (!currentItems[item.id]) {
            currentItems[item.id] = item;
        }
    });

    await chrome.storage.local.set({ [STORAGE_KEYS.ITEMS]: currentItems });
}

/**
 * Mark Item as Read/Unread
 */
export async function markItemRead(itemId, isRead = true) {
    const data = await chrome.storage.local.get([STORAGE_KEYS.ITEMS]);
    const currentItems = data[STORAGE_KEYS.ITEMS] || {};

    if (currentItems[itemId]) {
        currentItems[itemId].read = isRead;
        await chrome.storage.local.set({ [STORAGE_KEYS.ITEMS]: currentItems });
    }
}

/**
 * Clear all data (Debugging/Reset)
 */
export async function clearAllData() {
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
}
