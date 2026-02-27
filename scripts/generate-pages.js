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

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
if (!N8N_WEBHOOK_URL) {
    console.warn('WARNING: N8N_WEBHOOK_URL not set — free event registration will not work.');
}

// Remove trailing slash if present
const baseUrl = BASE_URL.replace(/\/+$/, '');
const DEFAULT_IMAGE = `${baseUrl}/events/images/event-conference.jpg`;

const DATA_SOURCE = process.env.DATA_SOURCE || 'bundled';
const FILES_DIR = process.env.FILES_DIR || '/files';

// HTML_ROOT: where index.html template lives and dist/ output goes.
// Defaults to parent of scripts/ dir (works for both build-time and local dev).
// Set to /usr/share/nginx/html at container runtime.
const HTML_ROOT = process.env.HTML_ROOT || path.join(__dirname, '..');

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
const template = fs.readFileSync(path.join(HTML_ROOT, 'index.html'), 'utf-8');

// Read data from bundled JSON or volume individual files
let eventsData, resourcesData;

if (DATA_SOURCE === 'volume') {
    console.log('Reading data from volume individual files...');
    eventsData = loadEventsFromVolume();
    resourcesData = loadResourcesFromVolume();
} else {
    eventsData = JSON.parse(
        fs.readFileSync(path.join(HTML_ROOT, 'events', 'events.json'), 'utf-8')
    );
    resourcesData = JSON.parse(
        fs.readFileSync(path.join(HTML_ROOT, 'library', 'resources.json'), 'utf-8')
    );
}

// Static page routes
const routes = [
    {
        path: '/',
        title: 'Human in the Loop | Moderne Bildung',
        description: 'Erlernen Sie die Fähigkeiten von morgen mit branchenführenden Kursen in Engineering, Design und Produktstrategie. Für ambitionierte Fachkräfte.',
        image: DEFAULT_IMAGE
    },
    {
        path: '/events',
        title: 'Veranstaltungen & Workshops | Human in the Loop',
        description: 'Melden Sie sich für kommende Live-Sessions, Hackathons und Gastvorträge von Branchenexperten an.',
        image: DEFAULT_IMAGE
    },
    {
        path: '/library',
        title: 'Bibliothek | Human in the Loop',
        description: 'Artikel, Bildergalerien und Videoressourcen aus der Human in the Loop-Community.',
        image: DEFAULT_IMAGE
    },
    {
        path: '/styleguide',
        title: 'Styleguide | Human in the Loop',
        description: 'Das Designsystem und die Komponentenbibliothek von Human in the Loop.',
        image: DEFAULT_IMAGE
    },
    {
        path: '/privacy',
        title: 'Datenschutzerklärung | Human in the Loop',
        description: 'Datenschutzerklärung von Human in the Loop. Erfahren Sie, wie wir Ihre Daten erheben, nutzen und schützen.',
        image: DEFAULT_IMAGE
    },
    {
        path: '/terms',
        title: 'Nutzungsbedingungen | Human in the Loop',
        description: 'Nutzungsbedingungen der Bildungsplattform Human in the Loop.',
        image: DEFAULT_IMAGE
    },
    {
        path: '/imprint',
        title: 'Impressum | Human in the Loop',
        description: 'Rechtliche Informationen und Unternehmensdaten der Human in the Loop GmbH.',
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
// OUTPUT_DIR: at build time, writes to dist/ (later overlaid onto HTML root).
// At runtime, writes directly into the HTML root so nginx serves them.
const distDir = process.env.OUTPUT_DIR || path.join(HTML_ROOT, 'dist');

routes.forEach((route) => {
    const url = route.path === '/'
        ? baseUrl
        : `${baseUrl}${route.path}`;

    const html = template
        .replace(/__OG_TITLE__/g, escapeAttr(route.title))
        .replace(/__OG_DESCRIPTION__/g, escapeAttr(route.description))
        .replace(/__OG_IMAGE__/g, route.image)
        .replace(/__OG_URL__/g, url)
        .replace(/__WEBHOOK_URL__/g, N8N_WEBHOOK_URL);

    const outDir = route.path === '/'
        ? distDir
        : path.join(distDir, route.path);

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
});

console.log(`Generated ${routes.length} pages in ${distDir}`);
