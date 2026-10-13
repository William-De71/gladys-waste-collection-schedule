# -----------------------------------------------------------------------------
# Waste Collection Schedule integration image.
#
# A Node.js service (the Gladys side, through the SDK) that runs the Python
# Waste Collection Schedule library (nearly 1,000 sources) in a short-lived process for
# each fetch. Debian trixie: Python 3.13 and glibc, for the binary wheels of
# lxml and curl_cffi on amd64 and arm64.
#
# Gladys sandbox constraints ("the sandbox is the defense"):
#   - rootfs mounted READ-ONLY -> never write outside /data (bytecode compiled
#     at build time, TMPDIR in /data)
#   - a single writable volume: /data
#   - runs as a non-root user
#   - multi-arch image (linux/amd64 + linux/arm64), see build.yml
# -----------------------------------------------------------------------------

# --- The Waste Collection Schedule library, pinned and checked ----------------
FROM node:24-trixie-slim AS python

# Upstream release. Updated by .github/workflows/wcs-update.yml (version and
# checksum of the release archive together).
ARG WCS_VERSION=2.35.0
ARG WCS_SHA256=87a09bf244e8db50175dbf3e56fec62a6acd2030ef998803dde5f5c754f5d8c9

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY python/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir --only-binary=:all: -r /tmp/requirements.txt \
  && /opt/venv/bin/pip uninstall -y pip

# Only the library package and its catalogs: no Home Assistant glue, no tests,
# no command-line wizards.
RUN curl -fsSL -o /tmp/wcs.tar.gz \
    "https://github.com/mampfes/hacs_waste_collection_schedule/archive/refs/tags/v${WCS_VERSION}.tar.gz" \
  && echo "${WCS_SHA256}  /tmp/wcs.tar.gz" | sha256sum -c - \
  && mkdir -p /tmp/wcs /opt/wcs \
  && tar -xzf /tmp/wcs.tar.gz -C /tmp/wcs --strip-components=1 \
  && cp -r /tmp/wcs/custom_components/waste_collection_schedule/waste_collection_schedule /opt/wcs/ \
  && cp /tmp/wcs/custom_components/waste_collection_schedule/sources.json \
        /tmp/wcs/custom_components/waste_collection_schedule/source_metadata.json \
        /tmp/wcs/LICENSE /opt/wcs/ \
  && rm -rf /opt/wcs/waste_collection_schedule/test /opt/wcs/waste_collection_schedule/wizard \
  && echo "${WCS_VERSION}" > /opt/wcs/VERSION \
  && /opt/venv/bin/python -m compileall -q /opt/wcs /opt/venv \
  && rm -rf /tmp/wcs /tmp/wcs.tar.gz

# --- The integration -----------------------------------------------------------
FROM node:24-trixie-slim

# The version label and the manifest label are added by build.yml.
LABEL org.opencontainers.image.title="gladys-waste-collection-schedule" \
      org.opencontainers.image.description="Waste collection dates in Gladys Assistant, from the nearly 1,000 sources of Waste Collection Schedule" \
      org.opencontainers.image.source="https://github.com/William-De71/gladys-waste-collection-schedule" \
      org.opencontainers.image.licenses="Apache-2.0"

# python3: the interpreter of the venv (same path as in the build stage).
# dumb-init: handles signals (SIGTERM) correctly for a graceful shutdown.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the PROD dependencies first (better build cache). `npm ci` only:
# a lockfile out of sync with package.json must fail the build.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=python /opt/venv /opt/venv
COPY --from=python /opt/wcs /app/python/lib
COPY python/bridge.py ./python/
RUN /opt/venv/bin/python -m compileall -q /app/python/bridge.py

# Then the integration code.
COPY index.js ./
COPY src ./src
COPY gladys-assistant-integration.json LICENSE NOTICE ./

ENV NODE_ENV=production \
    WCS_PYTHON=/opt/venv/bin/python \
    WCS_BRIDGE=/app/python/bridge.py \
    WCS_LIB_DIR=/app/python/lib \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# The only writable location allowed at runtime. Docker creates a new volume
# with the owner of the image's /data, so it must belong to `node`, and before
# VOLUME: changes made to /data after it are discarded.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

# Run as an unprivileged user (already present in the node image).
USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
