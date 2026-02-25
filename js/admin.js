/* ============================================
   Human in the Loop — Admin Panel
   ============================================ */

// --- Token Management ---

function getAdminToken() {
    return sessionStorage.getItem('admin_token');
}

function setAdminToken(token) {
    sessionStorage.setItem('admin_token', token);
}

function clearAdminToken() {
    sessionStorage.removeItem('admin_token');
}

// --- API Helper ---

async function adminFetch(url, opts = {}) {
    const token = getAdminToken();
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(url, { ...opts, headers });

    if (response.status === 401) {
        clearAdminToken();
        navigateTo('admin');
        throw new Error('Session expired');
    }

    return response;
}

// --- Login ---

function initAdminLogin() {
    const loginBtn = document.getElementById('admin-login-btn');
    const passwordInput = document.getElementById('admin-password');
    const errorEl = document.getElementById('admin-login-error');

    if (!loginBtn) return;

    async function doLogin() {
        const password = passwordInput.value;
        if (!password) return;

        errorEl.hidden = true;
        loginBtn.disabled = true;

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            const data = await res.json();

            if (!res.ok) {
                errorEl.textContent = data.error || 'Login failed';
                errorEl.hidden = false;
                return;
            }

            setAdminToken(data.token);
            passwordInput.value = '';
            navigateTo('admin-dashboard');
        } catch (err) {
            errorEl.textContent = 'Connection error. Please try again.';
            errorEl.hidden = false;
        } finally {
            loginBtn.disabled = false;
        }
    }

    loginBtn.addEventListener('click', doLogin);
    passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
    });
}

// --- Logout ---

function initAdminLogout() {
    const logoutBtn = document.getElementById('admin-logout-btn');
    if (!logoutBtn) return;

    logoutBtn.addEventListener('click', async () => {
        try {
            await adminFetch('/api/logout', { method: 'POST' });
        } catch {
            // Ignore errors, just clear locally
        }
        clearAdminToken();
        navigateTo('admin');
    });
}

// --- Dashboard ---

async function renderAdminDashboard() {
    const eventsList = document.getElementById('admin-events-list');
    const resourcesList = document.getElementById('admin-resources-list');

    if (!eventsList || !resourcesList) return;

    eventsList.innerHTML = '<p class="text-muted">Loading...</p>';
    resourcesList.innerHTML = '<p class="text-muted">Loading...</p>';

    try {
        const [eventsRes, resourcesRes] = await Promise.all([
            adminFetch('/api/events'),
            adminFetch('/api/resources')
        ]);

        const eventsData = await eventsRes.json();
        const resourcesData = await resourcesRes.json();

        renderAdminList(eventsList, eventsData, 'event');
        renderAdminList(resourcesList, resourcesData, 'resource');
    } catch (err) {
        eventsList.innerHTML = '<p class="admin-error">Failed to load data.</p>';
        resourcesList.innerHTML = '';
    }
}

function renderAdminList(container, items, type) {
    if (items.length === 0) {
        container.innerHTML = '<p class="text-muted">No items yet.</p>';
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="admin-item">
            <div class="admin-item-info">
                <span class="admin-item-title">${escapeHTML(item.title)}</span>
                <span class="admin-item-id text-muted">${escapeHTML(item.id)}</span>
            </div>
            <div class="admin-item-actions">
                <a href="/admin/${type}/${item.id}" class="btn btn-sm">Edit</a>
            </div>
        </div>
    `).join('');
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --- JSON Editor ---

let currentEditType = null;
let currentEditId = null;
let currentEditIsNew = false;

async function renderAdminEditor(type, id, isNew) {
    const titleEl = document.getElementById('admin-edit-title');
    const textarea = document.getElementById('admin-json-editor');
    const errorEl = document.getElementById('admin-edit-error');
    const deleteBtn = document.getElementById('admin-delete-btn');

    if (!textarea) return;

    currentEditType = type;
    currentEditId = id;
    currentEditIsNew = !!isNew;

    errorEl.hidden = true;

    if (isNew) {
        titleEl.textContent = `New ${type === 'event' ? 'Event' : 'Resource'}`;
        deleteBtn.style.display = 'none';
        textarea.value = JSON.stringify(getTemplate(type), null, 4);
    } else {
        titleEl.textContent = `Edit ${type === 'event' ? 'Event' : 'Resource'}`;
        deleteBtn.style.display = '';
        textarea.value = 'Loading...';

        try {
            const endpoint = type === 'event' ? `/api/events/${id}` : `/api/resources/${id}`;
            const res = await adminFetch(endpoint);
            if (!res.ok) throw new Error('Not found');
            const data = await res.json();
            textarea.value = JSON.stringify(data, null, 4);
        } catch (err) {
            textarea.value = '';
            errorEl.textContent = 'Failed to load item.';
            errorEl.hidden = false;
        }
    }
}

function getTemplate(type) {
    if (type === 'event') {
        return {
            id: 'new-event-slug',
            title: 'New Event Title',
            date: 'Mar 15, 2026',
            dateFull: 'March 15, 2026',
            time: '10:00 AM - 3:00 PM (CET)',
            location: 'Live Stream',
            locationNote: 'Link provided upon RSVP',
            type: 'Live Stream',
            cost: 'Free for Alumni',
            spots: 20,
            tags: [],
            image: 'events/images/event-conference.jpg',
            description: ['Description paragraph 1.'],
            learns: ['Learning point 1.'],
            audience: 'Target audience description.'
        };
    }

    return {
        id: 'new-resource-slug',
        title: 'New Resource Title',
        date: new Date().toISOString().split('T')[0],
        author: 'Author Name',
        description: ['Description paragraph 1.'],
        tags: [],
        thumbnail: null,
        images: [],
        video: null
    };
}

// --- Save ---

async function adminSave() {
    const textarea = document.getElementById('admin-json-editor');
    const errorEl = document.getElementById('admin-edit-error');
    const saveBtn = document.getElementById('admin-save-btn');

    errorEl.hidden = true;

    let data;
    try {
        data = JSON.parse(textarea.value);
    } catch (err) {
        errorEl.textContent = `Invalid JSON: ${err.message}`;
        errorEl.hidden = false;
        return;
    }

    if (!data.id || typeof data.id !== 'string') {
        errorEl.textContent = 'JSON must contain a valid "id" field.';
        errorEl.hidden = false;
        return;
    }

    saveBtn.disabled = true;

    try {
        let url, method;
        if (currentEditType === 'event') {
            if (currentEditIsNew) {
                url = '/api/events';
                method = 'POST';
            } else {
                url = `/api/events/${currentEditId}`;
                method = 'PUT';
            }
        } else {
            if (currentEditIsNew) {
                url = '/api/resources';
                method = 'POST';
            } else {
                url = `/api/resources/${currentEditId}`;
                method = 'PUT';
            }
        }

        const res = await adminFetch(url, {
            method,
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (!res.ok) {
            errorEl.textContent = result.error || 'Save failed.';
            errorEl.hidden = false;
            return;
        }

        // Reload data and go back to dashboard
        await Promise.all([loadEvents(), loadResources()]);
        renderAllEventCards();
        renderAllResourceCards();
        navigateTo('admin-dashboard');
    } catch (err) {
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.hidden = false;
    } finally {
        saveBtn.disabled = false;
    }
}

// --- Delete ---

async function adminDelete() {
    if (!currentEditId || currentEditIsNew) return;

    const confirmed = confirm(`Are you sure you want to delete this ${currentEditType}? This cannot be undone.`);
    if (!confirmed) return;

    const errorEl = document.getElementById('admin-edit-error');
    const deleteBtn = document.getElementById('admin-delete-btn');
    errorEl.hidden = true;
    deleteBtn.disabled = true;

    try {
        const url = currentEditType === 'event'
            ? `/api/events/${currentEditId}`
            : `/api/resources/${currentEditId}`;

        const res = await adminFetch(url, { method: 'DELETE' });

        if (!res.ok) {
            const result = await res.json();
            errorEl.textContent = result.error || 'Delete failed.';
            errorEl.hidden = false;
            return;
        }

        // Reload data and go back to dashboard
        await Promise.all([loadEvents(), loadResources()]);
        renderAllEventCards();
        renderAllResourceCards();
        navigateTo('admin-dashboard');
    } catch (err) {
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.hidden = false;
    } finally {
        deleteBtn.disabled = false;
    }
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
    initAdminLogin();
    initAdminLogout();

    const saveBtn = document.getElementById('admin-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', adminSave);

    const deleteBtn = document.getElementById('admin-delete-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', adminDelete);
});
