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

// Ensure directories exist
fs.mkdirSync(EVENTS_DIR, { recursive: true });
fs.mkdirSync(LIBRARY_DIR, { recursive: true });

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
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = auth.slice(7);
    const data = tokens.get(token);
    if (!data || Date.now() - data.createdAt > TOKEN_TTL) {
        tokens.delete(token);
        return res.status(401).json({ error: 'Token expired or invalid' });
    }
    next();
}

// --- ID validation ---

const VALID_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidId(id) {
    return VALID_ID.test(id) && !id.includes('..');
}

// --- Auth endpoints ---

app.post('/api/login', (req, res) => {
    const ip = req.headers['x-real-ip'] || req.ip;
    if (!checkLoginRate(ip)) {
        return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    }

    const { password } = req.body;
    if (!password || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
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
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid ID' });

    const filePath = path.join(EVENTS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Event not found' });
    }

    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read event' });
    }
});

app.put('/api/events/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid ID' });

    const filePath = path.join(EVENTS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Event not found' });
    }

    const data = req.body;
    if (!data || typeof data !== 'object' || !data.id) {
        return res.status(400).json({ error: 'Invalid JSON: must be an object with an id field' });
    }
    if (data.id !== id) {
        return res.status(400).json({ error: 'ID in body must match URL parameter' });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf-8');
    res.json(data);
});

app.post('/api/events', requireAuth, (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object' || !data.id) {
        return res.status(400).json({ error: 'Invalid JSON: must be an object with an id field' });
    }
    if (!isValidId(data.id)) {
        return res.status(400).json({ error: 'Invalid ID format (use lowercase alphanumeric with hyphens)' });
    }

    const filePath = path.join(EVENTS_DIR, `${data.id}.json`);
    if (fs.existsSync(filePath)) {
        return res.status(409).json({ error: 'Event with this ID already exists' });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf-8');
    res.status(201).json(data);
});

app.delete('/api/events/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid ID' });

    const filePath = path.join(EVENTS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Event not found' });
    }

    fs.unlinkSync(filePath);
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
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid ID' });

    const jsonPath = path.join(LIBRARY_DIR, id, 'resource.json');
    if (!fs.existsSync(jsonPath)) {
        return res.status(404).json({ error: 'Resource not found' });
    }

    try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read resource' });
    }
});

app.put('/api/resources/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid ID' });

    const dirPath = path.join(LIBRARY_DIR, id);
    const jsonPath = path.join(dirPath, 'resource.json');
    if (!fs.existsSync(jsonPath)) {
        return res.status(404).json({ error: 'Resource not found' });
    }

    const data = req.body;
    if (!data || typeof data !== 'object' || !data.id) {
        return res.status(400).json({ error: 'Invalid JSON: must be an object with an id field' });
    }
    if (data.id !== id) {
        return res.status(400).json({ error: 'ID in body must match URL parameter' });
    }

    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 4), 'utf-8');
    res.json(data);
});

app.post('/api/resources', requireAuth, (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object' || !data.id) {
        return res.status(400).json({ error: 'Invalid JSON: must be an object with an id field' });
    }
    if (!isValidId(data.id)) {
        return res.status(400).json({ error: 'Invalid ID format (use lowercase alphanumeric with hyphens)' });
    }

    const dirPath = path.join(LIBRARY_DIR, data.id);
    const jsonPath = path.join(dirPath, 'resource.json');

    fs.mkdirSync(dirPath, { recursive: true });

    if (fs.existsSync(jsonPath)) {
        return res.status(409).json({ error: 'Resource with this ID already exists' });
    }

    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 4), 'utf-8');
    res.status(201).json(data);
});

app.delete('/api/resources/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid ID' });

    const dirPath = path.join(LIBRARY_DIR, id);
    const jsonPath = path.join(dirPath, 'resource.json');
    if (!fs.existsSync(jsonPath)) {
        return res.status(404).json({ error: 'Resource not found' });
    }

    fs.unlinkSync(jsonPath);
    res.json({ ok: true });
});

// --- Start server ---

const PORT = process.env.API_PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
    console.log(`API server running on 127.0.0.1:${PORT}`);
});
