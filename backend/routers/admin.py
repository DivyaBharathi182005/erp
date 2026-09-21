from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
import models, schemas
from auth import require_role, get_password_hash

router = APIRouter(prefix="/admin", tags=["Admin"])


# ─── Dashboard ────────────────────────────────────
@router.get("/dashboard")
def get_dashboard(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    return {
        "total_students": db.query(models.Student).count(),
        "total_faculty": db.query(models.Faculty).count(),
        "total_courses": db.query(models.Course).count(),
        "total_departments": db.query(models.Department).count(),
        "pending_exam_registrations": db.query(models.ExamRegistration).filter(
            models.ExamRegistration.status == "pending"
        ).count(),
        "pending_payments": db.query(models.ExamFee).filter(
            models.ExamFee.payment_status == "pending"
        ).count()
    }


# ─── USERS ────────────────────────────────────────
@router.get("/users")
def get_all_users(
    role: Optional[str] = None,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    query = db.query(models.User)
    if role:
        query = query.filter(models.User.role == role)
    return query.all()


@router.post("/users/deactivate/{user_id}")
def deactivate_user(
    user_id: int,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    return {"message": f"User {user.name} deactivated"}


@router.post("/users/activate/{user_id}")
def activate_user(
    user_id: int,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    db.commit()
    return {"message": f"User {user.name} activated"}


# ─── STUDENTS ─────────────────────────────────────
@router.get("/students")
def get_all_students(
    department_id: Optional[int] = None,
    semester: Optional[int] = None,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    query = db.query(models.Student).options(
        joinedload(models.Student.user),
        joinedload(models.Student.department)
    )
    if department_id:
        query = query.filter(models.Student.department_id == department_id)
    if semester:
        query = query.filter(models.Student.current_semester == semester)
    return query.all()


@router.post("/students")
def create_student(
    data: schemas.StudentCreate,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    # Check duplicate email
    if db.query(models.User).filter(models.User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        name=data.name,
        email=data.email,
        password_hash=get_password_hash(data.password),
        role="student",
        phone=data.phone,
        gender=data.gender,
        date_of_birth=data.date_of_birth
    )
    db.add(user)
    db.flush()

    student = models.Student(
        user_id=user.id,
        register_number=data.register_number,
        department_id=data.department_id,
        batch_year=data.batch_year,
        current_semester=data.current_semester,
        section=data.section,
        blood_group=data.blood_group,
        guardian_name=data.guardian_name,
        guardian_phone=data.guardian_phone
    )
    db.add(student)
    db.commit()
    return {"message": "Student created", "user_id": user.id, "student_id": student.id}


@router.put("/students/{student_id}")
def update_student(
    student_id: int,
    data: dict,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    allowed_student = {"current_semester", "section", "cgpa", "blood_group", "guardian_name", "guardian_phone"}
    allowed_user = {"name", "phone", "address", "gender", "photo_url"}

    for key, value in data.items():
        if key in allowed_student:
            setattr(student, key, value)
        elif key in allowed_user:
            setattr(student.user, key, value)

    db.commit()
    return {"message": "Student updated"}


@router.delete("/students/{student_id}")
def delete_student(
    student_id: int,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    user_id = student.user_id
    db.delete(student)
    db.flush()
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user:
        db.delete(user)
    db.commit()
    return {"message": "Student deleted"}


# ─── FACULTY ──────────────────────────────────────
@router.get("/faculty")
def get_all_faculty(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    return db.query(models.Faculty).options(
        joinedload(models.Faculty.user),
        joinedload(models.Faculty.department)
    ).all()


@router.post("/faculty")
def create_faculty(
    data: schemas.FacultyCreate,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    if db.query(models.User).filter(models.User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        name=data.name,
        email=data.email,
        password_hash=get_password_hash(data.password),
        role="faculty",
        phone=data.phone,
        gender=data.gender
    )
    db.add(user)
    db.flush()

    faculty = models.Faculty(
        user_id=user.id,
        employee_id=data.employee_id,
        department_id=data.department_id,
        designation=data.designation,
        specialization=data.specialization,
        experience_years=data.experience_years
    )
    db.add(faculty)
    db.commit()
    return {"message": "Faculty created", "user_id": user.id, "faculty_id": faculty.id}


# ─── DEPARTMENTS ──────────────────────────────────
@router.get("/departments", response_model=List[schemas.DepartmentResponse])
def get_departments(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    return db.query(models.Department).all()


@router.post("/departments")
def create_department(
    data: dict,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    dept = models.Department(name=data["name"], code=data["code"])
    db.add(dept)
    db.commit()
    return {"message": "Department created", "id": dept.id}


# ─── COURSES ──────────────────────────────────────
@router.get("/courses")
def get_courses(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    return db.query(models.Course).options(joinedload(models.Course.department)).all()


@router.post("/courses")
def create_course(
    data: dict,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    course = models.Course(**data)
    db.add(course)
    db.commit()
    return {"message": "Course created", "id": course.id}


@router.put("/courses/{course_id}")
def update_course(
    course_id: int,
    data: dict,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    for k, v in data.items():
        if hasattr(course, k):
            setattr(course, k, v)
    db.commit()
    return {"message": "Course updated"}


# ─── EXAM REGISTRATIONS (Approve/Reject) ──────────
@router.get("/exam-registrations")
def get_exam_registrations(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    return db.query(models.ExamRegistration).options(
        joinedload(models.ExamRegistration.student).joinedload(models.Student.user)
    ).all()


@router.post("/exam-registrations/{reg_id}/approve")
def approve_exam_registration(
    reg_id: int,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    reg = db.query(models.ExamRegistration).filter(models.ExamRegistration.id == reg_id).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    reg.status = "approved"

    # Create fee record if not exists
    existing_fee = db.query(models.ExamFee).filter(
        models.ExamFee.student_id == reg.student_id,
        models.ExamFee.semester == reg.semester,
        models.ExamFee.academic_year == reg.academic_year
    ).first()
    if not existing_fee:
        fee = models.ExamFee(
            student_id=reg.student_id,
            semester=reg.semester,
            academic_year=reg.academic_year,
            amount=1500.00
        )
        db.add(fee)

    db.commit()
    return {"message": "Exam registration approved and fee generated"}


@router.post("/exam-registrations/{reg_id}/reject")
def reject_exam_registration(
    reg_id: int,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    reg = db.query(models.ExamRegistration).filter(models.ExamRegistration.id == reg_id).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    reg.status = "rejected"
    db.commit()
    return {"message": "Exam registration rejected"}


# ─── Broadcast Notification ───────────────────────
@router.post("/notify")
def send_notification(
    data: dict,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    target_role = data.get("role")  # None = all
    title = data["title"]
    message = data["message"]
    notif_type = data.get("type", "info")

    query = db.query(models.User).filter(models.User.is_active == True)
    if target_role:
        query = query.filter(models.User.role == target_role)

    users = query.all()
    for u in users:
        notif = models.Notification(
            user_id=u.id,
            title=title,
            message=message,
            type=notif_type
        )
        db.add(notif)
    db.commit()
    return {"message": f"Notification sent to {len(users)} users"}


# ─── Stats ────────────────────────────────────────
@router.get("/stats/attendance")
def get_attendance_stats(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    students = db.query(models.Student).options(
        joinedload(models.Student.user),
        joinedload(models.Student.attendance)
    ).all()

    result = []
    for s in students:
        total = len(s.attendance)
        present = sum(1 for a in s.attendance if a.status in ("present", "od"))
        pct = round((present / total * 100) if total > 0 else 0, 1)
        result.append({
            "student_id": s.id,
            "name": s.user.name if s.user else "",
            "register_number": s.register_number,
            "total_classes": total,
            "present": present,
            "attendance_percentage": pct,
            "low_attendance": pct < 75 and total > 0
        })
    return result
