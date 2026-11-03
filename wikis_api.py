"""Wikis section: per-wiki document storage and an AI relay for wiki chat helpers.

Each wiki (e.g. the Enshrouded field guide in FE/.../public/wiki-apps/enshrouded/)
is a self-contained page that talks to the dashboard through
public/wiki-apps/bridge.js. The bridge maps the page's document-store calls onto
these routes:

  GET    /wikis/<wiki>/docs?collection=<path>             list a collection
  PUT    /wikis/<wiki>/docs?collection=<path>&id=<doc>    create/replace a doc
  DELETE /wikis/<wiki>/docs?collection=<path>&id=<doc>    delete a doc

Collections are slash paths with an odd number of segments ("quests",
"data/users/u12"). Shared collections are readable by every signed-in user and
writable by admins. "data/users/u<id>" belongs to that user only.

  GET  /wikis/ai/status    which AI provider is available (claude | ollama | none)
  POST /wikis/ai/chat      one round of a tool-using chat; the page runs the tools

The chat relay is stateless: the browser keeps the conversation (Claude Messages
API format) and executes tool calls itself, then sends the next round. Uses
Claude when ANTHROPIC_API_KEY is in secrets.json, else the local Ollama model.
"""
import json
import os
import re
import threading
import time
import uuid

import requests
from flask import Blueprint, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required

bp = Blueprint("wikis", __name__)
_ctx = {}

WIKI_RE = re.compile(r"^[a-z0-9-]{1,64}$")
_SEG = r"[A-Za-z0-9_\-.~:@+]{1,200}"
COLLECTION_RE = re.compile(rf"^{_SEG}(?:/{_SEG}/{_SEG})*$")  # odd number of segments
DOC_ID_RE = re.compile(rf"^{_SEG}$")
MAX_DOC_BYTES = 256 * 1024
MAX_DOCS_PER_LIST = 2000
SEED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wikis")

# AI relay limits (per user, in memory)
AI_MAX_REQUEST_BYTES = 600 * 1024
AI_MAX_TOOLS = 16
AI_RATE_WINDOW_S = 600
AI_RATE_MAX_CALLS = 60
_ai_calls = {}
_ai_lock = threading.Lock()


def init_wikis(app, get_db, secret):
    """Register the wiki routes on the Flask app. Call once at import time."""
    _ctx["get_db"] = get_db
    _ctx["secret"] = secret
    app.register_blueprint(bp)


def _secret(key, default=None):
    return _ctx["secret"](key, default)


def _is_admin():
    return get_jwt().get("role") == "admin"


def _user_id():
    return int(get_jwt_identity())


# ---------------------------------------------------------------- storage

def ensure_wiki_tables():
    """Create the wiki document table and import bundled seed data for any
    wiki that has no documents yet (wikis/<wiki>_seed.json)."""
    db = _ctx["get_db"]()
    cursor = db.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS wiki_docs (
            wiki VARCHAR(64) NOT NULL,
            collection VARCHAR(255) NOT NULL,
            doc_id VARCHAR(200) NOT NULL,
            data LONGTEXT NOT NULL,
            updated_by INT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (wiki, collection, doc_id)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    """)
    db.commit()

    if os.path.isdir(SEED_DIR):
        for name in sorted(os.listdir(SEED_DIR)):
            m = re.match(r"^([a-z0-9-]+)_seed\.json$", name)
            if not m:
                continue
            wiki = m.group(1)
            cursor.execute("SELECT COUNT(*) FROM wiki_docs WHERE wiki=%s", (wiki,))
            if cursor.fetchone()[0]:
                continue
            try:
                with open(os.path.join(SEED_DIR, name), "r", encoding="utf-8") as f:
                    seed = json.load(f)
            except (OSError, ValueError) as e:
                print(f"[wikis] could not read seed {name}: {e}")
                continue
            rows = [
                (wiki, collection, doc_id, json.dumps(data))
                for collection, docs in seed.items() if COLLECTION_RE.match(collection)
                for doc_id, data in docs.items() if DOC_ID_RE.match(doc_id)
            ]
            cursor.executemany(
                "INSERT INTO wiki_docs (wiki, collection, doc_id, data) VALUES (%s, %s, %s, %s)", rows
            )
            db.commit()
            print(f"[wikis] seeded {len(rows)} documents for '{wiki}'")

    cursor.close()
    db.close()


def _check_collection(wiki, collection, write):
    """Return an (error_body, status) tuple when the caller may not use this
    collection, else None."""
    if not WIKI_RE.match(wiki or "") or not COLLECTION_RE.match(collection or ""):
        return {"error": "Invalid wiki or collection."}, 400
    parts = collection.split("/")
    if parts[0] == "data" and len(parts) >= 3 and parts[1] == "users":
        if parts[2] != f"u{_user_id()}":
            return {"error": "That collection belongs to another user."}, 403
        return None
    if parts[0] == "data":
        return {"error": "Unknown private collection."}, 403
    if write and not _is_admin():
        return {"error": "Only admins can change shared wiki data."}, 403
    return None


@bp.route("/wikis/<wiki>/docs", methods=["GET"])
@jwt_required()
def wiki_list_docs(wiki):
    collection = request.args.get("collection", "")
    denied = _check_collection(wiki, collection, write=False)
    if denied:
        return denied
    db = _ctx["get_db"]()
    cursor = db.cursor()
    cursor.execute(
        "SELECT doc_id, data, updated_at FROM wiki_docs WHERE wiki=%s AND collection=%s ORDER BY doc_id LIMIT %s",
        (wiki, collection, MAX_DOCS_PER_LIST),
    )
    docs = []
    for doc_id, data, updated_at in cursor.fetchall():
        try:
            body = json.loads(data)
        except ValueError:
            continue
        docs.append({"id": doc_id, "data": body, "updated_at": updated_at.isoformat() if updated_at else None})
    cursor.close()
    db.close()
    return {"docs": docs, "can_write": _check_collection(wiki, collection, write=True) is None}


@bp.route("/wikis/<wiki>/docs", methods=["PUT"])
@jwt_required()
def wiki_put_doc(wiki):
    collection = request.args.get("collection", "")
    doc_id = request.args.get("id", "")
    denied = _check_collection(wiki, collection, write=True)
    if denied:
        return denied
    if not DOC_ID_RE.match(doc_id):
        return {"error": "Invalid document id."}, 400
    body = request.get_json(silent=True)
    data = body.get("data") if isinstance(body, dict) else None
    if not isinstance(data, dict):
        return {"error": "Send the document as {\"data\": {...}}."}, 400
    raw = json.dumps(data)
    if len(raw.encode("utf-8")) > MAX_DOC_BYTES:
        return {"error": "Document is larger than 256 KB."}, 413
    db = _ctx["get_db"]()
    cursor = db.cursor()
    cursor.execute(
        """INSERT INTO wiki_docs (wiki, collection, doc_id, data, updated_by) VALUES (%s, %s, %s, %s, %s)
           ON DUPLICATE KEY UPDATE data=VALUES(data), updated_by=VALUES(updated_by)""",
        (wiki, collection, doc_id, raw, _user_id()),
    )
    db.commit()
    cursor.close()
    db.close()
    return {"ok": True}


@bp.route("/wikis/<wiki>/docs", methods=["DELETE"])
@jwt_required()
def wiki_delete_doc(wiki):
    collection = request.args.get("collection", "")
    doc_id = request.args.get("id", "")
    denied = _check_collection(wiki, collection, write=True)
    if denied:
        return denied
    if not DOC_ID_RE.match(doc_id):
        return {"error": "Invalid document id."}, 400
    db = _ctx["get_db"]()
    cursor = db.cursor()
    cursor.execute("DELETE FROM wiki_docs WHERE wiki=%s AND collection=%s AND doc_id=%s", (wiki, collection, doc_id))
    db.commit()
    cursor.close()
    db.close()
    return {"ok": True}


# ---------------------------------------------------------------- AI relay

def _ai_provider():
    if _secret("ANTHROPIC_API_KEY"):
        return "claude"
    url = (_secret("OLLAMA_URL", "http://localhost:11434") or "").rstrip("/")
    try:
        if requests.get(f"{url}/api/tags", timeout=1.5).status_code == 200:
            return "ollama"
    except requests.RequestException:
        pass
    return None


_provider_cache = {"value": None, "checked_at": 0.0}


def _cached_provider():
    now = time.time()
    if now - _provider_cache["checked_at"] > 60:
        _provider_cache["value"] = _ai_provider()
        _provider_cache["checked_at"] = now
    return _provider_cache["value"]


def _rate_limited(user_id):
    now = time.time()
    with _ai_lock:
        calls = [t for t in _ai_calls.get(user_id, []) if now - t < AI_RATE_WINDOW_S]
        if len(calls) >= AI_RATE_MAX_CALLS:
            _ai_calls[user_id] = calls
            return True
        calls.append(now)
        _ai_calls[user_id] = calls
        return False


@bp.route("/wikis/ai/status", methods=["GET"])
@jwt_required()
def wiki_ai_status():
    provider = _cached_provider()
    return {"available": provider is not None, "provider": provider}


@bp.route("/wikis/ai/chat", methods=["POST"])
@jwt_required()
def wiki_ai_chat():
    if (request.content_length or 0) > AI_MAX_REQUEST_BYTES:
        return {"error": "The conversation is too long. Start a new chat."}, 413
    body = request.get_json(silent=True) or {}
    messages = body.get("messages")
    tools = body.get("tools") or []
    if not isinstance(messages, list) or not messages or not isinstance(tools, list) or len(tools) > AI_MAX_TOOLS:
        return {"error": "Send {messages: [...], tools: [...]}."}, 400
    clean_tools = []
    for t in tools:
        if not isinstance(t, dict) or not re.match(r"^[A-Za-z0-9_-]{1,64}$", str(t.get("name", ""))):
            return {"error": "Invalid tool definition."}, 400
        clean_tools.append({
            "name": t["name"],
            "description": str(t.get("description", ""))[:1024],
            "input_schema": t.get("input_schema") or {"type": "object", "properties": {}},
        })
    if _rate_limited(_user_id()):
        return {"error": "Too many requests. Try again in a few minutes."}, 429

    provider = _cached_provider()
    if provider is None:
        return {"error": "No AI is configured. Add ANTHROPIC_API_KEY to secrets.json or start Ollama."}, 503
    try:
        if provider == "claude":
            return _chat_claude(messages, clean_tools)
        return _chat_ollama(messages, clean_tools)
    except _RelayError as e:
        return {"error": str(e)}, e.status


class _RelayError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


KEEP_BLOCK_TYPES = {"text", "tool_use", "thinking", "redacted_thinking"}


def _chat_claude(messages, tools):
    import anthropic  # imported lazily so the backend still starts without it

    client = anthropic.Anthropic(api_key=_secret("ANTHROPIC_API_KEY"), timeout=180.0, max_retries=2)
    try:
        resp = client.beta.messages.create(
            model=_secret("WIKI_AI_MODEL", "claude-opus-5-5"),
            max_tokens=16000,
            messages=messages,
            tools=tools,
            output_config={"effort": "medium"},
            # Re-run on Anthropic's recommended fallback model if a safety classifier declines.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError:
        raise _RelayError("The Anthropic API key in secrets.json was rejected.", 502)
    except anthropic.RateLimitError:
        raise _RelayError("Claude is rate limited right now. Try again in a minute.", 429)
    except anthropic.BadRequestError as e:
        raise _RelayError(f"Claude rejected the request: {e.message}", 400)
    except anthropic.APIStatusError as e:
        raise _RelayError(f"Claude returned an error ({e.status_code}). Try again.", 502)
    except anthropic.APIConnectionError:
        raise _RelayError("Couldn't reach the Claude API.", 502)

    if resp.stop_reason == "refusal":
        return {"stop_reason": "refusal", "content": [], "provider": "claude"}
    # Pass blocks back exactly as received (thinking blocks must round-trip unchanged).
    content = [b.model_dump(exclude_none=True) for b in resp.content if b.type in KEEP_BLOCK_TYPES]
    return {"stop_reason": resp.stop_reason, "content": content, "provider": "claude"}


def _to_ollama_messages(messages):
    out = []
    for m in messages:
        role, content = m.get("role"), m.get("content")
        if isinstance(content, str):
            out.append({"role": role, "content": content})
            continue
        if not isinstance(content, list):
            continue
        if role == "assistant":
            text = "".join(b.get("text", "") for b in content if b.get("type") == "text")
            calls = [{"function": {"name": b.get("name"), "arguments": b.get("input") or {}}}
                     for b in content if b.get("type") == "tool_use"]
            msg = {"role": "assistant", "content": text}
            if calls:
                msg["tool_calls"] = calls
            out.append(msg)
        else:
            for b in content:
                if b.get("type") == "tool_result":
                    c = b.get("content")
                    out.append({"role": "tool", "content": c if isinstance(c, str) else json.dumps(c)})
                elif b.get("type") == "text":
                    out.append({"role": "user", "content": b.get("text", "")})
    return out


def _chat_ollama(messages, tools):
    url = (_secret("OLLAMA_URL", "http://localhost:11434") or "").rstrip("/")
    payload = {
        "model": _secret("OLLAMA_MODEL", "llama3.2"),
        "messages": _to_ollama_messages(messages),
        "tools": [{"type": "function", "function": {"name": t["name"], "description": t["description"],
                                                     "parameters": t["input_schema"]}} for t in tools],
        "stream": False,
    }
    try:
        r = requests.post(f"{url}/api/chat", json=payload, timeout=240)
        r.raise_for_status()
        msg = r.json().get("message") or {}
    except (requests.RequestException, ValueError):
        raise _RelayError("Couldn't reach the local AI (Ollama).", 502)
    content = []
    if msg.get("content"):
        content.append({"type": "text", "text": msg["content"]})
    for call in msg.get("tool_calls") or []:
        fn = call.get("function") or {}
        args = fn.get("arguments")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except ValueError:
                args = {}
        content.append({"type": "tool_use", "id": f"call_{uuid.uuid4().hex[:16]}",
                        "name": fn.get("name"), "input": args or {}})
    stop = "tool_use" if any(b["type"] == "tool_use" for b in content) else "end_turn"
    return {"stop_reason": stop, "content": content, "provider": "ollama"}
