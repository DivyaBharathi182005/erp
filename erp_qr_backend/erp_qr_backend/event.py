from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import SessionLocal
import models
import datetime

router = APIRouter()


# -------------------------------
# Database dependency
# -------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -------------------------------
# Admin Create Event
# -------------------------------
@router.post("/create-event")
def create_event(title: str,
                 description: str,
                 date: str,
                 admin_id: int,
                 is_intercollege: bool,
                 db: Session = Depends(get_db)):

    admin = db.query(models.User).filter(
        models.User.id == admin_id,
        models.User.role == "admin"
    ).first()

    if not admin:
        return {"status": "error", "message": "Only admin can create events"}

    try:
        parsed_date = datetime.datetime.strptime(date, "%Y-%m-%d")
    except:
        return {"status": "error", "message": "Date format must be YYYY-MM-DD"}

    event = models.Event(
        title=title,
        description=description,
        date=parsed_date,
        created_by=admin_id,
        institution_id=admin.institution_id,
        is_intercollege=is_intercollege
    )

    db.add(event)
    db.commit()

    return {"status": "success", "message": "Event created successfully"}


# -------------------------------
# Get Intercollege Events
# -------------------------------
@router.get("/intercollege-events")
def get_intercollege_events(db: Session = Depends(get_db)):

    events = db.query(models.Event).filter(
        models.Event.is_intercollege == True
    ).all()

    return [
        {
            "id": event.id,
            "title": event.title,
            "description": event.description,
            "date": event.date.strftime("%Y-%m-%d")
        }
        for event in events
    ]


# -------------------------------
# Get Internal Events
# -------------------------------
@router.get("/internal-events")
def get_internal_events(student_id: int, db: Session = Depends(get_db)):

    student = db.query(models.User).filter(
        models.User.id == student_id
    ).first()

    if not student:
        return {"status": "error", "message": "Student not found"}

    events = db.query(models.Event).filter(
        models.Event.is_intercollege == False,
        models.Event.institution_id == student.institution_id
    ).all()

    return [
        {
            "id": event.id,
            "title": event.title,
            "description": event.description,
            "date": event.date.strftime("%Y-%m-%d")
        }
        for event in events
    ]


# -------------------------------
# Register Event
# -------------------------------
@router.post("/register-event")
def register_event(event_id: int,
                   student_id: int,
                   db: Session = Depends(get_db)):

    student = db.query(models.User).filter(
        models.User.id == student_id,
        models.User.role == "student"
    ).first()

    if not student:
        return {"status": "error", "message": "Only students can register"}

    event = db.query(models.Event).filter(
        models.Event.id == event_id
    ).first()

    if not event:
        return {"status": "error", "message": "Event not found"}

    # 🔥 Allow intercollege for everyone
    # Restrict internal to same institution
    if not event.is_intercollege:
        if student.institution_id != event.institution_id:
            return {
                "status": "error",
                "message": "Not allowed to register for this internal event"
            }

    # Prevent duplicate registration
    existing = db.query(models.EventRegistration).filter(
        models.EventRegistration.event_id == event_id,
        models.EventRegistration.student_id == student_id
    ).first()

    if existing:
        return {"status": "exists", "message": "Already registered"}

    registration = models.EventRegistration(
        event_id=event_id,
        student_id=student_id,
        institution_id=student.institution_id
    )

    db.add(registration)
    db.commit()

    return {"status": "success", "message": "Registered successfully"}


# -------------------------------
# View All Registrations (Admin)
# -------------------------------
@router.get("/event-registrations")
def view_registrations(db: Session = Depends(get_db)):

    registrations = db.query(models.EventRegistration).all()

    result = []

    for r in registrations:

        student = db.query(models.User).filter(
            models.User.id == r.student_id
        ).first()

        event = db.query(models.Event).filter(
            models.Event.id == r.event_id
        ).first()

        result.append({
            "event_id": event.id,
            "event_title": event.title,
            "student_id": student.id,
            "student_name": student.name,
            "institution_id": r.institution_id
        })

    return result