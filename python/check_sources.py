"""Smoke test of an image: every source of the bundled library imports.

A source that cannot be imported has a missing Python dependency (add it to
python/requirements.txt). Run inside the image, read-only, without network:
  docker run --rm --read-only --network none -v "$PWD/python/check_sources.py:/tmp/check.py:ro" \
    --entrypoint /opt/venv/bin/python IMAGE -I /tmp/check.py
"""

import importlib
import os
import sys

LIB_DIR = os.environ.get("WCS_LIB_DIR", "/app/python/lib")
sys.path.insert(0, LIB_DIR)
SOURCES = os.path.join(LIB_DIR, "waste_collection_schedule", "source")

failures = []
count = 0
for name in sorted(os.listdir(SOURCES)):
    if not name.endswith(".py") or name == "__init__.py":
        continue
    module = name[:-3]
    count += 1
    try:
        importlib.import_module(f"waste_collection_schedule.source.{module}")
    except Exception as error:  # report every broken source at once
        failures.append(f"{module}: {type(error).__name__}: {error}")

print(f"{count} sources, {len(failures)} cannot be imported")
for failure in failures:
    print(f"  {failure}")
sys.exit(1 if failures else 0)
