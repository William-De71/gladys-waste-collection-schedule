#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Local development without Docker: the Waste Collection Schedule version the
# Dockerfile pins (same archive, same checksum) in .wcs/lib, and a Python
# virtual environment with python/requirements.txt in .wcs/venv. Then:
#
#   WCS_PYTHON=.wcs/venv/bin/python WCS_LIB_DIR=.wcs/lib WCS_DATA_DIR=.wcs/data \
#     GLADYS_HOST_API_URL=… GLADYS_INTEGRATION_TOKEN=… GLADYS_INTEGRATION_SELECTOR=… \
#     node index.js
#
# Run from the repository root. Needs curl, tar and Python 3.12+.
# -----------------------------------------------------------------------------
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
version="$(sed -n 's/^ARG WCS_VERSION=//p' "$repo/Dockerfile")"
sha="$(sed -n 's/^ARG WCS_SHA256=//p' "$repo/Dockerfile")"
target="$repo/.wcs"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

curl -fsSL -o "$work/wcs.tar.gz" \
  "https://github.com/mampfes/hacs_waste_collection_schedule/archive/refs/tags/v${version}.tar.gz"
echo "${sha}  $work/wcs.tar.gz" | sha256sum -c - >/dev/null
tar -xzf "$work/wcs.tar.gz" -C "$work" --strip-components=1
rm -rf "${target:?}/lib"
mkdir -p "$target/lib" "$target/data"
cp -r "$work/custom_components/waste_collection_schedule/waste_collection_schedule" "$target/lib/"
cp "$work/custom_components/waste_collection_schedule/sources.json" \
  "$work/custom_components/waste_collection_schedule/source_metadata.json" "$work/LICENSE" "$target/lib/"
echo "$version" >"$target/lib/VERSION"

python3 -m venv "$target/venv"
"$target/venv/bin/pip" install -q -r "$repo/python/requirements.txt"
echo "Waste Collection Schedule ${version} ready in .wcs/"
echo '{"command": "search", "query": "bordeaux", "limit": 1}' |
  WCS_LIB_DIR="$target/lib" "$target/venv/bin/python" -I "$repo/python/bridge.py"
