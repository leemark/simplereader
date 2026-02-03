import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true
});

/**
 * Parses OPML content and returns a list of feed objects { title, url }
 * @param {string} xmlContent 
 */
export function parseOPML(xmlContent) {
    try {
        const result = parser.parse(xmlContent);
        const body = result.opml?.body;
        if (!body) throw new Error('Invalid OPML');

        const outlines = Array.isArray(body.outline) ? body.outline : [body.outline];

        // Flatten nested outlines (folders)
        const feeds = [];

        function traverse(nodes) {
            const list = Array.isArray(nodes) ? nodes : [nodes];
            list.forEach(node => {
                if (node['@_xmlUrl']) {
                    feeds.push({
                        title: node['@_title'] || node['@_text'] || 'Untitled',
                        url: node['@_xmlUrl']
                    });
                }
                if (node.outline) {
                    traverse(node.outline);
                }
            });
        }

        traverse(outlines);
        return feeds;
    } catch (e) {
        console.error('OPML Parse Error', e);
        throw e;
    }
}

/**
 * Generates OPML string from subscriptions
 * @param {Array} subscriptions 
 */
export function generateOPML(subscriptions) {
    const opmlObj = {
        opml: {
            "@_version": "2.0",
            head: {
                title: "SimpleReader Export"
            },
            body: {
                outline: {
                    "@_text": "SimpleReader Feeds",
                    "@_title": "SimpleReader Feeds",
                    outline: subscriptions.map(sub => ({
                        "@_text": sub.title,
                        "@_title": sub.title,
                        "@_type": "rss",
                        "@_xmlUrl": sub.url,
                        "@_htmlUrl": sub.url // simplified
                    }))
                }
            }
        }
    };
    return builder.build(opmlObj);
}
