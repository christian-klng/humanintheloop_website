# Human in the Loop — Website

## Project Overview

Static website for Human in the Loop. No build step, no frameworks — plain HTML, CSS, and vanilla JavaScript served via nginx in a Docker container.

## Tech Stack

- HTML5, CSS3 (custom properties), vanilla JS
- Google Fonts (Inter)
- Deployed via Northflank (Docker/nginx)

## Project Structure

```
/
├── index.html              Main HTML (SPA with hash routing)
├── css/styles.css          All styles, design system variables
├── js/app.js               SPA router, event rendering, data fetching
├── events/
│   ├── events.json         Event data (single source of truth)
│   └── images/             Event-specific images
├── Dockerfile              nginx:alpine static serving
├── favicon.ico             Favicons and web manifest
├── site.webmanifest
└── CLAUDE.md
```

## Key Conventions

- **No CSS frameworks** — custom CSS with design tokens in `:root` variables
- **No inline styles** — all styling via classes in css/styles.css (exception: styleguide color swatches)
- **Events are data-driven** — defined in events/events.json, rendered dynamically by JS
- **Hash-based SPA routing** — URLs use `#home`, `#events`, `#event/{id}`, `#styleguide`
- **Semantic HTML** — use `<a>` and `<button>` (not `<div onclick>`), include ARIA labels

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

## Local Development

```sh
python3 -m http.server 8000
# or any static server — fetch() requires HTTP, not file://
```
