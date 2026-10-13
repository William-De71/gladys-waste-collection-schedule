"""Smoke test of an image: every source of the bundled library imports.

A source that cannot be imported has a missing Python dependency (add it to
python/requirements.txt). With the manifest mounted at /tmp/manifest.json,
the countries of the form must be the countries of the library (a library
update bringing a new country adds it to the three `country_<n>` fields).
Run inside the image, read-only, without network:
  docker run --rm --read-only --network none -v "$PWD/python/check_sources.py:/tmp/check.py:ro" \
    -v "$PWD/gladys-assistant-integration.json:/tmp/manifest.json:ro" \
    --entrypoint /opt/venv/bin/python IMAGE -I /tmp/check.py
"""

import importlib
import json
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

MANIFEST = os.environ.get("WCS_MANIFEST", "/tmp/manifest.json")
if os.path.isfile(MANIFEST):
    with open(os.path.join(LIB_DIR, "sources.json"), encoding="utf-8") as handle:
        library = {name for name in json.load(handle) if name != "Generic"}
    with open(MANIFEST, encoding="utf-8") as handle:
        fields = json.load(handle)["config_schema"]
    for field in fields:
        if field["key"].startswith("country_"):
            declared = {option["value"] for option in field["options"]}
            for name in sorted(library - declared):
                failures.append(f"{field['key']}: country {name} missing from the manifest")
            for name in sorted(declared - library):
                failures.append(f"{field['key']}: country {name} unknown to the library")

print(f"{count} sources, {len(failures)} problem(s)")
for failure in failures:
    print(f"  {failure}")
sys.exit(1 if failures else 0)
