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
        throw new Error('Sitzung abgelaufen');
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
                errorEl.textContent = data.error || 'Anmeldung fehlgeschlagen';
                errorEl.hidden = false;
                return;
            }

            setAdminToken(data.token);
            passwordInput.value = '';
            navigateTo('admin-dashboard');
        } catch (err) {
            errorEl.textContent = 'Verbindungsfehler. Bitte versuchen Sie es erneut.';
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

    eventsList.innerHTML = '<p class="text-muted">Laden...</p>';
    resourcesList.innerHTML = '<p class="text-muted">Laden...</p>';

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
        eventsList.innerHTML = '<p class="admin-error">Daten konnten nicht geladen werden.</p>';
        resourcesList.innerHTML = '';
    }

    renderAdminUploads();
}

function renderAdminList(container, items, type) {
    if (items.length === 0) {
        container.innerHTML = '<p class="text-muted">Noch keine Einträge vorhanden.</p>';
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="admin-item">
            <div class="admin-item-info">
                <span class="admin-item-title">${escapeHTML(item.title)}</span>
                <span class="admin-item-id text-muted">${escapeHTML(item.id)}</span>
            </div>
            <div class="admin-item-actions">
                <a href="/admin/${type}/${item.id}" class="btn btn-sm">Bearbeiten</a>
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
        titleEl.textContent = `Neue ${type === 'event' ? 'Veranstaltung' : 'Ressource'}`;
        deleteBtn.style.display = 'none';
        textarea.value = JSON.stringify(getTemplate(type), null, 4);
    } else {
        titleEl.textContent = `${type === 'event' ? 'Veranstaltung' : 'Ressource'} bearbeiten`;
        deleteBtn.style.display = '';
        textarea.value = 'Laden...';

        try {
            const endpoint = type === 'event' ? `/api/events/${id}` : `/api/resources/${id}`;
            const res = await adminFetch(endpoint);
            if (!res.ok) throw new Error('Not found');
            const data = await res.json();
            textarea.value = JSON.stringify(data, null, 4);
        } catch (err) {
            textarea.value = '';
            errorEl.textContent = 'Element konnte nicht geladen werden.';
            errorEl.hidden = false;
        }
    }
}

function getTemplate(type) {
    if (type === 'event') {
        return {
            id: 'neue-veranstaltung',
            title: 'Neue Veranstaltung',
            date: '15. Mär. 2026',
            dateFull: '15. März 2026',
            time: '10:00 – 15:00 Uhr (MEZ)',
            location: 'Livestream',
            locationNote: 'Link nach Anmeldung',
            type: 'Livestream',
            cost: 'Kostenlos für Alumni',
            spots: 20,
            tags: [],
            image: null,
            description: ['Beschreibung Absatz 1.'],
            learns: ['Lernpunkt 1.'],
            audience: 'Beschreibung der Zielgruppe.'
        };
    }

    return {
        id: 'neue-ressource',
        title: 'Neue Ressource',
        date: new Date().toISOString().split('T')[0],
        author: 'Autorenname',
        description: ['Beschreibung Absatz 1.'],
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
        errorEl.textContent = `Ungültiges JSON: ${err.message}`;
        errorEl.hidden = false;
        return;
    }

    if (!data.id || typeof data.id !== 'string') {
        errorEl.textContent = 'JSON muss ein gültiges "id"-Feld enthalten.';
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
            errorEl.textContent = result.error || 'Speichern fehlgeschlagen.';
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

    const typeLabel = currentEditType === 'event' ? 'diese Veranstaltung' : 'diese Ressource';
    const confirmed = confirm(`Möchten Sie ${typeLabel} wirklich löschen? Dies kann nicht rückgängig gemacht werden.`);
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
            errorEl.textContent = result.error || 'Löschen fehlgeschlagen.';
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

// --- Media Uploads ---

let currentUploadFolder = '';

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function renderAdminUploads() {
    const list = document.getElementById('admin-uploads-list');
    if (!list) return;

    list.innerHTML = '<p class="text-muted">Laden...</p>';

    try {
        const folderParam = currentUploadFolder ? `?folder=${currentUploadFolder}` : '';
        const res = await adminFetch(`/api/uploads${folderParam}`);
        const files = await res.json();

        if (files.length === 0) {
            list.innerHTML = '<p class="text-muted">Noch keine Dateien hochgeladen.</p>';
            return;
        }

        list.innerHTML = files.map(file => {
            const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.filename);
            const isVideo = /\.(mp4|webm)$/i.test(file.filename);
            const previewAttr = (isImage || isVideo)
                ? ` data-preview-url="${file.url}" data-preview-type="${isImage ? 'image' : 'video'}" role="button" tabindex="0" aria-label="Vorschau: ${escapeHTML(file.filename)}"`
                : '';
            const preview = isImage
                ? `<img src="${file.url}" alt="${escapeHTML(file.filename)}" class="admin-upload-thumb"${previewAttr} loading="lazy">`
                : isVideo
                    ? `<div class="admin-upload-thumb admin-upload-thumb--video"${previewAttr}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`
                    : `<div class="admin-upload-thumb admin-upload-thumb--generic"></div>`;

            return `
                <div class="admin-upload-item">
                    ${preview}
                    <div class="admin-upload-item-info">
                        <span class="admin-upload-item-name" title="${escapeHTML(file.filename)}">${escapeHTML(file.filename)}</span>
                        <span class="text-muted admin-upload-item-size">${formatFileSize(file.size)}</span>
                    </div>
                    <div class="admin-upload-item-actions">
                        <button class="btn btn-sm admin-copy-url-btn" data-url="${file.url}" type="button">URL kopieren</button>
                        <button class="btn btn-sm btn-danger admin-delete-upload-btn" data-filename="${escapeHTML(file.filename)}" type="button" aria-label="Löschen">&times;</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch {
        list.innerHTML = '<p class="admin-error">Dateien konnten nicht geladen werden.</p>';
    }
}

async function uploadFile(file) {
    const errorEl = document.getElementById('admin-upload-error');
    const progressEl = document.getElementById('admin-upload-progress');
    const progressFill = document.getElementById('admin-upload-progress-fill');
    const progressText = document.getElementById('admin-upload-progress-text');

    errorEl.hidden = true;

    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExts.includes(ext)) {
        errorEl.textContent = `Dateityp "${ext}" nicht erlaubt.`;
        errorEl.hidden = false;
        return false;
    }

    if (file.size > 50 * 1024 * 1024) {
        errorEl.textContent = `Datei "${file.name}" ist zu groß (max. 50 MB).`;
        errorEl.hidden = false;
        return false;
    }

    progressEl.hidden = false;
    progressFill.style.width = '0%';
    progressText.textContent = `Hochladen: ${file.name}...`;

    try {
        const formData = new FormData();
        formData.append('file', file);

        await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    progressFill.style.width = pct + '%';
                    progressText.textContent = `Hochladen: ${file.name} (${pct}%)`;
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    try {
                        const err = JSON.parse(xhr.responseText);
                        reject(new Error(err.error || 'Upload fehlgeschlagen'));
                    } catch {
                        reject(new Error('Upload fehlgeschlagen'));
                    }
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Verbindungsfehler')));

            const folderParam = currentUploadFolder ? `?folder=${currentUploadFolder}` : '';
            xhr.open('POST', `/api/uploads${folderParam}`);
            xhr.setRequestHeader('Authorization', `Bearer ${getAdminToken()}`);
            xhr.send(formData);
        });

        return true;
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
        return false;
    } finally {
        progressEl.hidden = true;
    }
}

async function uploadFiles(fileList) {
    for (const file of fileList) {
        await uploadFile(file);
    }
    renderAdminUploads();
}

function initAdminUploads() {
    const area = document.getElementById('admin-upload-area');
    const input = document.getElementById('admin-upload-input');
    if (!area || !input) return;

    area.addEventListener('click', (e) => {
        if (e.target !== input) input.click();
    });
    area.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.click();
        }
    });

    input.addEventListener('change', () => {
        if (input.files.length > 0) {
            uploadFiles(input.files);
            input.value = '';
        }
    });

    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.classList.add('admin-upload-area--dragover');
    });

    area.addEventListener('dragleave', () => {
        area.classList.remove('admin-upload-area--dragover');
    });

    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.classList.remove('admin-upload-area--dragover');
        if (e.dataTransfer.files.length > 0) {
            uploadFiles(e.dataTransfer.files);
        }
    });
}

function initUploadTabs() {
    const tabList = document.getElementById('admin-upload-tabs');
    if (!tabList) return;

    tabList.addEventListener('click', (e) => {
        const tab = e.target.closest('.admin-upload-tab');
        if (!tab) return;

        tabList.querySelectorAll('.admin-upload-tab').forEach(t => {
            t.classList.remove('is-active');
            t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');

        currentUploadFolder = tab.dataset.folder;
        renderAdminUploads();
    });
}

function openAdminLightbox(url, type, filename) {
    const lb = document.getElementById('admin-lightbox');
    if (!lb) return;

    const img = lb.querySelector('.admin-lightbox-img');
    const video = lb.querySelector('.admin-lightbox-video');
    const caption = lb.querySelector('.lightbox-caption');

    if (type === 'image') {
        img.src = url;
        img.alt = filename;
        img.hidden = false;
        video.hidden = true;
        video.src = '';
    } else {
        video.src = url;
        video.hidden = false;
        img.hidden = true;
        img.src = '';
    }

    caption.textContent = filename;
    lb.hidden = false;
    document.body.classList.add('menu-open');
    lb.querySelector('.lightbox-close').focus();
}

function closeAdminLightbox() {
    const lb = document.getElementById('admin-lightbox');
    if (!lb) return;

    lb.hidden = true;
    document.body.classList.remove('menu-open');

    const video = lb.querySelector('.admin-lightbox-video');
    video.pause();
    video.src = '';
    video.hidden = true;

    const img = lb.querySelector('.admin-lightbox-img');
    img.src = '';
    img.hidden = true;
}

function initAdminLightbox() {
    const lb = document.getElementById('admin-lightbox');
    if (!lb) return;

    lb.querySelector('.lightbox-close').addEventListener('click', closeAdminLightbox);
    lb.addEventListener('click', (e) => {
        if (e.target === lb) closeAdminLightbox();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !lb.hidden) closeAdminLightbox();
    });
}

function initUploadActions() {
    const list = document.getElementById('admin-uploads-list');
    if (!list) return;

    list.addEventListener('click', async (e) => {
        const thumb = e.target.closest('[data-preview-url]');
        if (thumb) {
            openAdminLightbox(thumb.dataset.previewUrl, thumb.dataset.previewType, thumb.getAttribute('alt') || thumb.getAttribute('aria-label') || '');
            return;
        }

        const copyBtn = e.target.closest('.admin-copy-url-btn');
        if (copyBtn) {
            const url = window.location.origin + copyBtn.dataset.url;
            try {
                await navigator.clipboard.writeText(url);
            } catch {
                const tmp = document.createElement('input');
                tmp.value = url;
                document.body.appendChild(tmp);
                tmp.select();
                document.execCommand('copy');
                document.body.removeChild(tmp);
            }
            const original = copyBtn.textContent;
            copyBtn.textContent = 'Kopiert!';
            setTimeout(() => { copyBtn.textContent = original; }, 2000);
            return;
        }

        const deleteBtn = e.target.closest('.admin-delete-upload-btn');
        if (deleteBtn) {
            const filename = deleteBtn.dataset.filename;
            if (!confirm(`Datei "${filename}" wirklich löschen?`)) return;

            deleteBtn.disabled = true;
            try {
                const folderParam = currentUploadFolder ? `?folder=${currentUploadFolder}` : '';
                const res = await adminFetch(`/api/uploads/${encodeURIComponent(filename)}${folderParam}`, {
                    method: 'DELETE'
                });
                if (res.ok) {
                    renderAdminUploads();
                } else {
                    const data = await res.json();
                    alert(data.error || 'Löschen fehlgeschlagen.');
                }
            } catch {
                alert('Verbindungsfehler.');
            } finally {
                deleteBtn.disabled = false;
            }
        }
    });
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
    initAdminLogin();
    initAdminLogout();
    initAdminUploads();
    initUploadTabs();
    initUploadActions();
    initAdminLightbox();

    const saveBtn = document.getElementById('admin-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', adminSave);

    const deleteBtn = document.getElementById('admin-delete-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', adminDelete);
});
