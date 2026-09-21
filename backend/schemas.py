from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date, datetime, time
from decimal import Decimal


# ─── Auth ───────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_id: int
    name: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# ─── User ───────────────────────────────────────────
class UserBase(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    photo_url: Optional[str] = None

class UserCreate(UserBase):
    password: str
    role: str

class UserUpdate(BaseModel):
    phone: Optional[str] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None

class UserResponse(UserBase):
    id: int
    role: str
    is_active: bool
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True


# ─── Department ─────────────────────────────────────
class DepartmentResponse(BaseModel):
    id: int
    name: str
    code: str
    class Config:
        from_attributes = True


# ─── Student ────────────────────────────────────────
class StudentDetail(BaseModel):
    id: int
    register_number: str
    batch_year: int
    current_semester: int
    section: Optional[str]
    blood_group: Optional[str]
    guardian_name: Optional[str]
    guardian_phone: Optional[str]
    admission_date: Optional[date]
    cgpa: Optional[Decimal]
    department: Optional[DepartmentResponse] = None
    user: Optional[UserResponse] = None
    class Config:
        from_attributes = True

class StudentCreate(BaseModel):
    name: str
    email: str
    password: str
    register_number: str
    department_id: int
    batch_year: int
    current_semester: int = 1
    section: Optional[str] = None
    blood_group: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None


# ─── Faculty ────────────────────────────────────────
class FacultyDetail(BaseModel):
    id: int
    employee_id: str
    designation: Optional[str]
    specialization: Optional[str]
    experience_years: Optional[int]
    department: Optional[DepartmentResponse] = None
    user: Optional[UserResponse] = None
    class Config:
        from_attributes = True

class FacultyCreate(BaseModel):
    name: str
    email: str
    password: str
    employee_id: str
    department_id: int
    designation: Optional[str] = None
    specialization: Optional[str] = None
    experience_years: int = 0
    phone: Optional[str] = None
    gender: Optional[str] = None


# ─── Course ─────────────────────────────────────────
class CourseResponse(BaseModel):
    id: int
    code: str
    name: str
    credits: int
    semester: int
    course_type: str
    max_marks: Optional[int]
    description: Optional[str]
    department: Optional[DepartmentResponse] = None
    class Config:
        from_attributes = True


# ─── Timetable ──────────────────────────────────────
class TimetableSlot(BaseModel):
    id: int
    day_of_week: str
    start_time: time
    end_time: time
    room_number: Optional[str]
    course: Optional[CourseResponse] = None
    class Config:
        from_attributes = True


# ─── Attendance ─────────────────────────────────────
class AttendanceRecord(BaseModel):
    id: int
    date: date
    status: str
    course: Optional[CourseResponse] = None
    class Config:
        from_attributes = True

class AttendanceSummary(BaseModel):
    course_id: int
    course_name: str
    course_code: str
    total_classes: int
    present: int
    absent: int
    percentage: float

class AttendanceMarkRequest(BaseModel):
    course_id: int
    date: date
    records: List[dict]  # [{"student_id": 1, "status": "present"}, ...]


# ─── Marks ──────────────────────────────────────────
class InternalMarkResponse(BaseModel):
    id: int
    course_id: int
    course_name: Optional[str] = None
    cat1: Optional[Decimal]
    cat2: Optional[Decimal]
    cat3: Optional[Decimal]
    assignment1: Optional[Decimal]
    assignment2: Optional[Decimal]
    assignment3: Optional[Decimal]
    internal_total: Optional[float] = None
    class Config:
        from_attributes = True

class InternalMarkUpdate(BaseModel):
    cat1: Optional[float] = None
    cat2: Optional[float] = None
    cat3: Optional[float] = None
    assignment1: Optional[float] = None
    assignment2: Optional[float] = None
    assignment3: Optional[float] = None


# ─── Assignments ────────────────────────────────────
class AssignmentResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    due_date: date
    max_marks: int
    course: Optional[CourseResponse] = None
    class Config:
        from_attributes = True

class AssignmentCreate(BaseModel):
    course_id: int
    title: str
    description: Optional[str] = None
    due_date: date
    max_marks: int = 50


# ─── Exam Registration & Fees ───────────────────────
class ExamRegistrationCreate(BaseModel):
    semester: int
    academic_year: str

class ExamFeeResponse(BaseModel):
    id: int
    semester: int
    academic_year: str
    amount: Decimal
    payment_status: str
    transaction_id: Optional[str]
    paid_at: Optional[datetime]
    class Config:
        from_attributes = True

class ExamFeePayment(BaseModel):
    transaction_id: str


# ─── Messages ───────────────────────────────────────
class MessageCreate(BaseModel):
    recipient_id: int
    subject: Optional[str] = None
    body: str

class MessageResponse(BaseModel):
    id: int
    subject: Optional[str]
    body: str
    is_read: bool
    sent_at: datetime
    sender: Optional[UserResponse] = None
    recipient: Optional[UserResponse] = None
    class Config:
        from_attributes = True


# ─── Notification ───────────────────────────────────
class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    type: str
    is_read: bool
    created_at: datetime
    class Config:
        from_attributes = True
