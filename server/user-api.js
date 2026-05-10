const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const router = express.Router();

const MAGIC_LINK_TTL = 15 * 60 * 1000;
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const MAGIC_LINK_WEBHOOK_URL = process.env.MAGIC_LINK_WEBHOOK_URL;
const BASE_URL = process.env.BASE_URL || '';

// --- Auth middleware ---

async function requireUserAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Nicht autorisiert' });
    }
    const token = auth.slice(7);
    try {
        const { rows } = await db.query(
            `SELECT s.user_id, u.email, u.name, u.is_admin,
                    (SELECT om.org_id FROM org_members om WHERE om.user_id = u.id LIMIT 1) AS org_id
             FROM sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.token = $1 AND s.expires_at > now()`,
            [token]
        );
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Sitzung abgelaufen oder ungültig' });
        }
        req.user = rows[0];
        req.user.id = rows[0].user_id;
        next();
    } catch (err) {
        console.error('Auth check failed:', err.message);
        res.status(500).json({ error: 'Authentifizierungsfehler' });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ error: 'Nur für Administratoren' });
    }
    next();
}

// --- Magic link auth ---

router.post('/api/auth/magic-link', async (req, res) => {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'E-Mail-Adresse erforderlich' });
    }

    try {
        const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        if (rows.length === 0) {
            return res.status(200).json({ ok: true, message: 'Falls ein Konto existiert, wurde ein Link gesendet.' });
        }

        const userId = rows[0].id;
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL);

        await db.query(
            'INSERT INTO magic_links (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [userId, token, expiresAt]
        );

        const magicLinkUrl = `${BASE_URL}/auth/verify/${token}`;

        if (MAGIC_LINK_WEBHOOK_URL) {
            try {
                const resp = await fetch(MAGIC_LINK_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email.toLowerCase().trim(), magicLinkUrl }),
                    signal: AbortSignal.timeout(10000)
                });
                if (!resp.ok) {
                    console.error('Magic link webhook failed:', resp.status);
                    return res.status(502).json({ error: 'E-Mail konnte nicht gesendet werden' });
                }
            } catch (err) {
                console.error('Magic link webhook error:', err.message);
                return res.status(502).json({ error: 'E-Mail konnte nicht gesendet werden' });
            }
        } else {
            console.warn('MAGIC_LINK_WEBHOOK_URL not set — magic link:', magicLinkUrl);
        }

        res.json({ ok: true, message: 'Falls ein Konto existiert, wurde ein Link gesendet.' });
    } catch (err) {
        console.error('Magic link error:', err.message);
        res.status(500).json({ error: 'Interner Fehler' });
    }
});

router.get('/api/auth/verify/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const { rows } = await db.query(
            'SELECT id, user_id, expires_at, used_at FROM magic_links WHERE token = $1',
            [token]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: 'Ungültiger Link' });
        }

        const link = rows[0];

        if (link.used_at) {
            return res.status(400).json({ error: 'Dieser Link wurde bereits verwendet' });
        }

        if (new Date(link.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Dieser Link ist abgelaufen' });
        }

        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionExpires = new Date(Date.now() + SESSION_TTL);

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await client.query('UPDATE magic_links SET used_at = now() WHERE id = $1', [link.id]);
            await client.query(
                'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
                [link.user_id, sessionToken, sessionExpires]
            );
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        res.json({ token: sessionToken });
    } catch (err) {
        console.error('Verify error:', err.message);
        res.status(500).json({ error: 'Verifizierung fehlgeschlagen' });
    }
});

// --- Admin login (password-based for admin users) ---

router.post('/api/login', async (req, res) => {
    const email = req.body.email || req.body.username;
    const { password } = req.body;
    if (!email || !password) {
        return res.status(401).json({ error: 'Ungültiger Benutzername oder Passwort' });
    }

    try {
        const { rows } = await db.query(
            'SELECT id, password_hash FROM users WHERE email = $1 AND is_admin = true',
            [email.toLowerCase().trim()]
        );

        if (rows.length === 0 || !rows[0].password_hash) {
            return res.status(401).json({ error: 'Ungültiger Benutzername oder Passwort' });
        }

        const valid = await bcrypt.compare(password, rows[0].password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Ungültiger Benutzername oder Passwort' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + SESSION_TTL);

        await db.query(
            'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [rows[0].id, token, expiresAt]
        );

        res.json({ token });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Anmeldefehler' });
    }
});

// --- Session endpoints ---

router.get('/api/auth/me', requireUserAuth, (req, res) => {
    res.json({
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        is_admin: req.user.is_admin,
        org_id: req.user.org_id
    });
});

router.post('/api/auth/logout', requireUserAuth, async (req, res) => {
    const token = req.headers.authorization.slice(7);
    try {
        await db.query('DELETE FROM sessions WHERE token = $1', [token]);
        res.json({ ok: true });
    } catch (err) {
        console.error('Logout error:', err.message);
        res.status(500).json({ error: 'Abmeldefehler' });
    }
});

router.post('/api/logout', requireUserAuth, async (req, res) => {
    const token = req.headers.authorization.slice(7);
    try {
        await db.query('DELETE FROM sessions WHERE token = $1', [token]);
        res.json({ ok: true });
    } catch (err) {
        console.error('Logout error:', err.message);
        res.status(500).json({ error: 'Abmeldefehler' });
    }
});

router.get('/api/auth/check', requireUserAuth, (req, res) => {
    res.json({ ok: true });
});

// --- Project endpoints ---

router.get('/api/projects', requireUserAuth, async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT p.id, p.name, p.owner_id, p.org_id, p.settings, p.created_at,
                    u.name AS owner_name, u.email AS owner_email,
                    cv.latest_criteria_version,
                    pv.latest_prompt_version,
                    tc.test_case_count
             FROM projects p
             JOIN users u ON u.id = p.owner_id
             LEFT JOIN LATERAL (
                 SELECT MAX(version) AS latest_criteria_version
                 FROM criteria_versions WHERE project_id = p.id
             ) cv ON true
             LEFT JOIN LATERAL (
                 SELECT MAX(version) AS latest_prompt_version
                 FROM prompt_versions WHERE project_id = p.id
             ) pv ON true
             LEFT JOIN LATERAL (
                 SELECT COUNT(*)::int AS test_case_count
                 FROM test_cases WHERE project_id = p.id
             ) tc ON true
             WHERE p.owner_id = $1
                OR p.org_id IN (SELECT org_id FROM org_members WHERE user_id = $1)
             ORDER BY p.created_at DESC`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('List projects error:', err.message);
        res.status(500).json({ error: 'Projekte konnten nicht geladen werden' });
    }
});

router.post('/api/projects', requireUserAuth, async (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Projektname erforderlich' });
    }

    try {
        const orgId = req.user.org_id;
        if (!orgId) {
            return res.status(400).json({ error: 'Sie müssen einer Organisation angehören' });
        }

        const { rows } = await db.query(
            'INSERT INTO projects (owner_id, org_id, name) VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, orgId, name.trim()]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Create project error:', err.message);
        res.status(500).json({ error: 'Projekt konnte nicht erstellt werden' });
    }
});

router.get('/api/projects/:id', requireUserAuth, async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT p.*, u.name AS owner_name, u.email AS owner_email
             FROM projects p
             JOIN users u ON u.id = p.owner_id
             WHERE p.id = $1
               AND (p.owner_id = $2
                    OR p.org_id IN (SELECT org_id FROM org_members WHERE user_id = $2))`,
            [req.params.id, req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Projekt nicht gefunden' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('Get project error:', err.message);
        res.status(500).json({ error: 'Projekt konnte nicht geladen werden' });
    }
});

router.put('/api/projects/:id', requireUserAuth, async (req, res) => {
    const { name, settings } = req.body;
    try {
        const { rows } = await db.query(
            'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
            [req.params.id, req.user.id]
        );
        if (rows.length === 0) {
            return res.status(403).json({ error: 'Nur der Projektbesitzer kann bearbeiten' });
        }

        const updates = [];
        const values = [];
        let idx = 1;

        if (name !== undefined) {
            updates.push(`name = $${idx++}`);
            values.push(name.trim());
        }
        if (settings !== undefined) {
            updates.push(`settings = $${idx++}`);
            values.push(JSON.stringify(settings));
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Keine Änderungen' });
        }

        values.push(req.params.id);
        const result = await db.query(
            `UPDATE projects SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Update project error:', err.message);
        res.status(500).json({ error: 'Projekt konnte nicht aktualisiert werden' });
    }
});

router.delete('/api/projects/:id', requireUserAuth, async (req, res) => {
    try {
        const { rowCount } = await db.query(
            'DELETE FROM projects WHERE id = $1 AND owner_id = $2',
            [req.params.id, req.user.id]
        );
        if (rowCount === 0) {
            return res.status(403).json({ error: 'Nur der Projektbesitzer kann löschen' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Delete project error:', err.message);
        res.status(500).json({ error: 'Projekt konnte nicht gelöscht werden' });
    }
});

// --- Admin: User management ---

router.get('/api/admin/users', requireUserAuth, requireAdmin, async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT u.id, u.email, u.name, u.is_admin, u.created_at,
                    array_agg(o.name) FILTER (WHERE o.name IS NOT NULL) AS organizations
             FROM users u
             LEFT JOIN org_members om ON om.user_id = u.id
             LEFT JOIN organizations o ON o.id = om.org_id
             GROUP BY u.id
             ORDER BY u.created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        console.error('List users error:', err.message);
        res.status(500).json({ error: 'Benutzer konnten nicht geladen werden' });
    }
});

router.post('/api/admin/users', requireUserAuth, requireAdmin, async (req, res) => {
    const { email, name, is_admin, password } = req.body;
    if (!email || !name) {
        return res.status(400).json({ error: 'E-Mail und Name erforderlich' });
    }

    try {
        let passwordHash = null;
        if (password) {
            passwordHash = await bcrypt.hash(password, 10);
        }

        const { rows } = await db.query(
            'INSERT INTO users (email, name, password_hash, is_admin) VALUES ($1, $2, $3, $4) RETURNING id, email, name, is_admin, created_at',
            [email.toLowerCase().trim(), name.trim(), passwordHash, is_admin || false]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Ein Benutzer mit dieser E-Mail existiert bereits' });
        }
        console.error('Create user error:', err.message);
        res.status(500).json({ error: 'Benutzer konnte nicht erstellt werden' });
    }
});

router.delete('/api/admin/users/:id', requireUserAuth, requireAdmin, async (req, res) => {
    try {
        if (req.params.id === req.user.id) {
            return res.status(400).json({ error: 'Sie können sich nicht selbst löschen' });
        }
        const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        if (rowCount === 0) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Delete user error:', err.message);
        res.status(500).json({ error: 'Benutzer konnte nicht gelöscht werden' });
    }
});

// --- Admin: Organization management ---

router.get('/api/admin/organizations', requireUserAuth, requireAdmin, async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT o.id, o.name, o.created_at,
                    (o.openrouter_api_key IS NOT NULL AND o.openrouter_api_key != '') AS has_api_key,
                    array_agg(json_build_object('id', u.id, 'email', u.email, 'name', u.name))
                        FILTER (WHERE u.id IS NOT NULL) AS members
             FROM organizations o
             LEFT JOIN org_members om ON om.org_id = o.id
             LEFT JOIN users u ON u.id = om.user_id
             GROUP BY o.id
             ORDER BY o.created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        console.error('List orgs error:', err.message);
        res.status(500).json({ error: 'Organisationen konnten nicht geladen werden' });
    }
});

router.post('/api/admin/organizations', requireUserAuth, requireAdmin, async (req, res) => {
    const { name, openrouter_api_key } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Name erforderlich' });
    }

    try {
        const { rows } = await db.query(
            'INSERT INTO organizations (name, openrouter_api_key) VALUES ($1, $2) RETURNING *',
            [name.trim(), openrouter_api_key || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Create org error:', err.message);
        res.status(500).json({ error: 'Organisation konnte nicht erstellt werden' });
    }
});

router.put('/api/admin/organizations/:id', requireUserAuth, requireAdmin, async (req, res) => {
    const { name, openrouter_api_key } = req.body;
    try {
        const updates = [];
        const values = [];
        let idx = 1;

        if (name !== undefined) {
            updates.push(`name = $${idx++}`);
            values.push(name.trim());
        }
        if (openrouter_api_key !== undefined) {
            updates.push(`openrouter_api_key = $${idx++}`);
            values.push(openrouter_api_key);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Keine Änderungen' });
        }

        values.push(req.params.id);
        const { rows } = await db.query(
            `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, created_at,
             (openrouter_api_key IS NOT NULL AND openrouter_api_key != '') AS has_api_key`,
            values
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Organisation nicht gefunden' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('Update org error:', err.message);
        res.status(500).json({ error: 'Organisation konnte nicht aktualisiert werden' });
    }
});

router.post('/api/admin/organizations/:id/members', requireUserAuth, requireAdmin, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) {
        return res.status(400).json({ error: 'user_id erforderlich' });
    }

    try {
        await db.query(
            'INSERT INTO org_members (org_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [req.params.id, user_id]
        );
        res.json({ ok: true });
    } catch (err) {
        if (err.code === '23503') {
            return res.status(404).json({ error: 'Organisation oder Benutzer nicht gefunden' });
        }
        console.error('Add member error:', err.message);
        res.status(500).json({ error: 'Mitglied konnte nicht hinzugefügt werden' });
    }
});

router.delete('/api/admin/organizations/:id/members/:userId', requireUserAuth, requireAdmin, async (req, res) => {
    try {
        await db.query(
            'DELETE FROM org_members WHERE org_id = $1 AND user_id = $2',
            [req.params.id, req.params.userId]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('Remove member error:', err.message);
        res.status(500).json({ error: 'Mitglied konnte nicht entfernt werden' });
    }
});

module.exports = router;
module.exports.requireUserAuth = requireUserAuth;
module.exports.requireAdmin = requireAdmin;
