/* ============================================
   Human in the Loop — Application Logic
   ============================================ */

// --- Config ---
const WEBHOOK_URL = (
    window.__CONFIG__ &&
    window.__CONFIG__.webhookUrl &&
    !window.__CONFIG__.webhookUrl.startsWith('__')
) ? window.__CONFIG__.webhookUrl : null;

// --- State ---
let events = [];
let resources = [];

// --- DOM References ---
const app = document.getElementById('app');
const views = {
    home: document.getElementById('home-view'),
    events: document.getElementById('events-view'),
    'event-detail': document.getElementById('event-detail-view'),
    library: document.getElementById('library-view'),
    'resource-detail': document.getElementById('resource-detail-view'),
    styleguide: document.getElementById('styleguide-view'),
    privacy: document.getElementById('privacy-view'),
    terms: document.getElementById('terms-view'),
    imprint: document.getElementById('imprint-view'),
    admin: document.getElementById('admin-view'),
    'admin-dashboard': document.getElementById('admin-dashboard-view'),
    'admin-edit': document.getElementById('admin-edit-view')
};

const navLinks = {
    home: document.getElementById('nav-home'),
    events: document.getElementById('nav-events'),
    library: document.getElementById('nav-library'),
    styleguide: document.getElementById('nav-styleguide')
};

// --- Data Loading ---

async function loadEvents() {
    try {
        const response = await fetch('/api/events');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        events = await response.json();
    } catch (err) {
        console.error('Failed to load events:', err);
        events = [];
    }
}

async function loadResources() {
    try {
        const response = await fetch('/api/resources');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        resources = await response.json();
        resources.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (err) {
        console.error('Failed to load resources:', err);
        resources = [];
    }
}

// --- Render Helpers ---

function parseEventDate(dateStr) {
    const parts = dateStr.match(/^(\d+)\.\s*(\w+)/);
    if (!parts) return { month: '', day: '' };
    return { month: parts[2].toUpperCase().slice(0, 3), day: parts[1] };
}

function createEventCard(event) {
    const { month, day } = parseEventDate(event.date);
    const card = document.createElement('a');
    card.href = `/event/${event.id}`;
    card.className = 'card event-card';
    card.setAttribute('aria-label', `${event.title} — ${event.date}`);
    card.innerHTML = `
        <div class="ticket-stub">
            <span class="ticket-month">${month}</span>
            <span class="ticket-day">${day}</span>
            <div class="ticket-perf" aria-hidden="true"></div>
        </div>
        <div class="ticket-body">
            <img src="${event.image}" alt="" class="event-image" loading="lazy">
            <div class="event-content">
                <div class="event-date">${event.date} &bull; ${event.type}</div>
                <h3>${event.title}</h3>
                <p class="event-description">${event.description[0]}</p>
            </div>
        </div>
    `;
    return card;
}

function renderEventCards(container, eventList) {
    container.innerHTML = '';
    eventList.forEach((event) => {
        container.appendChild(createEventCard(event));
    });
}

function buildRegistrationBlock(event) {
    if (event.pricing === 'paid') {
        return `
            <div class="registration-form" id="registration-form">
                <label for="reg-email" class="reg-label">E-Mail-Adresse</label>
                <input type="email" id="reg-email" class="reg-input"
                    placeholder="name@example.com" autocomplete="email" required>
                <button type="button" class="btn btn-block" id="reg-submit">
                    Jetzt buchen
                </button>
                <p class="reg-note text-muted">Sie werden zu Stripe weitergeleitet.</p>
            </div>`;
    }

    return `
        <div class="registration-form" id="registration-form">
            <label for="reg-email" class="reg-label">E-Mail-Adresse</label>
            <input type="email" id="reg-email" class="reg-input"
                placeholder="name@example.com" autocomplete="email"
                aria-describedby="reg-status" required>
            <button type="button" class="btn btn-block" id="reg-submit">
                Kostenlos anmelden
            </button>
            <div id="reg-status" class="reg-status" aria-live="polite" aria-atomic="true"></div>
        </div>`;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setRegStatus(el, type, message) {
    if (!el) return;
    el.textContent = message;
    el.className = 'reg-status' + (type ? ` reg-status--${type}` : '');
}

function handlePaidRedirect(event, emailInput) {
    const email = emailInput.value.trim();

    if (!isValidEmail(email)) {
        emailInput.focus();
        emailInput.setCustomValidity('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
        emailInput.reportValidity();
        return;
    }
    emailInput.setCustomValidity('');

    const url = new URL(event.stripeLink);
    url.searchParams.set('client_reference_id', event.id);
    url.searchParams.set('prefilled_email', email);

    window.location.href = url.toString();
}

async function handleFreeRegistration(event, emailInput, submitBtn) {
    const email = emailInput.value.trim();
    const statusEl = document.getElementById('reg-status');

    if (!isValidEmail(email)) {
        emailInput.focus();
        emailInput.setCustomValidity('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
        emailInput.reportValidity();
        return;
    }
    emailInput.setCustomValidity('');

    if (!WEBHOOK_URL) {
        console.warn('Webhook URL not configured.');
        setRegStatus(statusEl, 'error', 'Anmeldung momentan nicht verfügbar. Bitte versuchen Sie es später erneut.');
        return;
    }

    // Loading state
    submitBtn.disabled = true;
    submitBtn.textContent = 'Wird gesendet\u2026';
    setRegStatus(statusEl, '', '');

    const payload = {
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.dateFull,
        eventTime: event.time,
        email: email,
        onlineLink: event.onlineLink || null,
        confirmationText: event.confirmationText || null
    };

    try {
        const res = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const form = document.getElementById('registration-form');
        if (form) {
            form.innerHTML = `
                <div class="reg-success" role="status">
                    <svg class="reg-success-icon" width="20" height="20" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" stroke-width="2.5"
                        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M20 6L9 17l-5-5"/>
                    </svg>
                    <p>Anmeldung erfolgreich! Sie erhalten in Kürze eine Bestätigungs-E-Mail.</p>
                </div>`;
        }
    } catch (err) {
        console.error('Registration failed:', err);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Kostenlos anmelden';
        setRegStatus(statusEl, 'error', 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.');
    }
}

function renderEventDetail(event) {
    const container = document.getElementById('event-detail-content');
    if (!container || !event) return;

    container.innerHTML = `
        <div class="page-header page-header--borderless container">
            <button class="back-link" id="back-to-events" aria-label="Zurück zu Veranstaltungen">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                Zurück zu Veranstaltungen
            </button>

            <h1 class="mb-md">${event.title}</h1>

            <div class="tag-list">
                <div class="badge inline"><span class="badge-dot" aria-hidden="true"></span> Bevorstehend</div>
                ${event.tags.map((tag) => `<div class="badge inline">${tag}</div>`).join('')}
            </div>
        </div>

        <section class="container section--flush">
            <img src="${event.image}" alt="${event.title} Veranstaltungsbild" class="event-cover-img" loading="lazy">

            <div class="detail-layout">
                <div class="detail-main">
                    <h3>Über diese Veranstaltung</h3>
                    ${event.description.map((p) => `<p>${p}</p>`).join('')}

                    <h3>Was Sie lernen werden</h3>
                    <ul>
                        ${event.learns.map((item) => `<li>${item}</li>`).join('')}
                    </ul>

                    <h3>Für wen ist diese Veranstaltung?</h3>
                    <p>${event.audience}</p>
                </div>

                <aside class="detail-sidebar">
                    <div class="card">
                        <h3>Veranstaltungsdetails</h3>

                        <div class="info-row">
                            <span class="info-label">Datum</span>
                            <span class="info-value">${event.dateFull}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Uhrzeit</span>
                            <span class="info-value">${event.time}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Ort</span>
                            <span class="info-value">
                                ${event.location}
                                ${event.locationNote ? `<small>${event.locationNote}</small>` : ''}
                            </span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Kosten</span>
                            <span class="info-value">${event.cost}</span>
                        </div>

<<<<<<< Updated upstream
                        <button class="btn btn-block">Jetzt Platz reservieren</button>
                        <p class="text-muted spots-remaining">Nur noch ${event.spots} Plätze verfügbar.</p>
=======
<<<<<<< HEAD
                        ${buildRegistrationBlock(event)}

                        <p class="text-muted spots-remaining">Only ${event.spots} spots remaining.</p>
=======
                        <button class="btn btn-block">Jetzt Platz reservieren</button>
                        <p class="text-muted spots-remaining">Nur noch ${event.spots} Plätze verfügbar.</p>
>>>>>>> 2f1040d3cfc4c0297726ef00c1878dd47a7ba26d
>>>>>>> Stashed changes
                    </div>
                </aside>
            </div>
        </section>
    `;

    // Bind back button
    document.getElementById('back-to-events').addEventListener('click', () => {
        navigateTo('events');
    });

    // Bind registration form
    const submitBtn = document.getElementById('reg-submit');
    const emailInput = document.getElementById('reg-email');

    if (submitBtn && emailInput) {
        submitBtn.addEventListener('click', () => {
            if (event.pricing === 'paid') {
                handlePaidRedirect(event, emailInput);
            } else {
                handleFreeRegistration(event, emailInput, submitBtn);
            }
        });

        emailInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitBtn.click();
        });
    }
}

function renderAllEventCards() {
    // Home page — show first 2 events
    const homeGrid = document.getElementById('home-events-grid');
    if (homeGrid) renderEventCards(homeGrid, events.slice(0, 2));

    // Events page — show all events
    const eventsGrid = document.getElementById('events-grid');
    if (eventsGrid) renderEventCards(eventsGrid, events);
}

// --- Resource Render Helpers ---

function formatResourceDate(isoDate) {
    const d = new Date(isoDate);
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function createResourceCard(resource) {
    const card = document.createElement('a');
    card.href = `/resource/${resource.id}`;
    card.className = 'card resource-card';
    card.setAttribute('aria-label', `${resource.title} — ${resource.author}`);

    const hasVideo = resource.video !== null;
    const hasImages = resource.images && resource.images.length > 0;
    const mediaType = hasVideo && hasImages ? 'Galerie & Video'
                    : hasVideo ? 'Video'
                    : hasImages ? 'Galerie'
                    : 'Artikel';

    card.innerHTML = `
        ${resource.thumbnail ? `<img src="${resource.thumbnail}" alt="" class="resource-card-img" loading="lazy">` : ''}
        <div class="resource-card-body">
            <div class="resource-card-meta">${formatResourceDate(resource.date)} &bull; ${mediaType}</div>
            <h3>${resource.title}</h3>
            <p>${resource.description[0]}</p>
        </div>
        ${resource.tags.length ? `
            <div class="resource-card-tags">
                ${resource.tags.map(tag => `<div class="badge inline">${tag}</div>`).join('')}
            </div>
        ` : ''}
    `;
    return card;
}

function renderResourceCards(container, resourceList) {
    container.innerHTML = '';
    resourceList.forEach(resource => {
        container.appendChild(createResourceCard(resource));
    });
}

function renderAllResourceCards() {
    const homeGrid = document.getElementById('home-resources-grid');
    if (homeGrid) renderResourceCards(homeGrid, resources.slice(0, 3));

    const libraryGrid = document.getElementById('library-grid');
    if (libraryGrid) renderResourceCards(libraryGrid, resources);
}

function renderResourceDetail(resource) {
    const container = document.getElementById('resource-detail-content');
    if (!container || !resource) return;

    const hasVideo = resource.video !== null;
    const hasImages = resource.images && resource.images.length > 0;

    let galleryHTML = '';
    if (hasImages) {
        galleryHTML = `
            <h3>Galerie</h3>
            <div class="gallery-grid">
                ${resource.images.map((img, i) => `
                    <img
                        src="${img.src}"
                        alt="${img.alt}"
                        class="gallery-thumb"
                        tabindex="0"
                        role="button"
                        aria-label="Bild ${i + 1} ansehen: ${img.alt}"
                        data-gallery-index="${i}"
                        loading="lazy"
                    >
                `).join('')}
            </div>
        `;
    }

    let videoHTML = '';
    if (hasVideo) {
        const v = resource.video;
        if (v.type === 'html5') {
            videoHTML = `
                <h3>Video</h3>
                <div class="resource-video">
                    <video id="resource-player" playsinline controls${v.poster ? ` poster="${v.poster}"` : ''}>
                        <source src="${v.src}" type="video/mp4">
                    </video>
                </div>
            `;
        } else if (v.type === 'youtube') {
            videoHTML = `
                <h3>Video</h3>
                <div class="resource-video">
                    <div id="resource-player" data-plyr-provider="youtube" data-plyr-embed-id="${v.src}"></div>
                </div>
            `;
        } else if (v.type === 'vimeo') {
            videoHTML = `
                <h3>Video</h3>
                <div class="resource-video">
                    <div id="resource-player" data-plyr-provider="vimeo" data-plyr-embed-id="${v.src}"></div>
                </div>
            `;
        }
    }

    container.innerHTML = `
        <div class="page-header page-header--borderless container">
            <button class="back-link" id="back-to-library" aria-label="Zurück zur Bibliothek">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                Zurück zur Bibliothek
            </button>

            <h1 class="mb-md">${resource.title}</h1>

            <div class="tag-list">
                ${resource.tags.map(tag => `<div class="badge inline">${tag}</div>`).join('')}
            </div>
        </div>

        <section class="container section--flush">
            <div class="detail-layout">
                <div class="detail-main">
                    <h3>Über diese Ressource</h3>
                    ${resource.description.map(p => `<p>${p}</p>`).join('')}

                    ${videoHTML}
                    ${galleryHTML}
                </div>

                <aside class="detail-sidebar">
                    <div class="card">
                        <h3>Ressourcendetails</h3>

                        <div class="info-row">
                            <span class="info-label">Autor</span>
                            <span class="info-value">${resource.author}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Veröffentlicht</span>
                            <span class="info-value">${formatResourceDate(resource.date)}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Medien</span>
                            <span class="info-value">${[
                                hasImages ? `${resource.images.length} Bild${resource.images.length > 1 ? 'er' : ''}` : '',
                                hasVideo ? '1 Video' : ''
                            ].filter(Boolean).join(', ') || 'Nur Artikel'}</span>
                        </div>
                    </div>
                </aside>
            </div>
        </section>
    `;

    document.getElementById('back-to-library').addEventListener('click', () => {
        navigateTo('library');
    });

    // Initialize Plyr if video exists
    if (hasVideo && typeof Plyr !== 'undefined') {
        new Plyr('#resource-player', {
            controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen']
        });
    }

    // Bind gallery thumbnails to lightbox
    if (hasImages) {
        const thumbs = container.querySelectorAll('.gallery-thumb');
        thumbs.forEach(thumb => {
            thumb.addEventListener('click', () => {
                openLightbox(resource.images, parseInt(thumb.dataset.galleryIndex, 10));
            });
            thumb.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openLightbox(resource.images, parseInt(thumb.dataset.galleryIndex, 10));
                }
            });
        });
    }
}

// --- Lightbox ---

let lightboxImages = [];
let lightboxIndex = 0;

function openLightbox(images, startIndex) {
    lightboxImages = images;
    lightboxIndex = startIndex;
    const lb = document.getElementById('lightbox');
    lb.hidden = false;
    document.body.classList.add('menu-open');
    updateLightbox();
    lb.querySelector('.lightbox-close').focus();
}

function closeLightbox() {
    const lb = document.getElementById('lightbox');
    lb.hidden = true;
    document.body.classList.remove('menu-open');
    lightboxImages = [];
}

function updateLightbox() {
    const img = lightboxImages[lightboxIndex];
    const lb = document.getElementById('lightbox');
    lb.querySelector('.lightbox-img').src = img.src;
    lb.querySelector('.lightbox-img').alt = img.alt;
    lb.querySelector('.lightbox-caption').textContent = img.caption || '';
    lb.querySelector('.lightbox-counter').textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
    lb.querySelector('.lightbox-prev').style.display = lightboxImages.length > 1 ? '' : 'none';
    lb.querySelector('.lightbox-next').style.display = lightboxImages.length > 1 ? '' : 'none';
}

function initLightbox() {
    const lb = document.getElementById('lightbox');
    if (!lb) return;

    lb.querySelector('.lightbox-close').addEventListener('click', closeLightbox);

    lb.querySelector('.lightbox-prev').addEventListener('click', () => {
        lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
        updateLightbox();
    });

    lb.querySelector('.lightbox-next').addEventListener('click', () => {
        lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
        updateLightbox();
    });

    lb.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') {
            lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
            updateLightbox();
        }
        if (e.key === 'ArrowRight') {
            lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
            updateLightbox();
        }
    });

    lb.addEventListener('click', (e) => {
        if (e.target === lb) closeLightbox();
    });
}

// --- Meta Tags ---

function updateMetaTags(title, description) {
    document.title = title;

    function setMeta(selector, content) {
        const el = document.querySelector(selector);
        if (el) el.setAttribute('content', content);
    }

    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', window.location.href);

    setMeta('meta[property="og:url"]', window.location.href);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
}

// --- Router ---

function getRouteFromPath() {
    const path = window.location.pathname;

    if (path === '/' || path === '') {
        return { page: 'home', eventId: null };
    }

    const eventMatch = path.match(/^\/event\/(.+?)(?:\/)?$/);
    if (eventMatch) {
        return { page: 'event-detail', detailId: eventMatch[1] };
    }

    const resourceMatch = path.match(/^\/resource\/(.+?)(?:\/)?$/);
    if (resourceMatch) {
        return { page: 'resource-detail', detailId: resourceMatch[1] };
    }

    // Admin routes
    const adminEditEventMatch = path.match(/^\/admin\/event\/(.+?)(?:\/)?$/);
    if (adminEditEventMatch) {
        return { page: 'admin-edit', detailId: adminEditEventMatch[1], editType: 'event' };
    }

    const adminEditResourceMatch = path.match(/^\/admin\/resource\/(.+?)(?:\/)?$/);
    if (adminEditResourceMatch) {
        return { page: 'admin-edit', detailId: adminEditResourceMatch[1], editType: 'resource' };
    }

    const adminNewMatch = path.match(/^\/admin\/new\/(event|resource)(?:\/)?$/);
    if (adminNewMatch) {
        return { page: 'admin-edit', detailId: null, editType: adminNewMatch[1], isNew: true };
    }

    if (path === '/admin' || path === '/admin/') {
        return { page: 'admin', detailId: null };
    }

    if (path === '/admin/dashboard' || path === '/admin/dashboard/') {
        return { page: 'admin-dashboard', detailId: null };
    }

    const page = path.replace(/^\//, '').replace(/\/$/, '');
    if (views[page]) {
        return { page, detailId: null };
    }

    return { page: 'home', detailId: null };
}

function navigateTo(page, detailId, opts) {
    let path = '/';
    if (page === 'event-detail' && detailId) {
        path = `/event/${detailId}`;
    } else if (page === 'resource-detail' && detailId) {
        path = `/resource/${detailId}`;
    } else if (page === 'admin-edit' && opts) {
        if (opts.isNew) {
            path = `/admin/new/${opts.editType}`;
        } else {
            path = `/admin/${opts.editType}/${detailId}`;
        }
    } else if (page === 'admin-dashboard') {
        path = '/admin/dashboard';
    } else if (page !== 'home') {
        path = `/${page}`;
    }

    if (window.location.pathname !== path) {
        history.pushState(null, '', path);
    }
    renderRoute({ page, detailId, ...(opts || {}) });
}

function renderRoute(route) {
    window.scrollTo(0, 0);

    // Hide all views
    Object.values(views).forEach((view) => {
        if (view) view.classList.remove('is-active');
    });

    // Reset active nav states
    Object.values(navLinks).forEach((link) => {
        if (link) link.classList.remove('active');
    });

    const { page, detailId } = route;

    // Show target view
    if (views[page]) {
        views[page].classList.add('is-active');
    }

    // Set active nav
    if (page === 'event-detail') {
        navLinks.events?.classList.add('active');
        const event = events.find((e) => e.id === detailId) || events[0];
        renderEventDetail(event);
    } else if (page === 'resource-detail') {
        navLinks.library?.classList.add('active');
        const resource = resources.find(r => r.id === detailId) || resources[0];
        renderResourceDetail(resource);
    } else if (page === 'admin') {
        // If already authenticated, redirect to dashboard
        if (typeof getAdminToken === 'function' && getAdminToken()) {
            navigateTo('admin-dashboard');
            return;
        }
    } else if (page === 'admin-dashboard') {
        if (typeof getAdminToken === 'function' && !getAdminToken()) {
            navigateTo('admin');
            return;
        }
        if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
    } else if (page === 'admin-edit') {
        if (typeof getAdminToken === 'function' && !getAdminToken()) {
            navigateTo('admin');
            return;
        }
        if (typeof renderAdminEditor === 'function') {
            renderAdminEditor(route.editType, detailId, route.isNew);
        }
    } else if (navLinks[page]) {
        navLinks[page].classList.add('active');
    }

    // Update page title and meta tags
    const meta = {
        home: {
            title: 'Human in the Loop | Moderne Bildung',
            description: 'Erlernen Sie die Fähigkeiten von morgen mit branchenführenden Kursen in Engineering, Design und Produktstrategie. Für ambitionierte Fachkräfte.'
        },
        events: {
            title: 'Veranstaltungen & Workshops | Human in the Loop',
            description: 'Melden Sie sich für kommende Live-Sessions, Hackathons und Gastvorträge von Branchenexperten an.'
        },
        library: {
            title: 'Bibliothek | Human in the Loop',
            description: 'Artikel, Bildergalerien und Videoressourcen aus der Human in the Loop-Community.'
        },
        styleguide: {
            title: 'Styleguide | Human in the Loop',
            description: 'Das Designsystem und die Komponentenbibliothek von Human in the Loop.'
        },
        privacy: {
            title: 'Datenschutzerklärung | Human in the Loop',
            description: 'Datenschutzerklärung von Human in the Loop. Erfahren Sie, wie wir Ihre Daten erheben, nutzen und schützen.'
        },
        terms: {
            title: 'Nutzungsbedingungen | Human in the Loop',
            description: 'Nutzungsbedingungen der Bildungsplattform Human in the Loop.'
        },
        imprint: {
            title: 'Impressum | Human in the Loop',
            description: 'Rechtliche Informationen und Unternehmensdaten der Human in the Loop GmbH.'
        },
        admin: {
            title: 'Admin | Human in the Loop',
            description: 'Admin-Bereich zur Verwaltung von Veranstaltungen und Ressourcen.'
        },
        'admin-dashboard': {
            title: 'Admin-Dashboard | Human in the Loop',
            description: 'Veranstaltungen und Ressourcen verwalten.'
        },
        'admin-edit': {
            title: 'Admin-Editor | Human in the Loop',
            description: 'Veranstaltungs- oder Ressourcendaten bearbeiten.'
        }
    };

    if (page === 'event-detail') {
        const event = events.find((e) => e.id === detailId) || events[0];
        updateMetaTags(
            `${event.title} | Human in the Loop`,
            event.description[0]
        );
    } else if (page === 'resource-detail') {
        const resource = resources.find(r => r.id === detailId) || resources[0];
        updateMetaTags(
            `${resource.title} | Human in the Loop`,
            resource.description[0]
        );
    } else {
        const m = meta[page] || meta.home;
        updateMetaTags(m.title, m.description);
    }
}

// --- Mobile Menu ---

const navToggle = document.querySelector('.nav-toggle');
const navEl = document.querySelector('nav');
const navLinksEl = document.querySelector('.nav-links');
const navOverlay = document.querySelector('.nav-overlay');

function openMenu() {
    navEl.classList.add('is-open');
    navLinksEl.classList.add('is-open');
    navOverlay.classList.add('is-open');
    navToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
}

function closeMenu() {
    navEl.classList.remove('is-open');
    navLinksEl.classList.remove('is-open');
    navOverlay.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
}

if (navToggle) {
    navToggle.addEventListener('click', () => {
        const isOpen = navEl.classList.contains('is-open');
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });
}

if (navOverlay) {
    navOverlay.addEventListener('click', closeMenu);
}

// --- Event Listeners ---

// Delegated click handler for all internal path-based links
document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || !href.startsWith('/')) return;
    if (link.target === '_blank' || e.ctrlKey || e.metaKey) return;

    e.preventDefault();
    closeMenu();

    if (href === '/') {
        navigateTo('home');
    } else if (href.startsWith('/admin/new/')) {
        const editType = href.replace('/admin/new/', '').replace(/\/$/, '');
        navigateTo('admin-edit', null, { editType, isNew: true });
    } else if (href.startsWith('/admin/event/')) {
        const detailId = href.replace('/admin/event/', '').replace(/\/$/, '');
        navigateTo('admin-edit', detailId, { editType: 'event' });
    } else if (href.startsWith('/admin/resource/')) {
        const detailId = href.replace('/admin/resource/', '').replace(/\/$/, '');
        navigateTo('admin-edit', detailId, { editType: 'resource' });
    } else if (href === '/admin/dashboard') {
        navigateTo('admin-dashboard');
    } else if (href.startsWith('/event/')) {
        const detailId = href.replace('/event/', '');
        navigateTo('event-detail', detailId);
    } else if (href.startsWith('/resource/')) {
        const detailId = href.replace('/resource/', '');
        navigateTo('resource-detail', detailId);
    } else {
        const page = href.slice(1);
        navigateTo(page);
    }
});

// Back/forward buttons
window.addEventListener('popstate', () => {
    closeMenu();
    renderRoute(getRouteFromPath());
});

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    // Legacy hash redirect (for old bookmarks like /#events)
    if (window.location.hash && window.location.hash !== '#app') {
        const hash = window.location.hash.slice(1);
        const path = hash === 'home' ? '/' :
                     hash.startsWith('event/') ? `/${hash}` :
                     hash.startsWith('resource/') ? `/${hash}` :
                     `/${hash}`;
        history.replaceState(null, '', path);
    }

    await Promise.all([loadEvents(), loadResources()]);
    renderAllEventCards();
    renderAllResourceCards();
    initLightbox();
    renderRoute(getRouteFromPath());
    initHeroCanvas();
});

// --- Hero Knowledge Graph Animation ---

function initHeroCanvas() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const hero = canvas.parentElement;

    // Config
    const NODE_COUNT = 40;
    const CONNECTION_DIST = 130;
    const MOUSE_RADIUS = 200;
    const NODE_SPEED = 0.25;
    const NODE_SIZE = 2;
    const ACCENT = [255, 209, 102]; // --accent #FFD166

    let mouse = { x: -9999, y: -9999 };
    let nodes = [];
    let animId = null;

    function resize() {
        const rect = hero.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    function createNodes() {
        nodes = [];
        for (let i = 0; i < NODE_COUNT; i++) {
            nodes.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * NODE_SPEED * 2,
                vy: (Math.random() - 0.5) * NODE_SPEED * 2
            });
        }
    }

    function dist(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update positions
        for (const node of nodes) {
            node.x += node.vx;
            node.y += node.vy;

            if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
            if (node.y < 0 || node.y > canvas.height) node.vy *= -1;

            node.x = Math.max(0, Math.min(canvas.width, node.x));
            node.y = Math.max(0, Math.min(canvas.height, node.y));
        }

        // Draw connections
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const d = dist(nodes[i], nodes[j]);
                if (d > CONNECTION_DIST) continue;

                const midX = (nodes[i].x + nodes[j].x) / 2;
                const midY = (nodes[i].y + nodes[j].y) / 2;
                const mouseDist = dist({ x: midX, y: midY }, mouse);
                const fade = 1 - d / CONNECTION_DIST;

                if (mouseDist < MOUSE_RADIUS) {
                    const glow = 1 - mouseDist / MOUSE_RADIUS;
                    ctx.strokeStyle = `rgba(${ACCENT[0]}, ${ACCENT[1]}, ${ACCENT[2]}, ${fade * 0.3 * glow + fade * 0.05})`;
                } else {
                    ctx.strokeStyle = `rgba(0, 0, 0, ${fade * 0.05})`;
                }

                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(nodes[i].x, nodes[i].y);
                ctx.lineTo(nodes[j].x, nodes[j].y);
                ctx.stroke();
            }
        }

        // Draw nodes
        for (const node of nodes) {
            const mouseDist = dist(node, mouse);
            let alpha = 0.1;
            let size = NODE_SIZE;
            let r = 0, g = 0, b = 0;

            if (mouseDist < MOUSE_RADIUS) {
                const glow = 1 - mouseDist / MOUSE_RADIUS;
                r = ACCENT[0];
                g = ACCENT[1];
                b = ACCENT[2];
                alpha = 0.15 + glow * 0.5;
                size = NODE_SIZE + glow * 1.5;
            }

            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.beginPath();
            ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        animId = requestAnimationFrame(draw);
    }

    // Mouse tracking — translate page coords to hero-relative coords
    hero.addEventListener('mousemove', (e) => {
        const rect = hero.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });

    hero.addEventListener('mouseleave', () => {
        mouse.x = -9999;
        mouse.y = -9999;
    });

    // Enable pointer events on the hero but keep canvas non-interactive
    hero.style.pointerEvents = 'auto';

    window.addEventListener('resize', () => {
        resize();
        createNodes();
    });

    resize();
    createNodes();
    draw();
}
