/**
 * Admin API server for Human in the Loop.
 *
 * Provides authentication and CRUD endpoints for events and resources.
 * Reads/writes individual JSON files on the /files/ volume.
 *
 * Environment variables:
 *   ADMIN_PASSWORD  — required, the admin login password
 *   FILES_DIR       — optional, defaults to /files
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const app = express();
app.use(express.json({ limit: '1mb' }));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
    console.error('ERROR: ADMIN_PASSWORD environment variable is required.');
    process.exit(1);
}

const FILES_DIR = process.env.FILES_DIR || '/files';
const EVENTS_DIR = path.join(FILES_DIR, 'events');
const LIBRARY_DIR = path.join(FILES_DIR, 'library');
const UPLOADS_DIR = path.join(FILES_DIR, 'uploads');
const UPLOAD_SUBDIRS = { events: 'events', library: 'library' };

// Ensure directories exist
fs.mkdirSync(EVENTS_DIR, { recursive: true });
fs.mkdirSync(LIBRARY_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, 'events'), { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, 'library'), { recursive: true });

// --- File upload constants ---

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm']);
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// --- Token store (in-memory, 24h expiry) ---

const TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 hours
const tokens = new Map(); // token → { createdAt }

function cleanExpiredTokens() {
    const now = Date.now();
    for (const [token, data] of tokens) {
        if (now - data.createdAt > TOKEN_TTL) tokens.delete(token);
    }
}

setInterval(cleanExpiredTokens, 60 * 60 * 1000); // hourly cleanup

// --- Rate limiting for login ---

const loginAttempts = new Map(); // ip → { count, resetAt }
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW = 60 * 1000; // 1 minute

function checkLoginRate(ip) {
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
        loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW });
        return true;
    }
    entry.count++;
    return entry.count <= LOGIN_LIMIT;
}

// --- Auth middleware ---

function requireAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Nicht autorisiert' });
    }
    const token = auth.slice(7);
    const data = tokens.get(token);
    if (!data || Date.now() - data.createdAt > TOKEN_TTL) {
        tokens.delete(token);
        return res.status(401).json({ error: 'Token abgelaufen oder ungültig' });
    }
    next();
}

// --- ID validation ---

const VALID_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidId(id) {
    return VALID_ID.test(id) && !id.includes('..');
}

// --- OG page regeneration ---

const GENERATE_SCRIPT = path.join(__dirname, '..', 'scripts', 'generate-pages.js');
const HTML_ROOT = process.env.HTML_ROOT || '/usr/share/nginx/html';

function regenerateOGPages() {
    const env = {
        ...process.env,
        DATA_SOURCE: 'volume',
        FILES_DIR,
        HTML_ROOT,
        OUTPUT_DIR: HTML_ROOT
    };
    execFile(process.execPath, [GENERATE_SCRIPT], { env }, (err, stdout, stderr) => {
        if (err) {
            console.error('OG page regeneration failed:', err.message);
            if (stderr) console.error(stderr);
        } else {
            console.log('OG pages regenerated:', stdout.trim());
        }
    });
}

// --- Auth endpoints ---

app.post('/api/login', (req, res) => {
    const ip = req.headers['x-real-ip'] || req.ip;
    if (!checkLoginRate(ip)) {
        return res.status(429).json({ error: 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.' });
    }

    const { password } = req.body;
    if (!password || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Ungültiges Passwort' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    tokens.set(token, { createdAt: Date.now() });
    res.json({ token });
});

app.post('/api/logout', requireAuth, (req, res) => {
    const token = req.headers.authorization.slice(7);
    tokens.delete(token);
    res.json({ ok: true });
});

app.get('/api/auth/check', requireAuth, (req, res) => {
    res.json({ ok: true });
});

// --- Event endpoints ---

function readAllEvents() {
    if (!fs.existsSync(EVENTS_DIR)) return [];
    const files = fs.readdirSync(EVENTS_DIR).filter(f => f.endsWith('.json'));
    const events = [];
    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(EVENTS_DIR, file), 'utf-8'));
            events.push(data);
        } catch (err) {
            console.error(`Failed to read event file ${file}:`, err.message);
        }
    }
    return events;
}

app.get('/api/events', (req, res) => {
    const events = readAllEvents();
    res.json(events);
});

app.get('/api/events/:id', (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Ungültige ID' });

    const filePath = path.join(EVENTS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Veranstaltung nicht gefunden' });
    }

    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Veranstaltung konnte nicht gelesen werden' });
    }
});

app.put('/api/events/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Ungültige ID' });

    const filePath = path.join(EVENTS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Veranstaltung nicht gefunden' });
    }

    const data = req.body;
    if (!data || typeof data !== 'object' || !data.id) {
        return res.status(400).json({ error: 'Ungültiges JSON: muss ein Objekt mit einem id-Feld sein' });
    }
    if (data.id !== id) {
        return res.status(400).json({ error: 'ID im Body muss mit dem URL-Parameter übereinstimmen' });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf-8');
    regenerateOGPages();
    res.json(data);
});

app.post('/api/events', requireAuth, (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object' || !data.id) {
        return res.status(400).json({ error: 'Ungültiges JSON: muss ein Objekt mit einem id-Feld sein' });
    }
    if (!isValidId(data.id)) {
        return res.status(400).json({ error: 'Ungültiges ID-Format (Kleinbuchstaben, Zahlen und Bindestriche verwenden)' });
    }

    const filePath = path.join(EVENTS_DIR, `${data.id}.json`);
    if (fs.existsSync(filePath)) {
        return res.status(409).json({ error: 'Veranstaltung mit dieser ID existiert bereits' });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf-8');
    regenerateOGPages();
    res.status(201).json(data);
});

app.delete('/api/events/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Ungültige ID' });

    const filePath = path.join(EVENTS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Veranstaltung nicht gefunden' });
    }

    fs.unlinkSync(filePath);
    regenerateOGPages();
    res.json({ ok: true });
});

// --- Resource endpoints ---

function readAllResources() {
    if (!fs.existsSync(LIBRARY_DIR)) return [];
    const entries = fs.readdirSync(LIBRARY_DIR, { withFileTypes: true });
    const resources = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const jsonPath = path.join(LIBRARY_DIR, entry.name, 'resource.json');
        if (!fs.existsSync(jsonPath)) continue;
        try {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            resources.push(data);
        } catch (err) {
            console.error(`Failed to read resource ${entry.name}:`, err.message);
        }
    }
    resources.sort((a, b) => new Date(b.date) - new Date(a.date));
    return resources;
}

app.get('/api/resources', (req, res) => {
    const resources = readAllResources();
    res.json(resources);
});

app.get('/api/resources/:id', (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Ungültige ID' });

    const jsonPath = path.join(LIBRARY_DIR, id, 'resource.json');
    if (!fs.existsSync(jsonPath)) {
        return res.status(404).json({ error: 'Ressource nicht gefunden' });
    }

    try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Ressource konnte nicht gelesen werden' });
    }
});

app.put('/api/resources/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Ungültige ID' });

    const dirPath = path.join(LIBRARY_DIR, id);
    const jsonPath = path.join(dirPath, 'resource.json');
    if (!fs.existsSync(jsonPath)) {
        return res.status(404).json({ error: 'Ressource nicht gefunden' });
    }

    const data = req.body;
    if (!data || typeof data !== 'object' || !data.id) {
        return res.status(400).json({ error: 'Ungültiges JSON: muss ein Objekt mit einem id-Feld sein' });
    }
    if (data.id !== id) {
        return res.status(400).json({ error: 'ID im Body muss mit dem URL-Parameter übereinstimmen' });
    }

    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 4), 'utf-8');
    regenerateOGPages();
    res.json(data);
});

app.post('/api/resources', requireAuth, (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object' || !data.id) {
        return res.status(400).json({ error: 'Ungültiges JSON: muss ein Objekt mit einem id-Feld sein' });
    }
    if (!isValidId(data.id)) {
        return res.status(400).json({ error: 'Ungültiges ID-Format (Kleinbuchstaben, Zahlen und Bindestriche verwenden)' });
    }

    const dirPath = path.join(LIBRARY_DIR, data.id);
    const jsonPath = path.join(dirPath, 'resource.json');

    fs.mkdirSync(dirPath, { recursive: true });

    if (fs.existsSync(jsonPath)) {
        return res.status(409).json({ error: 'Ressource mit dieser ID existiert bereits' });
    }

    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 4), 'utf-8');
    regenerateOGPages();
    res.status(201).json(data);
});

app.delete('/api/resources/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Ungültige ID' });

    const dirPath = path.join(LIBRARY_DIR, id);
    const jsonPath = path.join(dirPath, 'resource.json');
    if (!fs.existsSync(jsonPath)) {
        return res.status(404).json({ error: 'Ressource nicht gefunden' });
    }

    fs.unlinkSync(jsonPath);
    regenerateOGPages();
    res.json({ ok: true });
});

// --- File upload helpers ---

function sanitizeFilename(name) {
    const clean = name.replace(/[/\\:\0]/g, '').trim();
    if (!clean || clean.startsWith('.')) return null;
    return clean;
}

function parseMultipartFile(req) {
    return new Promise((resolve, reject) => {
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
        if (!boundaryMatch) return reject(new Error('No multipart boundary'));

        const boundary = boundaryMatch[1] || boundaryMatch[2];
        const chunks = [];
        let totalSize = 0;

        req.on('data', (chunk) => {
            totalSize += chunk.length;
            if (totalSize > MAX_FILE_SIZE + 1024 * 10) { // file + headers overhead
                req.destroy();
                return reject(new Error('File too large'));
            }
            chunks.push(chunk);
        });

        req.on('error', reject);

        req.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const boundaryBuf = Buffer.from('--' + boundary);

            // Find the first part (skip preamble)
            let start = buffer.indexOf(boundaryBuf);
            if (start === -1) return reject(new Error('Invalid multipart body'));
            start += boundaryBuf.length + 2; // skip boundary + CRLF

            // Find end of this part
            const end = buffer.indexOf(boundaryBuf, start);
            if (end === -1) return reject(new Error('Invalid multipart body'));

            const part = buffer.slice(start, end - 2); // -2 for CRLF before boundary

            // Split headers from body (separated by double CRLF)
            const headerEnd = part.indexOf('\r\n\r\n');
            if (headerEnd === -1) return reject(new Error('Invalid multipart part'));

            const headers = part.slice(0, headerEnd).toString('utf-8');
            const fileBuffer = part.slice(headerEnd + 4);

            // Extract filename from Content-Disposition
            const filenameMatch = headers.match(/filename="([^"]+)"/);
            if (!filenameMatch) return reject(new Error('No filename in upload'));

            resolve({ filename: filenameMatch[1], buffer: fileBuffer });
        });
    });
}

// --- Upload helpers ---

function resolveUploadDir(folder) {
    if (folder && UPLOAD_SUBDIRS[folder]) {
        return path.join(UPLOADS_DIR, UPLOAD_SUBDIRS[folder]);
    }
    return UPLOADS_DIR;
}

function resolveUploadUrlPrefix(folder) {
    if (folder && UPLOAD_SUBDIRS[folder]) {
        return `/files/uploads/${UPLOAD_SUBDIRS[folder]}`;
    }
    return '/files/uploads';
}

// --- Upload endpoints ---

app.post('/api/uploads', requireAuth, async (req, res) => {
    try {
        const folder = req.query.folder || '';
        const targetDir = resolveUploadDir(folder);
        const urlPrefix = resolveUploadUrlPrefix(folder);

        const { filename, buffer } = await parseMultipartFile(req);
        const sanitized = sanitizeFilename(filename);
        if (!sanitized) {
            return res.status(400).json({ error: 'Ungültiger Dateiname' });
        }

        const ext = path.extname(sanitized).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
            return res.status(400).json({ error: 'Dateityp nicht erlaubt. Erlaubt: JPG, PNG, GIF, WebP, SVG, MP4, WebM' });
        }

        if (buffer.length > MAX_FILE_SIZE) {
            return res.status(413).json({ error: 'Datei zu groß (max. 50 MB)' });
        }

        // Avoid overwriting: prepend timestamp if file exists
        let finalName = sanitized;
        if (fs.existsSync(path.join(targetDir, finalName))) {
            finalName = `${Date.now()}-${sanitized}`;
        }

        fs.writeFileSync(path.join(targetDir, finalName), buffer);

        res.status(201).json({
            filename: finalName,
            url: `${urlPrefix}/${encodeURIComponent(finalName)}`,
            size: buffer.length
        });
    } catch (err) {
        if (err.message === 'File too large') {
            return res.status(413).json({ error: 'Datei zu groß (max. 50 MB)' });
        }
        console.error('Upload error:', err.message);
        res.status(500).json({ error: 'Upload fehlgeschlagen' });
    }
});

app.get('/api/uploads', requireAuth, (req, res) => {
    const folder = req.query.folder || '';
    const targetDir = resolveUploadDir(folder);
    const urlPrefix = resolveUploadUrlPrefix(folder);

    if (!fs.existsSync(targetDir)) return res.json([]);

    const entries = fs.readdirSync(targetDir);
    const files = [];

    for (const name of entries) {
        const filePath = path.join(targetDir, name);
        try {
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) continue;
            files.push({
                filename: name,
                url: `${urlPrefix}/${encodeURIComponent(name)}`,
                size: stat.size,
                modified: stat.mtimeMs
            });
        } catch {
            // skip files we can't stat
        }
    }

    files.sort((a, b) => b.modified - a.modified);
    res.json(files);
});

app.delete('/api/uploads/:filename', requireAuth, (req, res) => {
    const folder = req.query.folder || '';
    const targetDir = resolveUploadDir(folder);

    const { filename } = req.params;
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..') || filename.includes('\0')) {
        return res.status(400).json({ error: 'Ungültiger Dateiname' });
    }

    const filePath = path.join(targetDir, filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Datei nicht gefunden' });
    }

    fs.unlinkSync(filePath);
    res.json({ ok: true });
});

// --- Start server ---

const PORT = process.env.API_PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
    console.log(`API server running on 127.0.0.1:${PORT}`);
});
