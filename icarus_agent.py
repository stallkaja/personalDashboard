"""Icarus dedicated server control agent.

Runs locally on whichever machine actually hosts the Icarus dedicated
server installs (this one -- see D:\\IcarusServers below) and exposes a
small HTTP API for starting/stopping/monitoring them. The personalDashboard
backend (listener.py), running on a *different* machine, calls this agent
over the LAN instead of touching local processes directly -- see the
/icarus-servers routes in listener.py, which proxy here.

Auth: every request must carry `X-Agent-Token: <token>` matching the value
in icarus_agent_secrets.json (gitignored, generated once). Copy that same
token into the dashboard host's own secrets.json as ICARUS_AGENT_TOKEN.

Run with:  python icarus_agent.py
Listens on 0.0.0.0:8420 -- needs an inbound firewall rule for that port,
plus the existing per-instance game/query port rules for players to connect.
"""
from flask import Flask, request, jsonify
from datetime import datetime, timezone
import configparser
import json
import os
import subprocess
import threading

AGENT_PORT = 8420

ICARUS_SERVERS_ROOT = r"D:\IcarusServers"

ICARUS_SERVERS = {
    "Elysium01": {"label": "Elysium", "port": 17777, "query_port": 27015},
    "OlympusStallkaj": {"label": "Olympus (Stallkaj)", "port": 17778, "query_port": 27016},
    "StallkajStyx": {"label": "Styx (Stallkaj)", "port": 17779, "query_port": 27017},
    "Prometheus01": {"label": "Prometheus", "port": 17780, "query_port": 27018},
}

_SECRETS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icarus_agent_secrets.json")


def _load_token():
    try:
        with open(_SECRETS_PATH, "r", encoding="utf-8") as f:
            return (json.load(f) or {}).get("token")
    except (OSError, ValueError):
        return None


AGENT_TOKEN = _load_token()

app = Flask(__name__)

_procs = {}  # name -> subprocess.Popen, valid for this agent process's lifetime
_lock = threading.Lock()


def _icarus_dir(name):
    return os.path.join(ICARUS_SERVERS_ROOT, name)


def _state_file(name):
    return os.path.join(_icarus_dir(name), "_control_state.json")


def _write_state(name, pid):
    try:
        with open(_state_file(name), "w", encoding="utf-8") as f:
            json.dump({"pid": pid, "started_at": datetime.now(timezone.utc).isoformat()}, f)
    except OSError:
        pass


def _read_state(name):
    try:
        with open(_state_file(name), "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _clear_state(name):
    try:
        os.remove(_state_file(name))
    except OSError:
        pass


def _pid_alive(pid):
    if not pid:
        return False
    try:
        result = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}"],
            capture_output=True, text=True, timeout=5
        )
        return str(pid) in result.stdout
    except (subprocess.SubprocessError, OSError):
        return False


def _settings(name):
    ini_path = os.path.join(
        _icarus_dir(name), "Icarus", "Saved", "Config", "WindowsServer", "ServerSettings.ini"
    )
    parser = configparser.ConfigParser()
    try:
        parser.read(ini_path, encoding="utf-8")
        section = parser["/Script/Icarus.DedicatedServerSettings"]
    except (OSError, KeyError):
        return {"max_players": None, "join_password": None, "admin_password": None}
    return {
        "max_players": section.get("MaxPlayers", "") or None,
        "join_password": section.get("JoinPassword", "") or None,
        "admin_password": section.get("AdminPassword", "") or None,
    }


def _log_tail(name, max_lines=30):
    log_path = os.path.join(_icarus_dir(name), "Icarus", "Saved", "Logs", "Icarus.log")
    try:
        with open(log_path, "rb") as f:
            f.seek(0, os.SEEK_END)
            remaining = f.tell()
            chunk = 8192
            data = b""
            while remaining > 0 and data.count(b"\n") <= max_lines:
                step = min(chunk, remaining)
                remaining -= step
                f.seek(remaining)
                data = f.read(step) + data
            text = data.decode("utf-8", errors="replace")
            return text.splitlines()[-max_lines:]
    except OSError:
        return []


def _status(name):
    proc = _procs.get(name)
    pid = None

    if proc is not None:
        if proc.poll() is None:
            pid = proc.pid
        else:
            with _lock:
                _procs.pop(name, None)
            _clear_state(name)

    if pid is None:
        state = _read_state(name)
        candidate = state.get("pid") if state else None
        if candidate and _pid_alive(candidate):
            pid = candidate
        elif state:
            _clear_state(name)

    started_at = None
    if pid:
        state = _read_state(name)
        started_at = state.get("started_at") if state else None

    return {"running": bool(pid), "pid": pid, "started_at": started_at}


@app.before_request
def _check_auth():
    if not AGENT_TOKEN or request.headers.get("X-Agent-Token") != AGENT_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401


@app.route("/status", methods=["GET"])
def status_all():
    servers = []
    for name, cfg in ICARUS_SERVERS.items():
        status = _status(name)
        settings = _settings(name)
        servers.append({
            "name": name,
            "label": cfg["label"],
            "port": cfg["port"],
            "query_port": cfg["query_port"],
            "installed": os.path.isfile(os.path.join(_icarus_dir(name), "IcarusServer.exe")),
            **status,
            **settings,
            "log_tail": _log_tail(name) if status["running"] else []
        })
    return jsonify({"servers": servers})


@app.route("/start/<name>", methods=["POST"])
def start(name):
    if name not in ICARUS_SERVERS:
        return jsonify({"error": "Unknown server"}), 404
    if _status(name)["running"]:
        return jsonify({"error": "Server is already running"}), 409

    instance_dir = _icarus_dir(name)
    exe = os.path.join(instance_dir, "IcarusServer.exe")
    if not os.path.isfile(exe):
        return jsonify({"error": f"Server executable not found at {exe}"}), 500

    cfg = ICARUS_SERVERS[name]
    args = [
        exe, "-log",
        f"-PORT={cfg['port']}",
        f"-QueryPort={cfg['query_port']}",
        f"-SteamServerName={cfg['label']} Dedicated Server"
    ]
    flags = (
        getattr(subprocess, "DETACHED_PROCESS", 0)
        | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        | getattr(subprocess, "CREATE_NO_WINDOW", 0)
    )

    try:
        proc = subprocess.Popen(args, cwd=instance_dir, creationflags=flags, close_fds=True)
    except OSError as e:
        return jsonify({"error": f"Failed to start: {e}"}), 500

    with _lock:
        _procs[name] = proc
    _write_state(name, proc.pid)

    return jsonify({"message": f"{cfg['label']} starting", "pid": proc.pid}), 202


@app.route("/stop/<name>", methods=["POST"])
def stop(name):
    if name not in ICARUS_SERVERS:
        return jsonify({"error": "Unknown server"}), 404

    status = _status(name)
    if not status["running"]:
        return jsonify({"error": "Server is not running"}), 409

    try:
        subprocess.run(
            ["taskkill", "/PID", str(status["pid"]), "/T", "/F"],
            capture_output=True, text=True, timeout=15
        )
    except (subprocess.SubprocessError, OSError) as e:
        return jsonify({"error": f"Failed to stop: {e}"}), 500

    with _lock:
        _procs.pop(name, None)
    _clear_state(name)

    return jsonify({"message": f"{ICARUS_SERVERS[name]['label']} stopped"})


if __name__ == "__main__":
    if not AGENT_TOKEN:
        print(f"[icarus-agent] WARNING: no token in {_SECRETS_PATH} -- every request will be rejected until one exists.")
    print(f"[icarus-agent] listening on 0.0.0.0:{AGENT_PORT}")
    app.run(host="0.0.0.0", port=AGENT_PORT, debug=False)
