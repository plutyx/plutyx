FROM node:22-alpine AS build

WORKDIR /app
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ .
RUN npm run build

FROM nginx:1.27-alpine AS runtime

ENV PORT=8080 \
    API_UPSTREAM=http://127.0.0.1:8000

COPY frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
