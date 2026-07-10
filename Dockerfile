# mcp-proxy + Trakt MCP server (SSE -> stdio)
FROM ghcr.io/sparfenyuk/mcp-proxy:latest

ARG VERSION=dev
ARG REPO_URL=https://github.com/wwiens/trakt_mcpserver
LABEL org.opencontainers.image.version=${VERSION}
LABEL org.opencontainers.image.source=${REPO_URL}
LABEL org.opencontainers.image.title="trakt-mcp-server"
LABEL org.opencontainers.image.description="MCP server for Trakt.tv"

# Install Python and tools (base image is Alpine)
RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    ca-certificates

# Create a non-root user and group
RUN addgroup -g 1000 -S appuser && \
    adduser -u 1000 -S appuser -G appuser

# Workdir
WORKDIR /app/trakt_mcpserver

# Layer 1 — deps from pyproject.toml only (cache key is pyproject.toml)
# NOTE: use the absolute path /usr/bin/python3 (the Alpine interpreter we
# just installed via apk), never the bare "python3" command. The base image
# also ships its own Python in /app/.venv (no pip installed there at all),
# and PATH resolves bare "python3"/"pip3" to that one instead — silently
# installing dependencies where the app can't see them at runtime, or
# failing outright with "No module named pip". Using the absolute path here
# AND in CMD below guarantees both steps target the exact same interpreter.
COPY pyproject.toml ./
RUN /usr/bin/python3 -c "import tomllib; \
print('\n'.join(tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']))" \
      > /tmp/requirements.txt \
    && /usr/bin/python3 -m pip install --no-cache-dir --break-system-packages -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

# Layer 2 — source + project metadata install (deps already satisfied)
COPY . .
RUN /usr/bin/python3 -m pip install --no-cache-dir --break-system-packages --no-deps .

# Back to root workdir
WORKDIR /app

# Change ownership of application files to non-root user
RUN chown -R appuser:appuser /app

# Environment variables (pass at runtime via -e ou --env-file)
ENV TRAKT_CLIENT_ID=""
ENV TRAKT_CLIENT_SECRET=""
# Auth token is persisted in Neon (see client/auth/storage.py), not on local
# disk — required because Render's free tier has no persistent disk across
# container restarts. Set the real value at runtime via Render env vars.
ENV NEON_DATABASE_URL=""

# Expose SSE port (will be overridden by runtime environment)
EXPOSE 8080

# Switch to non-root user
USER appuser

# Run as: SSE proxy on 0.0.0.0:8080 -> spawn local stdio server
# Use the absolute interpreter path here too, matching the install steps above.
ENTRYPOINT ["mcp-proxy"]
CMD ["--host", "0.0.0.0", "--port", "8080", "--pass-environment", "--", "/usr/bin/python3", "/app/trakt_mcpserver/server.py"]
