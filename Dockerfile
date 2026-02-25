# Stage 1: Generate route-specific HTML files with OG meta tags
FROM node:20-alpine AS builder
WORKDIR /app
COPY index.html ./
COPY events/events.json ./events/
COPY library/resources.json ./library/
COPY scripts/generate-pages.js ./scripts/
ARG BASE_URL
ENV BASE_URL=${BASE_URL}
RUN node scripts/generate-pages.js

# Stage 2: Serve with nginx
FROM nginx:alpine

# Custom nginx configuration (SPA fallback)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy all source files
COPY . /usr/share/nginx/html

# Overlay generated route-specific HTML files (replaces root index.html
# with home-page OG values, adds per-route index.html files)
COPY --from=builder /app/dist/ /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
