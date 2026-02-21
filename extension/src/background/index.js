import { fetchFeed } from '../utils/fetcher';
import { getSubscriptions, saveSubscriptions, saveItems, getItems, getSettings, markItemRead, saveLastRefreshed } from '../utils/storage';

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
        refreshAllFeeds().then(() => sendResponse({ status: 'success' }));
        return true;
    }

    if (request.type === 'ADD_FEED') {
        addNewFeed(request.url)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.toString() }));
        return true; // Async response
    }
});

async function addNewFeed(url) {
    console.log('Adding new feed:', url);
    // 1. Fetch to validate
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
    const itemsToSave = feedData.items.map(item => ({
        ...item,
        feedId: newSub.id,
        fetchedAt: Date.now()
    }));
    await saveItems(itemsToSave);

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
    const subscriptions = await getSubscriptions();
    if (subscriptions.length === 0) {
        console.log('No subscriptions to refresh.');
        return;
    }

    let totalNewItems = 0;

    await Promise.all(subscriptions.map(async (sub) => {
        try {
            const feedData = await fetchFeed(sub.url);

            // Tag items with feedId
            const itemsToSave = feedData.items.map(item => ({
                ...item,
                feedId: sub.id,
                fetchedAt: Date.now()
            }));

            await saveItems(itemsToSave);
            console.log(`Fetched ${sub.title}: ${itemsToSave.length} items.`);
            totalNewItems += itemsToSave.length;

        } catch (err) {
            console.error(`Failed to refresh ${sub.title}:`, err);
        }
    }));

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
