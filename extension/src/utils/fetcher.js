import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

// fast-xml-parser returns text nodes with attributes as { "#text": "...", "@_type": "..." }
// This extracts a plain string in either case.
function getText(value) {
    if (!value) return '';
    if (typeof value === 'object') return value['#text'] || '';
    return String(value);
}

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
        title: getText(channel.title),
        description: getText(channel.description),
        items: items.map(item => ({
            id: item.guid?.['#text'] || item.link || getText(item.title),
            title: getText(item.title),
            link: item.link,
            content: getText(item['content:encoded'] || item.description),
            pubDate: item.pubDate,
            read: false
        }))
    };
}

function parseAtom(feed) {
    const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];

    return {
        title: getText(feed.title),
        items: entries.map(entry => {
            // Atom links can be arrays or objects
            const link = Array.isArray(entry.link)
                ? entry.link.find(l => l['@_rel'] === 'alternate' || !l['@_rel'])?.['@_href']
                : entry.link?.['@_href'];

            return {
                id: getText(entry.id),
                title: getText(entry.title),
                link: link,
                content: getText(entry.content || entry.summary),
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
        title: getText(channel.title),
        items: items.map(item => ({
            id: item.link || getText(item.title),
            title: getText(item.title),
            link: item.link,
            content: getText(item.description),
            pubDate: item['dc:date'],
            read: false
        }))
    }
}
