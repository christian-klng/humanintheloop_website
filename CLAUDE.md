# Human in the Loop — Website

## Project Overview

Website for Human in the Loop. Plain HTML, CSS, and vanilla JavaScript served via nginx + Node.js API in a Docker container. A build-time Node.js script generates per-route HTML for OG meta tags. An admin panel allows editing events and resources via the browser.

## Tech Stack

- HTML5, CSS3 (custom properties), vanilla JS
- Google Fonts (Switzer via Fontshare)
- Express.js API server (admin CRUD + data aggregation)
- Deployed via Northflank (Docker/nginx + Node.js)

## Project Structure

```
/
├── index.html              Main HTML template (with OG placeholders)
├── css/styles.css          All styles, design system variables
├── js/app.js               SPA router (History API), event rendering
├── js/admin.js             Admin panel UI logic
├── events/
│   ├── events.json         Bundled event data (migration seed)
│   └── images/             Event-specific images
├── library/
│   └── resources.json      Bundled resource data (migration seed)
├── server/
│   ├── api.js              Express API server (auth + CRUD)
│   └── package.json        API server dependencies
├── scripts/
│   ├── generate-pages.js   Build-time OG meta tag generator
│   └── migrate-to-individual.js  Splits bundled JSON into individual files
├── nginx.conf              nginx routing + API proxy configuration
├── Dockerfile              Multi-stage: node build + nginx + API serve
├── docker-entrypoint.sh    Container startup (migration, OG gen, servers)
├── favicon.ico             Favicons and web manifest
├── site.webmanifest
└── CLAUDE.md
```

## Naming

- **Never abbreviate "Human in the Loop"** — do not use "HITL" as it has unfortunate connotations in German. Always write the full name.

## Key Conventions

- **No CSS frameworks** — custom CSS with design tokens in `:root` variables
- **No inline styles** — all styling via classes in css/styles.css (exception: styleguide color swatches)
- **Events are data-driven** — individual JSON files on `/files/` volume, served via API
- **Library resources are data-driven** — individual JSON files on `/files/` volume, served via API
- **Media files served from `/files/` volume** — Northflank volume mounted at `/files/`, referenced as `/files/library/...` in resource JSON
- **Path-based SPA routing** — URLs use `/`, `/events`, `/event/{id}`, `/library`, `/resource/{id}`, `/styleguide`, `/privacy`, `/terms`, `/imprint`, `/admin`
- **Semantic HTML** — use `<a>` and `<button>` (not `<div onclick>`), include ARIA labels
- **OG meta tags** — generated per-route at Docker build time via `scripts/generate-pages.js`; regenerated at container startup from volume data; also updated client-side on navigation

## Color Palette

| Variable         | Hex       | Use                        |
|-----------------|-----------|----------------------------|
| `--accent`       | `#FFD166` | Primary buttons, accents   |
| `--secondary`    | `#073B4C` | Secondary buttons, bgs     |
| `--warning`      | `#EF476F` | Warnings, errors           |
| `--success`      | `#06D6A0` | Confirmations              |
| `--info`         | `#118AB2` | Notifications              |
| `--text-primary` | `#111111` | Main text                  |
| `--text-secondary`| `#8A8F98`| Muted text                 |

## Data Storage on `/files/` Volume

```
/files/
  ├── events/
  │   ├── event-slug.json           Individual event JSON files
  │   └── ...
  ├── library/
  │   ├── resource-slug/
  │   │   ├── resource.json         Resource data
  │   │   ├── thumb.jpg             Media files
  │   │   └── ...
  │   └── ...
```

On first container startup, `migrate-to-individual.js` splits the bundled `events.json` and `resources.json` into individual files on the volume (idempotent).

## Admin Panel

- **Access**: Navigate to `/admin` (no link in public navigation)
- **Authentication**: Simple password login via `ADMIN_PASSWORD` environment variable (Northflank secret group)
- **Features**: Edit (raw JSON), add, and delete events and resources
- **API server**: Express.js on port 3000 (proxied by nginx at `/api/*`)
- **Session**: Bearer token stored in `sessionStorage`, 24h expiry

### Admin Routes

| Route | View |
|-------|------|
| `/admin` | Login form |
| `/admin/dashboard` | Dashboard listing events & resources |
| `/admin/event/{id}` | JSON editor for event |
| `/admin/resource/{id}` | JSON editor for resource |
| `/admin/new/event` | Create new event |
| `/admin/new/resource` | Create new resource |

### API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/login` | No | Authenticate, returns token |
| `POST` | `/api/logout` | Yes | Invalidate token |
| `GET` | `/api/auth/check` | Yes | Verify token validity |
| `GET` | `/api/events` | No | List all events |
| `GET` | `/api/events/:id` | No | Single event |
| `PUT` | `/api/events/:id` | Yes | Update event |
| `POST` | `/api/events` | Yes | Create event |
| `DELETE` | `/api/events/:id` | Yes | Delete event |
| `GET` | `/api/resources` | No | List all resources |
| `GET` | `/api/resources/:id` | No | Single resource |
| `PUT` | `/api/resources/:id` | Yes | Update resource |
| `POST` | `/api/resources` | Yes | Create resource |
| `DELETE` | `/api/resources/:id` | Yes | Delete resource |

## Adding a New Resource

**Via admin panel** (preferred): Navigate to `/admin` → login → Add Resource → edit JSON → Save.

**Via files**: Create `/files/library/{resource-id}/resource.json` on the Northflank volume.

### Resource JSON Schema

```json
{
    "id": "url-safe-slug",
    "title": "Resource Title",
    "date": "2026-02-20",
    "author": "Author Name",
    "description": ["Paragraph 1", "Paragraph 2"],
    "tags": ["Tag1", "Tag2"],
    "thumbnail": "/files/library/slug/thumb.jpg",
    "images": [
        { "src": "/files/library/slug/photo.jpg", "alt": "Description", "caption": "Optional caption" }
    ],
    "video": { "type": "html5|youtube|vimeo", "src": "path-or-embed-id", "poster": "optional-poster.jpg" }
}
```

- `images` can be `[]` if no gallery; `video` can be `null` if no video
- `video.type`: `html5` (self-hosted, `src` is file path), `youtube`/`vimeo` (`src` is embed ID)
- Resources are sorted by date (newest first) automatically

## Adding a New Event

**Via admin panel** (preferred): Navigate to `/admin` → login → Add Event → edit JSON → Save.

**Via files**: Create `/files/events/{event-id}.json` on the Northflank volume.

## Local Development

```sh
npx serve -s -l 8000
# SPA-aware static server — serves index.html for all routes
# Note: API endpoints require the Node.js server (see Docker instructions)
```

## Docker Build

```sh
docker build --build-arg BASE_URL=https://your-domain.com -t humanintheloop .
docker run -p 8080:80 -e ADMIN_PASSWORD=yourpassword -v ./test-files:/files humanintheloop
```

`BASE_URL` is required — it sets the absolute URLs for OG meta tags and canonical links.
`ADMIN_PASSWORD` is required — it sets the admin login password.
