import { fetchFeed } from '../utils/fetcher';
import { getSubscriptions, saveSubscriptions, saveItems, getItems, getSettings, saveLastRefreshed, getFeedValidators, saveFeedValidators } from '../utils/storage';

const ALARM_NAME = 'refresh_feeds';

// Initialize Alarm on Install
chrome.runtime.onInstalled.addListener(async () => {
    console.log('SimpleReader Installed');
    await setupAlarm();
});

// Re-create alarm on browser startup (guards against alarm loss on Chrome updates / disable+re-enable)
chrome.runtime.onStartup.addListener(async () => {
    console.log('SimpleReader startup');
    await setupAlarm();
});

// Alarm Listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        console.log('Alarm triggered: Refreshing feeds...');
        await refreshAllFeeds();
    }
});

// Message Listener (from UI)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'REFRESH_FEEDS') {
        refreshAllFeeds()
            .then(() => sendResponse({ status: 'success' }))
            .catch((err) => sendResponse({ status: 'error', error: err.toString() }));
        return true;
    }

    if (request.type === 'ADD_FEED') {
        addNewFeed(request.url)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.toString() }));
        return true; // Async response
    }

    if (request.type === 'DELETE_FEED') {
        deleteFeed(request.feedId)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.toString() }));
        return true;
    }
});

async function addNewFeed(url) {
    console.log('Adding new feed:', url);
    // 1. Fetch to validate (no validators on first fetch)
    const feedData = await fetchFeed(url);

    // 2. Create and Save Subscription
    const subscriptions = await getSubscriptions();

    // Check duplicates
    if (subscriptions.some(s => s.url === url)) {
        throw new Error('Feed already exists');
    }

    const newSub = {
        id: crypto.randomUUID(),
        url: url,
        title: feedData.title,
        addedAt: Date.now()
    };

    await saveSubscriptions([...subscriptions, newSub]);

    // 3. Save initial items
    const { etag, lastModified, siteLink, ...feedRest } = feedData;
    const itemsToSave = feedRest.items.map(item => ({
        ...item,
        feedId: newSub.id,
        fetchedAt: Date.now()
    }));
    await saveItems(itemsToSave);

    // 4. Persist any validators (and siteLink) the server returned
    if (etag || lastModified || siteLink) {
        const allValidators = await getFeedValidators();
        allValidators[newSub.id] = { etag, lastModified, siteLink };
        await saveFeedValidators(allValidators);
    }

    await updateBadge();
}

async function deleteFeed(feedId) {
    console.log('Deleting feed:', feedId);

    // 1. Remove from subscriptions
    const subscriptions = await getSubscriptions();
    await saveSubscriptions(subscriptions.filter(s => s.id !== feedId));

    // 2. Delete feed items from local storage
    await chrome.storage.local.remove(`items_${feedId}`);

    // 3. Clean up feedMeta entry
    const allValidators = await getFeedValidators();
    delete allValidators[feedId];
    await saveFeedValidators(allValidators);

    // 4. Update badge
    await updateBadge();
}

async function setupAlarm() {
    const existing = await chrome.alarms.get(ALARM_NAME);
    if (existing) return;
    const settings = await getSettings();
    chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: settings.refreshInterval || 30
    });
}

async function refreshAllFeeds() {
    const [subscriptions, allValidators] = await Promise.all([
        getSubscriptions(),
        getFeedValidators(),
    ]);

    if (subscriptions.length === 0) {
        console.log('No subscriptions to refresh.');
        return;
    }

    const updatedValidators = { ...allValidators };

    await Promise.all(subscriptions.map(async (sub) => {
        try {
            const feedData = await fetchFeed(sub.url, allValidators[sub.id] || {});

            if (feedData === null) {
                console.log(`${sub.title}: not modified.`);
                return;
            }

            const { etag, lastModified, siteLink, ...feedRest } = feedData;

            // Tag items with feedId
            const itemsToSave = feedRest.items.map(item => ({
                ...item,
                feedId: sub.id,
                fetchedAt: Date.now()
            }));

            await saveItems(itemsToSave);
            console.log(`Fetched ${sub.title}: ${itemsToSave.length} items.`);

            if (etag || lastModified || siteLink) {
                updatedValidators[sub.id] = { etag, lastModified, siteLink };
            }

        } catch (err) {
            console.error(`Failed to refresh ${sub.title}:`, err);
        }
    }));

    // Single write for all validator updates
    await saveFeedValidators(updatedValidators);
    await updateBadge();
    await saveLastRefreshed(new Date().toISOString());
}

async function updateBadge() {
    const items = await getItems();
    const unreadCount = items.filter(i => !i.read).length;

    if (unreadCount > 0) {
        chrome.action.setBadgeText({ text: unreadCount > 999 ? '999+' : unreadCount.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#666666' });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}
