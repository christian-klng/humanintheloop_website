/* ============================================
   Human in the Loop — Application Logic
   ============================================ */

// --- State ---
let events = [];

// --- DOM References ---
const app = document.getElementById('app');
const views = {
    home: document.getElementById('home-view'),
    events: document.getElementById('events-view'),
    'event-detail': document.getElementById('event-detail-view'),
    styleguide: document.getElementById('styleguide-view'),
    privacy: document.getElementById('privacy-view'),
    terms: document.getElementById('terms-view'),
    imprint: document.getElementById('imprint-view')
};

const navLinks = {
    home: document.getElementById('nav-home'),
    events: document.getElementById('nav-events'),
    styleguide: document.getElementById('nav-styleguide')
};

// --- Data Loading ---

async function loadEvents() {
    try {
        const response = await fetch('events/events.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        events = await response.json();
    } catch (err) {
        console.error('Failed to load events:', err);
        events = [];
    }
}

// --- Render Helpers ---

function parseEventDate(dateStr) {
    const parts = dateStr.match(/^(\w+)\s+(\d+)/);
    if (!parts) return { month: '', day: '' };
    return { month: parts[1].toUpperCase().slice(0, 3), day: parts[2] };
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

function renderEventDetail(event) {
    const container = document.getElementById('event-detail-content');
    if (!container || !event) return;

    container.innerHTML = `
        <div class="page-header page-header--borderless container">
            <button class="back-link" id="back-to-events" aria-label="Back to events">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                Back to events
            </button>

            <h1 class="mb-md">${event.title}</h1>

            <div class="tag-list">
                <div class="badge inline"><span class="badge-dot" aria-hidden="true"></span> Upcoming</div>
                ${event.tags.map((tag) => `<div class="badge inline">${tag}</div>`).join('')}
            </div>
        </div>

        <section class="container section--flush">
            <img src="${event.image}" alt="${event.title} event cover" class="event-cover-img" loading="lazy">

            <div class="detail-layout">
                <div class="detail-main">
                    <h3>About this event</h3>
                    ${event.description.map((p) => `<p>${p}</p>`).join('')}

                    <h3>What you will learn</h3>
                    <ul>
                        ${event.learns.map((item) => `<li>${item}</li>`).join('')}
                    </ul>

                    <h3>Who should attend?</h3>
                    <p>${event.audience}</p>
                </div>

                <aside class="detail-sidebar">
                    <div class="card">
                        <h3>Event Details</h3>

                        <div class="info-row">
                            <span class="info-label">Date</span>
                            <span class="info-value">${event.dateFull}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Time</span>
                            <span class="info-value">${event.time}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Location</span>
                            <span class="info-value">
                                ${event.location}
                                ${event.locationNote ? `<small>${event.locationNote}</small>` : ''}
                            </span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Cost</span>
                            <span class="info-value">${event.cost}</span>
                        </div>

                        <button class="btn btn-block">Reserve your spot</button>
                        <p class="text-muted spots-remaining">Only ${event.spots} spots remaining.</p>
                    </div>
                </aside>
            </div>
        </section>
    `;

    // Bind back button
    document.getElementById('back-to-events').addEventListener('click', () => {
        navigateTo('events');
    });
}

function renderAllEventCards() {
    // Home page — show first 2 events
    const homeGrid = document.getElementById('home-events-grid');
    if (homeGrid) renderEventCards(homeGrid, events.slice(0, 2));

    // Events page — show all events
    const eventsGrid = document.getElementById('events-grid');
    if (eventsGrid) renderEventCards(eventsGrid, events);
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
        return { page: 'event-detail', eventId: eventMatch[1] };
    }

    const page = path.replace(/^\//, '').replace(/\/$/, '');
    if (views[page]) {
        return { page, eventId: null };
    }

    return { page: 'home', eventId: null };
}

function navigateTo(page, eventId) {
    let path = '/';
    if (page === 'event-detail' && eventId) {
        path = `/event/${eventId}`;
    } else if (page !== 'home') {
        path = `/${page}`;
    }

    if (window.location.pathname !== path) {
        history.pushState(null, '', path);
    }
    renderRoute({ page, eventId });
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

    const { page, eventId } = route;

    // Show target view
    if (views[page]) {
        views[page].classList.add('is-active');
    }

    // Set active nav
    if (page === 'event-detail') {
        navLinks.events?.classList.add('active');
        const event = events.find((e) => e.id === eventId) || events[0];
        renderEventDetail(event);
    } else if (navLinks[page]) {
        navLinks[page].classList.add('active');
    }

    // Update page title and meta tags
    const meta = {
        home: {
            title: 'Human in the Loop | Modern Education',
            description: 'Master the skills of tomorrow with industry-leading courses in engineering, design, and product strategy. Built for ambitious professionals.'
        },
        events: {
            title: 'Events & Workshops | Human in the Loop',
            description: 'Register for upcoming live sessions, hackathons, and guest lectures hosted by industry veterans.'
        },
        styleguide: {
            title: 'Styleguide | Human in the Loop',
            description: 'The design system and component library powering Human in the Loop.'
        },
        privacy: {
            title: 'Privacy Policy | Human in the Loop',
            description: 'Privacy policy for Human in the Loop. Learn how we collect, use, and protect your data.'
        },
        terms: {
            title: 'Terms of Service | Human in the Loop',
            description: 'Terms of service for Human in the Loop educational platform.'
        },
        imprint: {
            title: 'Imprint | Human in the Loop',
            description: 'Legal information and company details for Human in the Loop GmbH.'
        }
    };

    if (page === 'event-detail') {
        const event = events.find((e) => e.id === eventId) || events[0];
        updateMetaTags(
            `${event.title} | Human in the Loop`,
            event.description[0]
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
    } else if (href.startsWith('/event/')) {
        const eventId = href.replace('/event/', '');
        navigateTo('event-detail', eventId);
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
                     `/${hash}`;
        history.replaceState(null, '', path);
    }

    await loadEvents();
    renderAllEventCards();
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
