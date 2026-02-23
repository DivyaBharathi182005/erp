from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
import models, schemas
from auth import require_role

router = APIRouter(prefix="/faculty", tags=["Faculty"])


def get_faculty_record(user: models.User, db: Session):
    faculty = db.query(models.Faculty).filter(models.Faculty.user_id == user.id)\
        .options(joinedload(models.Faculty.department), joinedload(models.Faculty.user)).first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty record not found")
    return faculty


# ─── Profile ──────────────────────────────────────
@router.get("/profile")
def get_profile(
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    return get_faculty_record(current_user, db)


# ─── My Students (in registered courses) ─────────
@router.get("/students")
def get_my_students(
    course_id: Optional[int] = None,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    faculty = get_faculty_record(current_user, db)

    query = db.query(models.CourseRegistration).filter(
        models.CourseRegistration.faculty_id == faculty.id
    )
    if course_id:
        query = query.filter(models.CourseRegistration.course_id == course_id)

    registrations = query.options(
        joinedload(models.CourseRegistration.student).joinedload(models.Student.user),
        joinedload(models.CourseRegistration.student).joinedload(models.Student.department),
        joinedload(models.CourseRegistration.course)
    ).all()

    students_seen = set()
    result = []
    for reg in registrations:
        s = reg.student
        if s.id not in students_seen:
            students_seen.add(s.id)
            
            # Attendance for this student in this course
            att = db.query(models.Attendance).filter(
                models.Attendance.student_id == s.id,
                models.Attendance.course_id == reg.course_id
            ).all() if course_id else []
            total = len(att)
            present = sum(1 for a in att if a.status in ("present", "od"))
            pct = round((present / total * 100) if total > 0 else 0, 1)

            result.append({
                "student_id": s.id,
                "user_id": s.user_id,
                "name": s.user.name,
                "register_number": s.register_number,
                "email": s.user.email,
                "section": s.section,
                "department": s.department.name if s.department else "",
                "cgpa": float(s.cgpa) if s.cgpa else 0.0,
                "course_id": reg.course_id,
                "course_name": reg.course.name if reg.course else "",
                "attendance_percentage": pct,
                "low_attendance": pct < 75 and total > 0
            })
    return result


# ─── Students with Low Attendance ─────────────────
@router.get("/low-attendance")
def get_low_attendance_students(
    course_id: Optional[int] = None,
    threshold: float = 75.0,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    all_students = get_my_students.__wrapped__(course_id, current_user, db) if False else None
    faculty = get_faculty_record(current_user, db)

    query = db.query(models.CourseRegistration).filter(
        models.CourseRegistration.faculty_id == faculty.id
    )
    if course_id:
        query = query.filter(models.CourseRegistration.course_id == course_id)

    registrations = query.options(
        joinedload(models.CourseRegistration.student).joinedload(models.Student.user),
        joinedload(models.CourseRegistration.course)
    ).all()

    result = []
    for reg in registrations:
        s = reg.student
        att = db.query(models.Attendance).filter(
            models.Attendance.student_id == s.id,
            models.Attendance.course_id == reg.course_id
        ).all()
        total = len(att)
        present = sum(1 for a in att if a.status in ("present", "od"))
        pct = round((present / total * 100) if total > 0 else 0, 1)

        if total > 0 and pct < threshold:
            result.append({
                "student_id": s.id,
                "name": s.user.name,
                "register_number": s.register_number,
                "email": s.user.email,
                "course_id": reg.course_id,
                "course_name": reg.course.name if reg.course else "",
                "total_classes": total,
                "present": present,
                "attendance_percentage": pct
            })
    return result


# ─── Mark Attendance ──────────────────────────────
@router.post("/attendance/mark")
def mark_attendance(
    data: schemas.AttendanceMarkRequest,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    faculty = get_faculty_record(current_user, db)
    marked = 0
    for record in data.records:
        student_id = record.get("student_id")
        status = record.get("status", "present")

        existing = db.query(models.Attendance).filter(
            models.Attendance.student_id == student_id,
            models.Attendance.course_id == data.course_id,
            models.Attendance.date == data.date
        ).first()

        if existing:
            existing.status = status
        else:
            att = models.Attendance(
                student_id=student_id,
                course_id=data.course_id,
                faculty_id=faculty.id,
                date=data.date,
                status=status
            )
            db.add(att)
        marked += 1

    db.commit()
    return {"message": f"Attendance marked for {marked} students"}


# ─── View Attendance for a Course ─────────────────
@router.get("/attendance/{course_id}")
def get_course_attendance(
    course_id: int,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    faculty = get_faculty_record(current_user, db)
    records = db.query(models.Attendance).filter(
        models.Attendance.course_id == course_id,
        models.Attendance.faculty_id == faculty.id
    ).options(
        joinedload(models.Attendance.student).joinedload(models.Student.user)
    ).order_by(models.Attendance.date.desc()).all()

    return [{
        "id": r.id,
        "student_name": r.student.user.name if r.student and r.student.user else "",
        "register_number": r.student.register_number if r.student else "",
        "date": str(r.date),
        "status": r.status
    } for r in records]


# ─── Upload/Update Marks ──────────────────────────
@router.post("/marks/{student_id}/{course_id}")
def update_marks(
    student_id: int,
    course_id: int,
    data: schemas.InternalMarkUpdate,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    faculty = get_faculty_record(current_user, db)
    existing = db.query(models.InternalMark).filter(
        models.InternalMark.student_id == student_id,
        models.InternalMark.course_id == course_id
    ).first()

    if existing:
        if data.cat1 is not None: existing.cat1 = data.cat1
        if data.cat2 is not None: existing.cat2 = data.cat2
        if data.cat3 is not None: existing.cat3 = data.cat3
        if data.assignment1 is not None: existing.assignment1 = data.assignment1
        if data.assignment2 is not None: existing.assignment2 = data.assignment2
        if data.assignment3 is not None: existing.assignment3 = data.assignment3
        existing.faculty_id = faculty.id
        # Auto-calculate internal total: (cat_avg*0.7 + asgn_avg*0.3) / 50 * 40
        cats = [v for v in [existing.cat1, existing.cat2, existing.cat3] if v is not None]
        pass  # internal_total is auto-computed via @property on the model
    else:
        mark = models.InternalMark(
            student_id=student_id,
            course_id=course_id,
            faculty_id=faculty.id,
            **{k: v for k, v in data.dict().items() if v is not None}
        )
        db.add(mark)
        db.flush()
        # internal_total is auto-computed via @property on the model

    db.commit()

    # Notify the student their marks were updated
    from models import Notification
    student_user = db.query(models.Student).filter(models.Student.id == student_id).first()
    if student_user:
        notif = Notification(
            user_id=student_user.user_id,
            title="Marks Updated",
            message=f"Your internal marks have been updated by your faculty. Check your Marks & Results page.",
            type="info"
        )
        db.add(notif)
        db.commit()

    return {"message": "Marks updated successfully"}


# ─── View Marks for Course ────────────────────────
@router.get("/marks/{course_id}")
def get_course_marks(
    course_id: int,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Return ALL enrolled students with their marks.
    Students without a mark record appear with None values so
    faculty can always enter marks for every student.
    """
    faculty = get_faculty_record(current_user, db)

    # All students registered in this course under this faculty
    registrations = db.query(models.CourseRegistration).filter(
        models.CourseRegistration.course_id == course_id,
        models.CourseRegistration.faculty_id == faculty.id
    ).options(
        joinedload(models.CourseRegistration.student).joinedload(models.Student.user)
    ).all()

    # Build existing marks lookup
    existing_marks = db.query(models.InternalMark).filter(
        models.InternalMark.course_id == course_id
    ).all()
    marks_by_student = {m.student_id: m for m in existing_marks}

    result = []
    seen = set()
    for reg in registrations:
        s = reg.student
        if not s or not s.user or s.id in seen:
            continue
        seen.add(s.id)
        m = marks_by_student.get(s.id)

        def fval(v):
            return float(v) if v is not None else None

        if m:
            cats  = [float(m.cat1 or 0), float(m.cat2 or 0), float(m.cat3 or 0)]
            asgns = [float(m.assignment1 or 0), float(m.assignment2 or 0), float(m.assignment3 or 0)]
            cat_avg  = sum(cats)  / 3
            asgn_avg = sum(asgns) / 3
            internal_total = round((cat_avg * 0.70 + asgn_avg * 0.30) / 50 * 40, 2)
        else:
            internal_total = None

        result.append({
            "student_id":      s.id,
            "student_name":    s.user.name,
            "register_number": s.register_number,
            "cat1":        fval(m.cat1)        if m else None,
            "cat2":        fval(m.cat2)        if m else None,
            "cat3":        fval(m.cat3)        if m else None,
            "assignment1": fval(m.assignment1) if m else None,
            "assignment2": fval(m.assignment2) if m else None,
            "assignment3": fval(m.assignment3) if m else None,
            "internal_total": internal_total,
            "has_record": m is not None,
        })

    result.sort(key=lambda x: x["register_number"])
    return result


# ─── Send Message to Student ──────────────────────
@router.post("/send-message")
def send_message(
    data: schemas.MessageCreate,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    msg = models.Message(
        sender_id=current_user.id,
        recipient_id=data.recipient_id,
        subject=data.subject,
        body=data.body
    )
    db.add(msg)
    
    # Also create notification
    recipient = db.query(models.User).filter(models.User.id == data.recipient_id).first()
    if recipient:
        notif = models.Notification(
            user_id=data.recipient_id,
            title=f"New message from {current_user.name}",
            message=data.subject or data.body[:100],
            type="info"
        )
        db.add(notif)
    
    db.commit()
    return {"message": "Message sent successfully"}


# ─── My Courses/Timetable ────────────────────────
@router.get("/my-courses")
def get_my_courses(
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    faculty = get_faculty_record(current_user, db)
    slots = db.query(models.Timetable).filter(
        models.Timetable.faculty_id == faculty.id
    ).options(joinedload(models.Timetable.course)).all()

    courses = {}
    for slot in slots:
        if slot.course_id not in courses:
            courses[slot.course_id] = {
                "course_id": slot.course_id,
                "code": slot.course.code if slot.course else "",
                "name": slot.course.name if slot.course else "",
                "semester": slot.semester,
                "section": slot.section
            }
    return list(courses.values())


# ─── Create Assignment ────────────────────────────
@router.post("/assignments")
def create_assignment(
    data: schemas.AssignmentCreate,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    faculty = get_faculty_record(current_user, db)
    assignment = models.Assignment(
        course_id=data.course_id,
        faculty_id=faculty.id,
        title=data.title,
        description=data.description,
        due_date=data.due_date,
        max_marks=data.max_marks
    )
    db.add(assignment)
    db.flush()  # Get the assignment ID without committing

    # Notify all students enrolled in this course
    course = db.query(models.Course).filter(models.Course.id == data.course_id).first()
    registrations = db.query(models.CourseRegistration).filter(
        models.CourseRegistration.course_id == data.course_id
    ).options(joinedload(models.CourseRegistration.student).joinedload(models.Student.user)).all()

    notified = 0
    for reg in registrations:
        s = reg.student
        if not s or not s.user:
            continue
        notif = models.Notification(
            user_id=s.user_id,
            title=f"📝 New Assignment: {data.title}",
            message=f"{'(' + course.code + ') ' if course else ''}Due: {data.due_date}. Max marks: {data.max_marks}",
            type="info"
        )
        db.add(notif)
        # Also send a message so student can see it in inbox
        msg = models.Message(
            sender_id=current_user.id,
            recipient_id=s.user_id,
            subject=f"New Assignment: {data.title}",
            body=f"A new assignment has been posted.\n\nTitle: {data.title}\nDescription: {data.description or 'N/A'}\nDue Date: {data.due_date}\nMax Marks: {data.max_marks}\n\nPlease submit it on time.",
            is_read=False
        )
        db.add(msg)
        notified += 1

    db.commit()
    return {"message": f"Assignment created and sent to {notified} students", "assignment_id": assignment.id}


# ─── Get My Assignments ───────────────────────────
@router.get("/assignments")
def get_my_assignments(
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    faculty = get_faculty_record(current_user, db)
    assignments = db.query(models.Assignment).filter(
        models.Assignment.faculty_id == faculty.id
    ).options(joinedload(models.Assignment.course)).order_by(models.Assignment.due_date.desc()).all()
    return [{
        "id": a.id,
        "course_id": a.course_id,
        "course_code": a.course.code if a.course else "",
        "course_name": a.course.name if a.course else "",
        "title": a.title,
        "description": a.description,
        "due_date": str(a.due_date),
        "max_marks": a.max_marks,
        "submission_count": len(a.submissions) if a.submissions else 0
    } for a in assignments]


# ─── Get Submissions for an Assignment ────────────────────────────────────────
@router.get("/assignments/{assignment_id}/submissions")
def get_assignment_submissions(
    assignment_id: int,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Get all student submissions for a specific assignment."""
    faculty = get_faculty_record(current_user, db)
    assignment = db.query(models.Assignment).filter(
        models.Assignment.id == assignment_id,
        models.Assignment.faculty_id == faculty.id
    ).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found or not yours")

    submissions = db.query(models.AssignmentSubmission).filter(
        models.AssignmentSubmission.assignment_id == assignment_id
    ).options(joinedload(models.AssignmentSubmission.assignment)).all()

    result = []
    for sub in submissions:
        student = db.query(models.Student).filter(models.Student.id == sub.student_id).options(
            joinedload(models.Student.user)
        ).first()
        result.append({
            "id": sub.id,
            "student_id": sub.student_id,
            "student_name": student.user.name if student and student.user else "Unknown",
            "register_number": student.register_number if student else "",
            "submission_text": sub.submission_text,
            "file_url": sub.file_url,
            "submitted_at": str(sub.submitted_at),
            "marks_obtained": float(sub.marks_obtained) if sub.marks_obtained else None,
            "feedback": sub.feedback,
            "graded_at": str(sub.graded_at) if sub.graded_at else None,
        })
    return result


# ─── Grade a Submission ───────────────────────────────────────────────────────
@router.post("/assignments/submissions/{submission_id}/grade")
def grade_submission(
    submission_id: int,
    data: dict,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Grade a specific assignment submission."""
    from datetime import datetime
    sub = db.query(models.AssignmentSubmission).filter(
        models.AssignmentSubmission.id == submission_id
    ).first()
    if not sub:
        raise HTTPException(404, "Submission not found")

    sub.marks_obtained = data.get("marks_obtained")
    sub.feedback = data.get("feedback", "")
    sub.graded_at = datetime.utcnow()
    db.commit()
    return {"message": "Graded successfully"}


# ─── Broadcast message to entire class ───────────────────────────────────────
@router.post("/broadcast-message")
def broadcast_message(
    data: dict,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Send a message to ALL students in a course/class at once."""
    course_id = data.get("course_id")
    subject = data.get("subject", "")
    body = data.get("body", "")
    if not course_id or not body:
        raise HTTPException(400, "course_id and body required")

    faculty = get_faculty_record(current_user, db)
    registrations = db.query(models.CourseRegistration).filter(
        models.CourseRegistration.course_id == course_id,
        models.CourseRegistration.faculty_id == faculty.id
    ).options(joinedload(models.CourseRegistration.student).joinedload(models.Student.user)).all()

    sent = 0
    for reg in registrations:
        s = reg.student
        if not s or not s.user:
            continue
        msg = models.Message(
            sender_id=current_user.id,
            recipient_id=s.user_id,
            subject=subject,
            body=body
        )
        db.add(msg)
        notif = models.Notification(
            user_id=s.user_id,
            title=f"📢 Message from {current_user.name}",
            message=subject or body[:100],
            type="info"
        )
        db.add(notif)
        sent += 1

    db.commit()
    return {"message": f"Broadcast sent to {sent} students"}


# ─── Smart alerts: low CAT, low internal, low attendance ─────────────────────
@router.get("/smart-alerts")
def get_smart_alerts(
    department_id: Optional[int] = None,
    year: Optional[int] = None,
    course_id: Optional[int] = None,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Returns students with low attendance (<75%), low CAT (<25/50), low internal (<23/40)."""
    faculty = get_faculty_record(current_user, db)

    query = db.query(models.CourseRegistration).filter(
        models.CourseRegistration.faculty_id == faculty.id
    )
    if course_id:
        query = query.filter(models.CourseRegistration.course_id == course_id)

    regs = query.options(
        joinedload(models.CourseRegistration.student).joinedload(models.Student.user),
        joinedload(models.CourseRegistration.student).joinedload(models.Student.department),
        joinedload(models.CourseRegistration.course)
    ).all()

    low_attendance = []
    low_cat = []
    low_internal = []

    for reg in regs:
        s = reg.student
        if not s or not s.user:
            continue
        # Filter by dept/year if specified
        if department_id and s.department_id != department_id:
            continue
        if year and s.batch_year != year:
            continue

        base = {
            "student_id": s.id,
            "name": s.user.name,
            "register_number": s.register_number,
            "email": s.user.email,
            "department": s.department.name if s.department else "",
            "batch_year": s.batch_year,
            "course_id": reg.course_id,
            "course_name": reg.course.name if reg.course else ""
        }

        # Attendance check
        att = db.query(models.Attendance).filter(
            models.Attendance.student_id == s.id,
            models.Attendance.course_id == reg.course_id
        ).all()
        total = len(att)
        present = sum(1 for a in att if a.status in ("present", "od"))
        pct = round((present / total * 100) if total > 0 else 0, 1)
        if total > 0 and pct < 75:
            low_attendance.append({**base, "attendance_percentage": pct, "present": present, "total": total})

        # Marks check
        mark = db.query(models.InternalMark).filter(
            models.InternalMark.student_id == s.id,
            models.InternalMark.course_id == reg.course_id
        ).first()
        if mark:
            for cat_field, cat_label in [("cat1", "CAT 1"), ("cat2", "CAT 2"), ("cat3", "CAT 3")]:
                val = getattr(mark, cat_field)
                if val is not None and float(val) < 25:
                    low_cat.append({**base, "exam": cat_label, "marks": float(val), "max": 50})

            # Internal total check
            cats = [float(v) for v in [mark.cat1, mark.cat2, mark.cat3] if v is not None]
            asgns = [float(v) for v in [mark.assignment1, mark.assignment2, mark.assignment3] if v is not None]
            if cats or asgns:
                cat_avg = sum(cats) / len(cats) if cats else 0
                asgn_avg = sum(asgns) / len(asgns) if asgns else 0
                internal = round((cat_avg * 0.7 + asgn_avg * 0.3) / 50 * 40, 2)
                if internal < 23:
                    low_internal.append({**base, "internal_total": internal, "max": 40})

    return {
        "low_attendance": low_attendance,
        "low_cat": low_cat,
        "low_internal": low_internal,
        "counts": {
            "low_attendance": len(low_attendance),
            "low_cat": len(low_cat),
            "low_internal": len(low_internal)
        }
    }


# ─── Attendance day-wise with dates + per-student percentage ─────────────────
@router.get("/attendance/daywise/{course_id}")
def get_daywise_attendance(
    course_id: int,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Return attendance in a pivot: student × date grid with % per student."""
    faculty = get_faculty_record(current_user, db)

    records = db.query(models.Attendance).filter(
        models.Attendance.course_id == course_id,
        models.Attendance.faculty_id == faculty.id
    ).options(
        joinedload(models.Attendance.student).joinedload(models.Student.user)
    ).order_by(models.Attendance.date).all()

    # Build pivot
    dates = sorted(set(str(r.date) for r in records))
    students_map = {}
    for r in records:
        sid = r.student_id
        if sid not in students_map:
            students_map[sid] = {
                "student_id": sid,
                "name": r.student.user.name if r.student and r.student.user else "",
                "register_number": r.student.register_number if r.student else "",
                "by_date": {}
            }
        students_map[sid]["by_date"][str(r.date)] = r.status

    # Calculate percentage per student
    result = []
    for sid, info in students_map.items():
        total = len(dates)
        present = sum(1 for d in dates if info["by_date"].get(d) in ("present", "od"))
        pct = round((present / total * 100) if total > 0 else 0, 1)
        result.append({
            **info,
            "total_classes": total,
            "present": present,
            "percentage": pct,
            "low_attendance": pct < 75 and total > 0
        })

    return {"dates": dates, "students": result}


# ─── Departments + years for filter ──────────────────────────────────────────
@router.get("/filter-options")
def get_filter_options(
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Return departments and batch years for the faculty smart filter."""
    faculty = get_faculty_record(current_user, db)

    regs = db.query(models.CourseRegistration).filter(
        models.CourseRegistration.faculty_id == faculty.id
    ).options(
        joinedload(models.CourseRegistration.student).joinedload(models.Student.department)
    ).all()

    depts = {}
    years = set()
    courses = {}
    for reg in regs:
        s = reg.student
        if s:
            if s.department:
                depts[s.department_id] = s.department.name
            years.add(s.batch_year)
        if reg.course:
            courses[reg.course_id] = {"id": reg.course_id, "name": reg.course.name, "code": reg.course.code}

    return {
        "departments": [{"id": k, "name": v} for k, v in depts.items()],
        "years": sorted(years, reverse=True),
        "courses": list(courses.values())
    }


# ─── Bulk marks upload (all students in one POST) ─────────────────────────────
@router.post("/marks/bulk/{course_id}")
def bulk_upload_marks(
    course_id: int,
    data: dict,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Upload marks for ALL students in a course in one request.
    data: { records: [{ student_id, cat1, cat2, cat3, assignment1, assignment2, assignment3 }] }
    """
    faculty = get_faculty_record(current_user, db)
    records = data.get("records", [])
    updated = 0

    for rec in records:
        student_id = rec.get("student_id")
        if not student_id:
            continue

        existing = db.query(models.InternalMark).filter(
            models.InternalMark.student_id == student_id,
            models.InternalMark.course_id == course_id
        ).first()

        fields = ["cat1", "cat2", "cat3", "assignment1", "assignment2", "assignment3"]
        if existing:
            for f in fields:
                if rec.get(f) is not None:
                    setattr(existing, f, rec[f])
            existing.faculty_id = faculty.id
        else:
            kwargs = {f: rec[f] for f in fields if rec.get(f) is not None}
            existing = models.InternalMark(
                student_id=student_id, course_id=course_id, faculty_id=faculty.id, **kwargs
            )
            db.add(existing)

        # Notify student
        student_obj = db.query(models.Student).filter(models.Student.id == student_id).first()
        if student_obj:
            notif = models.Notification(
                user_id=student_obj.user_id,
                title="Marks Updated",
                message="Your internal marks have been updated. Check your Marks & Results page.",
                type="info"
            )
            db.add(notif)
        updated += 1

    db.commit()
    return {"message": f"Marks updated for {updated} students", "updated": updated}


# ─── Internal Marks: auto-calculate and save total ───────────────────────────
@router.post("/marks/{student_id}/{course_id}/recalculate")
def recalculate_internal(
    student_id: int,
    course_id: int,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Trigger auto-recalculation of internal_total on an existing mark record."""
    mark = db.query(models.InternalMark).filter(
        models.InternalMark.student_id == student_id,
        models.InternalMark.course_id == course_id
    ).first()
    if not mark:
        raise HTTPException(404, "Mark record not found")
    # The DB trigger should handle this, but we commit to ensure
    db.commit()
    db.refresh(mark)
    return {"internal_total": mark.internal_total}

# ─── Faculty Messages Inbox (for OD/Internship approvals) ────────────────────
@router.get("/messages-inbox")
def get_faculty_inbox(
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Return all messages received by this faculty member."""
    from sqlalchemy.orm import aliased
    msgs = db.query(models.Message).filter(
        models.Message.recipient_id == current_user.id
    ).order_by(models.Message.sent_at.desc()).limit(100).all()

    result = []
    for m in msgs:
        sender = db.query(models.User).filter(models.User.id == m.sender_id).first()
        # Try to get register number if sender is student
        student = db.query(models.Student).filter(models.Student.user_id == m.sender_id).first() if sender else None
        result.append({
            "id": m.id,
            "subject": m.subject,
            "body": m.body,
            "sender_name": sender.name if sender else "Unknown",
            "sender_user_id": m.sender_id,
            "sender_reg": student.register_number if student else "",
            "is_read": m.is_read,
            "created_at": str(m.sent_at)
        })
    return result


@router.get("/notifications")
def get_faculty_notifications(
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Return all notifications for this faculty member (from admin broadcasts)."""
    notifs = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id
    ).order_by(models.Notification.created_at.desc()).limit(50).all()
    return [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "type": n.type,
            "is_read": n.is_read,
            "created_at": str(n.created_at)
        }
        for n in notifs
    ]