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

# Stage 2: Install API server dependencies
FROM node:20-alpine AS api-deps
WORKDIR /app/server
COPY server/package.json ./
RUN npm install --production

# Stage 3: Runtime — nginx + Node.js
FROM node:20-alpine

# Install nginx and vips runtime (required by sharp for image processing)
RUN apk add --no-cache nginx vips

# Copy nginx config
COPY nginx.conf /etc/nginx/http.d/default.conf

# Copy all source files
COPY . /usr/share/nginx/html

# Overlay generated OG pages from Stage 1
COPY --from=builder /app/dist/ /usr/share/nginx/html/

# Copy API server + dependencies
COPY --from=api-deps /app/server/node_modules /app/server/node_modules
COPY server/api.js /app/server/
COPY server/image-variants.js /app/server/
COPY server/package.json /app/server/

# Copy scripts for runtime migration + OG regeneration
COPY scripts/ /app/scripts/

# Copy entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENV ADMIN_USER=""
ENV ADMIN_PASSWORD=""
ENV BASE_URL=""

ENTRYPOINT ["/docker-entrypoint.sh"]
