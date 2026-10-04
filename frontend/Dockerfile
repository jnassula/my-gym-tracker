# Base images by digest: a tag can be moved to other content, a digest can't. Dependabot
# updates both.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS base
WORKDIR /app

# ---- dev: Vite dev server, source bind-mounted by compose ----
FROM base AS dev
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-fund --no-audit
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# ---- build: the static app (PWA) ----
FROM base AS build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-fund --no-audit
COPY . .
# The version CI worked out for this build (deploy/version.sh), shown in Definições.
ARG APP_VERSION=dev
ENV VITE_APP_VERSION=${APP_VERSION}
RUN npm run build

# ---- prod: nginx serves the build and proxies /api to the backend ----
FROM nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de AS prod
# deploy.sh prunes old releases by this label, and nothing else on the server.
LABEL mygymtracker.image=frontend
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Not root: nginx.conf keeps what it writes in /tmp, and Docker lets an unprivileged user
# listen on port 80 (net.ipv4.ip_unprivileged_port_start is 0 inside a container).
USER nginx
EXPOSE 80
