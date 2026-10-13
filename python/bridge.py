"""Bridge between the Node.js integration and the Waste Collection Schedule
library (https://github.com/mampfes/hacs_waste_collection_schedule, MIT).

One request per process: a JSON object on stdin, a JSON object on stdout.
Logs of the sources go to stderr. The Node side spawns this script with
`python -I` (isolated mode), so the library path is added here explicitly.

Requests:
  {"command": "fetch", "source": "Bordeaux", "country": "France",
   "address": {"city", "postcode", "street", "number", "url"},
   "args": {"key": "value"}}
    -> {"ok": true, "title": "Bordeaux", "module": "opendata_bordeauxmetropole_fr",
        "collections": [{"date": "2026-10-15", "type": "Recycling", "icon": "mdi:recycle"}]}
    The source is a module name, the title of an entry of sources.json, or
    empty (found from the town). The address fields go to the parameters of
    the source that mean the same thing (FIELD_PARAMS), `args` (the advanced
    `key=value` of the user) last; a French INSEE code is looked up from the
    town (geo.api.gouv.fr).
  {"command": "search", "query": "bordeaux", "limit": 8}
    -> {"ok": true, "total": 3, "results": [{"title", "country", "module",
          "default_params", "params": [{"name", "required", "field", "label"}],
          "docs_url"}]}
  {"command": "version"}
    -> {"ok": true, "version": "2.35.0", "sources": 978}

Errors: {"ok": false, "kind": "not_found" | "no_source" | "ambiguous" | "missing"
         | "bad_args" | "fetch" | "request",
         "error": "message", "argument": "street" (optional),
         "label": {"fr": "Rue"} (optional), "suggestions": ["..."] (optional),
         "missing": [{"name", "field", "label"}] (optional)}
"""

import ast
import datetime
import importlib
import json
import logging
import os
import sys
import unicodedata
import urllib.parse
import urllib.request

LIB_DIR = os.environ.get("WCS_LIB_DIR", "/app/python/lib")
sys.path.insert(0, LIB_DIR)

PACKAGE = "waste_collection_schedule"
MAX_ERROR = 500
MAX_SUGGESTIONS = 20
MAX_CANDIDATES = 10
GEO_API = os.environ.get("WCS_GEO_API", "https://geo.api.gouv.fr")
GEO_TIMEOUT_S = 10

# The parameter names the sources use for each field of the form. Names are
# matched exactly, never guessed: a source whose parameters are not here gets
# them from the advanced `key=value` field.
FIELD_PARAMS = {
    "city": {
        "city", "town", "ort", "municipality", "commune", "city_name", "gemeinde",
        "stadt", "locality", "suburb", "kommune", "comune", "gmina", "miasto",
        "plaats", "woonplaats", "ville", "place", "village",
    },
    "postcode": {
        "postcode", "post_code", "postal_code", "zip", "zip_code", "zipcode", "plz",
        "postleitzahl", "postnummer", "postnr", "cap",
    },
    "street": {
        "street", "street_name", "streetname", "strasse", "road", "rue", "via",
        "ulica", "gatenavn", "straat", "gata",
    },
    "number": {
        "house_number", "housenumber", "number", "street_number", "hausnummer",
        "hnr", "house_no", "huisnummer", "nr", "hausnr", "house_num",
    },
    "address": {"address", "street_address", "full_address", "adresse", "indirizzo"},
    "url": {"url", "ics_url", "calendar_url"},
    "insee": {"insee_code", "code_insee", "insee"},
}
PARAM_FIELD = {name: field for field, names in FIELD_PARAMS.items() for name in names}


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
    args = request.get("args") or {}
    address = request.get("address") or {}
    if not isinstance(args, dict) or not isinstance(address, dict):
        return fail("bad_args", "the arguments must be a JSON object")
    address = {key: str(value).strip() for key, value in address.items() if value is not None}

    found = resolve_source(request.get("source"), request.get("country"), address)
    if not found["ok"]:
        return found
    module_name = found["module"]

    try:
        module = importlib.import_module(f"{PACKAGE}.source.{module_name}")
    except Exception as error:  # a source with a missing dependency
        return fail("not_found", f"cannot load source {module_name}: {error}")

    params = source_params(module_name)
    labels = param_labels(module)
    built = build_args(params, found["default_params"], address, args, labels)
    if not built["ok"]:
        return built
    args = built["args"]

    exceptions = importlib.import_module(f"{PACKAGE}.exceptions")
    try:
        source = module.Source(**args)
    except TypeError as error:
        return fail("bad_args", error)
    except exceptions.SourceArgumentException as error:
        return argument_error(error, labels)
    except exceptions.SourceArgumentExceptionMultiple as error:
        return fail("bad_args", error.message, argument=", ".join(error.arguments))
    except Exception as error:
        return fail("bad_args", error)

    try:
        entries = source.fetch()
    except exceptions.SourceArgumentException as error:
        return argument_error(error, labels)
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
    return {
        "ok": True,
        "title": found["title"] or getattr(module, "TITLE", module_name),
        "module": module_name,
        "collections": collections,
    }


def argument_error(error, labels=None):
    suggestions = getattr(error, "suggestions", None)
    if suggestions is not None:
        suggestions = [str(item) for item in list(suggestions)[:MAX_SUGGESTIONS]]
    argument = getattr(error, "argument", None)
    return fail(
        "bad_args",
        getattr(error, "message", str(error)),
        argument=argument,
        field=PARAM_FIELD.get(argument),
        label=(labels or {}).get(argument),
        suggestions=suggestions,
    )


def resolve_source(text, country, address):
    """The module (and the defaults of its sources.json entry) to use.

    A module name is taken as is (the configurations written before the
    form had address fields). Otherwise the entries of sources.json are
    searched, in the chosen country, by the given source or else by the town:
    the exact title first, then the titles starting with it, then the titles
    containing every word. A tie between entries that do not mean the same
    thing is an `ambiguous` error listing them, never a guess.
    """
    text = str(text or "").strip()
    if text and valid_module_name(text) and os.path.isfile(source_file(text)):
        return {"ok": True, "module": text, "title": None, "default_params": {}}
    query = text or address.get("city", "")
    if not query:
        if address.get("url"):
            return {"ok": True, "module": "ics", "title": None, "default_params": {}}
        return fail("no_source", "no source and no town")
    sources = load_json("sources.json")
    wanted = normalize(country or "")
    words = normalize(query).split()
    best = None
    for name, entries in sources.items():
        if wanted and normalize(name) != wanted:
            continue
        for entry in entries:
            title = normalize(entry.get("title", ""))
            if not all(word in title for word in words):
                continue
            joined = " ".join(words)
            rank = 0 if title == joined else 1 if title.startswith(joined) else 2
            if best is None or rank < best[0]:
                best = (rank, [(name, entry)])
            elif rank == best[0]:
                best[1].append((name, entry))
    if best is None:
        return fail("no_source", f"no source for {query}", query=query)
    candidates = best[1]
    distinct = {
        (entry.get("module"), json.dumps(entry.get("default_params") or {}, sort_keys=True))
        for _name, entry in candidates
    }
    if len(distinct) > 1:
        titles = sorted({f"{entry.get('title')} ({name})" for name, entry in candidates})
        return fail(
            "ambiguous",
            f"several sources for {query}",
            query=query,
            suggestions=titles[:MAX_CANDIDATES],
        )
    _name, entry = candidates[0]
    module = entry.get("module")
    if not valid_module_name(module) or not os.path.isfile(source_file(module)):
        return fail("not_found", f"unknown source: {module}")
    return {
        "ok": True,
        "module": module,
        "title": entry.get("title"),
        "default_params": entry.get("default_params") or {},
    }


def build_args(params, defaults, address, extra, labels):
    """The keyword arguments of Source(): the defaults of the sources.json
    entry, then the address fields under the names this source uses, then
    the advanced `key=value` of the user, which always win (an unknown key
    there is the user's mistake, reported by the source)."""
    given = dict(defaults)
    mapped = {}
    for param in params:
        field = PARAM_FIELD.get(param["name"])
        if field and field not in mapped.values():
            mapped[param["name"]] = field
    fields_used = set(mapped.values())
    for name, field in mapped.items():
        if name in given or name in extra:
            continue
        if field == "address":
            value = compose_address(address, fields_used)
        elif field == "insee":
            continue
        else:
            value = address.get(field, "")
        if value:
            given[name] = value
    given.update(extra)

    for name, field in mapped.items():
        if field == "insee" and name not in given and address.get("city"):
            code = insee_code(address.get("city"), address.get("postcode"))
            if not code["ok"]:
                return code
            given[name] = code["code"]

    missing = [
        {"name": param["name"], "field": PARAM_FIELD.get(param["name"]),
         "label": labels.get(param["name"])}
        for param in params
        if param["required"] and not param.get("var_keyword") and param["name"] not in given
    ]
    if missing:
        return fail(
            "missing",
            "missing: " + ", ".join(item["name"] for item in missing),
            missing=missing,
        )
    return {"ok": True, "args": given}


def compose_address(address, fields_used):
    """One address line: the number and the street, then the postcode and the
    town unless the source asks for them separately."""
    line = " ".join(part for part in (address.get("number"), address.get("street")) if part)
    tail = " ".join(
        address.get(field, "")
        for field in ("postcode", "city")
        if field not in fields_used and address.get(field)
    )
    return ", ".join(part for part in (line, tail) if part)


def insee_code(city, postcode=None):
    """The INSEE code of a French town, from the official geo API.

    Only the town and its postcode leave the container, never the street.
    """
    city = str(city).strip()
    if len(city) == 5 and (city.isdigit() or city[:2].upper() in ("2A", "2B")):
        return {"ok": True, "code": city.upper()}
    query = {"nom": city, "fields": "nom,code,codesPostaux", "boost": "population", "limit": "10"}
    if postcode:
        query["codePostal"] = str(postcode).strip()
    url = f"{GEO_API}/communes?{urllib.parse.urlencode(query)}"
    try:
        with urllib.request.urlopen(url, timeout=GEO_TIMEOUT_S) as response:
            towns = json.loads(response.read(1024 * 1024).decode("utf-8"))
    except Exception as error:
        return fail("fetch", f"INSEE code of {city}: {type(error).__name__}: {error}")
    if not isinstance(towns, list):
        towns = []
    exact = [town for town in towns if normalize(town.get("nom", "")) == normalize(city)]
    chosen = exact if exact else towns
    if len(chosen) == 1 and chosen[0].get("code"):
        return {"ok": True, "code": chosen[0]["code"]}
    suggestions = [
        f"{town.get('nom')} ({', '.join((town.get('codesPostaux') or [])[:3])})"
        for town in chosen[:MAX_SUGGESTIONS]
    ]
    return fail(
        "bad_args",
        f"town '{city}' not found" if not chosen else f"several towns named '{city}'",
        argument="insee_code",
        field="city",
        suggestions=suggestions or None,
    )


def param_labels(module):
    """`{param: {language: label}}` from PARAM_TRANSLATIONS of the source."""
    return labels_from(getattr(module, "PARAM_TRANSLATIONS", None))


def labels_from(translations):
    labels = {}
    if not isinstance(translations, dict):
        return labels
    for language, names in translations.items():
        if not isinstance(names, dict):
            continue
        for name, label in names.items():
            if isinstance(label, str) and label.strip():
                labels.setdefault(name, {})[str(language)] = label.strip()
    return labels


def normalize(text):
    text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode()
    return text.lower()


def parse_source(module):
    try:
        with open(source_file(module), encoding="utf-8") as handle:
            return ast.parse(handle.read())
    except (OSError, SyntaxError):
        return None


def source_params(module, tree=None):
    """Parameters of Source.__init__, read without importing the module."""
    tree = tree or parse_source(module)
    if tree is None:
        return []
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "Source":
            for item in node.body:
                if isinstance(item, ast.FunctionDef) and item.name == "__init__":
                    return parameters_of(item.args)
    return []


def source_labels(tree):
    """PARAM_TRANSLATIONS of a source, read without importing it."""
    for node in tree.body if tree is not None else []:
        if (
            isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == "PARAM_TRANSLATIONS"
                    for target in node.targets)
        ):
            try:
                return labels_from(ast.literal_eval(node.value))
            except ValueError:
                return {}
    return {}


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
    if arguments.kwarg is not None:
        params.append({"name": arguments.kwarg.arg, "required": False, "var_keyword": True})
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
            tree = parse_source(module)
            labels = source_labels(tree)
            params_cache[module] = [
                {
                    "name": param["name"],
                    "required": param["required"],
                    "field": PARAM_FIELD.get(param["name"]),
                    "label": labels.get(param["name"]),
                }
                for param in source_params(module, tree)
                if not param.get("var_keyword")
            ]
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
