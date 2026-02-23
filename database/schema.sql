-- ============================================
-- COMPLETE ERP SYSTEM - PostgreSQL Schema
-- ============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS TABLE (Students, Faculty, Admin)
-- ============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'faculty', 'admin')),
    photo_url TEXT DEFAULT NULL,
    phone VARCHAR(15),
    address TEXT,
    date_of_birth DATE,
    gender VARCHAR(10),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- DEPARTMENTS
-- ============================================
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    head_faculty_id INT REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- STUDENTS (extends users)
-- ============================================
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    register_number VARCHAR(20) UNIQUE NOT NULL,
    department_id INT REFERENCES departments(id),
    batch_year INT NOT NULL,
    current_semester INT NOT NULL DEFAULT 1,
    section VARCHAR(5),
    blood_group VARCHAR(5),
    guardian_name VARCHAR(100),
    guardian_phone VARCHAR(15),
    admission_date DATE DEFAULT CURRENT_DATE,
    cgpa DECIMAL(4,2) DEFAULT 0.00
);

-- ============================================
-- FACULTY (extends users)
-- ============================================
CREATE TABLE faculty (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    employee_id VARCHAR(20) UNIQUE NOT NULL,
    department_id INT REFERENCES departments(id),
    designation VARCHAR(100),
    specialization VARCHAR(200),
    joining_date DATE DEFAULT CURRENT_DATE,
    experience_years INT DEFAULT 0
);

-- ============================================
-- COURSES
-- ============================================
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    department_id INT REFERENCES departments(id),
    credits INT NOT NULL DEFAULT 3,
    semester INT NOT NULL,
    course_type VARCHAR(20) DEFAULT 'theory' CHECK (course_type IN ('theory', 'lab', 'elective')),
    max_marks INT DEFAULT 100,
    description TEXT
);

-- ============================================
-- COURSE REGISTRATIONS
-- ============================================
CREATE TABLE course_registrations (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    course_id INT REFERENCES courses(id) ON DELETE CASCADE,
    faculty_id INT REFERENCES faculty(id),
    semester INT NOT NULL,
    academic_year VARCHAR(10) NOT NULL,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, course_id, academic_year)
);

-- ============================================
-- TIMETABLE
-- ============================================
CREATE TABLE timetable (
    id SERIAL PRIMARY KEY,
    course_id INT REFERENCES courses(id) ON DELETE CASCADE,
    faculty_id INT REFERENCES faculty(id),
    department_id INT REFERENCES departments(id),
    semester INT NOT NULL,
    section VARCHAR(5),
    day_of_week VARCHAR(10) NOT NULL CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room_number VARCHAR(20),
    academic_year VARCHAR(10)
);

-- ============================================
-- ATTENDANCE
-- ============================================
CREATE TABLE attendance (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    course_id INT REFERENCES courses(id) ON DELETE CASCADE,
    faculty_id INT REFERENCES faculty(id),
    date DATE NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('present', 'absent', 'late', 'od')),
    marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, course_id, date)
);

-- ============================================
-- ASSIGNMENTS
-- ============================================
CREATE TABLE assignments (
    id SERIAL PRIMARY KEY,
    course_id INT REFERENCES courses(id) ON DELETE CASCADE,
    faculty_id INT REFERENCES faculty(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    max_marks INT DEFAULT 50,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assignment_submissions (
    id SERIAL PRIMARY KEY,
    assignment_id INT REFERENCES assignments(id) ON DELETE CASCADE,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    submission_text TEXT,
    file_url TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    marks_obtained DECIMAL(5,2),
    feedback TEXT,
    graded_at TIMESTAMP,
    UNIQUE(assignment_id, student_id)
);

-- ============================================
-- MARKS / EXAMS
-- ============================================
CREATE TABLE exams (
    id SERIAL PRIMARY KEY,
    course_id INT REFERENCES courses(id) ON DELETE CASCADE,
    exam_type VARCHAR(20) NOT NULL CHECK (exam_type IN ('CAT1', 'CAT2', 'CAT3', 'FAT', 'assignment1', 'assignment2', 'assignment3')),
    max_marks INT NOT NULL,
    exam_date DATE,
    academic_year VARCHAR(10),
    semester INT
);

CREATE TABLE student_marks (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    exam_id INT REFERENCES exams(id) ON DELETE CASCADE,
    marks_obtained DECIMAL(5,2),
    grade VARCHAR(5),
    remarks TEXT,
    entered_by INT REFERENCES faculty(id),
    entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, exam_id)
);

-- ============================================
-- INTERNAL MARKS (computed)
-- ============================================
CREATE TABLE internal_marks (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    course_id INT REFERENCES courses(id) ON DELETE CASCADE,
    cat1 DECIMAL(5,2) DEFAULT 0,
    cat2 DECIMAL(5,2) DEFAULT 0,
    cat3 DECIMAL(5,2) DEFAULT 0,
    assignment1 DECIMAL(5,2) DEFAULT 0,
    assignment2 DECIMAL(5,2) DEFAULT 0,
    assignment3 DECIMAL(5,2) DEFAULT 0,
    internal_total DECIMAL(5,2) GENERATED ALWAYS AS (
        ROUND(((cat1 + cat2 + cat3) / 3.0 * 0.70 + (assignment1 + assignment2 + assignment3) / 3.0 * 0.30), 2)
    ) STORED,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, course_id)
);

-- ============================================
-- EXAM REGISTRATION & FEES
-- ============================================
CREATE TABLE exam_registrations (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    semester INT NOT NULL,
    academic_year VARCHAR(10) NOT NULL,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    UNIQUE(student_id, semester, academic_year)
);

CREATE TABLE exam_fees (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    semester INT NOT NULL,
    academic_year VARCHAR(10) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
    transaction_id VARCHAR(100),
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- MESSAGES (Faculty -> Students)
-- ============================================
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    sender_id INT REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INT REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(200),
    body TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(30) DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'alert')),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SEED DATA
-- ============================================

-- Admin user (password: Admin@123)
INSERT INTO users (name, email, password_hash, role) VALUES
('Admin', 'admin@college.edu', crypt('Admin@123', gen_salt('bf')), 'admin');

-- Departments
INSERT INTO departments (name, code) VALUES
('Electronics and Communication Engineering', 'ECE'),
('Computer Science Engineering', 'CSE'),
('Mechanical Engineering', 'MECH'),
('Civil Engineering', 'CIVIL'),
('Electrical Engineering', 'EEE');

-- Faculty users (password: Faculty@123)
INSERT INTO users (name, email, password_hash, role, phone, gender) VALUES
('Dr. Priya Sharma', 'priya.sharma@college.edu', crypt('Faculty@123', gen_salt('bf')), 'faculty', '9876543210', 'Female'),
('Prof. Rajesh Kumar', 'rajesh.kumar@college.edu', crypt('Faculty@123', gen_salt('bf')), 'faculty', '9876543211', 'Male'),
('Dr. Anitha Rajan', 'anitha.rajan@college.edu', crypt('Faculty@123', gen_salt('bf')), 'faculty', '9876543212', 'Female');

INSERT INTO faculty (user_id, employee_id, department_id, designation, specialization, experience_years) VALUES
(2, 'FAC001', 1, 'Associate Professor', 'VLSI Design', 8),
(3, 'FAC002', 2, 'Professor', 'Machine Learning', 12),
(4, 'FAC003', 1, 'Assistant Professor', 'Signal Processing', 5);

-- Student users (password: Student@123)  
INSERT INTO users (name, email, password_hash, role, phone, gender, date_of_birth) VALUES
('Arjun Mehta', 'arjun.mehta@college.edu', crypt('Student@123', gen_salt('bf')), 'student', '9123456789', 'Male', '2003-05-15'),
('Kavya Nair', 'kavya.nair@college.edu', crypt('Student@123', gen_salt('bf')), 'student', '9123456790', 'Female', '2003-08-22'),
('Rohit Verma', 'rohit.verma@college.edu', crypt('Student@123', gen_salt('bf')), 'student', '9123456791', 'Male', '2003-03-10'),
('Sneha Pillai', 'sneha.pillai@college.edu', crypt('Student@123', gen_salt('bf')), 'student', '9123456792', 'Female', '2003-11-30'),
('Kiran Babu', 'kiran.babu@college.edu', crypt('Student@123', gen_salt('bf')), 'student', '9123456793', 'Male', '2003-07-18');

INSERT INTO students (user_id, register_number, department_id, batch_year, current_semester, section, blood_group, guardian_name, guardian_phone, cgpa) VALUES
(5, '23ECE001', 1, 2023, 4, 'A', 'O+', 'Suresh Mehta', '9234567890', 8.5),
(6, '23ECE002', 1, 2023, 4, 'A', 'B+', 'Ravi Nair', '9234567891', 9.1),
(7, '23ECE003', 1, 2023, 4, 'B', 'A+', 'Mohan Verma', '9234567892', 7.8),
(8, '23ECE004', 1, 2023, 4, 'B', 'AB+', 'Gopalan Pillai', '9234567893', 8.9),
(9, '23CSE001', 2, 2023, 4, 'A', 'O-', 'Balu Babu', '9234567894', 8.2);

-- Courses
INSERT INTO courses (code, name, department_id, credits, semester, course_type) VALUES
('EC401', 'Digital Signal Processing', 1, 4, 4, 'theory'),
('EC402', 'Microprocessors & Microcontrollers', 1, 4, 4, 'theory'),
('EC403', 'VLSI Design', 1, 3, 4, 'theory'),
('EC404', 'DSP Lab', 1, 2, 4, 'lab'),
('MA401', 'Engineering Mathematics IV', 1, 3, 4, 'theory'),
('CS401', 'Data Structures', 2, 4, 4, 'theory'),
('CS402', 'Database Management Systems', 2, 3, 4, 'theory');

-- Timetable
INSERT INTO timetable (course_id, faculty_id, department_id, semester, section, day_of_week, start_time, end_time, room_number, academic_year) VALUES
(1, 1, 1, 4, 'A', 'Monday', '09:00', '10:00', 'ECE-101', '2024-25'),
(2, 3, 1, 4, 'A', 'Monday', '10:00', '11:00', 'ECE-101', '2024-25'),
(3, 1, 1, 4, 'A', 'Tuesday', '09:00', '10:00', 'ECE-102', '2024-25'),
(5, 2, 1, 4, 'A', 'Tuesday', '10:00', '11:00', 'ECE-101', '2024-25'),
(1, 1, 1, 4, 'A', 'Wednesday', '11:00', '12:00', 'ECE-101', '2024-25'),
(4, 3, 1, 4, 'A', 'Thursday', '14:00', '17:00', 'ECE-LAB', '2024-25'),
(2, 3, 1, 4, 'A', 'Friday', '09:00', '10:00', 'ECE-101', '2024-25'),
(3, 1, 1, 4, 'A', 'Friday', '10:00', '11:00', 'ECE-102', '2024-25');

-- Course registrations
INSERT INTO course_registrations (student_id, course_id, faculty_id, semester, academic_year) VALUES
(1, 1, 1, 4, '2024-25'), (1, 2, 3, 4, '2024-25'), (1, 3, 1, 4, '2024-25'), (1, 4, 3, 4, '2024-25'), (1, 5, 2, 4, '2024-25'),
(2, 1, 1, 4, '2024-25'), (2, 2, 3, 4, '2024-25'), (2, 3, 1, 4, '2024-25'), (2, 4, 3, 4, '2024-25'), (2, 5, 2, 4, '2024-25'),
(3, 1, 1, 4, '2024-25'), (3, 2, 3, 4, '2024-25'), (3, 3, 1, 4, '2024-25'), (3, 4, 3, 4, '2024-25'), (3, 5, 2, 4, '2024-25'),
(4, 1, 1, 4, '2024-25'), (4, 2, 3, 4, '2024-25'), (4, 3, 1, 4, '2024-25'), (4, 4, 3, 4, '2024-25'), (4, 5, 2, 4, '2024-25');

-- Attendance (sample data)
INSERT INTO attendance (student_id, course_id, faculty_id, date, status) VALUES
(1, 1, 1, '2025-01-06', 'present'), (1, 1, 1, '2025-01-13', 'present'), (1, 1, 1, '2025-01-20', 'absent'), (1, 1, 1, '2025-01-27', 'present'), (1, 1, 1, '2025-02-03', 'present'), (1, 1, 1, '2025-02-10', 'present'), (1, 1, 1, '2025-02-17', 'absent'), (1, 1, 1, '2025-02-24', 'present'), (1, 1, 1, '2025-03-03', 'present'), (1, 1, 1, '2025-03-10', 'present'),
(2, 1, 1, '2025-01-06', 'present'), (2, 1, 1, '2025-01-13', 'present'), (2, 1, 1, '2025-01-20', 'present'), (2, 1, 1, '2025-01-27', 'present'), (2, 1, 1, '2025-02-03', 'absent'), (2, 1, 1, '2025-02-10', 'present'), (2, 1, 1, '2025-02-17', 'present'), (2, 1, 1, '2025-02-24', 'present'), (2, 1, 1, '2025-03-03', 'present'), (2, 1, 1, '2025-03-10', 'present'),
(3, 1, 1, '2025-01-06', 'absent'), (3, 1, 1, '2025-01-13', 'absent'), (3, 1, 1, '2025-01-20', 'absent'), (3, 1, 1, '2025-01-27', 'present'), (3, 1, 1, '2025-02-03', 'present'), (3, 1, 1, '2025-02-10', 'absent'), (3, 1, 1, '2025-02-17', 'absent'), (3, 1, 1, '2025-02-24', 'present'), (3, 1, 1, '2025-03-03', 'absent'), (3, 1, 1, '2025-03-10', 'present');

-- Internal Marks
INSERT INTO internal_marks (student_id, course_id, cat1, cat2, cat3, assignment1, assignment2, assignment3) VALUES
(1, 1, 42, 38, 45, 44, 46, 43),
(1, 2, 35, 40, 38, 42, 40, 38),
(1, 3, 47, 43, 46, 48, 45, 47),
(2, 1, 48, 47, 49, 50, 48, 49),
(2, 2, 44, 42, 45, 46, 44, 45),
(2, 3, 46, 48, 47, 49, 47, 48),
(3, 1, 22, 18, 25, 30, 28, 25),
(3, 2, 28, 25, 30, 32, 30, 28),
(3, 3, 35, 32, 38, 36, 34, 37),
(4, 1, 43, 45, 42, 46, 44, 45),
(4, 2, 40, 38, 42, 43, 41, 40),
(4, 3, 44, 42, 45, 47, 45, 46);

-- Assignments
INSERT INTO assignments (course_id, faculty_id, title, description, due_date, max_marks) VALUES
(1, 1, 'DFT and FFT Implementation', 'Implement DFT and FFT algorithms using MATLAB', '2025-02-15', 50),
(2, 3, 'Assembly Language Programming', 'Write assembly programs for 8086 microprocessor', '2025-02-20', 50),
(3, 1, 'CMOS Inverter Design', 'Design and simulate CMOS inverter using Cadence', '2025-02-28', 50),
(1, 1, 'FIR Filter Design', 'Design FIR filter using windowing technique', '2025-03-15', 50);

-- Messages
INSERT INTO messages (sender_id, recipient_id, subject, body) VALUES
(2, 5, 'Assignment Submission Reminder', 'Dear Arjun, please submit your DSP assignment by this Friday. The deadline is 15th February 2025.'),
(2, 6, 'Great Performance!', 'Dear Kavya, you have shown excellent performance in the recent CAT exam. Keep it up!'),
(3, 7, 'Low Attendance Warning', 'Dear Rohit, your attendance in Microprocessors subject has fallen below 75%. Please ensure regular attendance to avoid exam registration issues.');

-- Notifications
INSERT INTO notifications (user_id, title, message, type) VALUES
(5, 'Exam Registration Open', 'Semester 4 exam registration is now open. Register before March 31st.', 'info'),
(5, 'Assignment Due', 'DFT and FFT Implementation assignment is due on February 15th.', 'warning'),
(6, 'Result Published', 'CAT-2 results have been published. Check your marks.', 'success'),
(7, 'Attendance Alert', 'Your attendance is below 75% in Microprocessors. Attend classes regularly.', 'alert'),
(7, 'Exam Registration Open', 'Semester 4 exam registration is now open. Register before March 31st.', 'info');

-- Exam Fees
INSERT INTO exam_fees (student_id, semester, academic_year, amount, payment_status) VALUES
(1, 4, '2024-25', 1500.00, 'paid'),
(2, 4, '2024-25', 1500.00, 'paid'),
(3, 4, '2024-25', 1500.00, 'pending'),
(4, 4, '2024-25', 1500.00, 'pending');
