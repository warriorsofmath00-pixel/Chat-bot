from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from flask_bcrypt import Bcrypt
from flask_cors import CORS
import sqlite3, requests, json
from config import OPENROUTER_API_KEY, MODEL, SECRET_KEY

app = Flask(__name__)
app.secret_key = SECRET_KEY
CORS(app)
bcrypt = Bcrypt(app)

# ----------------- DATABASE FUNCTIONS -----------------
def get_db_connection():
    conn = sqlite3.connect("serenity.db")
    conn.row_factory = sqlite3.Row
    return conn

# ----------------- USER AUTH -----------------
@app.route("/")
def home():
    if "user_id" in session:
        return redirect(url_for("chat"))
    return redirect(url_for("login"))

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        name = request.form["name"]
        email = request.form["email"]
        password = bcrypt.generate_password_hash(request.form["password"]).decode("utf-8")
        try:
            conn = get_db_connection()
            conn.execute("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", (name, email, password))
            conn.commit()
            conn.close()
            return redirect(url_for("login"))
        except:
            return "Email already exists!"
    return render_template("signup.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form["email"]
        password = request.form["password"]
        conn = get_db_connection()
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        conn.close()

        if user and bcrypt.check_password_hash(user["password"], password):
            session["user_id"] = user["id"]
            session["name"] = user["name"]
            return redirect(url_for("chat"))
        else:
            return "Invalid email or password!"
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# ----------------- CHATBOT API -----------------
@app.route("/chat", methods=["GET", "POST"])
def chat():
    if "user_id" not in session:
        return redirect(url_for("login"))

    if request.method == "POST":
        user_msg = request.json.get("message")
        user_id = session["user_id"]

        # Call OpenRouter API
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
        data = {
            "model": MODEL,
            "messages": [{"role": "user", "content": user_msg}]
        }
        response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, data=json.dumps(data))
        bot_reply = response.json()["choices"][0]["message"]["content"]

        # Save chat in DB
        conn = get_db_connection()
        conn.execute("INSERT INTO chats (user_id, title, message, response) VALUES (?, ?, ?, ?)",
                     (user_id, user_msg[:30], user_msg, bot_reply))
        conn.commit()
        conn.close()

        return jsonify({"reply": bot_reply})

    return render_template("chat.html", name=session["name"])

# ----------------- CHAT HISTORY -----------------
@app.route("/history")
def history():
    if "user_id" not in session:
        return redirect(url_for("login"))

    conn = get_db_connection()
    chats = conn.execute("SELECT * FROM chats WHERE user_id = ?", (session["user_id"],)).fetchall()
    conn.close()
    return jsonify([dict(row) for row in chats])

@app.route("/delete_chat/<int:chat_id>", methods=["DELETE"])
def delete_chat(chat_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route("/clear_history", methods=["DELETE"])
def clear_history():
    conn = get_db_connection()
    conn.execute("DELETE FROM chats WHERE user_id = ?", (session["user_id"],))
    conn.commit()
    conn.close()
    return jsonify({"status": "all history cleared"})

if __name__ == "__main__":
    app.run(debug=True)
