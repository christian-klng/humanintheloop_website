/**
 * Local development server that serves static files and proxies
 * /api/* requests to the API server (port 3099 by default).
 *
 * Usage:
 *   ADMIN_PASSWORD=test FILES_DIR=/tmp/hitl-test-files node scripts/dev-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const API_PORT = process.env.API_PORT || 3099;
const ROOT = path.join(__dirname, '..');

// Set defaults for local development
if (!process.env.ADMIN_PASSWORD) process.env.ADMIN_PASSWORD = 'test';
if (!process.env.FILES_DIR) process.env.FILES_DIR = '/tmp/hitl-test-files';

const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm'
};

// Start the API server as a child process
const { fork } = require('child_process');
const apiServer = fork(path.join(ROOT, 'server', 'api.js'), {
    env: { ...process.env, API_PORT: String(API_PORT) }
});

apiServer.on('exit', (code) => {
    console.error(`API server exited with code ${code}`);
    process.exit(1);
});

const server = http.createServer((req, res) => {
    // Proxy /api/* to the API server
    if (req.url.startsWith('/api/')) {
        const options = {
            hostname: '127.0.0.1',
            port: API_PORT,
            path: req.url,
            method: req.method,
            headers: req.headers
        };

        const proxy = http.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxy.on('error', () => {
            res.writeHead(502);
            res.end('API server unavailable');
        });

        req.pipe(proxy);
        return;
    }

    // Serve static files with SPA fallback
    let urlPath = req.url.split('?')[0];

    // Map /files/* to FILES_DIR (mirrors nginx alias /files/)
    const FILES_DIR = process.env.FILES_DIR || '/tmp/hitl-test-files';
    let filePath = urlPath.startsWith('/files/')
        ? path.join(FILES_DIR, urlPath.slice('/files'.length))
        : path.join(ROOT, urlPath);

    // Try exact file, then directory/index.html, then SPA fallback
    // For /files/* paths: serve file or 404 (no SPA fallback, mirrors nginx)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        serveFile(filePath, res);
    } else if (urlPath.startsWith('/files/')) {
        res.writeHead(404);
        res.end('Not found');
    } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
        serveFile(path.join(filePath, 'index.html'), res);
    } else {
        serveFile(path.join(ROOT, 'index.html'), res);
    }
});

function serveFile(filePath, res) {
    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
    });
}

server.listen(PORT, () => {
    console.log(`Dev server running at http://localhost:${PORT}`);
    console.log(`API proxy forwarding /api/* to http://127.0.0.1:${API_PORT}`);
});

process.on('SIGINT', () => {
    apiServer.kill();
    process.exit();
});

process.on('SIGTERM', () => {
    apiServer.kill();
    process.exit();
});
