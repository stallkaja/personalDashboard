from flask import Flask, request
from flask_cors import CORS
from flask_socketio import SocketIO, disconnect
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    decode_token,
    jwt_required,
    get_jwt
)
from datetime import datetime, timezone, timedelta
import bcrypt
import mysql.connector


DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "root",
    "database": "weather"
}


def get_db():
    return mysql.connector.connect(**DB_CONFIG)


def safe_float(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def admin_required():
    claims = get_jwt()
    return claims.get("role") == "admin"


def hash_password(password):
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")


app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

app.config["JWT_SECRET_KEY"] = "super-secret-change-this"
jwt = JWTManager(app)

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


@app.route("/latest")
def latest():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT timestamp, tempf, humidity, windspeedmph,
               windgustmph, winddir, uv, baromrelin, dailyrainin
        FROM readings
        ORDER BY timestamp DESC
        LIMIT 1
    """)

    row = cursor.fetchone()
    cursor.close()
    db.close()

    if not row:
        return {"data": None}

    return {
        "data": {
            "timestamp": row[0].isoformat() if row[0] else None,
            "tempf": row[1],
            "humidity": row[2],
            "windspeedmph": row[3],
            "windgustmph": row[4],
            "winddir": row[5],
            "uv": row[6],
            "baromrelin": row[7],
            "dailyrainin": row[8],
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
        }
    })

    return "OK"


@app.route("/history")
def history():
    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT timestamp, tempf, humidity, windspeedmph,
               windgustmph, winddir, uv, baromrelin, dailyrainin
        FROM readings
        ORDER BY timestamp DESC
        LIMIT 2000
    """)

    rows = cursor.fetchall()
    cursor.close()
    db.close()

    return {
        "history": [
            {
                "timestamp": r[0].isoformat() if r[0] else None,
                "tempf": r[1],
                "humidity": r[2],
                "windspeedmph": r[3],
                "windgustmph": r[4],
                "winddir": r[5],
                "uv": r[6],
                "baromrelin": r[7],
                "dailyrainin": r[8],
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
            MAX(dailyrainin)
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
            "rain_total": float(row[4])
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


@app.route("/login", methods=["POST"])
def login():
    data = request.json or {}

    username = data.get("username")
    password = data.get("password")

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        "SELECT id, username, password_hash, role FROM users WHERE username=%s",
        (username,)
    )

    user = cursor.fetchone()
    cursor.close()
    db.close()

    if not user:
        return {"error": "Invalid credentials"}, 401

    user_id, db_username, password_hash, role = user

    if not bcrypt.checkpw(
        password.encode("utf-8"),
        password_hash.encode("utf-8")
    ):
        return {"error": "Invalid credentials"}, 401

    token = create_access_token(
        identity=str(user_id),
        additional_claims={
            "username": db_username,
            "role": role
        },
        expires_delta=timedelta(hours=8)
    )

    return {
        "token": token,
        "user": {
            "id": user_id,
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
        SELECT id, username, role, created_at
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
                "created_at": r[3].isoformat() if r[3] else None
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
    password = data.get("password") or ""
    role = data.get("role", "user")

    if not username or not password:
        return {"error": "Username and password are required"}, 400

    if role not in ["user", "admin"]:
        return {"error": "Invalid role"}, 400

    password_hash = hash_password(password)

    db = get_db()
    cursor = db.cursor()

    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s)",
            (username, password_hash, role)
        )
        db.commit()
        new_id = cursor.lastrowid
    except mysql.connector.IntegrityError:
        cursor.close()
        db.close()
        return {"error": "Username already exists"}, 409

    cursor.close()
    db.close()

    return {
        "message": "User created",
        "user": {
            "id": new_id,
            "username": username,
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


if __name__ == "__main__":
    print("Registered routes:")
    for rule in app.url_map.iter_rules():
        print(rule)

    socketio.run(
        app,
        host="0.0.0.0",
        port=8132,
        debug=False,
        use_reloader=False
    )
