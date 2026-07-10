#!/usr/bin/env python
"""
Outage watchdog for the Stallkamp Family Dashboard.

Runs OUTSIDE the app (scheduled every few minutes by Task Scheduler) so it can
detect and report failures even when the app process itself is dead. It checks
the health of each component, records state transitions to logs/outages.log, and
emails every admin account when something goes DOWN and again when it RECOVERS.

Only transitions are emailed, so a sustained outage produces one "down" email
and one "recovered" email — never a flood. Reuses secrets.json for email + DB
credentials; kept dependency-light and standalone so it works even if listener.py
is broken.

Usage:
    python watchdog.py           # one health sweep (Task Scheduler mode)
    python watchdog.py --loop    # run forever, sweeping every 60s
    python watchdog.py --test    # send a test alert to admins and exit
"""
import json
import os
import socket
import ssl
import smtplib
import subprocess
import sys
import time
import urllib.request
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)
STATE_FILE = os.path.join(LOG_DIR, "watchdog_state.json")
OUTAGE_LOG = os.path.join(LOG_DIR, "outages.log")
ADMIN_CACHE = os.path.join(LOG_DIR, "admin_emails_cache.json")

with open(os.path.join(BASE_DIR, "secrets.json"), encoding="utf-8") as _f:
    SECRETS = json.load(_f)

RESEND_API_KEY = SECRETS.get("RESEND_API_KEY", "")
SMTP_PASSWORD = SECRETS.get("SMTP_PASSWORD", "")
DB_PASSWORD = SECRETS.get("DB_PASSWORD", "")

EMAIL_FROM = "Stallkamp Family Dashboard <invitations@s-dashboard.com>"
SMTP_FROM = "stallkampadmin@gmail.com"
REPLY_TO = "stallkampadmin@gmail.com"
FALLBACK_EMAIL = "jamesstallkamp@gmail.com"  # used only if no admin emails are known


# --- health checks ---------------------------------------------------------
def http_ok(url, timeout=10):
    try:
        ctx = ssl.create_default_context()
        req = urllib.request.Request(url, headers={"User-Agent": "dashboard-watchdog"})
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return r.status < 500
    except Exception:
        return False


def tcp_ok(host, port, timeout=5):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def service_running(name):
    try:
        out = subprocess.run(["sc", "query", name], capture_output=True,
                             text=True, timeout=10).stdout
        return "RUNNING" in out
    except Exception:
        return False


# Each component: friendly name -> health probe. All are checked every sweep.
COMPONENTS = {
    "Backend API (:8132)": lambda: http_ok("http://127.0.0.1:8132/"),
    "Frontend (:3000)": lambda: http_ok("http://127.0.0.1:3000/"),
    "Database (MySQL)": lambda: tcp_ok("127.0.0.1", 3306),
    "Cloudflare tunnel": lambda: service_running("Cloudflared"),
}


def check_with_retries(probe, retries=3, delay=5):
    """A component is only DOWN if it fails every retry — debounces brief blips
    (e.g. a service mid-restart) so we don't false-alarm."""
    for i in range(retries):
        if probe():
            return True
        if i < retries - 1:
            time.sleep(delay)
    return False


# --- logging + email -------------------------------------------------------
def log(msg):
    line = f"{datetime.now().isoformat(timespec='seconds')} {msg}"
    try:
        with open(OUTAGE_LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass
    print(line)


def get_admin_emails():
    emails = []
    try:
        import mysql.connector
        conn = mysql.connector.connect(host="127.0.0.1", user="root",
                                       password=DB_PASSWORD, database="weather",
                                       connection_timeout=5)
        cur = conn.cursor()
        cur.execute("SELECT email FROM users WHERE role='admin' "
                    "AND email IS NOT NULL AND email<>''")
        emails = [r[0] for r in cur.fetchall()]
        cur.close()
        conn.close()
        if emails:  # refresh cache while the DB is reachable
            with open(ADMIN_CACHE, "w", encoding="utf-8") as f:
                json.dump(emails, f)
    except Exception:
        pass
    if not emails and os.path.exists(ADMIN_CACHE):
        try:
            with open(ADMIN_CACHE, encoding="utf-8") as f:
                emails = json.load(f)
        except Exception:
            pass
    return emails or [FALLBACK_EMAIL]


def _send_one(to_email, subject, text):
    html = ("<pre style='font-family:monospace;white-space:pre-wrap;font-size:14px'>"
            + text + "</pre>")
    if RESEND_API_KEY:
        try:
            data = json.dumps({
                "from": EMAIL_FROM, "to": [to_email], "reply_to": REPLY_TO,
                "subject": subject, "text": text, "html": html,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.resend.com/emails", data=data,
                headers={"Authorization": f"Bearer {RESEND_API_KEY}",
                         "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=15) as r:
                if r.status < 400:
                    return True
        except Exception:
            pass
    try:  # SMTP fallback
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to_email
        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=20) as s:
            s.starttls()
            s.login(SMTP_FROM, SMTP_PASSWORD)
            s.sendmail(SMTP_FROM, to_email, msg.as_string())
        return True
    except Exception as e:
        log(f"EMAIL FAILED to {to_email}: {e}")
        return False


def email_admins(subject, text):
    sent = 0
    for addr in get_admin_emails():
        if _send_one(addr, subject, text):
            sent += 1
    log(f"alerted {sent} admin(s): {subject}")


# --- state -----------------------------------------------------------------
def load_state():
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state):
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
    except Exception:
        pass


def sweep():
    state = load_state()
    now = datetime.now().isoformat(timespec="seconds")
    for name, probe in COMPONENTS.items():
        up = check_with_retries(probe)
        prev = state.get(name, {}).get("status", "up")  # assume healthy first run
        if up and prev == "down":
            since = state.get(name, {}).get("since", "?")
            log(f"RECOVERED: {name} (was down since {since})")
            email_admins(
                f"✅ RECOVERED: {name} — Family Dashboard",
                f"{name} is back UP as of {now}.\n\nIt had been down since {since}.")
            state[name] = {"status": "up", "since": now}
        elif not up and prev != "down":
            log(f"DOWN: {name}")
            email_admins(
                f"🚨 OUTAGE: {name} is DOWN — Family Dashboard",
                f"{name} failed its health check at {now} on the dashboard server.\n\n"
                f"The service may have crashed or been stopped. It will be reported "
                f"again here when it recovers.\n\nCheck logs/app-errors.log and the "
                f"Windows services on the dashboard machine.")
            state[name] = {"status": "down", "since": now}
        elif not up:
            state.setdefault(name, {"status": "down", "since": now})
        else:
            state[name] = {"status": "up", "since": state.get(name, {}).get("since", now)}
    save_state(state)


def main():
    if "--test" in sys.argv:
        email_admins("🔔 TEST: Family Dashboard outage watchdog",
                     "This is a test alert confirming the outage watchdog can "
                     "reach all admin accounts. No action needed.")
        return
    if "--loop" in sys.argv:
        while True:
            try:
                sweep()
            except Exception as e:
                log(f"watchdog sweep error: {e}")
            time.sleep(60)
    else:
        sweep()


if __name__ == "__main__":
    main()
