"""Bridge between the Node.js integration and the Waste Collection Schedule
library (https://github.com/mampfes/hacs_waste_collection_schedule, MIT).

One request per process: a JSON object on stdin, a JSON object on stdout.
Logs of the sources go to stderr. The Node side spawns this script with
`python -I` (isolated mode), so the library path is added here explicitly.

Requests:
  {"command": "fetch", "source": "ics", "args": {"url": "https://..."}}
    -> {"ok": true, "title": "ICS", "collections": [
          {"date": "2026-10-15", "type": "Recycling", "icon": "mdi:recycle"}]}
  {"command": "search", "query": "bordeaux", "limit": 8}
    -> {"ok": true, "total": 3, "results": [{"title", "country", "module",
          "default_params", "params": [{"name", "required"}], "docs_url"}]}
  {"command": "version"}
    -> {"ok": true, "version": "2.35.0", "sources": 978}

Errors: {"ok": false, "kind": "not_found" | "bad_args" | "fetch" | "request",
         "error": "message", "argument": "street" (optional),
         "suggestions": ["..."] (optional)}
"""

import ast
import datetime
import importlib
import json
import logging
import os
import sys
import unicodedata

LIB_DIR = os.environ.get("WCS_LIB_DIR", "/app/python/lib")
sys.path.insert(0, LIB_DIR)

PACKAGE = "waste_collection_schedule"
MAX_ERROR = 500
MAX_SUGGESTIONS = 20


def respond(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, default=str))
    sys.stdout.write("\n")
    sys.stdout.flush()


def fail(kind, error, **extra):
    payload = {"ok": False, "kind": kind, "error": str(error)[:MAX_ERROR]}
    payload.update({key: value for key, value in extra.items() if value is not None})
    return payload


def source_file(module):
    return os.path.join(LIB_DIR, PACKAGE, "source", f"{module}.py")


def valid_module_name(module):
    return (
        isinstance(module, str)
        and 0 < len(module) <= 100
        and all(ch.isalnum() or ch in "_-" for ch in module)
    )


def fetch(request):
    module_name = request.get("source")
    args = request.get("args") or {}
    if not valid_module_name(module_name) or not os.path.isfile(source_file(module_name)):
        return fail("not_found", f"unknown source: {module_name}")
    if not isinstance(args, dict):
        return fail("bad_args", "the arguments must be a JSON object")

    try:
        module = importlib.import_module(f"{PACKAGE}.source.{module_name}")
    except Exception as error:  # a source with a missing dependency
        return fail("not_found", f"cannot load source {module_name}: {error}")

    exceptions = importlib.import_module(f"{PACKAGE}.exceptions")
    try:
        source = module.Source(**args)
    except TypeError as error:
        return fail("bad_args", error)
    except exceptions.SourceArgumentException as error:
        return argument_error(error)
    except exceptions.SourceArgumentExceptionMultiple as error:
        return fail("bad_args", error.message, argument=", ".join(error.arguments))
    except Exception as error:
        return fail("bad_args", error)

    try:
        entries = source.fetch()
    except exceptions.SourceArgumentException as error:
        return argument_error(error)
    except exceptions.SourceArgumentExceptionMultiple as error:
        return fail("bad_args", error.message, argument=", ".join(error.arguments))
    except Exception as error:
        logging.getLogger(__name__).debug("fetch failed", exc_info=True)
        return fail("fetch", f"{type(error).__name__}: {error}")

    collections = []
    for entry in entries or []:
        date = entry.date
        if isinstance(date, datetime.datetime):
            date = date.date()
        waste_type = str(entry.type or "").strip()
        if not waste_type:
            continue
        collections.append(
            {"date": date.isoformat(), "type": waste_type, "icon": entry.icon or None}
        )
    return {"ok": True, "title": getattr(module, "TITLE", module_name), "collections": collections}


def argument_error(error):
    suggestions = getattr(error, "suggestions", None)
    if suggestions is not None:
        suggestions = [str(item) for item in list(suggestions)[:MAX_SUGGESTIONS]]
    return fail(
        "bad_args",
        getattr(error, "message", str(error)),
        argument=getattr(error, "argument", None),
        suggestions=suggestions,
    )


def normalize(text):
    text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode()
    return text.lower()


def source_params(module):
    """Parameters of Source.__init__, read without importing the module."""
    try:
        with open(source_file(module), encoding="utf-8") as handle:
            tree = ast.parse(handle.read())
    except (OSError, SyntaxError):
        return []
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "Source":
            for item in node.body:
                if isinstance(item, ast.FunctionDef) and item.name == "__init__":
                    return parameters_of(item.args)
    return []


def parameters_of(arguments):
    positional = arguments.posonlyargs + arguments.args
    first_default = len(positional) - len(arguments.defaults)
    params = []
    for index, arg in enumerate(positional):
        if arg.arg == "self":
            continue
        params.append({"name": arg.arg, "required": index < first_default})
    for arg, default in zip(arguments.kwonlyargs, arguments.kw_defaults):
        params.append({"name": arg.arg, "required": default is None})
    return params


def load_json(name):
    path = os.path.join(LIB_DIR, name)
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except OSError:
        return {}


def search(request):
    query = normalize(request.get("query") or "").strip()
    limit = max(1, min(int(request.get("limit") or 8), 20))
    if len(query) < 2:
        return fail("request", "type at least 2 characters")
    words = query.split()
    sources = load_json("sources.json")
    metadata = load_json("source_metadata.json")
    matches = []
    for country, entries in sources.items():
        for entry in entries:
            haystack = normalize(f"{entry.get('title', '')} {entry.get('module', '')} {country}")
            if all(word in haystack for word in words):
                title = normalize(entry.get("title", ""))
                # Exact title first, then titles starting with the query.
                rank = 0 if title == query else 1 if title.startswith(query) else 2
                matches.append((rank, len(title), country, entry))
    matches.sort(key=lambda match: (match[0], match[1]))
    results = []
    params_cache = {}
    for _rank, _length, country, entry in matches[:limit]:
        module = entry.get("module")
        if module not in params_cache:
            params_cache[module] = source_params(module)
        results.append(
            {
                "title": entry.get("title"),
                "country": country,
                "module": module,
                "default_params": entry.get("default_params") or {},
                "params": params_cache[module],
                "docs_url": (metadata.get(module) or {}).get("docs_url"),
            }
        )
    return {"ok": True, "total": len(matches), "results": results}


def version(_request):
    sources_dir = os.path.join(LIB_DIR, PACKAGE, "source")
    try:
        count = len([name for name in os.listdir(sources_dir) if name.endswith(".py")])
    except OSError:
        count = 0
    try:
        with open(os.path.join(LIB_DIR, "VERSION"), encoding="utf-8") as handle:
            lib_version = handle.read().strip()
    except OSError:
        lib_version = None
    return {"ok": True, "version": lib_version, "sources": count}


COMMANDS = {"fetch": fetch, "search": search, "version": version}


def main():
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.DEBUG if os.environ.get("WCS_DEBUG") else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )
    try:
        request = json.loads(sys.stdin.read() or "{}")
    except ValueError as error:
        respond(fail("request", f"invalid JSON request: {error}"))
        return
    handler = COMMANDS.get(request.get("command")) if isinstance(request, dict) else None
    if handler is None:
        respond(fail("request", "unknown command"))
        return
    try:
        respond(handler(request))
    except Exception as error:  # never a traceback on stdout
        logging.getLogger(__name__).debug("bridge error", exc_info=True)
        respond(fail("fetch", f"{type(error).__name__}: {error}"))


if __name__ == "__main__":
    main()
