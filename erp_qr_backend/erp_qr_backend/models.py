from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base

# ---------------- USERS ----------------
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    email = Column(String, unique=True)
    password = Column(String)
    role = Column(String)
    institution_id=Column(Integer)  # "faculty" or "student"


# ---------------- COURSES ----------------
class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    faculty_id = Column(Integer, ForeignKey("users.id"))


# ---------------- ENROLLMENTS ----------------
class Enrollment(Base):
    __tablename__ = "enrollments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"))
    course_id = Column(Integer, ForeignKey("courses.id"))


# ---------------- ATTENDANCE SESSION ----------------
class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_code = Column(String, unique=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ---------------- ATTENDANCE RECORD ----------------
class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    session_code = Column(String)
    student_id = Column(Integer, ForeignKey("users.id"))
    marked_at = Column(DateTime(timezone=True), server_default=func.now())
    # Institution Model
class Institution(Base):
    __tablename__ = "institutions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    location = Column(String)


# Update User Model (ADD institution_id)
# Add this inside your existing User model:

institution_id = Column(Integer, ForeignKey("institutions.id"))


# Event Model
class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    description = Column(String)
    date = Column(DateTime)
    created_by = Column(Integer, ForeignKey("users.id"))
    institution_id = Column(Integer, ForeignKey("institutions.id"))
    is_intercollege = Column(Boolean, default=False)


# Event Registration Model
class EventRegistration(Base):
    __tablename__ = "event_registrations"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"))
    student_id = Column(Integer, ForeignKey("users.id"))
    institution_id = Column(Integer, ForeignKey("institutions.id"))