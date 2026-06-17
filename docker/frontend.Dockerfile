FROM node:22-alpine AS builder
WORKDIR /app
COPY src/frontend/package*.json ./
RUN npm install
COPY src/frontend/ ./
# Vite picks up VITE_* vars at build time from the environment
ARG VITE_COLOR_STAFF
ARG VITE_COLOR_LUMINARY
ARG VITE_COLOR_PRESTIGE
ARG VITE_COLOR_VICE
ARG VITE_COLOR_SENATOR
ARG VITE_COLOR_DIGNITARY
ARG VITE_COLOR_ATTACHE
ARG VITE_COLOR_CITIZEN
ARG VITE_API_BASE_URL
ARG VITE_CRAFTY_URL
RUN npm run build

FROM nginx:1.27-alpine AS runner
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
# nginx.conf is volume-mounted at runtime via compose
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
