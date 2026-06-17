FROM node:22-alpine AS deps
WORKDIR /app
COPY src/backend/package*.json ./
RUN npm install --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app

# proper signal handling save me
RUN apk add --no-cache dumb-init wget su-exec

RUN addgroup -S panel && adduser -S panel -G panel

COPY --from=deps /app/node_modules ./node_modules
COPY src/backend/ ./
COPY scripts/import-member-aliases.mjs ./scripts/import-member-aliases.mjs
COPY scripts/import-warnings.mjs ./scripts/import-warnings.mjs

# volumes for runtime data — declared here as documentation; actual mounts in compose
# /app/data  — SQLite database
# /app/logs  — Winston log files
# /app/secrets — Google service account key (bind-mounted from host)
# /app/import — one-off CSV imports (bind-mounted from host)
RUN mkdir -p data logs secrets scripts import && chown -R panel:panel /app

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--", "/entrypoint.sh"]
CMD ["node", "start.js"]
