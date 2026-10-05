# Global TSACO Control — build the static bundle, then serve it from nginx.
#
# Nothing in this image talks to a Techex backend: the browser opens those
# Socket.IO connections itself once the page loads, and servers are added at
# runtime through the UI. So the image needs no build args, no env vars, no
# credentials, and no network route to the appliances.
#
# Base images are pinned to a minor version so rebuilds stay reproducible;
# node here matches the 24.19.0 toolchain used on the build host.

FROM node:24.19.0-alpine AS build
WORKDIR /app

# Dependencies first so this layer caches independently of source changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

FROM nginx:1.30-alpine

LABEL org.opencontainers.image.title="Global TSACO Control" \
      org.opencontainers.image.description="Web UI for Techex TSACO changeover control across multiple appliances, with CCC/LMC regions, channel groups, paging and a local command audit log" \
      org.opencontainers.image.version="0.3.0" \
      org.opencontainers.image.source="https://github.com/gabrielmarchisparamount/global-tsaco-control"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz || exit 1
