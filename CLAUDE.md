# Human in the Loop — Website

## Project Overview

Static website for Human in the Loop. No frameworks — plain HTML, CSS, and vanilla JavaScript served via nginx in a Docker container. A build-time Node.js script generates per-route HTML for OG meta tags.

## Tech Stack

- HTML5, CSS3 (custom properties), vanilla JS
- Google Fonts (Inter)
- Deployed via Northflank (Docker/nginx)

## Project Structure

```
/
├── index.html              Main HTML template (with OG placeholders)
├── css/styles.css          All styles, design system variables
├── js/app.js               SPA router (History API), event rendering
├── events/
│   ├── events.json         Event data (single source of truth)
│   └── images/             Event-specific images
├── scripts/
│   └── generate-pages.js   Build-time OG meta tag generator
├── nginx.conf              nginx routing configuration
├── Dockerfile              Multi-stage: node build + nginx serve
├── favicon.ico             Favicons and web manifest
├── site.webmanifest
└── CLAUDE.md
```

## Naming

- **Never abbreviate "Human in the Loop"** — do not use "HITL" as it has unfortunate connotations in German. Always write the full name.

## Key Conventions

- **No CSS frameworks** — custom CSS with design tokens in `:root` variables
- **No inline styles** — all styling via classes in css/styles.css (exception: styleguide color swatches)
- **Events are data-driven** — defined in events/events.json, rendered dynamically by JS
- **Path-based SPA routing** — URLs use `/`, `/events`, `/event/{id}`, `/styleguide`, `/privacy`, `/terms`, `/imprint`
- **Semantic HTML** — use `<a>` and `<button>` (not `<div onclick>`), include ARIA labels
- **OG meta tags** — generated per-route at Docker build time via `scripts/generate-pages.js`; also updated client-side on navigation

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

## Adding a New Event

1. Add an entry to `events/events.json`
2. Place the event image in `events/images/`
3. Reference the image path as `events/images/filename.jpg` in the JSON
4. OG tags are generated automatically at Docker build time from events.json

## Local Development

```sh
npx serve -s -l 8000
# SPA-aware static server — serves index.html for all routes
```

## Docker Build

```sh
docker build --build-arg BASE_URL=https://your-domain.com -t humanintheloop .
docker run -p 8080:80 humanintheloop
```

`BASE_URL` is required — it sets the absolute URLs for OG meta tags and canonical links.
