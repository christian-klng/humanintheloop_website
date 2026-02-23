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

function createEventCard(event) {
    const card = document.createElement('a');
    card.href = `#event/${event.id}`;
    card.className = 'card event-card';
    card.setAttribute('aria-label', `${event.title} — ${event.date}`);
    card.innerHTML = `
        <img src="${event.image}" alt="" class="event-image" loading="lazy">
        <div class="event-content">
            <div class="event-date">${event.date} &bull; ${event.type}</div>
            <h3>${event.title}</h3>
            <p class="event-description">${event.description[0]}</p>
        </div>
    `;
    card.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('event-detail', event.id);
    });
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

// --- Router ---

function getRouteFromHash() {
    const hash = window.location.hash.slice(1) || 'home';
    if (hash.startsWith('event/')) {
        const eventId = hash.replace('event/', '');
        return { page: 'event-detail', eventId };
    }
    return { page: hash, eventId: null };
}

function navigateTo(page, eventId) {
    let hash = page;
    if (page === 'event-detail' && eventId) {
        hash = `event/${eventId}`;
    }

    if (window.location.hash !== `#${hash}`) {
        window.location.hash = hash;
    } else {
        renderRoute({ page, eventId });
    }
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

    // Update page title
    const titles = {
        home: 'Human in the Loop | Modern Education',
        events: 'Events & Workshops | Human in the Loop',
        'event-detail': null,
        styleguide: 'Styleguide | Human in the Loop',
        privacy: 'Privacy Policy | Human in the Loop',
        terms: 'Terms of Service | Human in the Loop',
        imprint: 'Imprint | Human in the Loop'
    };

    if (page === 'event-detail') {
        const event = events.find((e) => e.id === eventId) || events[0];
        document.title = `${event.title} | Human in the Loop`;
    } else {
        document.title = titles[page] || titles.home;
    }
}

// --- Event Listeners ---

// Nav links
Object.entries(navLinks).forEach(([page, link]) => {
    if (!link) return;
    link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(page);
    });
});

// Logo
const logo = document.querySelector('.logo');
if (logo) {
    logo.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('home');
    });
}

// Back/forward buttons
window.addEventListener('hashchange', () => {
    renderRoute(getRouteFromHash());
});

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadEvents();
    renderAllEventCards();
    renderRoute(getRouteFromHash());
});
