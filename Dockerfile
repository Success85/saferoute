# ═══════════════════════════════════════════════════════════════
# SafeRoute LA — Dockerfile
# Serves the frontend via Nginx in a lightweight container
# ═══════════════════════════════════════════════════════════════

# Stage 1: Use official Nginx Alpine image (tiny — ~7MB)
FROM nginx:alpine

# Copy the entire frontend into the Nginx web root
COPY . /usr/share/nginx/html/

# Copy our custom Nginx config with security headers
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check — verifies the server responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

# Start Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
