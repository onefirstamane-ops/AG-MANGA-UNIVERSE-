
import os
import re
import secrets
import hashlib
from datetime import timedelta
from functools import wraps

import psycopg
from psycopg.rows import dict_row
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "")

if len(app.secret_key) < 32:
    raise RuntimeError("Set SECRET_KEY to a random value of at least 32 characters.")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("Set DATABASE_URL to your PostgreSQL connection URL.")

ALLOWED_ORIGINS = [
    item.strip()
    for item in os.environ.get("FRONTEND_ORIGINS", "").split(",")
    if item.strip()
]
if not ALLOWED_ORIGINS:
    raise RuntimeError("Set FRONTEND_ORIGINS to your GitHub Pages URL.")

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "").strip().lower()

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_SAMESITE="None",
    PERMANENT_SESSION_LIFETIME=timedelta(days=3),
)

CORS(
    app,
    origins=ALLOWED_ORIGINS,
    supports_credentials=True,
    methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type"],
    max_age=600,
)

def db():
    return psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
        connect_timeout=10,
    )

def init_db():
    with db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id BIGSERIAL PRIMARY KEY,
                display_name VARCHAR(40) NOT NULL,
                email VARCHAR(254) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role VARCHAR(10) NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'admin')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS stories (
                id BIGSERIAL PRIMARY KEY,
                author_id BIGINT NOT NULL REFERENCES users(id),
                title VARCHAR(120) NOT NULL,
                category VARCHAR(30) NOT NULL,
                cover_url VARCHAR(500) NOT NULL DEFAULT '',
                synopsis VARCHAR(1000) NOT NULL,
                content TEXT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS stories_status_idx
            ON stories(status, created_at DESC)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS stories_author_idx
            ON stories(author_id, created_at DESC)
        """)

def public_user(user):
    if not user:
        return None
    return {
        "id": user["id"],
        "display_name": user["display_name"],
        "email": user["email"],
        "role": user["role"],
    }

def current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    with db() as conn:
        return conn.execute(
            "SELECT id, display_name, email, role FROM users WHERE id=%s",
            (user_id,),
        ).fetchone()

def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            return jsonify(error="Please login first."), 401
        return fn(*args, **kwargs)
    return wrapper

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify(error="Please login first."), 401
        if user["role"] != "admin":
            return jsonify(error="Admin access required."), 403
        return fn(*args, **kwargs)
    return wrapper

def story_json(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "category": row["category"],
        "cover_url": row["cover_url"],
        "synopsis": row["synopsis"],
        "content": row["content"],
        "status": row["status"],
        "author_name": row["author_name"],
        "created_at": row["created_at"].isoformat(),
    }

@app.get("/api/health")
def health():
    with db() as conn:
        conn.execute("SELECT 1")
    return jsonify(status="ok", app="AG AMU")

@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    name = str(data.get("display_name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not 2 <= len(name) <= 40:
        return jsonify(error="Display name must be 2–40 characters."), 400
    if len(email) > 254 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify(error="Enter a valid email address."), 400
    if len(password) < 10 or len(password) > 128:
        return jsonify(error="Password must be 10–128 characters."), 400

    role = "admin" if ADMIN_EMAIL and email == ADMIN_EMAIL else "user"
    hashed = generate_password_hash(password)

    try:
        with db() as conn:
            conn.execute(
                """INSERT INTO users(display_name,email,password_hash,role)
                   VALUES(%s,%s,%s,%s)""",
                (name, email, hashed, role),
            )
    except psycopg.errors.UniqueViolation:
        return jsonify(error="An account with this email already exists."), 409

    return jsonify(message="Account created. Please login."), 201

@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    with db() as conn:
        user = conn.execute(
            """SELECT id, display_name, email, password_hash, role
               FROM users WHERE email=%s""",
            (email,),
        ).fetchone()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify(error="Incorrect email or password."), 401

    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    session["session_nonce"] = secrets.token_urlsafe(24)
    return jsonify(user=public_user(user))

@app.get("/api/auth/me")
def me():
    user = current_user()
    if not user:
        return jsonify(user=None)
    return jsonify(user=public_user(user))

@app.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify(message="Logged out.")

@app.post("/api/auth/forgot-password")
def forgot_password():
    # Deliberately does not reveal whether an account exists.
    # A real reset flow requires a verified email-delivery service,
    # single-use expiring tokens, and a reset-password endpoint.
    return jsonify(
        message="If the account exists, password reset instructions can be sent."
    )

@app.get("/api/stories")
def list_stories():
    with db() as conn:
        rows = conn.execute("""
            SELECT s.id, s.title, s.category, s.cover_url, s.synopsis,
                   s.content, s.status, s.created_at,
                   u.display_name AS author_name
            FROM stories s JOIN users u ON u.id=s.author_id
            WHERE s.status='approved'
            ORDER BY s.created_at DESC LIMIT 200
        """).fetchall()
    return jsonify(stories=[story_json(row) for row in rows])

@app.get("/api/stories/<int:story_id>")
def get_story(story_id):
    with db() as conn:
        row = conn.execute("""
            SELECT s.id, s.title, s.category, s.cover_url, s.synopsis,
                   s.content, s.status, s.created_at,
                   u.display_name AS author_name
            FROM stories s JOIN users u ON u.id=s.author_id
            WHERE s.id=%s AND s.status='approved'
        """, (story_id,)).fetchone()
    if not row:
        return jsonify(error="Story not found."), 404
    return jsonify(story=story_json(row))

@app.post("/api/stories")
@login_required
def submit_story():
    user = current_user()
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "")).strip()
    category = str(data.get("category", "")).strip()
    cover_url = str(data.get("cover_url", "")).strip()
    synopsis = str(data.get("synopsis", "")).strip()
    content = str(data.get("content", "")).strip()
    categories = {
        "Manga", "Fantasy", "History", "Mystery",
        "Romance", "Action", "Other"
    }

    if not 2 <= len(title) <= 120:
        return jsonify(error="Title must be 2–120 characters."), 400
    if category not in categories:
        return jsonify(error="Choose a valid category."), 400
    if len(cover_url) > 500:
        return jsonify(error="Cover URL is too long."), 400
    if cover_url and not cover_url.startswith(("https://", "http://")):
        return jsonify(error="Cover URL must start with http:// or https://."), 400
    if not 10 <= len(synopsis) <= 1000:
        return jsonify(error="Synopsis must be 10–1000 characters."), 400
    if not 50 <= len(content) <= 50000:
        return jsonify(error="Story content must be 50–50000 characters."), 400

    with db() as conn:
        conn.execute(
            """INSERT INTO stories
               (author_id,title,category,cover_url,synopsis,content,status)
               VALUES(%s,%s,%s,%s,%s,%s,'pending')""",
            (user["id"], title, category, cover_url, synopsis, content),
        )
    return jsonify(message="Story submitted for admin review."), 201

@app.get("/api/my/stories")
@login_required
def my_stories():
    user = current_user()
    with db() as conn:
        rows = conn.execute("""
            SELECT s.id, s.title, s.category, s.cover_url, s.synopsis,
                   s.content, s.status, s.created_at,
                   u.display_name AS author_name
            FROM stories s JOIN users u ON u.id=s.author_id
            WHERE s.author_id=%s ORDER BY s.created_at DESC
        """, (user["id"],)).fetchall()
    return jsonify(stories=[story_json(row) for row in rows])

@app.get("/api/admin/stories")
@admin_required
def admin_stories():
    with db() as conn:
        rows = conn.execute("""
            SELECT s.id, s.title, s.category, s.cover_url, s.synopsis,
                   s.content, s.status, s.created_at,
                   u.display_name AS author_name
            FROM stories s JOIN users u ON u.id=s.author_id
            ORDER BY CASE WHEN s.status='pending' THEN 0 ELSE 1 END,
                     s.created_at DESC
            LIMIT 300
        """).fetchall()
    return jsonify(stories=[story_json(row) for row in rows])

@app.patch("/api/admin/stories/<int:story_id>")
@admin_required
def review_story(story_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in {"approved", "rejected"}:
        return jsonify(error="Status must be approved or rejected."), 400

    with db() as conn:
        result = conn.execute(
            "UPDATE stories SET status=%s WHERE id=%s",
            (status, story_id),
        )
        if result.rowcount == 0:
            return jsonify(error="Story not found."), 404

    return jsonify(message="Story review completed.", status=status)

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
else:
    # Initialize schema when Gunicorn imports the application.
    init_db()
