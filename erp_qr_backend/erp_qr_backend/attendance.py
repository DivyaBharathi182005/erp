from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import SessionLocal
import models
import random
import string
import datetime
import qrcode
from fastapi import HTTPException

router = APIRouter()

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Generate random session code
def generate_session_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


# Start attendance session
@router.post("/start-session")
def start_session(course_id: int, faculty_id: int, db: Session = Depends(get_db)):

    course = db.query(models.Course).filter(
        models.Course.id == course_id,
        models.Course.faculty_id == faculty_id
    ).first()

    if not course:
        raise HTTPException(status_code=403, detail="Invalid course or faculty")

    code = generate_session_code()

    new_session = models.AttendanceSession(
        session_code=code,
        course_id=course_id,
        is_active=True
    )

    db.add(new_session)
    db.commit()

    return {"session_code": code}


# Auto refresh logic (valid for 30 seconds)

from fastapi.responses import FileResponse

@router.get("/generate-qr/{session_code}")
def generate_qr(session_code: str):

    timestamp = int(datetime.datetime.utcnow().timestamp() / 60)
    qr_data = f"{session_code}:{timestamp}"

    img = qrcode.make(qr_data)
    img.save("current_qr.png")

    return FileResponse("current_qr.png", media_type="image/png")


# Mark attendance
@router.post("/mark-attendance")
def mark_attendance(qr_data: str, student_id: int, db: Session = Depends(get_db)):

    import datetime

    # Split QR data
    try:
        session_code, timestamp = qr_data.split(":")
        timestamp = int(timestamp)
    except:
        return {"error": "Invalid QR"}

    # Validate timestamp (30-second refresh logic)
    current_chunk = int(datetime.datetime.utcnow().timestamp() / 60)

    if timestamp not in [current_chunk, current_chunk - 1]:
     return {"error": "QR expired"}

    # Get session
    session = db.query(models.AttendanceSession).filter(
        models.AttendanceSession.session_code == session_code,
        models.AttendanceSession.is_active == True
    ).first()

    if not session:
        return {"error": "Session not active"}

    # Auto-expire after 2 minutes
    time_diff = datetime.datetime.utcnow() - session.created_at.replace(tzinfo=None)

    if time_diff.total_seconds() > 120:
        session.is_active = False
        db.commit()
        return {"error": "Session expired"}

    # Check enrollment (VERY IMPORTANT PART)
    enrolled = db.query(models.Enrollment).filter(
        models.Enrollment.student_id == student_id,
        models.Enrollment.course_id == session.course_id
    ).first()

    if not enrolled:
        return {"error": "Student not enrolled in this course"}

    # Prevent duplicate marking
    already_marked = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.session_code == session_code,
        models.AttendanceRecord.student_id == student_id
    ).first()

    if already_marked:
        return {"error": "Already marked"}

    # Save attendance
    record = models.AttendanceRecord(
        session_code=session_code,
        student_id=student_id
    )

    db.add(record)
    db.commit()

    return {"message": "Attendance marked successfully"}


# Close session
@router.post("/close-session/{session_code}")
def close_session(session_code: str, db: Session = Depends(get_db)):
    session = db.query(models.AttendanceSession).filter(
        models.AttendanceSession.session_code == session_code
    ).first()

    if session:
        session.is_active = False
        db.commit()

    return {"message": "Session closed"}
@router.post("/register")
def register(name: str, email: str, password: str, role: str,
             institution_id: int,
             db: Session = Depends(get_db)):

    user = models.User(
        name=name,
        email=email,
        password=password,
        role=role,
        institution_id=institution_id
    )

    db.add(user)
    db.commit()

    return {"message": "User registered successfully"}
@router.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.email == email,
        models.User.password == password
    ).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {
        "user_id": user.id,
        "role": user.role,
        "message": "Login successful"
    }
@router.post("/create-course")
def create_course(name: str, faculty_id: int, db: Session = Depends(get_db)):

    faculty = db.query(models.User).filter(
        models.User.id == faculty_id,
        models.User.role == "faculty"
    ).first()

    if not faculty:
        raise HTTPException(status_code=403, detail="Only faculty can create course")

    course = models.Course(name=name, faculty_id=faculty_id)
    db.add(course)
    db.commit()

    return {"message": "Course created"}
@router.post("/enroll")
def enroll(student_id: int, course_id: int, db: Session = Depends(get_db)):

    student = db.query(models.User).filter(
        models.User.id == student_id,
        models.User.role == "student"
    ).first()

    if not student:
        raise HTTPException(status_code=403, detail="Only students can enroll")

    enrollment = models.Enrollment(
        student_id=student_id,
        course_id=course_id
    )

    db.add(enrollment)
    db.commit()

    return {"message": "Student enrolled"}
@router.get("/present-students/{session_code}")
def get_present_students(session_code: str, db: Session = Depends(get_db)):

    records = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.session_code == session_code
    ).all()

    student_list = []

    for record in records:
        student_list.append({
            "student_id": record.student_id
        })

    return {
        "count": len(student_list),
        "students": student_list
    }
@router.get("/full-attendance")
def full_attendance(db: Session = Depends(get_db)):

    sessions = db.query(models.AttendanceSession).all()

    result = []

    for session in sessions:

        # Get course
        course = db.query(models.Course).filter(
            models.Course.id == session.course_id
        ).first()

        # Get all enrolled students in that course
        enrolled_students = db.query(models.Enrollment).filter(
            models.Enrollment.course_id == course.id
        ).all()

        # Get present students for this session
        present_records = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.session_code == session.session_code
        ).all()

        present_ids = [record.student_id for record in present_records]

        # Compare each enrolled student
        for enrollment in enrolled_students:

            student = db.query(models.User).filter(
                models.User.id == enrollment.student_id
            ).first()

            status = "Present" if student.id in present_ids else "Absent"

            result.append({
                "student_id": student.id,
                "student_name": student.name,
                "date": session.created_at.strftime("%Y-%m-%d"),
                "course_name": course.name,
                "status": status
            })

    return result