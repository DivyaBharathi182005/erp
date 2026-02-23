from sqlalchemy import (Column, Integer, String, Text, Boolean, Date, DateTime, 
                         Numeric, ForeignKey, Time, CheckConstraint, UniqueConstraint)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(Text, nullable=False)
    role = Column(String(20), nullable=False)
    photo_url = Column(Text)
    phone = Column(String(15))
    address = Column(Text)
    date_of_birth = Column(Date)
    gender = Column(String(10))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    student = relationship("Student", back_populates="user", uselist=False)
    faculty = relationship("Faculty", back_populates="user", uselist=False)
    sent_messages = relationship("Message", foreign_keys="Message.sender_id", back_populates="sender")
    received_messages = relationship("Message", foreign_keys="Message.recipient_id", back_populates="recipient")
    notifications = relationship("Notification", back_populates="user")


class Department(Base):
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    head_faculty_id = Column(Integer, ForeignKey("users.id"))

    students = relationship("Student", back_populates="department")
    faculty_members = relationship("Faculty", back_populates="department")
    courses = relationship("Course", back_populates="department")


class Student(Base):
    __tablename__ = "students"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    register_number = Column(String(20), unique=True, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"))
    batch_year = Column(Integer, nullable=False)
    current_semester = Column(Integer, default=1)
    section = Column(String(5))
    blood_group = Column(String(5))
    guardian_name = Column(String(100))
    guardian_phone = Column(String(15))
    admission_date = Column(Date)
    cgpa = Column(Numeric(4, 2), default=0.00)

    user = relationship("User", back_populates="student")
    department = relationship("Department", back_populates="students")
    registrations = relationship("CourseRegistration", back_populates="student")
    attendance = relationship("Attendance", back_populates="student")
    internal_marks = relationship("InternalMark", back_populates="student")
    exam_registrations = relationship("ExamRegistration", back_populates="student")
    exam_fees = relationship("ExamFee", back_populates="student")


class Faculty(Base):
    __tablename__ = "faculty"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    employee_id = Column(String(20), unique=True, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"))
    designation = Column(String(100))
    specialization = Column(String(200))
    joining_date = Column(Date)
    experience_years = Column(Integer, default=0)

    user = relationship("User", back_populates="faculty")
    department = relationship("Department", back_populates="faculty_members")
    timetable = relationship("Timetable", back_populates="faculty")
    attendance_marked = relationship("Attendance", back_populates="faculty")
    assignments = relationship("Assignment", back_populates="faculty")
    internal_marks_entered = relationship("InternalMark", back_populates="faculty", foreign_keys="InternalMark.faculty_id") if False else []


class Course(Base):
    __tablename__ = "courses"
    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"))
    credits = Column(Integer, default=3)
    semester = Column(Integer, nullable=False)
    course_type = Column(String(20), default="theory")
    max_marks = Column(Integer, default=100)
    description = Column(Text)

    department = relationship("Department", back_populates="courses")
    registrations = relationship("CourseRegistration", back_populates="course")
    timetable = relationship("Timetable", back_populates="course")
    attendance = relationship("Attendance", back_populates="course")
    internal_marks = relationship("InternalMark", back_populates="course")
    assignments = relationship("Assignment", back_populates="course")


class CourseRegistration(Base):
    __tablename__ = "course_registrations"
    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    course_id = Column(Integer, ForeignKey("courses.id"))
    faculty_id = Column(Integer, ForeignKey("faculty.id"))
    semester = Column(Integer, nullable=False)
    academic_year = Column(String(10), nullable=False)
    registered_at = Column(DateTime, server_default=func.now())

    student = relationship("Student", back_populates="registrations")
    course = relationship("Course", back_populates="registrations")
    __table_args__ = (UniqueConstraint("student_id", "course_id", "academic_year"),)


class Timetable(Base):
    __tablename__ = "timetable"
    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    faculty_id = Column(Integer, ForeignKey("faculty.id"))
    department_id = Column(Integer, ForeignKey("departments.id"))
    semester = Column(Integer, nullable=False)
    section = Column(String(5))
    day_of_week = Column(String(10), nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    room_number = Column(String(20))
    academic_year = Column(String(10))

    course = relationship("Course", back_populates="timetable")
    faculty = relationship("Faculty", back_populates="timetable")


class Attendance(Base):
    __tablename__ = "attendance"
    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    course_id = Column(Integer, ForeignKey("courses.id"))
    faculty_id = Column(Integer, ForeignKey("faculty.id"))
    date = Column(Date, nullable=False)
    status = Column(String(10), nullable=False)
    marked_at = Column(DateTime, server_default=func.now())

    student = relationship("Student", back_populates="attendance")
    course = relationship("Course", back_populates="attendance")
    faculty = relationship("Faculty", back_populates="attendance_marked")
    __table_args__ = (UniqueConstraint("student_id", "course_id", "date"),)


class InternalMark(Base):
    __tablename__ = "internal_marks"
    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    course_id = Column(Integer, ForeignKey("courses.id"))
    faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=True)
    cat1 = Column(Numeric(5, 2), default=0)
    cat2 = Column(Numeric(5, 2), default=0)
    cat3 = Column(Numeric(5, 2), default=0)
    assignment1 = Column(Numeric(5, 2), default=0)
    assignment2 = Column(Numeric(5, 2), default=0)
    assignment3 = Column(Numeric(5, 2), default=0)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    student = relationship("Student", back_populates="internal_marks")
    course = relationship("Course", back_populates="internal_marks")
    faculty = relationship("Faculty", foreign_keys=[faculty_id])

    @property
    def internal_total(self):
        fat_avg = (float(self.cat1) + float(self.cat2) + float(self.cat3)) / 3.0
        asgn_avg = (float(self.assignment1) + float(self.assignment2) + float(self.assignment3)) / 3.0
        return round(fat_avg * 0.70 + asgn_avg * 0.30, 2)

    __table_args__ = (UniqueConstraint("student_id", "course_id"),)


class Assignment(Base):
    __tablename__ = "assignments"
    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    faculty_id = Column(Integer, ForeignKey("faculty.id"))
    title = Column(String(200), nullable=False)
    description = Column(Text)
    due_date = Column(Date, nullable=False)
    max_marks = Column(Integer, default=50)
    created_at = Column(DateTime, server_default=func.now())

    course = relationship("Course", back_populates="assignments")
    faculty = relationship("Faculty", back_populates="assignments")
    submissions = relationship("AssignmentSubmission", back_populates="assignment")


class AssignmentSubmission(Base):
    __tablename__ = "assignment_submissions"
    id = Column(Integer, primary_key=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"))
    student_id = Column(Integer, ForeignKey("students.id"))
    submission_text = Column(Text)
    file_url = Column(Text)
    submitted_at = Column(DateTime, server_default=func.now())
    marks_obtained = Column(Numeric(5, 2))
    feedback = Column(Text)
    graded_at = Column(DateTime)

    assignment = relationship("Assignment", back_populates="submissions")
    __table_args__ = (UniqueConstraint("assignment_id", "student_id"),)


class ExamRegistration(Base):
    __tablename__ = "exam_registrations"
    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    semester = Column(Integer, nullable=False)
    academic_year = Column(String(10), nullable=False)
    registered_at = Column(DateTime, server_default=func.now())
    status = Column(String(20), default="pending")

    student = relationship("Student", back_populates="exam_registrations")
    __table_args__ = (UniqueConstraint("student_id", "semester", "academic_year"),)


class ExamFee(Base):
    __tablename__ = "exam_fees"
    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    semester = Column(Integer, nullable=False)
    academic_year = Column(String(10), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    payment_status = Column(String(20), default="pending")
    transaction_id = Column(String(100))
    paid_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())

    student = relationship("Student", back_populates="exam_fees")


class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    recipient_id = Column(Integer, ForeignKey("users.id"))
    subject = Column(String(200))
    body = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    sent_at = Column(DateTime, server_default=func.now())

    sender = relationship("User", foreign_keys=[sender_id], back_populates="sent_messages")
    recipient = relationship("User", foreign_keys=[recipient_id], back_populates="received_messages")


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(30), default="info")
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="notifications")
