/**
 * Migration script: splits bundled JSON arrays into individual files.
 *
 * Runs at container startup (idempotent). If individual files already
 * exist on the /files/ volume, this script does nothing.
 *
 * Environment variables:
 *   FILES_DIR       — optional, defaults to /files
 *   BUNDLED_DIR     — optional, defaults to /usr/share/nginx/html
 */

const fs = require('fs');
const path = require('path');

const FILES_DIR = process.env.FILES_DIR || '/files';
const BUNDLED_DIR = process.env.BUNDLED_DIR || '/usr/share/nginx/html';

const EVENTS_DIR = path.join(FILES_DIR, 'events');
const LIBRARY_DIR = path.join(FILES_DIR, 'library');

// Ensure directories exist
fs.mkdirSync(EVENTS_DIR, { recursive: true });
fs.mkdirSync(LIBRARY_DIR, { recursive: true });

// --- Migrate events ---

const existingEventFiles = fs.readdirSync(EVENTS_DIR).filter(f => f.endsWith('.json'));

if (existingEventFiles.length === 0) {
    const bundledEventsPath = path.join(BUNDLED_DIR, 'events', 'events.json');
    if (fs.existsSync(bundledEventsPath)) {
        console.log('Migrating bundled events to individual files...');
        const events = JSON.parse(fs.readFileSync(bundledEventsPath, 'utf-8'));
        for (const event of events) {
            const filePath = path.join(EVENTS_DIR, `${event.id}.json`);
            fs.writeFileSync(filePath, JSON.stringify(event, null, 4), 'utf-8');
            console.log(`  Created ${filePath}`);
        }
        console.log(`Migrated ${events.length} events.`);
    } else {
        console.log('No bundled events.json found, skipping event migration.');
    }
} else {
    console.log(`Found ${existingEventFiles.length} existing event files, skipping migration.`);
}

// --- Migrate resources ---

const existingResourceDirs = fs.readdirSync(LIBRARY_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .filter(e => fs.existsSync(path.join(LIBRARY_DIR, e.name, 'resource.json')));

if (existingResourceDirs.length === 0) {
    const bundledResourcesPath = path.join(BUNDLED_DIR, 'library', 'resources.json');
    if (fs.existsSync(bundledResourcesPath)) {
        console.log('Migrating bundled resources to individual files...');
        const resources = JSON.parse(fs.readFileSync(bundledResourcesPath, 'utf-8'));
        for (const resource of resources) {
            const dirPath = path.join(LIBRARY_DIR, resource.id);
            fs.mkdirSync(dirPath, { recursive: true });
            const filePath = path.join(dirPath, 'resource.json');
            fs.writeFileSync(filePath, JSON.stringify(resource, null, 4), 'utf-8');
            console.log(`  Created ${filePath}`);
        }
        console.log(`Migrated ${resources.length} resources.`);
    } else {
        console.log('No bundled resources.json found, skipping resource migration.');
    }
} else {
    console.log(`Found ${existingResourceDirs.length} existing resource dirs, skipping migration.`);
}

console.log('Migration complete.');
