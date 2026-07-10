from flask import Flask, request, send_from_directory, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, disconnect
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    create_refresh_token,
    decode_token,
    jwt_required,
    get_jwt,
    get_jwt_identity
)
from datetime import datetime, timezone, timedelta
try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python < 3.9
    ZoneInfo = None
from werkzeug.utils import secure_filename
from pywebpush import webpush, WebPushException
import bcrypt
import mysql.connector
import os
import uuid
import math
import json
import requests
import subprocess
import threading
import hashlib
import queue
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def _load_secrets():
    """Load sensitive config from a gitignored secrets.json next to this file.

    Returns a getter that prefers secrets.json, then environment variables,
    then a supplied default. Keeps credentials out of source control.
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "secrets.json")
    data = {}
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError) as e:
            print(f"[secrets] failed to read {path}: {e}")
    return lambda key, default=None: data.get(key) or os.environ.get(key) or default


_secret = _load_secrets()

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": _secret("DB_PASSWORD", "root"),
    "database": "weather"
}

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads", "photos")
ALLOWED_PHOTO_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}

VIDEO_UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads", "videos")
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "webm", "ogg", "mov"}

RESUME_UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads", "resumes")
ALLOWED_RESUME_EXTENSIONS = {"pdf"}

LOCAL_VIDEO_EXTENSIONS = {"mp4", "webm", "ogg", "mov", "mkv", "avi", "wmv", "m4v"}
DEFAULT_LOCAL_VIDEO_FOLDER = r"C:\Videos"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VAPID_PRIVATE_KEY_PATH = os.path.join(BASE_DIR, "vapid_private_key.pem")
VAPID_PUBLIC_KEY_PATH = os.path.join(BASE_DIR, "vapid_public_key.txt")
VAPID_CLAIMS = {"sub": "mailto:admin@example.com"}

CONVERTED_VIDEO_FOLDER = os.path.join(BASE_DIR, "uploads", "converted_videos")

FFMPEG_BIN = os.path.join(
    r"C:\Users\james\AppData\Local\Microsoft\WinGet\Packages",
    r"Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe",
    r"ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
)
FFPROBE_BIN = os.path.join(
    r"C:\Users\james\AppData\Local\Microsoft\WinGet\Packages",
    r"Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe",
    r"ffmpeg-8.1.2-full_build\bin\ffprobe.exe"
)

BROWSER_SAFE_VIDEO_CODECS = {"h264"}
BROWSER_SAFE_AUDIO_CODECS = {"aac"}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(VIDEO_UPLOAD_FOLDER, exist_ok=True)
os.makedirs(CONVERTED_VIDEO_FOLDER, exist_ok=True)
os.makedirs(RESUME_UPLOAD_FOLDER, exist_ok=True)

_last_alert_sent = {}
ALERT_COOLDOWN_SECONDS = 3600

NWS_USER_AGENT = "PersonalWeatherDashboard (admin@example.com)"

_forecast_cache = {"data": None, "fetched_at": 0}
FORECAST_CACHE_SECONDS = 1800

_app_settings_cache = {"data": None, "fetched_at": 0}
APP_SETTINGS_CACHE_SECONDS = 30


def get_app_settings(force_refresh=False):
    now = datetime.now().timestamp()

    if (
        not force_refresh
        and _app_settings_cache["data"]
        and (now - _app_settings_cache["fetched_at"]) < APP_SETTINGS_CACHE_SECONDS
    ):
        return _app_settings_cache["data"]

    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT dashboard_title, station_name, station_lat, station_lon,
               wind_alert_threshold, uv_alert_threshold, rain_alert_threshold, local_video_folder,
               accent_color, family_photo, announcement
        FROM app_settings WHERE id=1
    """)
    row = cursor.fetchone()
    cursor.close()
    db.close()

    data = {
        "dashboard_title": row[0],
        "station_name": row[1],
        "station_lat": float(row[2]),
        "station_lon": float(row[3]),
        "wind_alert_threshold": float(row[4]),
        "uv_alert_threshold": float(row[5]),
        "rain_alert_threshold": float(row[6]),
        "local_video_folder": row[7] or DEFAULT_LOCAL_VIDEO_FOLDER,
        "accent_color": row[8] or "",
        "family_photo": row[9] or "",
        "announcement": row[10] or ""
    }

    _app_settings_cache["data"] = data
    _app_settings_cache["fetched_at"] = now

    return data


def allowed_photo_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_PHOTO_EXTENSIONS


def allowed_video_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_VIDEO_EXTENSIONS


def allowed_resume_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_RESUME_EXTENSIONS


def get_vapid_public_key():
    if not os.path.exists(VAPID_PUBLIC_KEY_PATH):
        return None
    with open(VAPID_PUBLIC_KEY_PATH, "r") as f:
        return f.read().strip()


def get_vapid_private_key():
    if not os.path.exists(VAPID_PRIVATE_KEY_PATH):
        return None
    with open(VAPID_PRIVATE_KEY_PATH, "r") as f:
        return f.read()


def send_push_to_subscription(subscription, payload):
    private_key = get_vapid_private_key()
    if not private_key:
        return False

    try:
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {
                    "p256dh": subscription["p256dh"],
                    "auth": subscription["auth"]
                }
            },
            data=json.dumps(payload),
            vapid_private_key=private_key,
            vapid_claims=dict(VAPID_CLAIMS)
        )
        return True
    except WebPushException:
        return False


def send_push_to_all(payload, notify_column=None):
    db = get_db()
    cursor = db.cursor()

    if notify_column in ("notify_wind", "notify_uv", "notify_rain"):
        cursor.execute(f"""
            SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
            FROM push_subscriptions ps
            LEFT JOIN user_settings us ON us.user_id = ps.user_id
            WHERE us.{notify_column} IS NULL OR us.{notify_column} = TRUE
        """)
    else:
        cursor.execute("SELECT id, endpoint, p256dh, auth FROM push_subscriptions")

    rows = cursor.fetchall()
    cursor.close()
    db.close()

    for row in rows:
        sub_id, endpoint, p256dh, auth = row
        ok = send_push_to_subscription(
            {"endpoint": endpoint, "p256dh": p256dh, "auth": auth}, payload
        )

        if not ok:
            db2 = get_db()
            cursor2 = db2.cursor()
            cursor2.execute("DELETE FROM push_subscriptions WHERE id=%s", (sub_id,))
            db2.commit()
            cursor2.close()
            db2.close()


def maybe_send_alert_push(alert_type, message):
    now = datetime.now().timestamp()
    last_sent = _last_alert_sent.get(alert_type, 0)

    if now - last_sent < ALERT_COOLDOWN_SECONDS:
        return

    _last_alert_sent[alert_type] = now
    notify_column = {"wind": "notify_wind", "uv": "notify_uv", "rain": "notify_rain"}.get(alert_type)
    send_push_to_all({
        "title": "Weather Alert",
        "body": message,
        "url": "/weather-center"
    }, notify_column=notify_column)


def get_db():
    return mysql.connector.connect(**DB_CONFIG)


def ensure_feature_tables():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            recurrence_rule VARCHAR(20) DEFAULT 'none',
            recurrence_end DATE,
            created_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            assigned_to VARCHAR(255),
            due_date DATE,
            is_done BOOLEAN DEFAULT FALSE,
            recurrence_rule VARCHAR(20) DEFAULT 'none',
            recurrence_end DATE,
            created_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS meals (
            id INT AUTO_INCREMENT PRIMARY KEY,
            meal_date DATE NOT NULL,
            meal_type VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            notes TEXT,
            created_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Family message board ("Communication" tab): a shared feed of short notes.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            author VARCHAR(255),
            body TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # --- Drinks ("what can I make from my bar") -----------------------------
    # drink_catalog + drink_ingredient_catalog + drink_recipe_ingredients hold
    # the cocktail dataset imported from TheCocktailDB (see /drinks/seed).
    # user_bar stores each user's selected on-hand ingredients.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS drink_catalog (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ext_id VARCHAR(32) UNIQUE,
            name VARCHAR(255) NOT NULL,
            category VARCHAR(120),
            alcoholic VARCHAR(40),
            glass VARCHAR(120),
            instructions TEXT,
            thumb VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS drink_ingredient_catalog (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(190) NOT NULL UNIQUE,
            category VARCHAR(40) DEFAULT 'other',
            is_alcohol BOOLEAN DEFAULT FALSE
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS drink_recipe_ingredients (
            id INT AUTO_INCREMENT PRIMARY KEY,
            drink_id INT NOT NULL,
            ingredient_id INT NOT NULL,
            measure VARCHAR(190),
            is_garnish BOOLEAN DEFAULT FALSE,
            position INT,
            INDEX idx_dri_drink (drink_id),
            INDEX idx_dri_ingredient (ingredient_id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_bar (
            user_id INT NOT NULL,
            ingredient_id INT NOT NULL,
            PRIMARY KEY (user_id, ingredient_id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS shopping_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            quantity VARCHAR(100),
            is_checked BOOLEAN DEFAULT FALSE,
            meal_id INT,
            created_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS photos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(255) NOT NULL,
            original_name VARCHAR(255),
            caption TEXT,
            visibility VARCHAR(10) DEFAULT 'private',
            uploaded_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS videos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(255) NOT NULL,
            original_name VARCHAR(255),
            caption TEXT,
            visibility VARCHAR(10) DEFAULT 'private',
            file_size BIGINT,
            uploaded_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS resumes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(255) NOT NULL,
            original_name VARCHAR(255),
            label VARCHAR(255),
            file_size BIGINT,
            uploaded_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS job_applications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company VARCHAR(255) NOT NULL,
            role VARCHAR(255) NOT NULL,
            source VARCHAR(50) DEFAULT 'other',
            status VARCHAR(50) DEFAULT 'saved',
            location VARCHAR(255),
            url TEXT,
            notes TEXT,
            applied_date DATE,
            created_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            endpoint TEXT NOT NULL,
            p256dh VARCHAR(255) NOT NULL,
            auth VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_endpoint (endpoint(255))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS meal_ingredients (
            id INT AUTO_INCREMENT PRIMARY KEY,
            meal_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            quantity VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS video_conversions (
            source_path VARCHAR(500) PRIMARY KEY,
            output_filename VARCHAR(255),
            status VARCHAR(20) DEFAULT 'queued',
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS invitations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            token VARCHAR(64) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN DEFAULT FALSE
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS password_resets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token VARCHAR(64) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN DEFAULT FALSE
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS app_settings (
            id INT PRIMARY KEY DEFAULT 1,
            dashboard_title VARCHAR(255) DEFAULT 'Stallkamp Family Dashboard',
            station_name VARCHAR(255) DEFAULT 'Home Station',
            station_lat DOUBLE DEFAULT 45.5152,
            station_lon DOUBLE DEFAULT -122.6784,
            wind_alert_threshold DOUBLE DEFAULT 25,
            uv_alert_threshold DOUBLE DEFAULT 8,
            rain_alert_threshold DOUBLE DEFAULT 1,
            local_video_folder VARCHAR(500) DEFAULT 'C:\\\\Videos',
            accent_color VARCHAR(20),
            family_photo VARCHAR(255),
            announcement TEXT
        )
    """)

    cursor.execute("SELECT COUNT(*) FROM app_settings WHERE id=1")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO app_settings (id) VALUES (1)")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INT PRIMARY KEY,
            notify_wind BOOLEAN DEFAULT TRUE,
            notify_uv BOOLEAN DEFAULT TRUE,
            notify_rain BOOLEAN DEFAULT TRUE,
            temperature_unit VARCHAR(1) DEFAULT 'F'
        )
    """)

    for table, column, ddl in [
        ("events", "recurrence_rule", "VARCHAR(20) DEFAULT 'none'"),
        ("events", "recurrence_end", "DATE"),
        ("events", "timezone", "VARCHAR(64)"),
        ("user_settings", "timezone", "VARCHAR(64)"),
        ("chores", "recurrence_rule", "VARCHAR(20) DEFAULT 'none'"),
        ("chores", "recurrence_end", "DATE"),
        ("chores", "rotation_members", "TEXT"),
        ("photos", "visibility", "VARCHAR(10) DEFAULT 'private'"),
        ("app_settings", "local_video_folder", "VARCHAR(500) DEFAULT 'C:\\\\Videos'"),
        ("app_settings", "accent_color", "VARCHAR(20)"),
        ("app_settings", "family_photo", "VARCHAR(255)"),
        ("app_settings", "announcement", "TEXT"),
        ("users", "status", "VARCHAR(20) DEFAULT 'approved'"),
        ("users", "must_change_password", "BOOLEAN DEFAULT FALSE"),
        ("users", "email", "VARCHAR(255)")
    ]:
        cursor.execute(f"""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema=%s AND table_name=%s AND column_name=%s
        """, (DB_CONFIG["database"], table, column))

        if cursor.fetchone()[0] == 0:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")

    # Promote users.email to the required, unique login identifier — but only
    # once every existing row has an email, so we never lock out un-backfilled
    # accounts. Idempotent: the UNIQUE index is added at most once.
    cursor.execute("SELECT COUNT(*) FROM users WHERE email IS NULL OR email=''")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.statistics
            WHERE table_schema=%s AND table_name='users' AND index_name='uniq_user_email'
        """, (DB_CONFIG["database"],))
        if cursor.fetchone()[0] == 0:
            cursor.execute("ALTER TABLE users MODIFY email VARCHAR(255) NOT NULL")
            cursor.execute("ALTER TABLE users ADD UNIQUE KEY uniq_user_email (email)")

    db.commit()
    cursor.close()
    db.close()


def localize_iso(naive_dt, tz_name):
    """Render a stored wall-clock datetime as an ISO-8601 string.

    When ``tz_name`` is a loadable IANA zone, the naive wall time is
    interpreted in that zone and the result carries the correct UTC offset
    (DST resolved for that specific date), e.g. ``2026-07-09T09:00:00-04:00``.
    Clients can then convert that absolute instant into any viewer's timezone.

    Legacy events with no stored zone fall back to the plain (floating)
    isoformat, preserving the previous device-local behaviour exactly.
    """
    if not naive_dt:
        return None
    if tz_name and ZoneInfo is not None:
        try:
            return naive_dt.replace(tzinfo=ZoneInfo(tz_name)).isoformat()
        except Exception:
            pass
    return naive_dt.isoformat()


RECURRENCE_WINDOW_DAYS = 365


def expand_recurrence(anchor_date, recurrence_rule, recurrence_end, window_end):
    """Yield each occurrence date for a recurring item up to window_end / recurrence_end."""
    occurrences = [anchor_date]

    if not recurrence_rule or recurrence_rule == "none":
        return occurrences

    if recurrence_rule == "daily":
        step = timedelta(days=1)
    elif recurrence_rule == "weekly":
        step = timedelta(weeks=1)
    elif recurrence_rule == "monthly":
        step = None
    else:
        return occurrences

    limit = recurrence_end if recurrence_end and recurrence_end < window_end else window_end
    current = anchor_date

    while True:
        if recurrence_rule == "monthly":
            month = current.month + 1
            year = current.year + (1 if month > 12 else 0)
            month = month if month <= 12 else 1
            try:
                current = current.replace(year=year, month=month)
            except ValueError:
                current = current.replace(year=year, month=month, day=28)
        else:
            current = current + step

        if current > limit:
            break

        occurrences.append(current)

    return occurrences


def safe_float(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def compute_dewpoint(tempf, humidity):
    if tempf is None or humidity is None or humidity <= 0:
        return None

    tempc = (tempf - 32) * 5.0 / 9.0
    gamma = (17.625 * tempc) / (243.04 + tempc) + math.log(humidity / 100.0)
    dewpointc = (243.04 * gamma) / (17.625 - gamma)
    return dewpointc * 9.0 / 5.0 + 32


def compute_feels_like(tempf, humidity, windspeedmph):
    if tempf is None:
        return None

    if tempf <= 50 and windspeedmph and windspeedmph > 3:
        windchill = (
            35.74 + 0.6215 * tempf
            - 35.75 * (windspeedmph ** 0.16)
            + 0.4275 * tempf * (windspeedmph ** 0.16)
        )
        return windchill

    if tempf >= 80 and humidity:
        heat_index = (
            -42.379 + 2.04901523 * tempf + 10.14333127 * humidity
            - 0.22475541 * tempf * humidity - 0.00683783 * tempf * tempf
            - 0.05481717 * humidity * humidity + 0.00122874 * tempf * tempf * humidity
            + 0.00085282 * tempf * humidity * humidity
            - 0.00000199 * tempf * tempf * humidity * humidity
        )
        return heat_index

    return tempf


def admin_required():
    claims = get_jwt()
    return claims.get("role") == "admin"


def hash_password(password):
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")


app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"])

app.config["JWT_SECRET_KEY"] = _secret("JWT_SECRET_KEY", "super-secret-change-this")
jwt = JWTManager(app)

# Signed, time-limited access tokens for the unauthenticated local-video file
# endpoints (a <video> tag can't send an Authorization header). An admin's
# browse response embeds these tokens in the play URLs; the file endpoints refuse
# any request whose token is missing, tampered, expired, or signed for a
# different path. Non-admins can't browse, so they never receive a valid token.
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

_video_signer = URLSafeTimedSerializer(app.config["JWT_SECRET_KEY"], salt="local-video-access")
VIDEO_URL_MAX_AGE = 12 * 3600  # signed local-video URLs are valid for 12 hours

def sign_video_ref(ref):
    """Return a signed, time-limited token authorizing access to `ref`."""
    return _video_signer.dumps(ref)

def verify_video_ref(token, ref):
    """True only if `token` is a valid, unexpired signature over exactly `ref`."""
    if not token:
        return False
    try:
        return _video_signer.loads(token, max_age=VIDEO_URL_MAX_AGE) == ref
    except (BadSignature, SignatureExpired):
        return False

ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
REFRESH_TOKEN_EXPIRES = timedelta(days=30)

ADMIN_ALLOWED_IPS = {"127.0.0.1", "::1", "192.168.1.72"}

SMTP_FROM_EMAIL = "stallkampadmin@gmail.com"
SMTP_PASSWORD = _secret("SMTP_PASSWORD", "")
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
APP_BASE_URL = "https://s-dashboard.com"

# Transactional email via Resend (preferred). When RESEND_API_KEY is set, mail
# is sent from our own authenticated domain so it lands in the inbox instead of
# spam. Falls back to Gmail SMTP when the key is absent.
RESEND_API_KEY = _secret("RESEND_API_KEY", "")
EMAIL_FROM = "Stallkamp Family Dashboard <invitations@s-dashboard.com>"
EMAIL_REPLY_TO = "stallkampadmin@gmail.com"


def request_ip_allowed_for_admin():
    return request.remote_addr in ADMIN_ALLOWED_IPS

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    logger=True,
    engineio_logger=True
)


@socketio.on("connect")
def handle_socket_connect(auth):
    if not auth or "token" not in auth:
        print("Socket rejected: no token")
        disconnect()
        return

    try:
        decoded = decode_token(auth["token"])
        print("Socket authenticated:", {
            "id": decoded.get("sub"),
            "username": decoded.get("username"),
            "role": decoded.get("role")
        })
    except Exception as e:
        print("Socket rejected:", e)
        disconnect()


@app.route("/")
def home():
    return "Weather server running"


@app.route("/routes")
def routes():
    return {
        "routes": sorted([str(rule) for rule in app.url_map.iter_rules()])
    }


@app.route("/privacy")
def privacy_policy():
    """Public privacy policy page (linked from the Play Store listing)."""
    policy_path = os.path.join(
        BASE_DIR, "FE", "personal_dashboard", "public", "privacy.html"
    )
    try:
        with open(policy_path, "r", encoding="utf-8") as f:
            return app.response_class(f.read(), mimetype="text/html")
    except OSError:
        return app.response_class(
            "<h1>Privacy Policy</h1><p>Contact jamesstallkamp@gmail.com.</p>",
            mimetype="text/html",
        )






_points_cache = {"data": None, "fetched_at": 0}
POINTS_CACHE_SECONDS = 86400

_forecast_hourly_cache = {"data": None, "fetched_at": 0}


def get_nws_points():
    now = datetime.now().timestamp()

    if _points_cache["data"] and (now - _points_cache["fetched_at"]) < POINTS_CACHE_SECONDS:
        return _points_cache["data"]

    headers = {"User-Agent": NWS_USER_AGENT, "Accept": "application/geo+json"}
    settings = get_app_settings()

    points_res = requests.get(
        f"https://api.weather.gov/points/{settings['station_lat']},{settings['station_lon']}",
        headers=headers,
        timeout=10
    )
    points_res.raise_for_status()
    properties = points_res.json()["properties"]

    data = {
        "forecast": properties["forecast"],
        "forecast_hourly": properties["forecastHourly"]
    }

    _points_cache["data"] = data
    _points_cache["fetched_at"] = now

    return data


def fetch_nws_forecast():
    now = datetime.now().timestamp()

    if _forecast_cache["data"] and (now - _forecast_cache["fetched_at"]) < FORECAST_CACHE_SECONDS:
        return _forecast_cache["data"]

    headers = {"User-Agent": NWS_USER_AGENT, "Accept": "application/geo+json"}
    forecast_url = get_nws_points()["forecast"]

    forecast_res = requests.get(forecast_url, headers=headers, timeout=10)
    forecast_res.raise_for_status()
    periods = forecast_res.json()["properties"]["periods"]

    data = {
        "periods": [
            {
                "name": p.get("name"),
                "start_time": p.get("startTime"),
                "end_time": p.get("endTime"),
                "is_daytime": p.get("isDaytime"),
                "temperature": p.get("temperature"),
                "temperature_unit": p.get("temperatureUnit"),
                "wind_speed": p.get("windSpeed"),
                "wind_direction": p.get("windDirection"),
                "short_forecast": p.get("shortForecast"),
                "detailed_forecast": p.get("detailedForecast"),
                "icon": p.get("icon"),
                "probability_of_precipitation": (p.get("probabilityOfPrecipitation") or {}).get("value")
            }
            for p in periods
        ]
    }

    _forecast_cache["data"] = data
    _forecast_cache["fetched_at"] = now

    return data


def fetch_nws_hourly_forecast():
    now = datetime.now().timestamp()

    if _forecast_hourly_cache["data"] and (now - _forecast_hourly_cache["fetched_at"]) < FORECAST_CACHE_SECONDS:
        return _forecast_hourly_cache["data"]

    headers = {"User-Agent": NWS_USER_AGENT, "Accept": "application/geo+json"}
    forecast_hourly_url = get_nws_points()["forecast_hourly"]

    hourly_res = requests.get(forecast_hourly_url, headers=headers, timeout=10)
    hourly_res.raise_for_status()
    periods = hourly_res.json()["properties"]["periods"]

    data = {
        "periods": [
            {
                "start_time": p.get("startTime"),
                "end_time": p.get("endTime"),
                "temperature": p.get("temperature"),
                "temperature_unit": p.get("temperatureUnit"),
                "wind_speed": p.get("windSpeed"),
                "wind_direction": p.get("windDirection"),
                "short_forecast": p.get("shortForecast"),
                "icon": p.get("icon"),
                "probability_of_precipitation": (p.get("probabilityOfPrecipitation") or {}).get("value")
            }
            for p in periods
        ]
    }

    _forecast_hourly_cache["data"] = data
    _forecast_hourly_cache["fetched_at"] = now

    return data


@app.route("/forecast")
def forecast():
    try:
        return fetch_nws_forecast()
    except requests.RequestException as e:
        return {"error": f"Failed to fetch forecast: {e}"}, 502


@app.route("/forecast/hourly")
def forecast_hourly():
    date_filter = request.args.get("date")

    try:
        data = fetch_nws_hourly_forecast()
    except requests.RequestException as e:
        return {"error": f"Failed to fetch hourly forecast: {e}"}, 502

    if not date_filter:
        return data

    filtered = [
        p for p in data["periods"]
        if p["start_time"] and p["start_time"][:10] == date_filter
    ]

    return {"periods": filtered}


@app.route("/alerts/current")
def current_alerts():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT timestamp, windgustmph, baromrelin, dailyrainin, uv
        FROM readings
        ORDER BY timestamp DESC
        LIMIT 1
    """)

    row = cursor.fetchone()
    cursor.close()
    db.close()

    if not row:
        return {"alerts": []}

    timestamp, gust, pressure, rain, uv = row
    alerts = []
    thresholds = get_app_settings()

    if gust is not None and float(gust) >= thresholds["wind_alert_threshold"]:
        alerts.append({
            "level": "warning",
            "type": "wind",
            "message": f"High wind gust detected: {float(gust):.1f} mph"
        })

    if uv is not None and float(uv) >= thresholds["uv_alert_threshold"]:
        alerts.append({
            "level": "warning",
            "type": "uv",
            "message": f"High UV index detected: {float(uv):.1f}"
        })

    if rain is not None and float(rain) >= thresholds["rain_alert_threshold"]:
        alerts.append({
            "level": "watch",
            "type": "rain",
            "message": f"Heavy daily rainfall detected: {float(rain):.2f} in"
        })

    return {
        "timestamp": timestamp.isoformat() if timestamp else None,
        "alerts": alerts
    }

@app.route("/latest")
def latest():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT timestamp, tempf, humidity, windspeedmph,
               windgustmph, winddir, uv, baromrelin, dailyrainin, solarradiation
        FROM readings
        ORDER BY timestamp DESC
        LIMIT 1
    """)

    row = cursor.fetchone()
    cursor.close()
    db.close()

    if not row:
        return {"data": None}

    tempf = float(row[1]) if row[1] is not None else None
    humidity = float(row[2]) if row[2] is not None else None
    windspeedmph = float(row[3]) if row[3] is not None else None

    return {
        "data": {
            "timestamp": row[0].isoformat() if row[0] else None,
            "tempf": tempf,
            "humidity": humidity,
            "windspeedmph": windspeedmph,
            "windgustmph": row[4],
            "winddir": row[5],
            "uv": row[6],
            "baromrelin": row[7],
            "dailyrainin": row[8],
            "solarradiation": row[9],
            "dewpoint": compute_dewpoint(tempf, humidity),
            "feels_like": compute_feels_like(tempf, humidity, windspeedmph)
        }
    }


@app.route("/data/", methods=["GET"])
def ingest():
    args = request.args.to_dict()
    args.pop("PASSKEY", None)

    tempf = safe_float(args.get("tempf"))
    humidity = safe_float(args.get("humidity"))
    windspeed = safe_float(args.get("windspeedmph"))
    windgust = safe_float(args.get("windgustmph"))
    winddir = safe_float(args.get("winddir"))
    uv = safe_float(args.get("uv"))
    solar = safe_float(args.get("solarradiation"))
    baro = safe_float(args.get("baromrelin"))
    rain = safe_float(args.get("dailyrainin"))

    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        INSERT INTO readings (
            timestamp, tempf, humidity, windspeedmph,
            windgustmph, winddir, uv, solarradiation,
            baromrelin, dailyrainin
        )
        VALUES (NOW(), %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        tempf, humidity, windspeed,
        windgust, winddir, uv, solar,
        baro, rain
    ))

    db.commit()
    cursor.close()
    db.close()

    socketio.emit("weather_update", {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": {
            "stationtype": args.get("stationtype"),
            "dateutc": args.get("dateutc"),
            "tempf": tempf,
            "humidity": humidity,
            "windspeedmph": windspeed,
            "windgustmph": windgust,
            "winddir": winddir,
            "uv": uv,
            "solarradiation": solar,
            "baromrelin": baro,
            "dailyrainin": rain,
            "dewpoint": compute_dewpoint(tempf, humidity),
            "feels_like": compute_feels_like(tempf, humidity, windspeed)
        }
    })

    thresholds = get_app_settings()

    if windgust >= thresholds["wind_alert_threshold"]:
        maybe_send_alert_push("wind", f"High wind gust detected: {windgust:.1f} mph")

    if uv >= thresholds["uv_alert_threshold"]:
        maybe_send_alert_push("uv", f"High UV index detected: {uv:.1f}")

    if rain >= thresholds["rain_alert_threshold"]:
        maybe_send_alert_push("rain", f"Heavy daily rainfall detected: {rain:.2f} in")

    return "OK"


HISTORY_TARGET_POINTS = 300


@app.route("/history")
def history():
    try:
        hours = int(request.args.get("hours", 24))
    except ValueError:
        hours = 24

    hours = max(1, min(hours, 24 * 30))

    bucket_seconds = max(60, int(hours * 3600 / HISTORY_TARGET_POINTS))

    db = get_db()
    cursor = db.cursor()

    cursor.execute(f"""
        SELECT
            FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {bucket_seconds}) * {bucket_seconds}) AS bucket,
            AVG(tempf), AVG(humidity), AVG(windspeedmph),
            MAX(windgustmph), AVG(winddir), AVG(uv),
            AVG(baromrelin), MAX(dailyrainin), AVG(solarradiation)
        FROM readings
        WHERE timestamp >= NOW() - INTERVAL %s HOUR
        GROUP BY bucket
        ORDER BY bucket ASC
    """, (hours,))

    rows = cursor.fetchall()
    cursor.close()
    db.close()

    return {
        "history": [
            {
                "timestamp": r[0].isoformat() if r[0] else None,
                "tempf": float(r[1]) if r[1] is not None else None,
                "humidity": float(r[2]) if r[2] is not None else None,
                "windspeedmph": float(r[3]) if r[3] is not None else None,
                "windgustmph": float(r[4]) if r[4] is not None else None,
                "winddir": float(r[5]) if r[5] is not None else None,
                "uv": float(r[6]) if r[6] is not None else None,
                "baromrelin": float(r[7]) if r[7] is not None else None,
                "dailyrainin": float(r[8]) if r[8] is not None else None,
                "solarradiation": float(r[9]) if r[9] is not None else None
            }
            for r in rows
        ]
    }


@app.route("/stats/today")
def stats_today():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            MAX(tempf),
            MIN(tempf),
            AVG(tempf),
            MAX(windgustmph),
            MAX(dailyrainin),
            MAX(solarradiation),
            MIN(humidity),
            MAX(humidity)
        FROM readings
        WHERE DATE(timestamp) = CURDATE()
    """)

    row = cursor.fetchone()
    cursor.close()
    db.close()

    if not row or row[0] is None:
        return {"stats": None}

    return {
        "stats": {
            "high_temp": float(row[0]),
            "low_temp": float(row[1]),
            "avg_temp": float(row[2]),
            "max_gust": float(row[3]),
            "rain_total": float(row[4]),
            "max_solar": float(row[5]) if row[5] is not None else None,
            "low_humidity": float(row[6]) if row[6] is not None else None,
            "high_humidity": float(row[7]) if row[7] is not None else None
        }
    }


@app.route("/stats/daily")
def stats_daily():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            DATE(timestamp),
            MAX(tempf),
            MIN(tempf),
            AVG(tempf),
            MAX(windgustmph),
            MAX(dailyrainin)
        FROM readings
        GROUP BY DATE(timestamp)
        ORDER BY DATE(timestamp) DESC
        LIMIT 7
    """)

    rows = cursor.fetchall()
    cursor.close()
    db.close()

    return {
        "daily": [
            {
                "date": str(r[0]),
                "high_temp": float(r[1]) if r[1] is not None else None,
                "low_temp": float(r[2]) if r[2] is not None else None,
                "avg_temp": float(r[3]) if r[3] is not None else None,
                "max_gust": float(r[4]) if r[4] is not None else None,
                "rain_total": float(r[5]) if r[5] is not None else None
            }
            for r in rows
        ]
    }


def send_invite_email(to_email, token):
    invite_url = f"{APP_BASE_URL}/register?token={token}"
    subject = "You've been invited to join the Dashboard"

    text = f"You've been invited to join the Stallkamp Family Dashboard.\n\nClick the link below to create your account:\n{invite_url}\n\nThis link expires in 48 hours."
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
      <h2>You're invited!</h2>
      <p>You've been invited to join the <strong>Stallkamp Family Dashboard</strong>.</p>
      <p style="margin:24px 0">
        <a href="{invite_url}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          Create your account
        </a>
      </p>
      <p style="color:#666;font-size:13px">This link expires in 48 hours. If you weren't expecting this, you can ignore it.</p>
    </div>
    """

    if RESEND_API_KEY:
        _send_email_resend(to_email, subject, text, html)
    else:
        _send_email_smtp(to_email, subject, text, html)


def send_password_reset_email(to_email, token):
    reset_url = f"{APP_BASE_URL}/reset-password?token={token}"
    subject = "Reset your Dashboard password"

    text = f"We received a request to reset your Stallkamp Family Dashboard password.\n\nClick the link below to choose a new password:\n{reset_url}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email."
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
      <h2>Reset your password</h2>
      <p>We received a request to reset your <strong>Stallkamp Family Dashboard</strong> password.</p>
      <p style="margin:24px 0">
        <a href="{reset_url}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          Choose a new password
        </a>
      </p>
      <p style="color:#666;font-size:13px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>
    """

    if RESEND_API_KEY:
        _send_email_resend(to_email, subject, text, html)
    else:
        _send_email_smtp(to_email, subject, text, html)


def _send_email_resend(to_email, subject, text, html):
    """Send via Resend's HTTP API from our authenticated domain."""
    resp = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "from": EMAIL_FROM,
            "to": [to_email],
            "reply_to": EMAIL_REPLY_TO,
            "subject": subject,
            "text": text,
            "html": html,
        },
        timeout=15,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Resend API error {resp.status_code}: {resp.text}")


def _send_email_smtp(to_email, subject, text, html):
    """Fallback: send via Gmail SMTP."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM_EMAIL
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_FROM_EMAIL, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM_EMAIL, to_email, msg.as_string())


@app.route("/admin/invite", methods=["POST"])
@jwt_required()
def admin_invite_user():
    if not admin_required():
        return {"error": "Admin access required"}, 403

    data = request.json or {}
    email = (data.get("email") or "").strip().lower()

    if not email or "@" not in email:
        return {"error": "Valid email address required"}, 400

    token = uuid.uuid4().hex + uuid.uuid4().hex
    expires_at = datetime.now() + timedelta(hours=48)

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        "INSERT INTO invitations (email, token, expires_at) VALUES (%s, %s, %s)",
        (email, token, expires_at)
    )
    db.commit()
    cursor.close()
    db.close()

    try:
        send_invite_email(email, token)
    except Exception as e:
        return {"error": f"Invitation saved but email failed to send: {str(e)}"}, 500

    return {"message": f"Invitation sent to {email}"}, 201


@app.route("/register", methods=["POST"])
def register():
    data = request.json or {}
    # "username" is now a human-friendly display name, not the login credential.
    display_name = (data.get("username") or "").strip()
    password = data.get("password") or ""
    email = (data.get("email") or "").strip().lower()
    invite_token = (data.get("invite_token") or "").strip()

    if not display_name or not password:
        return {"error": "Name and password are required"}, 400

    if len(password) < 8:
        return {"error": "Password must be at least 8 characters"}, 400

    status = "pending"

    if invite_token:
        db = get_db()
        cursor = db.cursor()
        cursor.execute(
            "SELECT id, email FROM invitations WHERE token=%s AND used=FALSE AND expires_at > NOW()",
            (invite_token,)
        )
        inv = cursor.fetchone()
        cursor.close()
        db.close()

        if not inv:
            return {"error": "Invalid or expired invitation link."}, 400

        # The invited address is authoritative for invite-based signups.
        email = (inv[1] or "").strip().lower()
        status = "approved"

    if not email or "@" not in email:
        return {"error": "A valid email address is required"}, 400

    password_hash = hash_password(password)

    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash, role, status, email) VALUES (%s, %s, 'user', %s, %s)",
            (display_name, password_hash, status, email)
        )
        db.commit()

        if invite_token and status == "approved":
            cursor.execute("UPDATE invitations SET used=TRUE WHERE token=%s", (invite_token,))
            db.commit()

    except mysql.connector.IntegrityError:
        cursor.close()
        db.close()
        return {"error": "An account with that email already exists"}, 409

    cursor.close()
    db.close()

    if status == "approved":
        return {"message": "Account created! You can now log in.", "auto_approved": True}, 201

    return {"message": "Account request submitted. An admin must approve it before you can log in."}, 201


# Generic response used for all forgot-password outcomes so the endpoint never
# reveals whether a given email has an account (prevents account enumeration).
FORGOT_PASSWORD_MESSAGE = "If an account exists for that email, a reset link has been sent."


@app.route("/forgot-password", methods=["POST"])
def forgot_password():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()

    if not email or "@" not in email:
        return {"error": "Valid email address required"}, 400

    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT id FROM users WHERE LOWER(email)=%s", (email,))
    user = cursor.fetchone()

    if not user:
        cursor.close()
        db.close()
        return {"message": FORGOT_PASSWORD_MESSAGE}, 200

    user_id = user[0]
    token = uuid.uuid4().hex + uuid.uuid4().hex
    expires_at = datetime.now() + timedelta(hours=1)

    # Invalidate any earlier outstanding reset tokens for this user.
    cursor.execute("UPDATE password_resets SET used=TRUE WHERE user_id=%s AND used=FALSE", (user_id,))
    cursor.execute(
        "INSERT INTO password_resets (user_id, token, expires_at) VALUES (%s, %s, %s)",
        (user_id, token, expires_at)
    )
    db.commit()
    cursor.close()
    db.close()

    try:
        send_password_reset_email(email, token)
    except Exception as e:
        print(f"[forgot-password] failed to send reset email to {email}: {e}")

    return {"message": FORGOT_PASSWORD_MESSAGE}, 200


@app.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.json or {}
    token = (data.get("token") or "").strip()
    new_password = data.get("password") or ""

    if not token:
        return {"error": "Reset token is required"}, 400

    if len(new_password) < 8:
        return {"error": "Password must be at least 8 characters"}, 400

    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "SELECT id, user_id FROM password_resets WHERE token=%s AND used=FALSE AND expires_at > NOW()",
        (token,)
    )
    row = cursor.fetchone()

    if not row:
        cursor.close()
        db.close()
        return {"error": "This reset link is invalid or has expired. Please request a new one."}, 400

    reset_id, user_id = row
    password_hash = hash_password(new_password)

    cursor.execute(
        "UPDATE users SET password_hash=%s, must_change_password=FALSE WHERE id=%s",
        (password_hash, user_id)
    )
    cursor.execute("UPDATE password_resets SET used=TRUE WHERE id=%s", (reset_id,))
    db.commit()
    cursor.close()
    db.close()

    return {"message": "Your password has been reset. You can now log in."}, 200


@app.route("/login", methods=["POST"])
def login():
    data = request.json or {}

    # Email is the login identifier; accept the legacy "username" key as a
    # fallback so older clients keep working during the transition.
    identifier = (data.get("email") or data.get("username") or "").strip().lower()
    password = data.get("password")

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        "SELECT id, username, password_hash, role, status, must_change_password, email "
        "FROM users WHERE LOWER(email)=%s",
        (identifier,)
    )

    user = cursor.fetchone()
    cursor.close()
    db.close()

    if not user:
        return {"error": "Invalid credentials"}, 401

    user_id, db_username, password_hash, role, status, must_change_password, db_email = user

    if not bcrypt.checkpw(
        password.encode("utf-8"),
        password_hash.encode("utf-8")
    ):
        return {"error": "Invalid credentials"}, 401

    if status == "pending":
        return {"error": "Your account is awaiting admin approval."}, 403

    if status == "rejected":
        return {"error": "Your account request was not approved."}, 403

    if role == "admin" and not request_ip_allowed_for_admin():
        return {"error": "Admin login is only allowed from the server machine."}, 403

    token = create_access_token(
        identity=str(user_id),
        additional_claims={
            "username": db_username,
            "role": role
        },
        expires_delta=ACCESS_TOKEN_EXPIRES
    )

    refresh_token = create_refresh_token(
        identity=str(user_id),
        expires_delta=REFRESH_TOKEN_EXPIRES
    )

    return {
        "token": token,
        "refresh_token": refresh_token,
        "user": {
            "id": user_id,
            "username": db_username,
            "email": db_email,
            "role": role,
            "must_change_password": bool(must_change_password)
        }
    }


@app.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    user_id = get_jwt_identity()

    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT username, role, status FROM users WHERE id=%s", (user_id,))
    user = cursor.fetchone()
    cursor.close()
    db.close()

    if not user:
        return {"error": "User no longer exists"}, 401

    db_username, role, status = user

    if status != "approved":
        return {"error": "Account is no longer active"}, 401

    if role == "admin" and not request_ip_allowed_for_admin():
        return {"error": "Admin session is only valid from the server machine."}, 403

    token = create_access_token(
        identity=str(user_id),
        additional_claims={
            "username": db_username,
            "role": role
        },
        expires_delta=ACCESS_TOKEN_EXPIRES
    )

    return {
        "token": token,
        "user": {
            "id": int(user_id),
            "username": db_username,
            "role": role
        }
    }


@app.route("/admin/debug-db", methods=["GET"])
@jwt_required()
def admin_debug_db():
    if not admin_required():
        return {"error": "Admin access required"}, 403

    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT DATABASE()")
    database_name = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]

    cursor.execute("""
        SELECT id, username, role, created_at
        FROM users
        ORDER BY id ASC
    """)

    rows = cursor.fetchall()
    cursor.close()
    db.close()

    return {
        "database": database_name,
        "user_count": user_count,
        "users": [
            {
                "id": r[0],
                "username": r[1],
                "role": r[2],
                "created_at": r[3].isoformat() if r[3] else None
            }
            for r in rows
        ]
    }


@app.route("/admin/users", methods=["GET"])
@jwt_required()
def admin_users():
    if not admin_required():
        return {"error": "Admin access required"}, 403

    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT DATABASE()")
    database_name = cursor.fetchone()[0]

    cursor.execute("""
        SELECT id, username, role, created_at, status, email
        FROM users
        ORDER BY id ASC
    """)

    rows = cursor.fetchall()
    cursor.close()
    db.close()

    return {
        "database": database_name,
        "count": len(rows),
        "users": [
            {
                "id": r[0],
                "username": r[1],
                "role": r[2],
                "created_at": r[3].isoformat() if r[3] else None,
                "status": r[4] or "approved",
                "email": r[5]
            }
            for r in rows
        ]
    }


@app.route("/admin/users", methods=["POST"])
@jwt_required()
def admin_create_user():
    if not admin_required():
        return {"error": "Admin access required"}, 403

    data = request.json or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = data.get("role", "user")

    if not username or not password:
        return {"error": "Name and password are required"}, 400

    if not email or "@" not in email:
        return {"error": "A valid email address is required"}, 400

    if role not in ["user", "admin"]:
        return {"error": "Invalid role"}, 400

    password_hash = hash_password(password)

    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash, role, status, must_change_password, email) "
            "VALUES (%s, %s, %s, 'approved', TRUE, %s)",
            (username, password_hash, role, email)
        )
        db.commit()
        new_id = cursor.lastrowid
    except mysql.connector.IntegrityError:
        cursor.close()
        db.close()
        return {"error": "An account with that email or name already exists"}, 409

    cursor.close()
    db.close()

    return {
        "message": "User created",
        "user": {
            "id": new_id,
            "username": username,
            "email": email,
            "role": role
        }
    }, 201


@app.route("/admin/users/<int:user_id>/role", methods=["PUT"])
@jwt_required()
def admin_update_user_role(user_id):
    if not admin_required():
        return {"error": "Admin access required"}, 403

    data = request.json or {}
    role = data.get("role")

    if role not in ["user", "admin"]:
        return {"error": "Invalid role"}, 400

    db = get_db()
    cursor = db.cursor()

    cursor.execute("UPDATE users SET role=%s WHERE id=%s", (role, user_id))
    db.commit()
    affected = cursor.rowcount

    cursor.close()
    db.close()

    if affected == 0:
        return {"error": "User not found"}, 404

    return {"message": "Role updated"}


@app.route("/admin/users/<int:user_id>/approve", methods=["POST"])
@jwt_required()
def admin_approve_user(user_id):
    if not admin_required():
        return {"error": "Admin access required"}, 403

    db = get_db()
    cursor = db.cursor()

    cursor.execute("UPDATE users SET status='approved' WHERE id=%s", (user_id,))
    db.commit()
    affected = cursor.rowcount

    cursor.close()
    db.close()

    if affected == 0:
        return {"error": "User not found"}, 404

    return {"message": "User approved"}


@app.route("/admin/users/<int:user_id>/reject", methods=["POST"])
@jwt_required()
def admin_reject_user(user_id):
    if not admin_required():
        return {"error": "Admin access required"}, 403

    db = get_db()
    cursor = db.cursor()

    cursor.execute("DELETE FROM users WHERE id=%s AND status='pending'", (user_id,))
    db.commit()
    affected = cursor.rowcount

    cursor.close()
    db.close()

    if affected == 0:
        return {"error": "Pending account request not found"}, 404

    return {"message": "Account request rejected"}


@app.route("/admin/users/<int:user_id>/password", methods=["PUT"])
@jwt_required()
def admin_reset_user_password(user_id):
    if not admin_required():
        return {"error": "Admin access required"}, 403

    data = request.json or {}
    password = data.get("password") or ""

    if not password:
        return {"error": "Password is required"}, 400

    password_hash = hash_password(password)

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        "UPDATE users SET password_hash=%s WHERE id=%s",
        (password_hash, user_id)
    )
    db.commit()
    affected = cursor.rowcount

    cursor.close()
    db.close()

    if affected == 0:
        return {"error": "User not found"}, 404

    return {"message": "Password reset"}


@app.route("/admin/users/<int:user_id>", methods=["DELETE"])
@jwt_required()
def admin_delete_user(user_id):
    if not admin_required():
        return {"error": "Admin access required"}, 403

    current_user_id = int(get_jwt()["sub"])

    if user_id == current_user_id:
        return {"error": "You cannot delete your own account"}, 400

    db = get_db()
    cursor = db.cursor()

    cursor.execute("DELETE FROM users WHERE id=%s", (user_id,))
    db.commit()
    affected = cursor.rowcount

    cursor.close()
    db.close()

    if affected == 0:
        return {"error": "User not found"}, 404

    return {"message": "User deleted"}


@app.route("/account/change-password", methods=["PUT"])
@jwt_required()
def change_own_password():
    claims = get_jwt()
    user_id = int(claims["sub"])

    data = request.json or {}
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""

    if not current_password or not new_password:
        return {"error": "Current password and new password are required"}, 400

    if len(new_password) < 8:
        return {"error": "Password must be at least 8 characters"}, 400

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        "SELECT password_hash FROM users WHERE id=%s",
        (user_id,)
    )

    row = cursor.fetchone()

    if not row:
        cursor.close()
        db.close()
        return {"error": "User not found"}, 404

    password_hash = row[0]

    if not bcrypt.checkpw(
        current_password.encode("utf-8"),
        password_hash.encode("utf-8")
    ):
        cursor.close()
        db.close()
        return {"error": "Current password is incorrect"}, 401

    new_hash = hash_password(new_password)

    cursor.execute(
        "UPDATE users SET password_hash=%s, must_change_password=FALSE WHERE id=%s",
        (new_hash, user_id)
    )

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Password changed successfully"}


@app.route("/events", methods=["GET"])
@jwt_required()
def list_events():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT id, title, description, start_time, end_time,
               recurrence_rule, recurrence_end, created_by, created_at, timezone
        FROM events
        ORDER BY start_time ASC
    """)

    rows = cursor.fetchall()
    cursor.close()
    db.close()

    window_end = (datetime.now() + timedelta(days=RECURRENCE_WINDOW_DAYS)).date()
    events = []

    for r in rows:
        (event_id, title, description, start_time, end_time,
         recurrence_rule, recurrence_end, created_by, created_at, event_tz) = r

        duration = (end_time - start_time) if (end_time and start_time) else None
        occurrence_dates = expand_recurrence(
            start_time.date(), recurrence_rule, recurrence_end, window_end
        )

        for occurrence_date in occurrence_dates:
            is_base = occurrence_date == start_time.date()
            occurrence_start = datetime.combine(occurrence_date, start_time.time())
            occurrence_end = (occurrence_start + duration) if duration else None

            events.append({
                "id": event_id,
                "occurrence_id": f"{event_id}" if is_base else f"{event_id}-{occurrence_date.isoformat()}",
                "is_generated": not is_base,
                "title": title,
                "description": description,
                "start_time": localize_iso(occurrence_start, event_tz),
                "end_time": localize_iso(occurrence_end, event_tz),
                "timezone": event_tz,
                "recurrence_rule": recurrence_rule,
                "recurrence_end": recurrence_end.isoformat() if recurrence_end else None,
                "created_by": created_by,
                "created_at": created_at.isoformat() if created_at else None
            })

    return {"events": events}


@app.route("/events", methods=["POST"])
@jwt_required()
def create_event():
    claims = get_jwt()
    user_id = int(claims["sub"])

    data = request.json or {}
    title = data.get("title")
    start_time = data.get("start_time")

    if not title or not start_time:
        return {"error": "title and start_time are required"}, 400

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        """
        INSERT INTO events
            (title, description, start_time, end_time, recurrence_rule,
             recurrence_end, timezone, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            title,
            data.get("description"),
            start_time,
            data.get("end_time"),
            data.get("recurrence_rule") or "none",
            data.get("recurrence_end") or None,
            data.get("timezone") or None,
            user_id
        )
    )

    db.commit()
    new_id = cursor.lastrowid
    cursor.close()
    db.close()

    return {"id": new_id}, 201


@app.route("/events/<int:event_id>", methods=["PUT"])
@jwt_required()
def update_event(event_id):
    data = request.json or {}

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        """
        UPDATE events
        SET title=%s, description=%s, start_time=%s, end_time=%s,
            recurrence_rule=%s, recurrence_end=%s, timezone=%s
        WHERE id=%s
        """,
        (
            data.get("title"),
            data.get("description"),
            data.get("start_time"),
            data.get("end_time"),
            data.get("recurrence_rule") or "none",
            data.get("recurrence_end") or None,
            data.get("timezone") or None,
            event_id
        )
    )

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Event updated"}


@app.route("/events/<int:event_id>", methods=["DELETE"])
@jwt_required()
def delete_event(event_id):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("DELETE FROM events WHERE id=%s", (event_id,))

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Event deleted"}


@app.route("/chores", methods=["GET"])
@jwt_required()
def list_chores():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT id, title, description, assigned_to, due_date, is_done,
               recurrence_rule, recurrence_end, rotation_members, created_by, created_at
        FROM chores
        ORDER BY is_done ASC, due_date ASC
    """)

    rows = cursor.fetchall()
    cursor.close()
    db.close()

    window_end = (datetime.now() + timedelta(days=RECURRENCE_WINDOW_DAYS)).date()
    chores = []

    for r in rows:
        (chore_id, title, description, assigned_to, due_date, is_done,
         recurrence_rule, recurrence_end, rotation_members_raw, created_by, created_at) = r

        try:
            rotation_members = json.loads(rotation_members_raw) if rotation_members_raw else None
        except (TypeError, ValueError):
            rotation_members = None

        if due_date is None:
            occurrence_dates = [None]
        else:
            occurrence_dates = expand_recurrence(
                due_date, recurrence_rule, recurrence_end, window_end
            )

        for occurrence_index, occurrence_date in enumerate(occurrence_dates):
            is_base = occurrence_date is None or occurrence_date == due_date

            occurrence_assigned_to = assigned_to
            if rotation_members:
                occurrence_assigned_to = rotation_members[occurrence_index % len(rotation_members)]

            chores.append({
                "id": chore_id,
                "occurrence_id": f"{chore_id}" if is_base else f"{chore_id}-{occurrence_date.isoformat()}",
                "is_generated": not is_base,
                "title": title,
                "description": description,
                "assigned_to": occurrence_assigned_to,
                "rotation_members": rotation_members,
                "due_date": occurrence_date.isoformat() if occurrence_date else None,
                "is_done": bool(is_done),
                "recurrence_rule": recurrence_rule,
                "recurrence_end": recurrence_end.isoformat() if recurrence_end else None,
                "created_by": created_by,
                "created_at": created_at.isoformat() if created_at else None
            })

    return {"chores": chores}


@app.route("/chores", methods=["POST"])
@jwt_required()
def create_chore():
    claims = get_jwt()
    user_id = int(claims["sub"])

    data = request.json or {}
    title = data.get("title")

    if not title:
        return {"error": "title is required"}, 400

    db = get_db()
    cursor = db.cursor()

    rotation_members = data.get("rotation_members")
    rotation_members_json = json.dumps(rotation_members) if rotation_members else None

    cursor.execute(
        """
        INSERT INTO chores
            (title, description, assigned_to, due_date, recurrence_rule, recurrence_end,
             rotation_members, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            title,
            data.get("description"),
            data.get("assigned_to"),
            data.get("due_date"),
            data.get("recurrence_rule") or "none",
            data.get("recurrence_end") or None,
            rotation_members_json,
            user_id
        )
    )

    db.commit()
    new_id = cursor.lastrowid
    cursor.close()
    db.close()

    return {"id": new_id}, 201


@app.route("/chores/<int:chore_id>", methods=["PUT"])
@jwt_required()
def update_chore(chore_id):
    data = request.json or {}

    db = get_db()
    cursor = db.cursor()

    rotation_members = data.get("rotation_members")
    rotation_members_json = json.dumps(rotation_members) if rotation_members else None

    cursor.execute(
        """
        UPDATE chores
        SET title=%s, description=%s, assigned_to=%s, due_date=%s, is_done=%s,
            recurrence_rule=%s, recurrence_end=%s, rotation_members=%s
        WHERE id=%s
        """,
        (
            data.get("title"),
            data.get("description"),
            data.get("assigned_to"),
            data.get("due_date"),
            bool(data.get("is_done", False)),
            data.get("recurrence_rule") or "none",
            data.get("recurrence_end") or None,
            rotation_members_json,
            chore_id
        )
    )

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Chore updated"}


@app.route("/chores/<int:chore_id>/toggle", methods=["PUT"])
@jwt_required()
def toggle_chore(chore_id):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT is_done FROM chores WHERE id=%s", (chore_id,))
    row = cursor.fetchone()

    if not row:
        cursor.close()
        db.close()
        return {"error": "Chore not found"}, 404

    cursor.execute(
        "UPDATE chores SET is_done=%s WHERE id=%s",
        (not bool(row[0]), chore_id)
    )

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Chore toggled"}


@app.route("/chores/<int:chore_id>", methods=["DELETE"])
@jwt_required()
def delete_chore(chore_id):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("DELETE FROM chores WHERE id=%s", (chore_id,))

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Chore deleted"}


@app.route("/meals", methods=["GET"])
@jwt_required()
def list_meals():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT id, meal_date, meal_type, title, notes, created_by, created_at
        FROM meals
        ORDER BY meal_date ASC
    """)

    rows = cursor.fetchall()
    cursor.close()
    db.close()

    return {
        "meals": [
            {
                "id": r[0],
                "meal_date": r[1].isoformat() if r[1] else None,
                "meal_type": r[2],
                "title": r[3],
                "notes": r[4],
                "created_by": r[5],
                "created_at": r[6].isoformat() if r[6] else None
            }
            for r in rows
        ]
    }


@app.route("/meals", methods=["POST"])
@jwt_required()
def create_meal():
    claims = get_jwt()
    user_id = int(claims["sub"])

    data = request.json or {}
    meal_date = data.get("meal_date")
    meal_type = data.get("meal_type")
    title = data.get("title")

    if not meal_date or not meal_type or not title:
        return {"error": "meal_date, meal_type and title are required"}, 400

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        """
        INSERT INTO meals (meal_date, meal_type, title, notes, created_by)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (meal_date, meal_type, title, data.get("notes"), user_id)
    )

    db.commit()
    new_id = cursor.lastrowid
    cursor.close()
    db.close()

    return {"id": new_id}, 201


@app.route("/meals/<int:meal_id>", methods=["PUT"])
@jwt_required()
def update_meal(meal_id):
    data = request.json or {}

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        """
        UPDATE meals
        SET meal_date=%s, meal_type=%s, title=%s, notes=%s
        WHERE id=%s
        """,
        (
            data.get("meal_date"),
            data.get("meal_type"),
            data.get("title"),
            data.get("notes"),
            meal_id
        )
    )

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Meal updated"}


@app.route("/meals/<int:meal_id>", methods=["DELETE"])
@jwt_required()
def delete_meal(meal_id):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("DELETE FROM meals WHERE id=%s", (meal_id,))

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Meal deleted"}


# ==========================================================================
# Drinks — "what can I make from my bar" (data from TheCocktailDB)
# ==========================================================================

COCKTAILDB_BASE = "https://www.thecocktaildb.com/api/json/v1/1"

_SPIRIT_WORDS = (
    "vodka", "gin", "rum", "whiskey", "whisky", "bourbon", "scotch", "tequila",
    "brandy", "cognac", "absinthe", "cachaca", "cachaça", "mezcal", "vermouth",
    "sake", "soju", "grappa", "everclear", "pisco", "aquavit", "wine",
    "champagne", "prosecco", "sherry", "port", "beer", "ale", "lager", "cider",
    "rye", "moonshine", "absolut", "bacardi", "smirnoff", "malibu", "corona",
    "guinness", "budweiser", "stout", "proof", "kirsch",
)
_LIQUEUR_WORDS = (
    "liqueur", "triple sec", "cointreau", "curacao", "curaçao", "amaretto",
    "kahlua", "baileys", "irish cream", "campari", "aperol", "chambord",
    "grand marnier", "midori", "sambuca", "chartreuse", "drambuie", "galliano",
    "frangelico", "st. germain", "st germain", "creme de", "crème de",
    "sloe gin", "advocaat", "limoncello", "peach schnapps", "schnapps", "amaro",
    "fernet", "benedictine", "ouzo", "aperitif", "bitters", "anisette", "anis",
    "pernod", "ricard", "pastis", "apfelkorn", "goldschlager",
)
_GARNISH_WORDS = (
    "peel", "zest", "twist", "wedge", "wheel", "sprig", "leaves", "leaf",
    "mint", "salt", "nutmeg", "cinnamon", "clove", "star anise", "olive",
    "celery", "cucumber", "basil", "rosemary", "umbrella", "garnish", "slice",
    "allspice", "cardamom", "coriander", "cayenne",
)
_FRUIT_WORDS = (
    "lemon", "lime", "orange", "strawberr", "banana", "pineapple", "apple",
    "peach", "mango", "raspberr", "blueberr", "cranberr", "grapefruit",
    "coconut", "watermelon", "kiwi", "pear", "grape", "pomegranate", "berries",
    "berry", "apricot", "passion fruit", "melon", "cherry",
)
_MIXER_WORDS = (
    "juice", "soda", "tonic", "cola", "coke", "pepsi", "sprite", "7-up", "7up",
    "ginger ale", "ginger beer", "water", "tea", "coffee", "milk", "cream",
    "lemonade", "syrup", "honey", "egg", "cordial", "puree", "purée", "sugar",
    "sweet and sour", "sour mix", "nectar", "tabasco", "worcestershire",
    "chocolate", "vanilla", "grenadine",
)


def categorize_ingredient(name):
    """Best-effort (category, is_alcohol) for a cocktail ingredient name.

    category is one of alcohol | liqueur | mixer | fruit | garnish | other.
    Order matters so that 'Orange juice' -> mixer and 'Orange peel' -> garnish
    while a bare 'Orange' -> fruit.
    """
    n = " ".join((name or "").split()).lower()

    def has(words):
        return any(w in n for w in words)

    # non-alcoholic "…beer"/"…ale" mixers must beat the spirit check below
    if any(x in n for x in ("ginger beer", "root beer", "ginger ale")):
        return ("mixer", False)
    if has(_GARNISH_WORDS) and not has(("juice", "liqueur", "syrup")):
        return ("garnish", False)
    if has(_LIQUEUR_WORDS):
        return ("liqueur", True)
    if has(_SPIRIT_WORDS):
        return ("alcohol", True)
    if has(_MIXER_WORDS):
        return ("mixer", False)
    if has(_FRUIT_WORDS):
        return ("fruit", False)
    return ("other", False)


def seed_drinks_from_cocktaildb():
    """Import the full TheCocktailDB dataset into the local drink tables.

    Iterates search.php?f=<letter> for a-z and 0-9 (the free tier returns full
    recipes this way), upserting drinks, their ingredients, and the recipe
    links. Idempotent: safe to re-run to refresh the catalog.
    """
    import string

    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT id, name, category FROM drink_ingredient_catalog")
    ing_cache = {name.strip().lower(): (iid, cat) for iid, name, cat in cursor.fetchall()}

    def ingredient_ref(raw):
        name = " ".join(raw.split()).strip()
        key = name.lower()
        if key in ing_cache:
            return ing_cache[key]
        # The DB's default collation is accent/case-insensitive, so variants like
        # 'Jägermeister' vs 'Jagermeister' map to the same UNIQUE(name) row. Look
        # up first (collation-aware) before inserting to avoid 1062 collisions.
        cursor.execute(
            "SELECT id, category FROM drink_ingredient_catalog WHERE name=%s", (name[:190],)
        )
        row = cursor.fetchone()
        if row:
            ing_cache[key] = (row[0], row[1])
            return ing_cache[key]
        category, is_alcohol = categorize_ingredient(name)
        try:
            cursor.execute(
                "INSERT INTO drink_ingredient_catalog (name, category, is_alcohol) VALUES (%s, %s, %s)",
                (name[:190], category, is_alcohol)
            )
            ing_cache[key] = (cursor.lastrowid, category)
        except mysql.connector.IntegrityError:
            cursor.execute(
                "SELECT id, category FROM drink_ingredient_catalog WHERE name=%s", (name[:190],)
            )
            row = cursor.fetchone()
            ing_cache[key] = (row[0], row[1])
        return ing_cache[key]

    processed = 0
    letters = list(string.ascii_lowercase) + [str(d) for d in range(10)]
    for ch in letters:
        try:
            resp = requests.get(f"{COCKTAILDB_BASE}/search.php?f={ch}", timeout=25)
            data = resp.json() or {}
        except Exception:
            continue
        for d in (data.get("drinks") or []):
            ext_id = str(d.get("idDrink"))
            cursor.execute("SELECT id FROM drink_catalog WHERE ext_id=%s", (ext_id,))
            row = cursor.fetchone()
            if row:
                drink_id = row[0]
                cursor.execute(
                    """UPDATE drink_catalog SET name=%s, category=%s, alcoholic=%s,
                       glass=%s, instructions=%s, thumb=%s WHERE id=%s""",
                    (d.get("strDrink"), d.get("strCategory"), d.get("strAlcoholic"),
                     d.get("strGlass"), d.get("strInstructions"),
                     d.get("strDrinkThumb"), drink_id)
                )
                cursor.execute("DELETE FROM drink_recipe_ingredients WHERE drink_id=%s", (drink_id,))
            else:
                cursor.execute(
                    """INSERT INTO drink_catalog
                       (ext_id, name, category, alcoholic, glass, instructions, thumb)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    (ext_id, d.get("strDrink"), d.get("strCategory"),
                     d.get("strAlcoholic"), d.get("strGlass"),
                     d.get("strInstructions"), d.get("strDrinkThumb"))
                )
                drink_id = cursor.lastrowid
            processed += 1
            for i in range(1, 16):
                raw = d.get(f"strIngredient{i}")
                if not raw or not raw.strip():
                    continue
                measure = (d.get(f"strMeasure{i}") or "").strip()
                iid, cat = ingredient_ref(raw)
                m = measure.lower()
                is_garnish = (cat == "garnish") or any(
                    h in m for h in ("garnish", "wedge", "twist", "peel", "zest",
                                     "slice", "sprig", "wheel", "rim", "leaves")
                )
                cursor.execute(
                    """INSERT INTO drink_recipe_ingredients
                       (drink_id, ingredient_id, measure, is_garnish, position)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (drink_id, iid, measure[:190], is_garnish, i)
                )
        db.commit()

    cursor.execute("SELECT COUNT(*) FROM drink_catalog")
    total_drinks = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM drink_ingredient_catalog")
    total_ings = cursor.fetchone()[0]
    cursor.close()
    db.close()
    return {"drinks": total_drinks, "ingredients": total_ings, "processed": processed}


@app.route("/drinks/seed", methods=["POST"])
@jwt_required()
def drinks_seed():
    if not admin_required():
        return {"error": "Admin access required"}, 403
    return seed_drinks_from_cocktaildb()


@app.route("/drinks/ingredients", methods=["GET"])
@jwt_required()
def drinks_ingredients():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT c.id, c.name, c.category, c.is_alcohol, COUNT(r.id)
        FROM drink_ingredient_catalog c
        LEFT JOIN drink_recipe_ingredients r ON r.ingredient_id = c.id
        GROUP BY c.id, c.name, c.category, c.is_alcohol
        ORDER BY c.category, c.name
    """)
    rows = cursor.fetchall()
    cursor.close()
    db.close()
    return {
        "ingredients": [
            {
                "id": r[0],
                "name": r[1],
                "category": r[2],
                "is_alcohol": bool(r[3]),
                "drink_count": r[4]
            }
            for r in rows
        ]
    }


@app.route("/drinks/bar", methods=["GET"])
@jwt_required()
def drinks_get_bar():
    user_id = int(get_jwt()["sub"])
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT ingredient_id FROM user_bar WHERE user_id=%s", (user_id,))
    ids = [r[0] for r in cursor.fetchall()]
    cursor.close()
    db.close()
    return {"ingredient_ids": ids}


@app.route("/drinks/bar", methods=["PUT"])
@jwt_required()
def drinks_set_bar():
    user_id = int(get_jwt()["sub"])
    data = request.json or {}
    try:
        ids = [int(x) for x in (data.get("ingredient_ids") or [])]
    except (TypeError, ValueError):
        return {"error": "ingredient_ids must be a list of integers"}, 400

    db = get_db()
    cursor = db.cursor()
    cursor.execute("DELETE FROM user_bar WHERE user_id=%s", (user_id,))
    if ids:
        cursor.executemany(
            "INSERT IGNORE INTO user_bar (user_id, ingredient_id) VALUES (%s, %s)",
            [(user_id, i) for i in ids]
        )
    db.commit()
    cursor.close()
    db.close()
    return {"ingredient_ids": ids}


@app.route("/drinks/match", methods=["GET"])
@jwt_required()
def drinks_match():
    user_id = int(get_jwt()["sub"])
    garnish_optional = request.args.get("garnish_optional", "1") not in ("0", "false", "no")
    alcoholic_only = request.args.get("alcoholic_only", "1") not in ("0", "false", "no")

    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT ingredient_id FROM user_bar WHERE user_id=%s", (user_id,))
    have = {r[0] for r in cursor.fetchall()}

    cursor.execute("SELECT id, name, category, alcoholic, glass, thumb FROM drink_catalog")
    drinks = {
        r[0]: {"id": r[0], "name": r[1], "category": r[2], "alcoholic": r[3],
               "glass": r[4], "thumb": r[5]}
        for r in cursor.fetchall()
    }
    cursor.execute("""
        SELECT r.drink_id, r.ingredient_id, c.name, r.is_garnish
        FROM drink_recipe_ingredients r
        JOIN drink_ingredient_catalog c ON c.id = r.ingredient_id
        ORDER BY r.position
    """)
    recipe = {}
    for did, iid, iname, is_garnish in cursor.fetchall():
        recipe.setdefault(did, []).append((iid, iname, bool(is_garnish)))
    cursor.close()
    db.close()

    can_make, missing_one = [], []
    for did, meta in drinks.items():
        if alcoholic_only and "non" in (meta["alcoholic"] or "").lower():
            continue
        items = recipe.get(did, [])
        required = [(iid, iname) for iid, iname, g in items if not (garnish_optional and g)]
        if not required:
            continue
        missing = [iname for iid, iname in required if iid not in have]
        entry = {
            **meta,
            "ingredients": [iname for _, iname, _ in items],
            "have_count": len(required) - len(missing),
            "required_count": len(required)
        }
        if not missing:
            can_make.append(entry)
        elif len(missing) == 1 and entry["have_count"] >= 1:
            entry["missing"] = missing
            missing_one.append(entry)

    can_make.sort(key=lambda d: (d["name"] or "").lower())
    missing_one.sort(key=lambda d: (d["name"] or "").lower())
    return {"can_make": can_make, "missing_one": missing_one, "have_count": len(have)}


@app.route("/drinks/<int:drink_id>", methods=["GET"])
@jwt_required()
def drinks_detail(drink_id):
    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "SELECT id, name, category, alcoholic, glass, instructions, thumb FROM drink_catalog WHERE id=%s",
        (drink_id,)
    )
    r = cursor.fetchone()
    if not r:
        cursor.close()
        db.close()
        return {"error": "Not found"}, 404
    cursor.execute("""
        SELECT c.name, r.measure, r.is_garnish
        FROM drink_recipe_ingredients r
        JOIN drink_ingredient_catalog c ON c.id = r.ingredient_id
        WHERE r.drink_id=%s ORDER BY r.position
    """, (drink_id,))
    ings = [{"name": x[0], "measure": x[1], "is_garnish": bool(x[2])} for x in cursor.fetchall()]
    cursor.close()
    db.close()
    return {
        "id": r[0], "name": r[1], "category": r[2], "alcoholic": r[3],
        "glass": r[4], "instructions": r[5], "thumb": r[6], "ingredients": ings
    }


@app.route("/shopping", methods=["GET"])
@jwt_required()
def list_shopping_items():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT id, name, quantity, is_checked, meal_id, created_by, created_at
        FROM shopping_items
        ORDER BY is_checked ASC, created_at ASC
    """)

    rows = cursor.fetchall()
    cursor.close()
    db.close()

    return {
        "items": [
            {
                "id": r[0],
                "name": r[1],
                "quantity": r[2],
                "is_checked": bool(r[3]),
                "meal_id": r[4],
                "created_by": r[5],
                "created_at": r[6].isoformat() if r[6] else None
            }
            for r in rows
        ]
    }


@app.route("/shopping", methods=["POST"])
@jwt_required()
def create_shopping_item():
    claims = get_jwt()
    user_id = int(claims["sub"])

    data = request.json or {}
    name = data.get("name")

    if not name:
        return {"error": "name is required"}, 400

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        """
        INSERT INTO shopping_items (name, quantity, meal_id, created_by)
        VALUES (%s, %s, %s, %s)
        """,
        (name, data.get("quantity"), data.get("meal_id"), user_id)
    )

    db.commit()
    new_id = cursor.lastrowid
    cursor.close()
    db.close()

    return {"id": new_id}, 201


@app.route("/shopping/<int:item_id>/toggle", methods=["PUT"])
@jwt_required()
def toggle_shopping_item(item_id):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT is_checked FROM shopping_items WHERE id=%s", (item_id,))
    row = cursor.fetchone()

    if not row:
        cursor.close()
        db.close()
        return {"error": "Item not found"}, 404

    cursor.execute(
        "UPDATE shopping_items SET is_checked=%s WHERE id=%s",
        (not bool(row[0]), item_id)
    )

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Item toggled"}


@app.route("/shopping/<int:item_id>", methods=["DELETE"])
@jwt_required()
def delete_shopping_item(item_id):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("DELETE FROM shopping_items WHERE id=%s", (item_id,))

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Item deleted"}


@app.route("/shopping/clear-checked", methods=["DELETE"])
@jwt_required()
def clear_checked_shopping_items():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("DELETE FROM shopping_items WHERE is_checked=TRUE")

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Checked items cleared"}


@app.route("/photos", methods=["GET"])
@jwt_required()
def list_photos():
    claims = get_jwt()
    user_id = int(claims["sub"])

    scope = request.args.get("scope", "mine")

    db = get_db()
    cursor = db.cursor()

    if scope == "shared":
        cursor.execute("""
            SELECT id, filename, original_name, caption, visibility, uploaded_by, created_at
            FROM photos
            WHERE visibility='shared'
            ORDER BY created_at DESC
        """)
    else:
        cursor.execute("""
            SELECT id, filename, original_name, caption, visibility, uploaded_by, created_at
            FROM photos
            WHERE uploaded_by=%s
            ORDER BY created_at DESC
        """, (user_id,))

    rows = cursor.fetchall()
    cursor.close()
    db.close()

    return {
        "photos": [
            {
                "id": r[0],
                "filename": r[1],
                "original_name": r[2],
                "caption": r[3],
                "visibility": r[4],
                "url": f"/photos/file/{r[1]}",
                "uploaded_by": r[5],
                "is_mine": r[5] == user_id,
                "created_at": r[6].isoformat() if r[6] else None
            }
            for r in rows
        ]
    }


@app.route("/photos", methods=["POST"])
@jwt_required()
def upload_photo():
    claims = get_jwt()
    user_id = int(claims["sub"])

    if "file" not in request.files:
        return {"error": "No file provided"}, 400

    file = request.files["file"]

    if not file.filename or not allowed_photo_file(file.filename):
        return {"error": "Unsupported file type"}, 400

    visibility = request.form.get("visibility") or "private"
    if visibility not in ("private", "shared"):
        visibility = "private"

    original_name = secure_filename(file.filename)
    extension = original_name.rsplit(".", 1)[1].lower()
    stored_name = f"{uuid.uuid4().hex}.{extension}"

    file.save(os.path.join(UPLOAD_FOLDER, stored_name))

    caption = request.form.get("caption")

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        """
        INSERT INTO photos (filename, original_name, caption, visibility, uploaded_by)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (stored_name, original_name, caption, visibility, user_id)
    )

    db.commit()
    new_id = cursor.lastrowid
    cursor.close()
    db.close()

    return {"id": new_id, "filename": stored_name}, 201


@app.route("/photos/file/<path:filename>")
def serve_photo_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route("/photos/<int:photo_id>", methods=["DELETE"])
@jwt_required()
def delete_photo(photo_id):
    claims = get_jwt()
    user_id = int(claims["sub"])

    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT filename, uploaded_by FROM photos WHERE id=%s", (photo_id,))
    row = cursor.fetchone()

    if not row:
        cursor.close()
        db.close()
        return {"error": "Photo not found"}, 404

    filename, uploaded_by = row

    if uploaded_by != user_id and not admin_required():
        cursor.close()
        db.close()
        return {"error": "You can only delete your own photos"}, 403

    cursor.execute("DELETE FROM photos WHERE id=%s", (photo_id,))
    db.commit()
    cursor.close()
    db.close()

    file_path = os.path.join(UPLOAD_FOLDER, filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    return {"message": "Photo deleted"}


@app.route("/videos", methods=["GET"])
@jwt_required()
def list_videos():
    claims = get_jwt()
    user_id = int(claims["sub"])

    scope = request.args.get("scope", "mine")

    db = get_db()
    cursor = db.cursor()

    if scope == "shared":
        cursor.execute("""
            SELECT id, filename, original_name, caption, visibility, file_size, uploaded_by, created_at
            FROM videos
            WHERE visibility='shared'
            ORDER BY created_at DESC
        """)
    else:
        cursor.execute("""
            SELECT id, filename, original_name, caption, visibility, file_size, uploaded_by, created_at
            FROM videos
            WHERE uploaded_by=%s
            ORDER BY created_at DESC
        """, (user_id,))

    rows = cursor.fetchall()
    cursor.close()
    db.close()

    return {
        "videos": [
            {
                "id": r[0],
                "filename": r[1],
                "original_name": r[2],
                "caption": r[3],
                "visibility": r[4],
                "file_size": r[5],
                "url": f"/videos/file/{r[1]}",
                "uploaded_by": r[6],
                "is_mine": r[6] == user_id,
                "created_at": r[7].isoformat() if r[7] else None
            }
            for r in rows
        ]
    }


@app.route("/videos", methods=["POST"])
@jwt_required()
def upload_video():
    claims = get_jwt()
    user_id = int(claims["sub"])

    if "file" not in request.files:
        return {"error": "No file provided"}, 400

    file = request.files["file"]

    if not file.filename or not allowed_video_file(file.filename):
        return {"error": "Unsupported file type. Use mp4, webm, ogg, or mov."}, 400

    visibility = request.form.get("visibility") or "private"
    if visibility not in ("private", "shared"):
        visibility = "private"

    original_name = secure_filename(file.filename)
    extension = original_name.rsplit(".", 1)[1].lower()
    stored_name = f"{uuid.uuid4().hex}.{extension}"
    stored_path = os.path.join(VIDEO_UPLOAD_FOLDER, stored_name)

    file.save(stored_path)
    file_size = os.path.getsize(stored_path)

    caption = request.form.get("caption")

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        """
        INSERT INTO videos (filename, original_name, caption, visibility, file_size, uploaded_by)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (stored_name, original_name, caption, visibility, file_size, user_id)
    )

    db.commit()
    new_id = cursor.lastrowid
    cursor.close()
    db.close()

    return {"id": new_id, "filename": stored_name}, 201


@app.route("/videos/file/<path:filename>")
def serve_video_file(filename):
    return send_from_directory(VIDEO_UPLOAD_FOLDER, filename, conditional=True)


@app.route("/videos/<int:video_id>", methods=["DELETE"])
@jwt_required()
def delete_video(video_id):
    claims = get_jwt()
    user_id = int(claims["sub"])

    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT filename, uploaded_by FROM videos WHERE id=%s", (video_id,))
    row = cursor.fetchone()

    if not row:
        cursor.close()
        db.close()
        return {"error": "Video not found"}, 404

    filename, uploaded_by = row

    if uploaded_by != user_id and not admin_required():
        cursor.close()
        db.close()
        return {"error": "You can only delete your own videos"}, 403

    cursor.execute("DELETE FROM videos WHERE id=%s", (video_id,))
    db.commit()
    cursor.close()
    db.close()

    file_path = os.path.join(VIDEO_UPLOAD_FOLDER, filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    return {"message": "Video deleted"}


def resolve_local_video_path(relpath):
    """Resolve relpath against the configured local video folder, rejecting any
    path that would escape it (path traversal protection)."""
    base_dir = os.path.realpath(get_app_settings()["local_video_folder"])
    candidate = os.path.realpath(os.path.join(base_dir, relpath))

    if candidate != base_dir and not candidate.startswith(base_dir + os.sep):
        return None, base_dir

    return candidate, base_dir


@app.route("/local-videos", methods=["GET"])
@jwt_required()
def list_local_videos():
    if not admin_required():
        return {"error": "Admins only"}, 403
    base_dir = get_app_settings()["local_video_folder"]

    if not os.path.isdir(base_dir):
        return {"error": f"Local video folder not found: {base_dir}", "folders": [], "videos": []}, 200

    requested_path = request.args.get("path", "")
    target_dir, resolved_base = resolve_local_video_path(requested_path)

    if not target_dir or not os.path.isdir(target_dir):
        return {"error": "Folder not found", "folders": [], "videos": []}, 404

    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT source_path, status, output_filename, error_message FROM video_conversions")
    conversions = {
        row[0]: {"status": row[1], "output_filename": row[2], "error_message": row[3]}
        for row in cursor.fetchall()
    }
    cursor.close()
    db.close()

    folders = []
    videos = []

    try:
        entries = list(os.scandir(target_dir))
    except OSError as e:
        return {"error": str(e), "folders": [], "videos": []}, 500

    for entry in entries:
        rel_path = os.path.relpath(entry.path, resolved_base).replace(os.sep, "/")

        if entry.is_dir():
            folders.append({
                "name": entry.name,
                "path": rel_path
            })
            continue

        name = entry.name
        extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""

        if extension not in LOCAL_VIDEO_EXTENSIONS:
            continue

        try:
            stat = entry.stat()
        except OSError:
            continue

        conversion = conversions.get(rel_path)
        conversion_status = conversion["status"] if conversion else None

        video = {
            "name": name,
            "path": rel_path,
            "size": stat.st_size,
            "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "url": f"/local-videos/file/{rel_path}?token={sign_video_ref(rel_path)}",
            "playable_in_browser": extension in ALLOWED_VIDEO_EXTENSIONS,
            "conversion_status": conversion_status
        }

        if conversion_status == "done":
            video["playable_in_browser"] = True
            video["url"] = f"/local-videos/converted/{conversion['output_filename']}?token={sign_video_ref(conversion['output_filename'])}"

        videos.append(video)

    folders.sort(key=lambda f: f["name"].lower())
    videos.sort(key=lambda v: v["name"].lower())

    current_rel_path = os.path.relpath(target_dir, resolved_base).replace(os.sep, "/")
    if current_rel_path == ".":
        current_rel_path = ""

    return {
        "folder": base_dir,
        "current_path": current_rel_path,
        "folders": folders,
        "videos": videos
    }


@app.route("/local-videos/file/<path:relpath>")
def serve_local_video_file(relpath):
    if not verify_video_ref(request.args.get("token"), relpath):
        return {"error": "Invalid or expired link"}, 403

    candidate, base_dir = resolve_local_video_path(relpath)

    if not candidate:
        return {"error": "Invalid path"}, 403

    if not os.path.isfile(candidate):
        return {"error": "File not found"}, 404

    return send_file(candidate, conditional=True)


def probe_codec(path, stream_type):
    """stream_type is 'v' for video or 'a' for audio. Returns codec name or None."""
    try:
        result = subprocess.run(
            [
                FFPROBE_BIN, "-v", "error",
                "-select_streams", f"{stream_type}:0",
                "-show_entries", "stream=codec_name",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path
            ],
            capture_output=True, text=True, timeout=30
        )
        codec = result.stdout.strip()
        return codec or None
    except (subprocess.SubprocessError, OSError):
        return None


def set_conversion_status(source_path, status, output_filename=None, error_message=None):
    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        """
        INSERT INTO video_conversions (source_path, status, output_filename, error_message)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE status=%s, output_filename=%s, error_message=%s
        """,
        (source_path, status, output_filename, error_message,
         status, output_filename, error_message)
    )
    db.commit()
    cursor.close()
    db.close()


def get_conversion_status(source_path):
    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "SELECT status, output_filename, error_message FROM video_conversions WHERE source_path=%s",
        (source_path,)
    )
    row = cursor.fetchone()
    cursor.close()
    db.close()

    if not row:
        return None

    return {"status": row[0], "output_filename": row[1], "error_message": row[2]}


def run_ffmpeg(command):
    creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    return subprocess.run(
        command, capture_output=True, text=True, timeout=7200,
        creationflags=creation_flags
    )


def run_conversion(source_path_relative, source_full_path):
    set_conversion_status(source_path_relative, "running")

    output_filename = hashlib.sha256(source_path_relative.encode("utf-8")).hexdigest() + ".mp4"
    output_path = os.path.join(CONVERTED_VIDEO_FOLDER, output_filename)

    video_codec = probe_codec(source_full_path, "v")
    audio_codec = probe_codec(source_full_path, "a")

    needs_video_transcode = video_codec not in BROWSER_SAFE_VIDEO_CODECS
    audio_args = ["-c:a", "copy"] if audio_codec in BROWSER_SAFE_AUDIO_CODECS else ["-c:a", "aac", "-b:a", "192k"]

    if needs_video_transcode:
        # Try full GPU pipeline first (CUDA decode + NVENC encode) since it's 3-5x faster
        # than CPU x264 for a full transcode and keeps the CPU free. Fall back to
        # NVENC-encode-only (CPU decode), then full CPU libx264 if the GPU attempts fail
        # for any reason (driver issue, unsupported source format, etc).
        attempts = [
            (["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"],
             ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "23", "-b:v", "0"]),
            ([],
             ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "23", "-b:v", "0"]),
            ([],
             ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"])
        ]
    else:
        attempts = [([], ["-c:v", "copy"])]

    last_result = None

    for input_args, video_args in attempts:
        command = [
            FFMPEG_BIN, "-y", *input_args, "-i", source_full_path,
            *video_args, *audio_args,
            "-movflags", "+faststart",
            output_path
        ]

        try:
            last_result = run_ffmpeg(command)
        except subprocess.SubprocessError as e:
            set_conversion_status(source_path_relative, "failed", error_message=str(e))
            return

        if last_result.returncode == 0 and os.path.isfile(output_path):
            set_conversion_status(source_path_relative, "done", output_filename=output_filename)
            return

        # GPU attempt failed - clean up partial output and try the next (CPU) attempt, if any.
        if os.path.isfile(output_path):
            os.remove(output_path)

    set_conversion_status(
        source_path_relative, "failed",
        error_message=(last_result.stderr if last_result else "Unknown ffmpeg error")[-2000:]
    )


_conversion_queue = queue.Queue()


def _conversion_worker():
    while True:
        source_path_relative, source_full_path = _conversion_queue.get()
        try:
            run_conversion(source_path_relative, source_full_path)
        finally:
            _conversion_queue.task_done()


threading.Thread(target=_conversion_worker, daemon=True).start()


@app.route("/local-videos/convert", methods=["POST"])
@jwt_required()
def convert_local_video():
    if not admin_required():
        return {"error": "Admins only"}, 403
    data = request.json or {}
    relpath = data.get("path")

    if not relpath:
        return {"error": "path is required"}, 400

    candidate, _base_dir = resolve_local_video_path(relpath)

    if not candidate or not os.path.isfile(candidate):
        return {"error": "File not found"}, 404

    existing = get_conversion_status(relpath)
    if existing and existing["status"] in ("queued", "running", "done"):
        return {"message": "Conversion already queued or complete", "status": existing["status"]}

    set_conversion_status(relpath, "queued")
    _conversion_queue.put((relpath, candidate))

    return {"message": "Conversion queued"}, 202


@app.route("/local-videos/convert-status", methods=["GET"])
@jwt_required()
def convert_local_video_status():
    if not admin_required():
        return {"error": "Admins only"}, 403
    relpath = request.args.get("path")

    if not relpath:
        return {"error": "path is required"}, 400

    status = get_conversion_status(relpath)

    if not status:
        return {"status": "none"}

    if status["status"] == "done":
        status["url"] = f"/local-videos/converted/{status['output_filename']}?token={sign_video_ref(status['output_filename'])}"

    return status


@app.route("/local-videos/converted/<path:filename>")
def serve_converted_video(filename):
    if not verify_video_ref(request.args.get("token"), filename):
        return {"error": "Invalid or expired link"}, 403

    safe_name = secure_filename(filename)
    full_path = os.path.join(CONVERTED_VIDEO_FOLDER, safe_name)

    if not os.path.isfile(full_path):
        return {"error": "File not found"}, 404

    return send_file(full_path, conditional=True)


# ---------------------------------------------------------------------------
# Career / job search: resume PDFs + application tracker
# ---------------------------------------------------------------------------

@app.route("/resumes", methods=["GET"])
@jwt_required()
def list_resumes():
    claims = get_jwt()
    user_id = int(claims["sub"])

    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        """
        SELECT id, filename, original_name, label, file_size, uploaded_by, created_at
        FROM resumes
        WHERE uploaded_by=%s
        ORDER BY created_at DESC
        """,
        (user_id,)
    )
    rows = cursor.fetchall()
    cursor.close()
    db.close()

    return {
        "resumes": [
            {
                "id": r[0],
                "filename": r[1],
                "original_name": r[2],
                "label": r[3],
                "file_size": r[4],
                "url": f"/resumes/file/{r[1]}",
                "download_url": f"/resumes/{r[0]}/download",
                "uploaded_by": r[5],
                "created_at": r[6].isoformat() if r[6] else None
            }
            for r in rows
        ]
    }


@app.route("/resumes", methods=["POST"])
@jwt_required()
def upload_resume():
    claims = get_jwt()
    user_id = int(claims["sub"])

    if "file" not in request.files:
        return {"error": "No file provided"}, 400

    file = request.files["file"]

    if not file.filename or not allowed_resume_file(file.filename):
        return {"error": "Only PDF files are allowed"}, 400

    original_name = secure_filename(file.filename)
    stored_name = f"{uuid.uuid4().hex}.pdf"
    save_path = os.path.join(RESUME_UPLOAD_FOLDER, stored_name)
    file.save(save_path)

    file_size = os.path.getsize(save_path) if os.path.exists(save_path) else None
    label = request.form.get("label") or None

    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        """
        INSERT INTO resumes (filename, original_name, label, file_size, uploaded_by)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (stored_name, original_name, label, file_size, user_id)
    )
    db.commit()
    new_id = cursor.lastrowid
    cursor.close()
    db.close()

    return {"id": new_id, "filename": stored_name}, 201


@app.route("/resumes/file/<path:filename>")
def serve_resume_file(filename):
    # Unguessable uuid filename acts as the access capability (same model as
    # photos/videos). Served inline so it can be embedded in a PDF viewer.
    safe_name = secure_filename(filename)
    full_path = os.path.join(RESUME_UPLOAD_FOLDER, safe_name)
    if not os.path.isfile(full_path):
        return {"error": "File not found"}, 404
    return send_file(full_path, mimetype="application/pdf", conditional=True)


@app.route("/resumes/<int:resume_id>/download")
def download_resume(resume_id):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT filename, original_name FROM resumes WHERE id=%s", (resume_id,))
    row = cursor.fetchone()
    cursor.close()
    db.close()

    if not row:
        return {"error": "Resume not found"}, 404

    filename, original_name = row
    full_path = os.path.join(RESUME_UPLOAD_FOLDER, filename)
    if not os.path.isfile(full_path):
        return {"error": "File not found"}, 404

    return send_file(
        full_path,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=original_name or "resume.pdf"
    )


@app.route("/resumes/<int:resume_id>", methods=["DELETE"])
@jwt_required()
def delete_resume(resume_id):
    claims = get_jwt()
    user_id = int(claims["sub"])

    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT filename, uploaded_by FROM resumes WHERE id=%s", (resume_id,))
    row = cursor.fetchone()

    if not row:
        cursor.close()
        db.close()
        return {"error": "Resume not found"}, 404

    filename, uploaded_by = row
    if uploaded_by != user_id and not admin_required():
        cursor.close()
        db.close()
        return {"error": "You can only delete your own resumes"}, 403

    cursor.execute("DELETE FROM resumes WHERE id=%s", (resume_id,))
    db.commit()
    cursor.close()
    db.close()

    file_path = os.path.join(RESUME_UPLOAD_FOLDER, filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    return {"message": "Resume deleted"}


@app.route("/job-applications", methods=["GET"])
@jwt_required()
def list_job_applications():
    claims = get_jwt()
    user_id = int(claims["sub"])

    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        """
        SELECT id, company, role, source, status, location, url, notes,
               applied_date, created_at, updated_at
        FROM job_applications
        WHERE created_by=%s
        ORDER BY (applied_date IS NULL), applied_date DESC, created_at DESC
        """,
        (user_id,)
    )
    rows = cursor.fetchall()
    cursor.close()
    db.close()

    return {
        "applications": [
            {
                "id": r[0],
                "company": r[1],
                "role": r[2],
                "source": r[3],
                "status": r[4],
                "location": r[5],
                "url": r[6],
                "notes": r[7],
                "applied_date": r[8].isoformat() if r[8] else None,
                "created_at": r[9].isoformat() if r[9] else None,
                "updated_at": r[10].isoformat() if r[10] else None
            }
            for r in rows
        ]
    }


@app.route("/job-applications", methods=["POST"])
@jwt_required()
def create_job_application():
    claims = get_jwt()
    user_id = int(claims["sub"])

    data = request.json or {}
    company = (data.get("company") or "").strip()
    role = (data.get("role") or "").strip()

    if not company or not role:
        return {"error": "company and role are required"}, 400

    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        """
        INSERT INTO job_applications
            (company, role, source, status, location, url, notes, applied_date, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            company,
            role,
            data.get("source") or "other",
            data.get("status") or "saved",
            data.get("location") or None,
            data.get("url") or None,
            data.get("notes") or None,
            data.get("applied_date") or None,
            user_id
        )
    )
    db.commit()
    new_id = cursor.lastrowid
    cursor.close()
    db.close()

    return {"id": new_id}, 201


@app.route("/job-applications/<int:application_id>", methods=["PUT"])
@jwt_required()
def update_job_application(application_id):
    claims = get_jwt()
    user_id = int(claims["sub"])

    data = request.json or {}

    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "SELECT created_by FROM job_applications WHERE id=%s", (application_id,)
    )
    row = cursor.fetchone()
    if not row:
        cursor.close()
        db.close()
        return {"error": "Application not found"}, 404
    if row[0] != user_id and not admin_required():
        cursor.close()
        db.close()
        return {"error": "You can only edit your own applications"}, 403

    cursor.execute(
        """
        UPDATE job_applications
        SET company=%s, role=%s, source=%s, status=%s, location=%s,
            url=%s, notes=%s, applied_date=%s
        WHERE id=%s
        """,
        (
            data.get("company"),
            data.get("role"),
            data.get("source") or "other",
            data.get("status") or "saved",
            data.get("location") or None,
            data.get("url") or None,
            data.get("notes") or None,
            data.get("applied_date") or None,
            application_id
        )
    )
    db.commit()
    cursor.close()
    db.close()

    return {"message": "Application updated"}


@app.route("/job-applications/<int:application_id>", methods=["DELETE"])
@jwt_required()
def delete_job_application(application_id):
    claims = get_jwt()
    user_id = int(claims["sub"])

    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "SELECT created_by FROM job_applications WHERE id=%s", (application_id,)
    )
    row = cursor.fetchone()
    if not row:
        cursor.close()
        db.close()
        return {"error": "Application not found"}, 404
    if row[0] != user_id and not admin_required():
        cursor.close()
        db.close()
        return {"error": "You can only delete your own applications"}, 403

    cursor.execute("DELETE FROM job_applications WHERE id=%s", (application_id,))
    db.commit()
    cursor.close()
    db.close()

    return {"message": "Application deleted"}


@app.route("/push/vapid-public-key", methods=["GET"])
@jwt_required()
def push_vapid_public_key():
    public_key = get_vapid_public_key()

    if not public_key:
        return {"error": "Push notifications are not configured"}, 503

    return {"public_key": public_key}


@app.route("/push/subscribe", methods=["POST"])
@jwt_required()
def push_subscribe():
    claims = get_jwt()
    user_id = int(claims["sub"])

    data = request.json or {}
    subscription = data.get("subscription") or {}
    endpoint = subscription.get("endpoint")
    keys = subscription.get("keys") or {}
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")

    if not endpoint or not p256dh or not auth:
        return {"error": "Invalid subscription payload"}, 400

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        """
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE user_id=%s, p256dh=%s, auth=%s
        """,
        (user_id, endpoint, p256dh, auth, user_id, p256dh, auth)
    )

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Subscribed"}, 201


@app.route("/push/unsubscribe", methods=["POST"])
@jwt_required()
def push_unsubscribe():
    data = request.json or {}
    endpoint = data.get("endpoint")

    if not endpoint:
        return {"error": "endpoint is required"}, 400

    db = get_db()
    cursor = db.cursor()

    cursor.execute("DELETE FROM push_subscriptions WHERE endpoint=%s", (endpoint,))

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Unsubscribed"}


@app.route("/meals/<int:meal_id>/ingredients", methods=["GET"])
@jwt_required()
def list_meal_ingredients(meal_id):
    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        "SELECT id, name, quantity FROM meal_ingredients WHERE meal_id=%s ORDER BY id ASC",
        (meal_id,)
    )

    rows = cursor.fetchall()
    cursor.close()
    db.close()

    return {
        "ingredients": [
            {"id": r[0], "name": r[1], "quantity": r[2]}
            for r in rows
        ]
    }


@app.route("/meals/<int:meal_id>/ingredients", methods=["POST"])
@jwt_required()
def add_meal_ingredient(meal_id):
    data = request.json or {}
    name = data.get("name")

    if not name:
        return {"error": "name is required"}, 400

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        "INSERT INTO meal_ingredients (meal_id, name, quantity) VALUES (%s, %s, %s)",
        (meal_id, name, data.get("quantity"))
    )

    db.commit()
    new_id = cursor.lastrowid
    cursor.close()
    db.close()

    return {"id": new_id}, 201


@app.route("/meal-ingredients/<int:ingredient_id>", methods=["DELETE"])
@jwt_required()
def delete_meal_ingredient(ingredient_id):
    db = get_db()
    cursor = db.cursor()

    cursor.execute("DELETE FROM meal_ingredients WHERE id=%s", (ingredient_id,))

    db.commit()
    cursor.close()
    db.close()

    return {"message": "Ingredient deleted"}


@app.route("/meals/<int:meal_id>/add-to-shopping-list", methods=["POST"])
@jwt_required()
def add_meal_to_shopping_list(meal_id):
    claims = get_jwt()
    user_id = int(claims["sub"])

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        "SELECT name, quantity FROM meal_ingredients WHERE meal_id=%s ORDER BY id ASC",
        (meal_id,)
    )
    ingredients = cursor.fetchall()

    if not ingredients:
        cursor.execute("SELECT title FROM meals WHERE id=%s", (meal_id,))
        meal_row = cursor.fetchone()

        if not meal_row:
            cursor.close()
            db.close()
            return {"error": "Meal not found"}, 404

        ingredients = [(meal_row[0], None)]

    for name, quantity in ingredients:
        cursor.execute(
            "INSERT INTO shopping_items (name, quantity, meal_id, created_by) VALUES (%s, %s, %s, %s)",
            (name, quantity, meal_id, user_id)
        )

    db.commit()
    cursor.close()
    db.close()

    return {"message": f"Added {len(ingredients)} item(s) to shopping list"}, 201


@app.route("/stats/records", methods=["GET"])
@jwt_required()
def stats_records():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT timestamp, tempf FROM readings
        WHERE tempf IS NOT NULL ORDER BY tempf DESC LIMIT 1
    """)
    hottest = cursor.fetchone()

    cursor.execute("""
        SELECT timestamp, tempf FROM readings
        WHERE tempf IS NOT NULL ORDER BY tempf ASC LIMIT 1
    """)
    coldest = cursor.fetchone()

    cursor.execute("""
        SELECT timestamp, windgustmph FROM readings
        WHERE windgustmph IS NOT NULL ORDER BY windgustmph DESC LIMIT 1
    """)
    windiest = cursor.fetchone()

    cursor.execute("""
        SELECT DATE(timestamp) AS day, MAX(dailyrainin) AS total
        FROM readings
        WHERE dailyrainin IS NOT NULL
        GROUP BY day
        ORDER BY total DESC
        LIMIT 1
    """)
    rainiest = cursor.fetchone()

    cursor.execute("""
        SELECT AVG(tempf) FROM readings
        WHERE timestamp >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
    """)
    this_month_avg = cursor.fetchone()

    cursor.execute("""
        SELECT AVG(tempf) FROM readings
        WHERE timestamp >= DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01')
          AND timestamp < DATE_FORMAT(CURDATE(), '%Y-%m-01')
    """)
    last_month_avg = cursor.fetchone()

    cursor.close()
    db.close()

    def record(row, value_key):
        if not row or row[1] is None:
            return None
        return {
            "value": float(row[1]),
            "timestamp": row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0])
        }

    return {
        "hottest": record(hottest, "tempf"),
        "coldest": record(coldest, "tempf"),
        "windiest_gust": record(windiest, "windgustmph"),
        "rainiest_day": record(rainiest, "total"),
        "this_month_avg_temp": float(this_month_avg[0]) if this_month_avg and this_month_avg[0] is not None else None,
        "last_month_avg_temp": float(last_month_avg[0]) if last_month_avg and last_month_avg[0] is not None else None
    }


@app.route("/settings/app", methods=["GET"])
@jwt_required()
def get_app_settings_route():
    return get_app_settings()


@app.route("/settings/app", methods=["PUT"])
@jwt_required()
def update_app_settings_route():
    if not admin_required():
        return {"error": "Admin access required"}, 403

    data = request.json or {}

    current = get_app_settings()

    updated = {
        "dashboard_title": data.get("dashboard_title", current["dashboard_title"]),
        "station_name": data.get("station_name", current["station_name"]),
        "station_lat": data.get("station_lat", current["station_lat"]),
        "station_lon": data.get("station_lon", current["station_lon"]),
        "wind_alert_threshold": data.get("wind_alert_threshold", current["wind_alert_threshold"]),
        "uv_alert_threshold": data.get("uv_alert_threshold", current["uv_alert_threshold"]),
        "rain_alert_threshold": data.get("rain_alert_threshold", current["rain_alert_threshold"]),
        "local_video_folder": data.get("local_video_folder", current["local_video_folder"]),
        "accent_color": data.get("accent_color", current["accent_color"]),
        "family_photo": data.get("family_photo", current["family_photo"]),
        "announcement": data.get("announcement", current["announcement"])
    }

    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        UPDATE app_settings
        SET dashboard_title=%s, station_name=%s, station_lat=%s, station_lon=%s,
            wind_alert_threshold=%s, uv_alert_threshold=%s, rain_alert_threshold=%s,
            local_video_folder=%s, accent_color=%s, family_photo=%s, announcement=%s
        WHERE id=1
    """, (
        updated["dashboard_title"], updated["station_name"],
        updated["station_lat"], updated["station_lon"],
        updated["wind_alert_threshold"], updated["uv_alert_threshold"], updated["rain_alert_threshold"],
        updated["local_video_folder"], updated["accent_color"], updated["family_photo"], updated["announcement"]
    ))
    db.commit()
    cursor.close()
    db.close()

    get_app_settings(force_refresh=True)
    _points_cache["data"] = None
    _forecast_cache["data"] = None
    _forecast_hourly_cache["data"] = None

    return {"message": "Settings updated"}


@app.route("/settings/family-photo", methods=["POST"])
@jwt_required()
def upload_family_photo():
    if not admin_required():
        return {"error": "Admin access required"}, 403

    if "file" not in request.files:
        return {"error": "No file provided"}, 400

    file = request.files["file"]
    if not file.filename or not allowed_photo_file(file.filename):
        return {"error": "Unsupported file type. Use png, jpg, jpeg, gif, or webp."}, 400

    original_name = secure_filename(file.filename)
    extension = original_name.rsplit(".", 1)[1].lower()
    stored_name = f"family_{uuid.uuid4().hex}.{extension}"
    file.save(os.path.join(UPLOAD_FOLDER, stored_name))

    db = get_db()
    cursor = db.cursor()
    # remove the previous family photo file so uploads don't accumulate
    cursor.execute("SELECT family_photo FROM app_settings WHERE id=1")
    prev = cursor.fetchone()
    if prev and prev[0]:
        old_path = os.path.join(UPLOAD_FOLDER, prev[0])
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass
    cursor.execute("UPDATE app_settings SET family_photo=%s WHERE id=1", (stored_name,))
    db.commit()
    cursor.close()
    db.close()

    get_app_settings(force_refresh=True)
    return {"family_photo": stored_name}, 201


@app.route("/messages", methods=["GET"])
@jwt_required()
def list_messages():
    claims = get_jwt()
    user_id = int(claims["sub"])

    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT id, user_id, author, body, created_at
        FROM messages
        ORDER BY created_at DESC, id DESC
        LIMIT 200
    """)
    rows = cursor.fetchall()
    cursor.close()
    db.close()

    return {
        "messages": [
            {
                "id": r[0],
                "author": r[2] or "Unknown",
                "body": r[3],
                "created_at": r[4].isoformat() if r[4] else None,
                "is_mine": r[1] == user_id
            }
            for r in rows
        ]
    }


@app.route("/messages", methods=["POST"])
@jwt_required()
def post_message():
    claims = get_jwt()
    user_id = int(claims["sub"])
    author = claims.get("username") or "Unknown"

    data = request.json or {}
    body = (data.get("body") or "").strip()
    if not body:
        return {"error": "Message cannot be empty"}, 400
    if len(body) > 2000:
        return {"error": "Message is too long (2000 char max)"}, 400

    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO messages (user_id, author, body) VALUES (%s, %s, %s)",
        (user_id, author, body)
    )
    db.commit()
    new_id = cursor.lastrowid
    cursor.close()
    db.close()

    return {"id": new_id}, 201


@app.route("/messages/<int:message_id>", methods=["DELETE"])
@jwt_required()
def delete_message(message_id):
    claims = get_jwt()
    user_id = int(claims["sub"])

    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT user_id FROM messages WHERE id=%s", (message_id,))
    row = cursor.fetchone()
    if not row:
        cursor.close()
        db.close()
        return {"error": "Message not found"}, 404
    if row[0] != user_id and not admin_required():
        cursor.close()
        db.close()
        return {"error": "You can only delete your own messages"}, 403

    cursor.execute("DELETE FROM messages WHERE id=%s", (message_id,))
    db.commit()
    cursor.close()
    db.close()
    return {"message": "Message deleted"}


@app.route("/settings/user", methods=["GET"])
@jwt_required()
def get_user_settings_route():
    claims = get_jwt()
    user_id = int(claims["sub"])

    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT notify_wind, notify_uv, notify_rain, temperature_unit, timezone
        FROM user_settings WHERE user_id=%s
    """, (user_id,))
    row = cursor.fetchone()
    cursor.close()
    db.close()

    if not row:
        return {
            "notify_wind": True,
            "notify_uv": True,
            "notify_rain": True,
            "temperature_unit": "F",
            "timezone": None
        }

    return {
        "notify_wind": bool(row[0]),
        "notify_uv": bool(row[1]),
        "notify_rain": bool(row[2]),
        "temperature_unit": row[3],
        "timezone": row[4]
    }


@app.route("/settings/user", methods=["PUT"])
@jwt_required()
def update_user_settings_route():
    claims = get_jwt()
    user_id = int(claims["sub"])

    data = request.json or {}

    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        """
        INSERT INTO user_settings (user_id, notify_wind, notify_uv, notify_rain, temperature_unit, timezone)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            notify_wind=%s, notify_uv=%s, notify_rain=%s, temperature_unit=%s, timezone=%s
        """,
        (
            user_id,
            bool(data.get("notify_wind", True)),
            bool(data.get("notify_uv", True)),
            bool(data.get("notify_rain", True)),
            data.get("temperature_unit", "F"),
            data.get("timezone") or None,
            bool(data.get("notify_wind", True)),
            bool(data.get("notify_uv", True)),
            bool(data.get("notify_rain", True)),
            data.get("temperature_unit", "F"),
            data.get("timezone") or None
        )
    )
    db.commit()
    cursor.close()
    db.close()

    return {"message": "Settings updated"}


# ---------------------------------------------------------------------------
# Outage / error tracking
#
# Two layers work together:
#   * This in-process hook captures the *cause* of a crash (the traceback),
#     writes it to logs/app-errors.log, and best-effort emails every admin.
#   * The separate watchdog.py (run by Task Scheduler) detects full-process
#     death or a hung/stopped service — even a hard kill this hook can't see —
#     and emails admins independently.
# ---------------------------------------------------------------------------
import sys as _sys
import logging as _logging
import atexit as _atexit
import traceback as _traceback

_ERR_LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(_ERR_LOG_DIR, exist_ok=True)
_error_logger = _logging.getLogger("dashboard.errors")
if not _error_logger.handlers:
    _eh = _logging.FileHandler(os.path.join(_ERR_LOG_DIR, "app-errors.log"), encoding="utf-8")
    _eh.setFormatter(_logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    _error_logger.addHandler(_eh)
    _error_logger.setLevel(_logging.INFO)


def get_admin_emails():
    """Email addresses of all admin accounts (empty list on any DB error)."""
    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute(
            "SELECT email FROM users WHERE role='admin' AND email IS NOT NULL AND email<>''"
        )
        rows = cursor.fetchall()
        cursor.close()
        db.close()
        return [r[0] for r in rows]
    except Exception:
        return []


def email_admins(subject, text, html=None):
    """Best-effort email to every admin account. Never raises."""
    html = html or "<pre style='font-family:monospace;white-space:pre-wrap'>" + text + "</pre>"
    for addr in get_admin_emails():
        try:
            if RESEND_API_KEY:
                _send_email_resend(addr, subject, text, html)
            else:
                _send_email_smtp(addr, subject, text, html)
        except Exception as e:
            try:
                _error_logger.error(f"Failed to email admin {addr}: {e}")
            except Exception:
                pass


def _handle_uncaught(exc_type, exc_value, exc_tb):
    tb = "".join(_traceback.format_exception(exc_type, exc_value, exc_tb))
    try:
        _error_logger.critical("UNCAUGHT EXCEPTION — backend is going down:\n" + tb)
    except Exception:
        pass
    try:
        email_admins(
            "🚨 Dashboard backend crashed",
            "The dashboard backend hit an uncaught exception and is shutting down.\n\n" + tb,
        )
    except Exception:
        pass
    _sys.__excepthook__(exc_type, exc_value, exc_tb)


_sys.excepthook = _handle_uncaught


def _thread_excepthook(args):
    _handle_uncaught(args.exc_type, args.exc_value, args.exc_traceback)


threading.excepthook = _thread_excepthook


@_atexit.register
def _log_shutdown():
    try:
        _error_logger.info("Backend process exiting.")
    except Exception:
        pass


@app.errorhandler(Exception)
def _log_request_error(e):
    """Log unhandled request errors (500s). These don't crash the app, but are
    worth recording. HTTP errors (404 etc.) pass through unchanged."""
    from werkzeug.exceptions import HTTPException
    if isinstance(e, HTTPException):
        return e
    try:
        _error_logger.error("Unhandled request error:\n" + _traceback.format_exc())
    except Exception:
        pass
    return {"error": "Internal server error"}, 500


if __name__ == "__main__":
    ensure_feature_tables()
    _error_logger.info("Backend started.")

    print("Registered routes:")
    for rule in app.url_map.iter_rules():
        print(rule)

    socketio.run(
        app,
        host="0.0.0.0",
        port=8132,
        debug=False,
        use_reloader=False,
        allow_unsafe_werkzeug=True
    )
