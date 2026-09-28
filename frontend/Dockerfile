FROM node:24-alpine AS base
WORKDIR /app

# ---- dev: Vite dev server, source bind-mounted by compose ----
FROM base AS dev
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-fund --no-audit
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
