FROM node:22-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Vite picks up VITE_* vars at build time from the environment
ARG VITE_COLOR_BRONZE
ARG VITE_COLOR_SILVER
ARG VITE_COLOR_GOLD
ARG VITE_COLOR_DIAMOND
ARG VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine AS runner
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
# nginx.conf is volume-mounted at runtime via compose
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
