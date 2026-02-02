import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

/**
 * Fetches and parses an RSS/Atom feed.
 * @param {string} url 
 * @returns {Promise<{title: string, items: Array}>} - Normalized feed object
 */
export async function fetchFeed(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const xmlText = await response.text();
        const result = parser.parse(xmlText);

        // Normalize RSS vs Atom
        if (result.rss) {
            return parseRSS2(result.rss);
        } else if (result.feed) {
            return parseAtom(result.feed);
        } else if (result['rdf:RDF']) {
            return parseRSS1(result['rdf:RDF']);
        } else {
            throw new Error('Unknown feed format');
        }

    } catch (error) {
        console.error('Feed fetch error:', error);
        throw error;
    }
}

function parseRSS2(rss) {
    const channel = rss.channel;
    const items = Array.isArray(channel.item) ? channel.item : [channel.item];

    return {
        title: channel.title,
        description: channel.description,
        items: items.map(item => ({
            id: item.guid?.['#text'] || item.link || item.title, // Fallback ID
            title: item.title,
            link: item.link,
            content: item['content:encoded'] || item.description,
            pubDate: item.pubDate,
            read: false
        }))
    };
}

function parseAtom(feed) {
    const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];

    return {
        title: feed.title,
        items: entries.map(entry => {
            // Atom links can be arrays or objects
            const link = Array.isArray(entry.link)
                ? entry.link.find(l => l['@_rel'] === 'alternate' || !l['@_rel'])?.['@_href']
                : entry.link['@_href'];

            return {
                id: entry.id,
                title: entry.title,
                link: link,
                content: entry.content?.['#text'] || entry.summary?.['#text'],
                pubDate: entry.updated || entry.published,
                read: false
            };
        })
    };
}

function parseRSS1(rdf) {
    const channel = rdf.channel;
    const items = Array.isArray(rdf.item) ? rdf.item : [rdf.item];

    return {
        title: channel.title,
        items: items.map(item => ({
            id: item.link || item.title,
            title: item.title,
            link: item.link,
            content: item.description,
            pubDate: item['dc:date'],
            read: false
        }))
    }
}
