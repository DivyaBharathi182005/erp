# 🏆 College ERP System — Hackathon Edition v2.0

> A next-generation, AI-powered Enterprise Resource Planning system for colleges.
> Built with FastAPI + React + Claude AI.

---

## ✨ What's New in v2.0 (Hackathon Upgrades)

### 🎨 Complete UI/UX Overhaul
- **Premium design system** — Syne + Cabinet Grotesk + DM Mono typography
- **Dark sidebar + light content** split layout — modern, professional aesthetic
- **Animated stat cards**, donut charts, bar charts — all built-in without extra libraries
- **Smooth transitions**, hover states, and skeleton loading states
- **Glassmorphism topbar** with backdrop blur
- **Split-screen login page** — brand statement + stats on left, clean form on right

### 🤖 Claude AI Integration (NEW)
- **AI Study Advisor** — dedicated student page powered by Claude API
  - Auto-generates personalized advice based on CGPA + attendance on page load
  - 6 quick-prompt shortcuts (exam prep, stress, study schedule, etc.)
  - Full conversational interface
- **Admin AI Analytics** — generates institutional health reports on demand
- **AI Message Drafting** — admins can draft notifications with Claude in one click
- AI badge visible in topbar when on AI-powered pages

### 🔐 Security Hardened Backend
- CORS wildcard removed — explicit origin allowlist only
- Refresh token support — /auth/refresh endpoint for token rotation
- Rate limiting on login — 10 attempts per 5-minute window per IP
- Password strength validation enforced on change-password
- Request timing middleware — logs every request with duration
- Global exception handler — no stack traces exposed to clients
- bcrypt rounds increased to 12

### 📊 Enhanced Data Visualization
- BarChart component — marks/attendance trends rendered inline
- DonutChart component — circular attendance visualization on dashboard
- Admin Analytics page — semester distribution chart, system metrics
- Performance overview on marks page — visual bar per course

### 🚀 UX Improvements
- Search bars in faculty student list and admin student table
- Live present count while marking attendance (e.g. "24 / 30 present")
- Structured sidebar sections — Overview / Academics / Finance / Communication
- Friendly empty states instead of raw error text
- Proper loading spinners throughout

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python FastAPI 0.111 |
| Database | PostgreSQL |
| Frontend | React 18 (JSX) |
| Auth | JWT Access + Refresh Tokens + Bcrypt |
| ORM | SQLAlchemy 2.0 |
| AI | Claude Sonnet (Anthropic API) |
| Build | Vite |

---

## 🚀 Quick Setup

### 1. Database
```bash
sudo -u postgres psql
CREATE USER erp_user WITH PASSWORD 'erp_password';
CREATE DATABASE erp_db OWNER erp_user;
GRANT ALL PRIVILEGES ON DATABASE erp_db TO erp_user;
\q
psql -U erp_user -d erp_db -f database/schema.sql
```

### 2. Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Edit .env with your DATABASE_URL and a strong SECRET_KEY
uvicorn main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 🔐 Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@college.edu | Admin@123 |
| Faculty | priya.sharma@college.edu | Faculty@123 |
| Student | arjun.mehta@college.edu | Student@123 |
| Low Att. | rohit.verma@college.edu | Student@123 |

---

## 📋 Feature Matrix

### Student Portal
- Dashboard with live stats + donut chart
- Profile page
- Timetable (color-coded by day)
- Attendance with visual bars
- Marks with bar chart overview
- Assignments with overdue detection
- Courses, Exam registration, Exam fees
- Messages inbox
- Internal marks calculator
- AI Study Advisor (NEW — Claude powered)

### Faculty Portal
- Dashboard with student stats
- Student list with search + course filter
- Mark attendance with live count
- Low attendance alerts
- Upload marks
- Send messages

### Admin Portal
- System dashboard
- Analytics with AI report (NEW)
- Manage students/faculty/courses
- Exam approvals
- AI-assisted notification drafting (NEW)
- Broadcast notifications

---

*Built for national hackathon — ERP v2.0 with Claude AI*
