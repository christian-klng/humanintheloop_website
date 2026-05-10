const express = require('express');
const db = require('./db');
const { requireUserAuth } = require('./user-api');
const { generateTestCase, evaluateTestCase } = require('./openrouter');

const router = express.Router();

// --- Authorization helpers ---

async function loadProjectWithAccess(projectId, userId) {
    const { rows } = await db.query(
        `SELECT p.*, o.openrouter_api_key
         FROM projects p
         LEFT JOIN organizations o ON o.id = p.org_id
         WHERE p.id = $1
           AND (p.owner_id = $2
                OR p.org_id IN (SELECT org_id FROM org_members WHERE user_id = $2))`,
        [projectId, userId]
    );
    return rows[0] || null;
}

function isOwner(project, userId) {
    return project.owner_id === userId;
}

// --- Criteria endpoints ---

router.get('/api/projects/:id/criteria', requireUserAuth, async (req, res) => {
    try {
        const project = await loadProjectWithAccess(req.params.id, req.user.id);
        if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

        const { rows } = await db.query(
            'SELECT * FROM criteria_versions WHERE project_id = $1 ORDER BY version DESC',
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('Get criteria error:', err.message);
        res.status(500).json({ error: 'Kriterien konnten nicht geladen werden' });
    }
});

router.put('/api/projects/:id/criteria', requireUserAuth, async (req, res) => {
    const { content } = req.body;
    if (!content || typeof content !== 'object') {
        return res.status(400).json({ error: 'Ungültiger JSON-Inhalt' });
    }

    try {
        const project = await loadProjectWithAccess(req.params.id, req.user.id);
        if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });
        if (!isOwner(project, req.user.id)) {
            return res.status(403).json({ error: 'Nur der Projektbesitzer kann bearbeiten' });
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const { rows: [{ max }] } = await client.query(
                'SELECT COALESCE(MAX(version), 0) AS max FROM criteria_versions WHERE project_id = $1',
                [req.params.id]
            );
            const newVersion = max + 1;
            const { rows } = await client.query(
                'INSERT INTO criteria_versions (project_id, version, content) VALUES ($1, $2, $3) RETURNING *',
                [req.params.id, newVersion, JSON.stringify(content)]
            );
            await client.query('COMMIT');
            res.status(201).json(rows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Save criteria error:', err.message);
        res.status(500).json({ error: 'Kriterien konnten nicht gespeichert werden' });
    }
});

// --- Prompt endpoints ---

router.get('/api/projects/:id/prompts', requireUserAuth, async (req, res) => {
    try {
        const project = await loadProjectWithAccess(req.params.id, req.user.id);
        if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

        const { rows } = await db.query(
            'SELECT * FROM prompt_versions WHERE project_id = $1 ORDER BY version DESC',
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('Get prompts error:', err.message);
        res.status(500).json({ error: 'Prompts konnten nicht geladen werden' });
    }
});

router.put('/api/projects/:id/prompts', requireUserAuth, async (req, res) => {
    const { prompt_md, system_prompt_md } = req.body;
    if (typeof prompt_md !== 'string' || typeof system_prompt_md !== 'string') {
        return res.status(400).json({ error: 'prompt_md und system_prompt_md erforderlich' });
    }

    try {
        const project = await loadProjectWithAccess(req.params.id, req.user.id);
        if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });
        if (!isOwner(project, req.user.id)) {
            return res.status(403).json({ error: 'Nur der Projektbesitzer kann bearbeiten' });
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const { rows: [{ max }] } = await client.query(
                'SELECT COALESCE(MAX(version), 0) AS max FROM prompt_versions WHERE project_id = $1',
                [req.params.id]
            );
            const newVersion = max + 1;
            const { rows } = await client.query(
                'INSERT INTO prompt_versions (project_id, version, prompt_md, system_prompt_md) VALUES ($1, $2, $3, $4) RETURNING *',
                [req.params.id, newVersion, prompt_md, system_prompt_md]
            );
            await client.query('COMMIT');
            res.status(201).json(rows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Save prompts error:', err.message);
        res.status(500).json({ error: 'Prompts konnten nicht gespeichert werden' });
    }
});

// --- Test case endpoints ---

router.get('/api/projects/:id/test-cases', requireUserAuth, async (req, res) => {
    try {
        const project = await loadProjectWithAccess(req.params.id, req.user.id);
        if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

        const { rows } = await db.query(
            `SELECT tc.*, e.id AS evaluation_id, e.criteria_version_id, e.result AS evaluation_result, e.model AS evaluation_model
             FROM test_cases tc
             LEFT JOIN evaluations e ON e.test_case_id = tc.id
             WHERE tc.project_id = $1
             ORDER BY tc.created_at DESC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('Get test cases error:', err.message);
        res.status(500).json({ error: 'Testfälle konnten nicht geladen werden' });
    }
});

router.get('/api/projects/:id/test-cases/:tcId', requireUserAuth, async (req, res) => {
    try {
        const project = await loadProjectWithAccess(req.params.id, req.user.id);
        if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

        const { rows } = await db.query(
            `SELECT tc.*, e.id AS evaluation_id, e.criteria_version_id, e.result AS evaluation_result,
                    e.model AS evaluation_model, e.created_at AS evaluation_created_at
             FROM test_cases tc
             LEFT JOIN evaluations e ON e.test_case_id = tc.id
             WHERE tc.id = $1 AND tc.project_id = $2`,
            [req.params.tcId, req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Testfall nicht gefunden' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('Get test case error:', err.message);
        res.status(500).json({ error: 'Testfall konnte nicht geladen werden' });
    }
});

// --- Generate test case ---

router.post('/api/projects/:id/generate', requireUserAuth, async (req, res) => {
    try {
        const project = await loadProjectWithAccess(req.params.id, req.user.id);
        if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });
        if (!isOwner(project, req.user.id)) {
            return res.status(403).json({ error: 'Nur der Projektbesitzer kann generieren' });
        }

        if (!project.openrouter_api_key) {
            return res.status(400).json({ error: 'Kein OpenRouter API-Schlüssel für diese Organisation konfiguriert' });
        }

        const { rows: prompts } = await db.query(
            'SELECT * FROM prompt_versions WHERE project_id = $1 ORDER BY version DESC LIMIT 1',
            [req.params.id]
        );
        if (prompts.length === 0) {
            return res.status(400).json({ error: 'Bitte zuerst einen Prompt erstellen' });
        }

        const promptVersion = prompts[0];
        const settings = project.settings || {};
        const model = settings.generator_model || 'openai/gpt-4o-mini';

        const content = await generateTestCase(
            promptVersion.prompt_md,
            promptVersion.system_prompt_md,
            model,
            project.openrouter_api_key
        );

        const { rows } = await db.query(
            'INSERT INTO test_cases (project_id, prompt_version_id, content_md, model) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.params.id, promptVersion.id, content, model]
        );

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Generate test case error:', err.message);
        res.status(500).json({ error: err.message || 'Testfall konnte nicht generiert werden' });
    }
});

// --- Evaluate test case ---

router.post('/api/projects/:id/evaluate/:tcId', requireUserAuth, async (req, res) => {
    try {
        const project = await loadProjectWithAccess(req.params.id, req.user.id);
        if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });
        if (!isOwner(project, req.user.id)) {
            return res.status(403).json({ error: 'Nur der Projektbesitzer kann evaluieren' });
        }

        if (!project.openrouter_api_key) {
            return res.status(400).json({ error: 'Kein OpenRouter API-Schlüssel konfiguriert' });
        }

        const { rows: testCases } = await db.query(
            'SELECT * FROM test_cases WHERE id = $1 AND project_id = $2',
            [req.params.tcId, req.params.id]
        );
        if (testCases.length === 0) {
            return res.status(404).json({ error: 'Testfall nicht gefunden' });
        }

        const { rows: criteria } = await db.query(
            'SELECT * FROM criteria_versions WHERE project_id = $1 ORDER BY version DESC LIMIT 1',
            [req.params.id]
        );
        if (criteria.length === 0) {
            return res.status(400).json({ error: 'Bitte zuerst Kriterien definieren' });
        }

        const criteriaVersion = criteria[0];
        const settings = project.settings || {};
        const model = settings.evaluator_model || 'openai/gpt-4o-mini';

        const result = await evaluateTestCase(
            testCases[0].content_md,
            criteriaVersion.content,
            model,
            project.openrouter_api_key
        );

        const { rows } = await db.query(
            'INSERT INTO evaluations (test_case_id, criteria_version_id, result, model) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.params.tcId, criteriaVersion.id, JSON.stringify(result), model]
        );

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Evaluate test case error:', err.message);
        res.status(500).json({ error: err.message || 'Evaluation fehlgeschlagen' });
    }
});

module.exports = router;
