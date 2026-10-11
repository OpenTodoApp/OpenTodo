# Static website for OpenTodo, served by nginx.
# Coolify: build pack Dockerfile, base directory /website, port 80.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css main.js analytics.js /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
# Docs, generated from ../docs by `make docs` and committed (user-documentation).
COPY docs/ /usr/share/nginx/html/docs/
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
