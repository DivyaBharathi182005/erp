from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List
from database import get_db
import models, schemas
from auth import get_current_user, require_role
from datetime import date

router = APIRouter(prefix="/student", tags=["Student"])


def get_student_record(user: models.User, db: Session):
    student = db.query(models.Student).filter(models.Student.user_id == user.id)\
        .options(joinedload(models.Student.department), joinedload(models.Student.user)).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found")
    return student


# ─── Profile ──────────────────────────────────────
@router.get("/profile", response_model=schemas.StudentDetail)
def get_profile(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    return get_student_record(current_user, db)


# ─── Dashboard Stats ──────────────────────────────
@router.get("/dashboard")
def get_dashboard(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    student = get_student_record(current_user, db)
    
    # Attendance overall
    total = db.query(models.Attendance).filter(models.Attendance.student_id == student.id).count()
    present = db.query(models.Attendance).filter(
        models.Attendance.student_id == student.id,
        models.Attendance.status.in_(["present", "od"])
    ).count()
    
    # Notifications unread
    unread_notif = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).count()

    # Unread messages
    unread_msgs = db.query(models.Message).filter(
        models.Message.recipient_id == current_user.id,
        models.Message.is_read == False
    ).count()

    # Registered courses count
    course_count = db.query(models.CourseRegistration).filter(
        models.CourseRegistration.student_id == student.id
    ).count()

    return {
        "student": {
            "name": current_user.name,
            "register_number": student.register_number,
            "semester": student.current_semester,
            "section": student.section,
            "cgpa": float(student.cgpa) if student.cgpa else 0.0,
            "department": student.department.name if student.department else ""
        },
        "attendance_percentage": round((present / total * 100) if total > 0 else 0, 1),
        "total_courses": course_count,
        "unread_notifications": unread_notif,
        "unread_messages": unread_msgs
    }


# ─── Timetable ────────────────────────────────────
@router.get("/timetable")
def get_timetable(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    student = get_student_record(current_user, db)
    slots = db.query(models.Timetable).filter(
        models.Timetable.department_id == student.department_id,
        models.Timetable.semester == student.current_semester,
        models.Timetable.section == student.section
    ).options(
        joinedload(models.Timetable.course),
        joinedload(models.Timetable.faculty).joinedload(models.Faculty.user)
    ).all()

    days_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    timetable = {day: [] for day in days_order}
    for slot in slots:
        timetable[slot.day_of_week].append({
            "id": slot.id,
            "start_time": str(slot.start_time),
            "end_time": str(slot.end_time),
            "course_code": slot.course.code if slot.course else "",
            "course_name": slot.course.name if slot.course else "",
            "faculty_name": slot.faculty.user.name if slot.faculty and slot.faculty.user else "",
            "room": slot.room_number
        })
    return timetable


# ─── Attendance ───────────────────────────────────
@router.get("/attendance")
def get_attendance(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    student = get_student_record(current_user, db)
    registrations = db.query(models.CourseRegistration).filter(
        models.CourseRegistration.student_id == student.id
    ).options(joinedload(models.CourseRegistration.course)).all()

    result = []
    for reg in registrations:
        records = db.query(models.Attendance).filter(
            models.Attendance.student_id == student.id,
            models.Attendance.course_id == reg.course_id
        ).all()
        total = len(records)
        present = sum(1 for r in records if r.status in ("present", "od"))
        absent = sum(1 for r in records if r.status == "absent")
        result.append({
            "course_id": reg.course_id,
            "course_name": reg.course.name if reg.course else "",
            "course_code": reg.course.code if reg.course else "",
            "total_classes": total,
            "present": present,
            "absent": absent,
            "percentage": round((present / total * 100) if total > 0 else 0, 1)
        })
    return result


# ─── Internal Marks ───────────────────────────────
@router.get("/marks")
def get_marks(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    student = get_student_record(current_user, db)
    marks = db.query(models.InternalMark).filter(
        models.InternalMark.student_id == student.id
    ).options(joinedload(models.InternalMark.course)).all()

    result = []
    for m in marks:
        result.append({
            "course_id": m.course_id,
            "course_name": m.course.name if m.course else "",
            "course_code": m.course.code if m.course else "",
            "cat1": float(m.cat1) if m.cat1 else 0,
            "cat2": float(m.cat2) if m.cat2 else 0,
            "cat3": float(m.cat3) if m.cat3 else 0,
            "assignment1": float(m.assignment1) if m.assignment1 else 0,
            "assignment2": float(m.assignment2) if m.assignment2 else 0,
            "assignment3": float(m.assignment3) if m.assignment3 else 0,
            "internal_total": m.internal_total
        })
    return result


# ─── Assignments ──────────────────────────────────
@router.get("/assignments")
def get_assignments(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    student = get_student_record(current_user, db)
    reg_course_ids = [r.course_id for r in db.query(models.CourseRegistration).filter(
        models.CourseRegistration.student_id == student.id
    ).all()]

    assignments = db.query(models.Assignment).filter(
        models.Assignment.course_id.in_(reg_course_ids)
    ).options(joinedload(models.Assignment.course)).order_by(models.Assignment.due_date).all()

    result = []
    for a in assignments:
        submission = db.query(models.AssignmentSubmission).filter(
            models.AssignmentSubmission.assignment_id == a.id,
            models.AssignmentSubmission.student_id == student.id
        ).first()
        result.append({
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "due_date": str(a.due_date),
            "max_marks": a.max_marks,
            "course_name": a.course.name if a.course else "",
            "course_code": a.course.code if a.course else "",
            "submitted": submission is not None,
            "marks_obtained": float(submission.marks_obtained) if submission and submission.marks_obtained else None,
            "feedback": submission.feedback if submission else None
        })
    return result


# ─── Courses ──────────────────────────────────────
@router.get("/courses")
def get_courses(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    student = get_student_record(current_user, db)
    registrations = db.query(models.CourseRegistration).filter(
        models.CourseRegistration.student_id == student.id
    ).options(
        joinedload(models.CourseRegistration.course).joinedload(models.Course.department)
    ).all()

    return [{
        "course_id": r.course_id,
        "code": r.course.code,
        "name": r.course.name,
        "credits": r.course.credits,
        "type": r.course.course_type,
        "semester": r.semester,
        "academic_year": r.academic_year
    } for r in registrations if r.course]


# ─── Exam Registration ────────────────────────────
@router.post("/exam-register")
def exam_register(
    data: schemas.ExamRegistrationCreate,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    student = get_student_record(current_user, db)
    existing = db.query(models.ExamRegistration).filter(
        models.ExamRegistration.student_id == student.id,
        models.ExamRegistration.semester == data.semester,
        models.ExamRegistration.academic_year == data.academic_year
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already registered for this exam")

    reg = models.ExamRegistration(
        student_id=student.id,
        semester=data.semester,
        academic_year=data.academic_year
    )
    db.add(reg)
    db.commit()
    return {"message": "Exam registration successful", "status": "pending"}


@router.get("/exam-registrations")
def get_exam_registrations(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    student = get_student_record(current_user, db)
    return db.query(models.ExamRegistration).filter(
        models.ExamRegistration.student_id == student.id
    ).all()


# ─── Exam Fees ────────────────────────────────────
@router.get("/exam-fees", response_model=List[schemas.ExamFeeResponse])
def get_exam_fees(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    student = get_student_record(current_user, db)
    return db.query(models.ExamFee).filter(models.ExamFee.student_id == student.id).all()


@router.post("/exam-fees/{fee_id}/pay")
def pay_exam_fee(
    fee_id: int,
    data: schemas.ExamFeePayment,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    student = get_student_record(current_user, db)
    fee = db.query(models.ExamFee).filter(
        models.ExamFee.id == fee_id,
        models.ExamFee.student_id == student.id
    ).first()
    if not fee:
        raise HTTPException(status_code=404, detail="Fee record not found")
    if fee.payment_status == "paid":
        raise HTTPException(status_code=400, detail="Already paid")

    from datetime import datetime
    fee.payment_status = "paid"
    fee.transaction_id = data.transaction_id
    fee.paid_at = datetime.utcnow()
    db.commit()
    return {"message": "Payment successful"}


# ─── Messages ─────────────────────────────────────
@router.get("/messages")
def get_messages(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    messages = db.query(models.Message).filter(
        models.Message.recipient_id == current_user.id
    ).options(joinedload(models.Message.sender)).order_by(models.Message.sent_at.desc()).all()
    
    result = []
    for m in messages:
        result.append({
            "id": m.id,
            "subject": m.subject,
            "body": m.body,
            "is_read": m.is_read,
            "sent_at": str(m.sent_at),
            "sender_name": m.sender.name if m.sender else "System"
        })
    return result


@router.post("/messages/{msg_id}/read")
def mark_message_read(
    msg_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    msg = db.query(models.Message).filter(
        models.Message.id == msg_id,
        models.Message.recipient_id == current_user.id
    ).first()
    if msg:
        msg.is_read = True
        db.commit()
    return {"message": "Marked as read"}


# ─── Notifications ────────────────────────────────
@router.get("/notifications")
def get_notifications(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    return db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id
    ).order_by(models.Notification.created_at.desc()).all()


# ─── Student → Faculty Messaging ─────────────────────────────────────────────
@router.post("/send-message")
def send_message_to_faculty(
    data: dict,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    """Allow a student to send a direct message to a faculty member."""
    faculty_id = data.get("faculty_id")
    if not faculty_id:
        raise HTTPException(400, "faculty_id required")
    faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(404, "Faculty not found")

    msg = models.Message(
        sender_id=current_user.id,
        recipient_id=faculty.user_id,
        subject=data.get("subject", "(No subject)"),
        body=data.get("body", ""),
        is_read=False
    )
    db.add(msg)
    notif = models.Notification(
        user_id=faculty.user_id,
        title=f"New message from {current_user.name}",
        message=data.get("subject", "(No subject)"),
        type="info"
    )
    db.add(notif)
    db.commit()
    return {"message": "Message sent to faculty."}


# ─── Faculty List (for OD/Internship applications) ───────────────────────────
@router.get("/faculty-list")
def get_faculty_list(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    """Return all active faculty members for the student to select when submitting OD/internship."""
    faculty_records = db.query(models.Faculty).options(
        joinedload(models.Faculty.user),
        joinedload(models.Faculty.department)
    ).all()
    result = []
    for f in faculty_records:
        if f.user and f.user.is_active:
            result.append({
                "id": f.id,
                "user_id": f.user_id,
                "name": f.user.name,
                "employee_id": f.employee_id,
                "designation": f.designation or "Faculty",
                "department": f.department.name if f.department else "",
            })
    return sorted(result, key=lambda x: x["name"])


# ─── Assignment Submission ────────────────────────────────────────────────────
@router.post("/assignments/submit")
def submit_assignment(
    data: dict,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    """Submit an assignment (text or file)."""
    student = get_student_record(current_user, db)
    assignment_id = data.get("assignment_id")
    if not assignment_id:
        raise HTTPException(400, "assignment_id required")

    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    # Check if already submitted
    existing = db.query(models.AssignmentSubmission).filter(
        models.AssignmentSubmission.assignment_id == assignment_id,
        models.AssignmentSubmission.student_id == student.id
    ).first()

    if existing:
        # Allow resubmission — update existing
        existing.submission_text = data.get("submission_text") or existing.submission_text
        if data.get("file_name"):
            existing.file_url = f"/uploads/{data['file_name']}"
        db.commit()
        return {"message": "Assignment resubmitted successfully", "id": existing.id}

    submission = models.AssignmentSubmission(
        assignment_id=assignment_id,
        student_id=student.id,
        submission_text=data.get("submission_text"),
        file_url=f"/uploads/{data['file_name']}" if data.get("file_name") else None,
    )
    db.add(submission)

    # Notify faculty if there is one
    if assignment.faculty_id:
        faculty = db.query(models.Faculty).filter(models.Faculty.id == assignment.faculty_id).first()
        if faculty:
            notif = models.Notification(
                user_id=faculty.user_id,
                title="New Assignment Submission",
                message=f"{current_user.name} submitted '{assignment.title}'",
                type="info"
            )
            db.add(notif)

    db.commit()
    db.refresh(submission)
    return {"message": "Assignment submitted successfully", "id": submission.id}


# ─── OD Application ──────────────────────────────────────────────────────────
# Stored as Messages to faculty (no separate DB table needed)
@router.post("/od")
def submit_od(
    data: dict,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    student = get_student_record(current_user, db)
    faculty_id = data.get("faculty_id")
    if not faculty_id:
        raise HTTPException(400, "faculty_id required")

    faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(404, "Faculty not found")

    reason = data.get("reason", "")
    from_date = data.get("from_date", "")
    to_date = data.get("to_date", "")
    event_name = data.get("event_name", "")
    venue = data.get("venue", "")

    body = f"""OD APPLICATION REQUEST
Student: {current_user.name}
Register No: {student.register_number}
Event: {event_name or 'N/A'}
Venue: {venue or 'N/A'}
From: {from_date}  To: {to_date}
Reason: {reason}

[Please reply to approve or reject this application]"""

    msg = models.Message(
        sender_id=current_user.id,
        recipient_id=faculty.user_id,
        subject=f"OD Application – {current_user.name} ({from_date} to {to_date})",
        body=body,
        is_read=False
    )
    db.add(msg)

    # Notify faculty
    notif = models.Notification(
        user_id=faculty.user_id,
        title="OD Application Received",
        message=f"{current_user.name} has submitted an OD application for {from_date} to {to_date}",
        type="info"
    )
    db.add(notif)
    db.commit()
    return {"message": "OD application submitted. Faculty notified."}


@router.get("/od/my")
def get_my_od(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    """Return all OD applications sent by this student."""
    msgs = db.query(models.Message).filter(
        models.Message.sender_id == current_user.id,
        models.Message.subject.like("OD Application%")
    ).order_by(models.Message.sent_at.desc()).all()
    return [{
        "id": m.id,
        "subject": m.subject,
        "status": "pending",
        "sent_at": str(m.sent_at)
    } for m in msgs]


# ─── Internship Application ───────────────────────────────────────────────────
@router.post("/internship")
def submit_internship(
    data: dict,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    student = get_student_record(current_user, db)
    faculty_id = data.get("faculty_id")
    if not faculty_id:
        raise HTTPException(400, "faculty_id required")

    faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(404, "Faculty not found")

    company = data.get("company_name", "")
    role = data.get("role", "")
    from_date = data.get("from_date", "")
    to_date = data.get("to_date", "")
    description = data.get("description", "")

    body = f"""INTERNSHIP PERMISSION REQUEST
Student: {current_user.name}
Register No: {student.register_number}
Company: {company}
Role: {role or 'N/A'}
From: {from_date}  To: {to_date}
Description: {description or 'N/A'}

[Please reply to approve or reject this application]"""

    msg = models.Message(
        sender_id=current_user.id,
        recipient_id=faculty.user_id,
        subject=f"Internship Application – {current_user.name} at {company}",
        body=body,
        is_read=False
    )
    db.add(msg)

    notif = models.Notification(
        user_id=faculty.user_id,
        title="Internship Application Received",
        message=f"{current_user.name} has applied for internship at {company}",
        type="info"
    )
    db.add(notif)
    db.commit()
    return {"message": "Internship application submitted. Faculty notified."}


@router.get("/internship/my")
def get_my_internship(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db)
):
    msgs = db.query(models.Message).filter(
        models.Message.sender_id == current_user.id,
        models.Message.subject.like("Internship Application%")
    ).order_by(models.Message.sent_at.desc()).all()
    return [{
        "id": m.id,
        "subject": m.subject,
        "status": "pending",
        "sent_at": str(m.sent_at)
    } for m in msgs]