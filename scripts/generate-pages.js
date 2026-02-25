/**
 * Build-time page generator for OG meta tags.
 *
 * Reads index.html (with __OG_*__ placeholders) and event/resource data,
 * then generates per-route HTML files with correct meta tags baked in.
 *
 * Usage:
 *   BASE_URL=https://example.com node scripts/generate-pages.js
 *
 * Set DATA_SOURCE=volume to read individual files from /files/ volume
 * instead of bundled JSON arrays (used at container startup after migration).
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
    console.error('ERROR: BASE_URL environment variable is required.');
    console.error('Usage: BASE_URL=https://example.com node scripts/generate-pages.js');
    process.exit(1);
}

// Remove trailing slash if present
const baseUrl = BASE_URL.replace(/\/+$/, '');
const DEFAULT_IMAGE = `${baseUrl}/events/images/event-conference.jpg`;

const DATA_SOURCE = process.env.DATA_SOURCE || 'bundled';
const FILES_DIR = process.env.FILES_DIR || '/files';

function loadEventsFromVolume() {
    const eventsDir = path.join(FILES_DIR, 'events');
    if (!fs.existsSync(eventsDir)) return [];
    return fs.readdirSync(eventsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            try { return JSON.parse(fs.readFileSync(path.join(eventsDir, f), 'utf-8')); }
            catch { return null; }
        })
        .filter(Boolean);
}

function loadResourcesFromVolume() {
    const libraryDir = path.join(FILES_DIR, 'library');
    if (!fs.existsSync(libraryDir)) return [];
    return fs.readdirSync(libraryDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => {
            const jsonPath = path.join(libraryDir, e.name, 'resource.json');
            if (!fs.existsSync(jsonPath)) return null;
            try { return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')); }
            catch { return null; }
        })
        .filter(Boolean);
}

// Read template
const template = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');

// Read data from bundled JSON or volume individual files
let eventsData, resourcesData;

if (DATA_SOURCE === 'volume') {
    console.log('Reading data from volume individual files...');
    eventsData = loadEventsFromVolume();
    resourcesData = loadResourcesFromVolume();
} else {
    eventsData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'events', 'events.json'), 'utf-8')
    );
    resourcesData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'library', 'resources.json'), 'utf-8')
    );
}

// Static page routes
const routes = [
    {
        path: '/',
        title: 'Human in the Loop | Modern Education',
        description: 'Master the skills of tomorrow with industry-leading courses in engineering, design, and product strategy. Built for ambitious professionals.',
        image: DEFAULT_IMAGE
    },
    {
        path: '/events',
        title: 'Events & Workshops | Human in the Loop',
        description: 'Register for upcoming live sessions, hackathons, and guest lectures hosted by industry veterans.',
        image: DEFAULT_IMAGE
    },
    {
        path: '/library',
        title: 'Library | Human in the Loop',
        description: 'Articles, image galleries, and video resources from the Human in the Loop community.',
        image: DEFAULT_IMAGE
    },
    {
        path: '/styleguide',
        title: 'Styleguide | Human in the Loop',
        description: 'The design system and component library powering Human in the Loop.',
        image: DEFAULT_IMAGE
    },
    {
        path: '/privacy',
        title: 'Privacy Policy | Human in the Loop',
        description: 'Privacy policy for Human in the Loop. Learn how we collect, use, and protect your data.',
        image: DEFAULT_IMAGE
    },
    {
        path: '/terms',
        title: 'Terms of Service | Human in the Loop',
        description: 'Terms of service for Human in the Loop educational platform.',
        image: DEFAULT_IMAGE
    },
    {
        path: '/imprint',
        title: 'Imprint | Human in the Loop',
        description: 'Legal information and company details for Human in the Loop GmbH.',
        image: DEFAULT_IMAGE
    }
];

// Add event detail routes from events.json
eventsData.forEach((event) => {
    const desc = event.description[0];
    const truncated = desc.length > 160 ? desc.substring(0, 157) + '...' : desc;

    routes.push({
        path: `/event/${event.id}`,
        title: `${event.title} | Human in the Loop`,
        description: truncated,
        image: `${baseUrl}/${event.image}`
    });
});

// Add resource detail routes from resources.json
resourcesData.forEach((resource) => {
    const desc = resource.description[0];
    const truncated = desc.length > 160 ? desc.substring(0, 157) + '...' : desc;

    routes.push({
        path: `/resource/${resource.id}`,
        title: `${resource.title} | Human in the Loop`,
        description: truncated,
        image: resource.thumbnail ? `${baseUrl}${resource.thumbnail}` : DEFAULT_IMAGE
    });
});

// HTML-escape meta content to prevent injection
function escapeAttr(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Generate per-route HTML
const distDir = path.join(__dirname, '..', 'dist');

routes.forEach((route) => {
    const url = route.path === '/'
        ? baseUrl
        : `${baseUrl}${route.path}`;

    const html = template
        .replace(/__OG_TITLE__/g, escapeAttr(route.title))
        .replace(/__OG_DESCRIPTION__/g, escapeAttr(route.description))
        .replace(/__OG_IMAGE__/g, route.image)
        .replace(/__OG_URL__/g, url);

    const outDir = route.path === '/'
        ? distDir
        : path.join(distDir, route.path);

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
});

console.log(`Generated ${routes.length} pages in dist/`);
