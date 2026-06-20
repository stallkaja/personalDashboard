import mysql.connector
import bcrypt

db = mysql.connector.connect(
    host="localhost",
    user="root",
    password="root",
    database="weather"
)

cursor = db.cursor()

def create_user(username, password, role="user"):
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    hashed = hashed.decode("utf-8")

    sql = "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s)"
    cursor.execute(sql, (username, hashed, role))
    db.commit()

    print(f"User '{username}' created with role '{role}'")

# ---- create your admin user here ----
create_user("admin", "admin123", "admin")