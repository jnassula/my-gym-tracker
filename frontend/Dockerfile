FROM node:24-alpine AS base
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
FROM nginx:1.29-alpine AS prod
# deploy.sh prunes old releases by this label, and nothing else on the server.
LABEL mygymtracker.image=frontend
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
