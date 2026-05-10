(function () {
    'use strict';

    let currentProject = null;
    let criteriaVersions = [];
    let promptVersions = [];
    let testCases = [];
    let currentTestCaseIndex = 0;
    let criteriaEditor = null;
    let promptEditor = null;
    let systemPromptEditor = null;
    let isGenerating = false;
    let isEvaluating = false;

    function getToken() {
        return sessionStorage.getItem('userToken');
    }

    async function userFetch(url, options = {}) {
        const token = getToken();
        if (!token) {
            window.navigateTo('/login');
            throw new Error('Not authenticated');
        }
        const headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
        if (options.body && typeof options.body === 'string') {
            headers['Content-Type'] = 'application/json';
        }
        const res = await fetch(url, { ...options, headers });
        if (res.status === 401) {
            sessionStorage.removeItem('userToken');
            window.navigateTo('/login');
            throw new Error('Session expired');
        }
        return res;
    }

    // --- Dashboard ---

    window.renderDashboard = async function () {
        const container = document.getElementById('dashboard-projects');
        if (!container) return;
        container.innerHTML = '<p class="loading-text">Projekte werden geladen...</p>';

        try {
            const res = await userFetch('/api/projects');
            if (!res.ok) throw new Error('Failed to load projects');
            const projects = await res.json();

            if (projects.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <h3>Noch keine Projekte</h3>
                        <p>Erstelle dein erstes Projekt, um mit der Evaluation zu beginnen.</p>
                    </div>`;
                return;
            }

            container.innerHTML = projects.map(p => `
                <a href="/project/${p.id}" class="project-card" data-link>
                    <h3>${escapeHtml(p.name)}</h3>
                    <div class="project-meta">
                        <span>${escapeHtml(p.owner_name)}</span>
                        <span>${p.test_case_count || 0} Testfälle</span>
                    </div>
                    <div class="project-versions">
                        ${p.latest_criteria_version ? `<span class="version-badge">Kriterien v${p.latest_criteria_version}</span>` : ''}
                        ${p.latest_prompt_version ? `<span class="version-badge">Prompt v${p.latest_prompt_version}</span>` : ''}
                    </div>
                </a>
            `).join('');
        } catch (err) {
            container.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
        }
    };

    window.createProject = async function () {
        const nameInput = document.getElementById('new-project-name');
        const name = nameInput ? nameInput.value.trim() : '';
        if (!name) return;

        try {
            const res = await userFetch('/api/projects', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.error || 'Fehler beim Erstellen');
                return;
            }
            nameInput.value = '';
            window.renderDashboard();
        } catch (err) {
            alert(err.message);
        }
    };

    // --- Experiment View ---

    window.renderExperimentView = async function (projectId) {
        try {
            const [projectRes, criteriaRes, promptsRes, testCasesRes] = await Promise.all([
                userFetch(`/api/projects/${projectId}`),
                userFetch(`/api/projects/${projectId}/criteria`),
                userFetch(`/api/projects/${projectId}/prompts`),
                userFetch(`/api/projects/${projectId}/test-cases`)
            ]);

            if (!projectRes.ok) throw new Error('Projekt nicht gefunden');

            currentProject = await projectRes.json();
            criteriaVersions = await criteriaRes.json();
            promptVersions = await promptsRes.json();
            testCases = await testCasesRes.json();
            currentTestCaseIndex = 0;

            const isProjectOwner = currentProject.owner_id === (await getCurrentUserId());

            document.getElementById('experiment-project-name').textContent = currentProject.name;

            renderCriteriaPanel(isProjectOwner);
            renderPromptPanel(isProjectOwner);
            renderTestCasePanel(isProjectOwner);
            renderEvaluationPanel();
        } catch (err) {
            console.error('Experiment load error:', err);
            document.getElementById('experiment-view').innerHTML =
                `<p class="error-text">${escapeHtml(err.message)}</p>`;
        }
    };

    async function getCurrentUserId() {
        const res = await userFetch('/api/auth/me');
        if (!res.ok) return null;
        const user = await res.json();
        return user.id;
    }

    // --- Criteria Panel ---

    function renderCriteriaPanel(editable) {
        const container = document.getElementById('criteria-content');
        const latest = criteriaVersions[0];
        const criteriaJson = latest ? JSON.stringify(latest.content, null, 2) : '{\n  "criteria": [\n    {\n      "name": "Relevanz",\n      "description": "Ist die Antwort relevant für die Frage?"\n    }\n  ]\n}';

        container.innerHTML = `
            <div class="panel-header">
                <h3>Kriterien</h3>
                ${criteriaVersions.length > 0 ? `<span class="version-badge">v${latest.version}</span>` : ''}
            </div>
            <textarea id="criteria-editor" class="criteria-textarea" ${editable ? '' : 'readonly'}>${escapeHtml(criteriaJson)}</textarea>
            ${editable ? '<button class="btn btn-primary btn-sm" onclick="saveCriteria()">Speichern</button>' : ''}
            <div id="criteria-error" class="field-error"></div>
            ${criteriaVersions.length > 1 ? renderVersionSelect('criteria', criteriaVersions) : ''}`;
    }

    window.saveCriteria = async function () {
        const textarea = document.getElementById('criteria-editor');
        const errorEl = document.getElementById('criteria-error');
        errorEl.textContent = '';

        let content;
        try {
            content = JSON.parse(textarea.value);
        } catch (e) {
            errorEl.textContent = 'Ungültiges JSON: ' + e.message;
            return;
        }

        try {
            const res = await userFetch(`/api/projects/${currentProject.id}/criteria`, {
                method: 'PUT',
                body: JSON.stringify({ content })
            });
            if (!res.ok) {
                const err = await res.json();
                errorEl.textContent = err.error;
                return;
            }
            const newVersion = await res.json();
            criteriaVersions.unshift(newVersion);
            renderCriteriaPanel(true);
            checkEvaluationOutdated();
        } catch (err) {
            errorEl.textContent = err.message;
        }
    };

    // --- Prompt Panel ---

    function renderPromptPanel(editable) {
        const container = document.getElementById('prompt-content');
        const latest = promptVersions[0];

        container.innerHTML = `
            <div class="panel-header">
                <h3>Prompt</h3>
                ${promptVersions.length > 0 ? `<span class="version-badge">v${latest.version}</span>` : ''}
            </div>
            <div class="prompt-tabs">
                <button class="tab-btn active" onclick="switchPromptTab('prompt')">Prompt</button>
                <button class="tab-btn" onclick="switchPromptTab('system')">System Prompt</button>
            </div>
            <div id="prompt-tab-prompt" class="prompt-tab-content active">
                <textarea id="prompt-editor-textarea">${escapeHtml(latest ? latest.prompt_md : '')}</textarea>
            </div>
            <div id="prompt-tab-system" class="prompt-tab-content">
                <textarea id="system-prompt-editor-textarea">${escapeHtml(latest ? latest.system_prompt_md : '')}</textarea>
            </div>
            ${editable ? '<button class="btn btn-primary btn-sm" onclick="savePrompts()">Speichern</button>' : ''}
            <div id="prompt-error" class="field-error"></div>
            ${promptVersions.length > 1 ? renderVersionSelect('prompt', promptVersions) : ''}`;

        if (typeof EasyMDE !== 'undefined' && editable) {
            setTimeout(() => {
                const promptTextarea = document.getElementById('prompt-editor-textarea');
                const systemTextarea = document.getElementById('system-prompt-editor-textarea');
                if (promptTextarea) {
                    promptEditor = new EasyMDE({
                        element: promptTextarea,
                        spellChecker: false,
                        status: false,
                        toolbar: ['bold', 'italic', 'heading', '|', 'unordered-list', 'ordered-list', '|', 'preview'],
                        minHeight: '200px'
                    });
                }
                if (systemTextarea) {
                    systemPromptEditor = new EasyMDE({
                        element: systemTextarea,
                        spellChecker: false,
                        status: false,
                        toolbar: ['bold', 'italic', 'heading', '|', 'unordered-list', 'ordered-list', '|', 'preview'],
                        minHeight: '200px'
                    });
                }
            }, 50);
        }
    }

    window.switchPromptTab = function (tab) {
        document.querySelectorAll('.prompt-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.prompt-tab-content').forEach(c => c.classList.remove('active'));

        const btn = tab === 'prompt'
            ? document.querySelector('.prompt-tabs .tab-btn:first-child')
            : document.querySelector('.prompt-tabs .tab-btn:last-child');
        if (btn) btn.classList.add('active');

        const content = document.getElementById(`prompt-tab-${tab}`);
        if (content) content.classList.add('active');
    };

    window.savePrompts = async function () {
        const errorEl = document.getElementById('prompt-error');
        errorEl.textContent = '';

        const prompt_md = promptEditor ? promptEditor.value() : document.getElementById('prompt-editor-textarea').value;
        const system_prompt_md = systemPromptEditor ? systemPromptEditor.value() : document.getElementById('system-prompt-editor-textarea').value;

        try {
            const res = await userFetch(`/api/projects/${currentProject.id}/prompts`, {
                method: 'PUT',
                body: JSON.stringify({ prompt_md, system_prompt_md })
            });
            if (!res.ok) {
                const err = await res.json();
                errorEl.textContent = err.error;
                return;
            }
            const newVersion = await res.json();
            promptVersions.unshift(newVersion);
            renderPromptPanel(true);
        } catch (err) {
            errorEl.textContent = err.message;
        }
    };

    // --- Test Case Panel ---

    function renderTestCasePanel(editable) {
        const container = document.getElementById('testcase-content');
        const tc = testCases[currentTestCaseIndex];

        let historyHtml = '';
        if (testCases.length > 1) {
            historyHtml = `<select class="version-select" onchange="switchTestCase(this.value)">
                ${testCases.map((t, i) => `<option value="${i}" ${i === currentTestCaseIndex ? 'selected' : ''}>
                    Testfall ${testCases.length - i} — ${new Date(t.created_at).toLocaleString('de-DE')}
                </option>`).join('')}
            </select>`;
        }

        container.innerHTML = `
            <div class="panel-header">
                <h3>Testfall</h3>
                ${tc ? `<span class="version-badge">${tc.model || ''}</span>` : ''}
            </div>
            ${historyHtml}
            <div id="testcase-output" class="testcase-output">
                ${tc ? renderMarkdown(tc.content_md) : '<p class="muted-text">Noch kein Testfall generiert.</p>'}
            </div>
            ${editable ? `<button class="btn btn-primary btn-sm" onclick="generateTestCase()" ${isGenerating ? 'disabled' : ''}>
                ${isGenerating ? 'Generiert...' : 'Testfall generieren'}
            </button>` : ''}
            <div id="testcase-error" class="field-error"></div>`;
    }

    window.switchTestCase = function (index) {
        currentTestCaseIndex = parseInt(index, 10);
        const isOwner = currentProject && currentProject.owner_id;
        renderTestCasePanel(true);
        renderEvaluationPanel();
    };

    window.generateTestCase = async function () {
        if (isGenerating) return;
        isGenerating = true;
        renderTestCasePanel(true);

        const errorEl = document.getElementById('testcase-error');
        try {
            const res = await userFetch(`/api/projects/${currentProject.id}/generate`, {
                method: 'POST'
            });
            if (!res.ok) {
                const err = await res.json();
                errorEl.textContent = err.error;
                isGenerating = false;
                renderTestCasePanel(true);
                return;
            }
            const newTestCase = await res.json();
            testCases.unshift(newTestCase);
            currentTestCaseIndex = 0;
            isGenerating = false;
            renderTestCasePanel(true);
            triggerEvaluation(newTestCase.id);
        } catch (err) {
            errorEl.textContent = err.message;
            isGenerating = false;
            renderTestCasePanel(true);
        }
    };

    async function triggerEvaluation(testCaseId) {
        if (criteriaVersions.length === 0) return;

        isEvaluating = true;
        renderEvaluationPanel();

        try {
            const res = await userFetch(`/api/projects/${currentProject.id}/evaluate/${testCaseId}`, {
                method: 'POST'
            });
            if (!res.ok) {
                const err = await res.json();
                console.error('Evaluation error:', err.error);
                isEvaluating = false;
                renderEvaluationPanel();
                return;
            }
            const evaluation = await res.json();
            if (testCases[currentTestCaseIndex] && testCases[currentTestCaseIndex].id === testCaseId) {
                testCases[currentTestCaseIndex].evaluation_id = evaluation.id;
                testCases[currentTestCaseIndex].evaluation_result = evaluation.result;
                testCases[currentTestCaseIndex].criteria_version_id = evaluation.criteria_version_id;
                testCases[currentTestCaseIndex].evaluation_model = evaluation.model;
            }
            isEvaluating = false;
            renderEvaluationPanel();
        } catch (err) {
            console.error('Evaluation error:', err);
            isEvaluating = false;
            renderEvaluationPanel();
        }
    }

    // --- Evaluation Panel ---

    function renderEvaluationPanel() {
        const container = document.getElementById('evaluation-content');
        const tc = testCases[currentTestCaseIndex];

        if (!tc) {
            container.innerHTML = `
                <div class="panel-header"><h3>Evaluation</h3></div>
                <p class="muted-text">Generiere zuerst einen Testfall.</p>`;
            return;
        }

        if (isEvaluating) {
            container.innerHTML = `
                <div class="panel-header"><h3>Evaluation</h3></div>
                <div class="evaluating-indicator">
                    <div class="spinner"></div>
                    <span>Evaluiert...</span>
                </div>`;
            return;
        }

        if (!tc.evaluation_result) {
            container.innerHTML = `
                <div class="panel-header"><h3>Evaluation</h3></div>
                <p class="muted-text">Keine Evaluation für diesen Testfall.</p>`;
            return;
        }

        const outdated = isEvaluationOutdated(tc);
        const results = typeof tc.evaluation_result === 'string'
            ? JSON.parse(tc.evaluation_result) : tc.evaluation_result;

        container.innerHTML = `
            <div class="panel-header">
                <h3>Evaluation</h3>
                ${tc.evaluation_model ? `<span class="version-badge">${tc.evaluation_model}</span>` : ''}
            </div>
            ${outdated ? '<div class="evaluation-outdated-warning">Evaluation veraltet — Kriterien wurden geändert. Generiere einen neuen Testfall.</div>' : ''}
            <div class="evaluation-scores">
                ${(Array.isArray(results) ? results : []).map(r => `
                    <div class="score-card ${outdated ? 'outdated' : ''}">
                        <div class="score-header">
                            <span class="score-name">${escapeHtml(r.criterion || r.name || '')}</span>
                            <span class="score-value score-${getScoreClass(r.score)}">${r.score}/10</span>
                        </div>
                        <p class="score-comment">${escapeHtml(r.comment || '')}</p>
                    </div>
                `).join('')}
            </div>`;
    }

    function isEvaluationOutdated(tc) {
        if (!tc || !tc.criteria_version_id || criteriaVersions.length === 0) return false;
        return tc.criteria_version_id !== criteriaVersions[0].id;
    }

    function checkEvaluationOutdated() {
        renderEvaluationPanel();
    }

    function getScoreClass(score) {
        if (score >= 8) return 'high';
        if (score >= 5) return 'mid';
        return 'low';
    }

    // --- Project Settings ---

    window.renderProjectSettings = async function (projectId) {
        const container = document.getElementById('project-settings-content');
        if (!container) return;

        try {
            const res = await userFetch(`/api/projects/${projectId}`);
            if (!res.ok) throw new Error('Projekt nicht gefunden');
            const project = await res.json();
            const settings = project.settings || {};

            container.innerHTML = `
                <h2>${escapeHtml(project.name)} — Einstellungen</h2>
                <div class="settings-form">
                    <label>Projektname
                        <input type="text" id="settings-name" value="${escapeHtml(project.name)}">
                    </label>
                    <label>Generator-Modell (OpenRouter)
                        <input type="text" id="settings-generator-model" value="${escapeHtml(settings.generator_model || 'openai/gpt-4o-mini')}" placeholder="openai/gpt-4o-mini">
                    </label>
                    <label>Evaluator-Modell (OpenRouter)
                        <input type="text" id="settings-evaluator-model" value="${escapeHtml(settings.evaluator_model || 'openai/gpt-4o-mini')}" placeholder="openai/gpt-4o-mini">
                    </label>
                    <button class="btn btn-primary" onclick="saveProjectSettings('${project.id}')">Speichern</button>
                    <div id="settings-error" class="field-error"></div>
                    <div id="settings-success" class="field-success"></div>
                </div>
                <hr>
                <a href="/project/${project.id}" data-link class="btn btn-secondary">Zurück zum Experiment</a>`;
        } catch (err) {
            container.innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
        }
    };

    window.saveProjectSettings = async function (projectId) {
        const errorEl = document.getElementById('settings-error');
        const successEl = document.getElementById('settings-success');
        errorEl.textContent = '';
        successEl.textContent = '';

        const name = document.getElementById('settings-name').value.trim();
        const generator_model = document.getElementById('settings-generator-model').value.trim();
        const evaluator_model = document.getElementById('settings-evaluator-model').value.trim();

        try {
            const res = await userFetch(`/api/projects/${projectId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name,
                    settings: { generator_model, evaluator_model }
                })
            });
            if (!res.ok) {
                const err = await res.json();
                errorEl.textContent = err.error;
                return;
            }
            successEl.textContent = 'Einstellungen gespeichert.';
        } catch (err) {
            errorEl.textContent = err.message;
        }
    };

    // --- Login ---

    window.handleMagicLinkLogin = async function (e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const errorEl = document.getElementById('login-error');
        const successEl = document.getElementById('login-success');
        errorEl.textContent = '';
        successEl.textContent = '';

        if (!email) {
            errorEl.textContent = 'Bitte E-Mail-Adresse eingeben.';
            return;
        }

        try {
            const res = await fetch('/api/auth/magic-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (!res.ok) {
                errorEl.textContent = data.error;
                return;
            }
            successEl.textContent = 'Prüfe deine E-Mails — wir haben dir einen Login-Link gesendet.';
            document.getElementById('login-email').value = '';
        } catch (err) {
            errorEl.textContent = 'Verbindungsfehler. Bitte erneut versuchen.';
        }
    };

    let pendingVerifyToken = null;

    window.verifyMagicLink = function (token) {
        pendingVerifyToken = token;
    };

    window.doVerify = async function () {
        if (!pendingVerifyToken) return;
        const container = document.getElementById('verify-message');
        const btn = document.getElementById('verify-btn');
        if (btn) btn.disabled = true;
        if (container) container.innerHTML = '<div class="verify-container"><div class="verify-spinner"></div><p>Wird verifiziert...</p></div>';

        try {
            const res = await fetch(`/api/auth/verify/${pendingVerifyToken}`);
            const data = await res.json();

            if (!res.ok) {
                container.innerHTML = `
                    <div class="verify-container">
                        <h3>${escapeHtml(data.error)}</h3>
                        <a href="/login" class="btn">Neuen Link anfordern</a>
                    </div>`;
                return;
            }

            sessionStorage.setItem('userToken', data.token);
            window.navigateTo('/dashboard');
        } catch (err) {
            container.innerHTML = `
                <div class="verify-container">
                    <h3>Verifizierung fehlgeschlagen</h3>
                    <a href="/login" class="btn">Neuen Link anfordern</a>
                </div>`;
        }
    };

    window.userLogout = function () {
        const token = getToken();
        if (token) {
            fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            }).catch(() => {});
        }
        sessionStorage.removeItem('userToken');
        window.navigateTo('/login');
    };

    window.isUserLoggedIn = function () {
        return !!getToken();
    };

    // --- Helpers ---

    function renderVersionSelect(type, versions) {
        return `<select class="version-select" onchange="loadVersion('${type}', this.value)">
            ${versions.map(v => `<option value="${v.id}">v${v.version} — ${new Date(v.created_at).toLocaleString('de-DE')}</option>`).join('')}
        </select>`;
    }

    window.loadVersion = async function (type, versionId) {
        if (type === 'criteria') {
            const v = criteriaVersions.find(c => c.id === versionId);
            if (v) {
                document.getElementById('criteria-editor').value = JSON.stringify(v.content, null, 2);
            }
        } else if (type === 'prompt') {
            const v = promptVersions.find(p => p.id === versionId);
            if (v) {
                if (promptEditor) promptEditor.value(v.prompt_md);
                else document.getElementById('prompt-editor-textarea').value = v.prompt_md;
                if (systemPromptEditor) systemPromptEditor.value(v.system_prompt_md);
                else document.getElementById('system-prompt-editor-textarea').value = v.system_prompt_md;
            }
        }
    };

    function renderMarkdown(md) {
        if (typeof marked !== 'undefined') {
            return marked.parse(md || '');
        }
        return '<pre>' + escapeHtml(md || '') + '</pre>';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
})();
