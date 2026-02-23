from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import sqlite3
from datetime import datetime

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# ---------------- DATABASE ---------------- #

def get_db():
    conn = sqlite3.connect("database.db")
    conn.row_factory = sqlite3.Row
    return conn


def create_tables():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        parent_phone TEXT,
        block_no TEXT,
        room_no TEXT,
        status TEXT DEFAULT 'Present'
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS leave_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        reason TEXT,
        out_date TEXT,
        out_time TEXT,
        in_date TEXT,
        in_time TEXT,
        status TEXT DEFAULT 'Pending'
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS gate_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        entry_time TEXT,
        exit_time TEXT
    )
    """)

    conn.commit()
    conn.close()


create_tables()


# ---------------- SAMPLE DATA ---------------- #

def add_sample_students():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM students")
    if cursor.fetchone()[0] == 0:
        students = [
            ("Indhu", "9876543210", "A", "101"),
            ("Arun", "9123456789", "B", "202"),
            ("Meena", "9988776655", "A", "103"),
            ("Karthik", "9001122334", "C", "305")
        ]
        cursor.executemany("""
        INSERT INTO students (name, parent_phone, block_no, room_no)
        VALUES (?, ?, ?, ?)
        """, students)
        conn.commit()

    conn.close()


add_sample_students()


# ---------------- LOGIN ---------------- #

@app.get("/", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


@app.post("/login")
def login(name: str = Form(...), student_id: int = Form(...)):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM students WHERE id=?", (student_id,))
    student = cursor.fetchone()
    conn.close()

    if student and student["name"].lower() == name.lower():
        return RedirectResponse(url=f"/student/{student_id}", status_code=303)

    return HTMLResponse("Invalid Student Name or ID")


# ---------------- STUDENT PAGE ---------------- #

@app.get("/student/{student_id}", response_class=HTMLResponse)
def student_page(request: Request, student_id: int):

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM students WHERE id=?", (student_id,))
    student = cursor.fetchone()

    if not student:
        conn.close()
        return templates.TemplateResponse(
            "student.html",
            {"request": request, "student": None, "leaves": [], "active_leave": None}
        )

    cursor.execute("SELECT * FROM leave_requests WHERE student_id=?", (student_id,))
    raw_leaves = cursor.fetchall()

    leaves = []
    active_leave = None
    now = datetime.now()

    for leave in raw_leaves:
        try:
            out_dt = datetime.strptime(
                leave["out_date"] + " " + leave["out_time"],
                "%Y-%m-%d %H:%M"
            )
            in_dt = datetime.strptime(
                leave["in_date"] + " " + leave["in_time"],
                "%Y-%m-%d %H:%M"
            )

            duration_hours = round((in_dt - out_dt).total_seconds() / 3600, 2)
        except:
            duration_hours = 0

        leave_dict = dict(leave)
        leave_dict["duration"] = duration_hours
        leaves.append(leave_dict)

        if leave["status"] == "Approved":
            if out_dt <= now <= in_dt:
                active_leave = leave_dict

    conn.close()

    return templates.TemplateResponse(
        "student.html",
        {
            "request": request,
            "student": student,
            "leaves": leaves,
            "active_leave": active_leave
        }
    )


# ---------------- APPLY LEAVE ---------------- #

@app.post("/apply_leave/{student_id}")
def apply_leave(student_id: int,
                reason: str = Form(...),
                out_date: str = Form(...),
                out_time: str = Form(...),
                in_date: str = Form(...),
                in_time: str = Form(...)):

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    INSERT INTO leave_requests
    (student_id, reason, out_date, out_time, in_date, in_time)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (student_id, reason, out_date, out_time, in_date, in_time))

    conn.commit()
    conn.close()

    return RedirectResponse(url=f"/student/{student_id}", status_code=303)


# ---------------- CANCEL LEAVE ---------------- #

@app.post("/cancel_leave/{leave_id}/{student_id}")
def cancel_leave(leave_id: int, student_id: int):

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("UPDATE leave_requests SET status='Cancelled' WHERE id=?", (leave_id,))
    cursor.execute("UPDATE students SET status='Present' WHERE id=?", (student_id,))

    conn.commit()
    conn.close()

    return RedirectResponse(url=f"/student/{student_id}", status_code=303)


# ---------------- RT PAGE ---------------- #

@app.get("/rt", response_class=HTMLResponse)
def rt_page(request: Request):

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT leave_requests.*, students.name
    FROM leave_requests
    JOIN students ON leave_requests.student_id = students.id
    WHERE leave_requests.status = 'Pending'
    """)
    requests = cursor.fetchall()

    cursor.execute("SELECT * FROM students")
    students = cursor.fetchall()

    conn.close()

    return templates.TemplateResponse(
        "rt.html",
        {"request": request, "requests": requests, "students": students}
    )


@app.post("/update_leave/{leave_id}")
def update_leave(leave_id: int, action: str = Form(...)):

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT student_id FROM leave_requests WHERE id=?", (leave_id,))
    result = cursor.fetchone()

    if result:
        student_id = result["student_id"]

        if action == "approve":
            cursor.execute("UPDATE leave_requests SET status='Approved' WHERE id=?", (leave_id,))
            cursor.execute("UPDATE students SET status='On Leave' WHERE id=?", (student_id,))
        else:
            cursor.execute("UPDATE leave_requests SET status='Rejected' WHERE id=?", (leave_id,))

    conn.commit()
    conn.close()

    return RedirectResponse(url="/rt", status_code=303)
@app.get("/gate", response_class=HTMLResponse)
def gate_page(request: Request):

    conn = get_db()
    cursor = conn.cursor()

    # Get all students
    cursor.execute("SELECT * FROM students ORDER BY id ASC")
    students = cursor.fetchall()

    # Get gate logs safely
    try:
        cursor.execute("""
        SELECT gate_logs.id,
               gate_logs.student_id,
               gate_logs.exit_time,
               gate_logs.entry_time,
               students.name
        FROM gate_logs
        LEFT JOIN students ON gate_logs.student_id = students.id
        ORDER BY gate_logs.id DESC
        """)
        logs = cursor.fetchall()
    except:
        logs = []

    conn.close()

    return templates.TemplateResponse(
        "gate.html",
        {
            "request": request,
            "students": students if students else [],
            "logs": logs if logs else []
        }
    )
