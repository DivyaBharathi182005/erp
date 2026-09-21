"""
features.py — Extra feature endpoints: AI Risk Predictor, Guardian Alerts,
               AI Assignment Generator, Parent Dashboard, Gamification.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional, List
from database import get_db
import models
from auth import get_current_user, require_role

router = APIRouter(prefix="/features", tags=["Features"])


# ─── AI Risk Predictor ────────────────────────────────────────────────────────
@router.get("/risk-scores")
def get_risk_scores(
    department_id: Optional[int] = None,
    year: Optional[int] = None,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Compute a 0-100 risk score for every student based on attendance, CAT marks, assignments."""
    query = db.query(models.Student).options(
        joinedload(models.Student.user),
        joinedload(models.Student.department),
        joinedload(models.Student.attendance),
        joinedload(models.Student.internal_marks),
    )
    if department_id:
        query = query.filter(models.Student.department_id == department_id)
    if year:
        query = query.filter(models.Student.batch_year == year)
    students = query.all()

    results = []
    for s in students:
        if not s.user:
            continue

        # Attendance risk (0-40): <75% = high risk
        att_records = s.attendance or []
        total_att = len(att_records)
        present = sum(1 for a in att_records if a.status in ("P", "OD"))
        att_pct = round((present / total_att * 100) if total_att > 0 else 85, 1)
        if att_pct < 60:
            att_risk = 40
        elif att_pct < 75:
            att_risk = int(30 * (75 - att_pct) / 15)
        else:
            att_risk = max(0, int((85 - att_pct) * 1.5))

        # CAT marks risk (0-40)
        marks_records = s.internal_marks or []
        cat_scores = []
        for m in marks_records:
            for f in ("cat1", "cat2", "cat3"):
                v = getattr(m, f, None)
                if v is not None:
                    cat_scores.append(float(v))
        avg_cat = round(sum(cat_scores) / len(cat_scores), 1) if cat_scores else None
        if avg_cat is None:
            marks_risk = 20  # neutral when no data
        elif avg_cat < 20:
            marks_risk = 40
        elif avg_cat < 30:
            marks_risk = int(30 * (30 - avg_cat) / 10)
        else:
            marks_risk = max(0, int((40 - avg_cat) * 1.2))

        # Assignment risk (0-20)
        asgn_scores = []
        for m in marks_records:
            for f in ("assignment1", "assignment2", "assignment3"):
                v = getattr(m, f, None)
                if v is not None:
                    asgn_scores.append(float(v))
        avg_asgn = sum(asgn_scores) / len(asgn_scores) if asgn_scores else None
        if avg_asgn is None:
            asgn_risk = 10
        elif avg_asgn < 20:
            asgn_risk = 20
        elif avg_asgn < 35:
            asgn_risk = int(15 * (35 - avg_asgn) / 15)
        else:
            asgn_risk = 0

        total_risk = min(100, att_risk + marks_risk + asgn_risk)
        if total_risk >= 70:
            level = "critical"
        elif total_risk >= 50:
            level = "high"
        elif total_risk >= 30:
            level = "medium"
        else:
            level = "low"

        results.append({
            "student_id": s.id,
            "name": s.user.name,
            "register_number": s.register_number,
            "department": s.department.name if s.department else "",
            "batch_year": s.batch_year,
            "risk_score": total_risk,
            "risk_level": level,
            "att_pct": att_pct,
            "avg_cat": avg_cat,
            "factors": {
                "attendance_risk": att_risk,
                "marks_risk": marks_risk,
                "assignment_risk": asgn_risk,
            }
        })

    results.sort(key=lambda x: x["risk_score"], reverse=True)
    return results


# ─── Guardian SMS/WhatsApp Alerts (Demo mode without Twilio) ─────────────────
@router.post("/sms-guardian")
def send_guardian_sms(
    data: dict,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Send guardian alerts. Works in demo mode; configure Twilio env vars for live SMS."""
    import os
    student_ids = data.get("student_ids", [])
    message = data.get("message", "")
    channel = data.get("channel", "whatsapp")

    if not student_ids:
        raise HTTPException(400, "No students selected")
    if not message:
        raise HTTPException(400, "Message is required")

    students = db.query(models.Student).filter(
        models.Student.id.in_(student_ids)
    ).options(joinedload(models.Student.user)).all()

    TWILIO_SID   = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_FROM  = os.getenv("TWILIO_FROM_NUMBER", "")

    sent_list = []
    failed_list = []
    demo_mode = not (TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM)

    for s in students:
        phone = s.guardian_phone or (s.user.phone if s.user else "")
        name = s.user.name if s.user else str(s.id)
        if not phone:
            failed_list.append({"name": name, "reason": "No guardian phone"})
            continue

        if demo_mode:
            sent_list.append({"name": name, "phone": phone, "channel": channel})
        else:
            try:
                from twilio.rest import Client
                client = Client(TWILIO_SID, TWILIO_TOKEN)
                to_num = f"whatsapp:{phone}" if channel == "whatsapp" else phone
                from_num = f"whatsapp:{TWILIO_FROM}" if channel == "whatsapp" else TWILIO_FROM
                client.messages.create(body=message, from_=from_num, to=to_num)
                sent_list.append({"name": name, "phone": phone, "channel": channel})
            except Exception as e:
                failed_list.append({"name": name, "reason": str(e)})

    return {
        "demo_mode": demo_mode,
        "sent": len(sent_list),
        "failed": len(failed_list),
        "sent_list": sent_list,
        "failed_list": failed_list,
        "message": f"{'[DEMO] ' if demo_mode else ''}Processed {len(students)} students — {len(sent_list)} sent, {len(failed_list)} failed."
    }


# ─── AI Assignment Generator (server-side generation) ─────────────────────────
@router.post("/ai-assignment")
async def generate_ai_assignment(
    data: dict,
    current_user: models.User = Depends(require_role("faculty")),
    db: Session = Depends(get_db)
):
    """Generate assignment questions using AI. Falls back to template if AI key not set."""
    import os, httpx, json
    topic = data.get("topic", "")
    subject = data.get("subject", "")
    difficulty = data.get("difficulty", "medium")
    total_marks = int(data.get("marks", 10))
    # Frontend sends num_questions
    count = min(int(data.get("num_questions", data.get("count", 5))), 10)

    AI_API_KEY  = os.getenv("AI_API_KEY", "")
    AI_PROVIDER = os.getenv("AI_PROVIDER", "groq")

    if AI_API_KEY:
        prompt = (
            f"Generate {count} {difficulty}-difficulty assignment questions on '{topic}' for the subject '{subject}'.\n"
            f"Total marks: {total_marks}. Distribute marks evenly.\n"
            f"Return ONLY valid JSON in this exact format:\n"
            f'{{"title": "Assignment Title", "instructions": "General instructions", "total_marks": {total_marks}, "questions": [{{"question": "...", "marks": N, "rubric": "..."}}]}}\n'
            f"No extra text, just JSON."
        )
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                if AI_PROVIDER == "anthropic":
                    r = await client.post(
                        "https://api.anthropic.com/v1/messages",
                        headers={"x-api-key": AI_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                        json={"model": "claude-haiku-20240307", "max_tokens": 1200, "system": "You are a college professor. Return only valid JSON.", "messages": [{"role": "user", "content": prompt}]}
                    )
                else:
                    r = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {AI_API_KEY}", "Content-Type": "application/json"},
                        json={"model": "llama-3.3-70b-versatile", "messages": [{"role": "system", "content": "You are a college professor. Return only valid JSON."}, {"role": "user", "content": prompt}], "max_tokens": 1200}
                    )
                if r.status_code == 200:
                    d = r.json()
                    text = d["content"][0]["text"] if AI_PROVIDER == "anthropic" else d["choices"][0]["message"]["content"]
                    # Extract JSON from response
                    start = text.find("{")
                    end = text.rfind("}") + 1
                    if start >= 0 and end > start:
                        parsed = json.loads(text[start:end])
                        return {**parsed, "generated": True}
        except Exception:
            pass

    # Fallback template questions — return structured JSON
    marks_each = total_marks // count
    remainder = total_marks - marks_each * count
    templates = {
        "easy":   ["Define {topic} with a suitable example.", "List any five key features of {topic}.", "What are the basic components of {topic}?", "Briefly explain the history of {topic}.", "State the importance of {topic} in modern engineering.", "Describe the applications of {topic}.", "What are the types of {topic}?", "Explain {topic} in your own words.", "Draw a diagram to illustrate {topic}.", "Compare {topic} with any related concept."],
        "medium": ["Explain the working mechanism of {topic} with a block diagram.", "Compare and contrast {topic} with related concepts.", "Describe a real-world application of {topic} with analysis.", "Analyze the advantages and limitations of {topic}.", "Design a simple system involving {topic} and justify your design.", "Derive the key equations associated with {topic}.", "What are the challenges in implementing {topic}?", "Explain {topic} with suitable examples and diagrams.", "How does {topic} impact modern technology?", "Evaluate different approaches to {topic}."],
        "hard":   ["Critically evaluate the role of {topic} in modern systems, citing recent research.", "Propose an innovative solution using {topic} to a real engineering challenge.", "Derive the mathematical model for {topic} and verify it with a case study.", "Design and implement a prototype based on {topic} concepts.", "Compare multiple approaches to {topic} and recommend the best for a given scenario.", "Analyze the scalability of {topic} in large-scale systems.", "Develop an algorithm for {topic} and analyze its time complexity.", "Write a critical review of {topic} from multiple perspectives.", "Propose enhancements to existing {topic} approaches.", "Formulate and solve a complex problem involving {topic}."],
    }
    q_templates = templates.get(difficulty, templates["medium"])[:count]
    questions = []
    for i, qt in enumerate(q_templates):
        q_marks = marks_each + (1 if i < remainder else 0)
        q_text = qt.replace("{topic}", topic or "the given topic")
        questions.append({
            "question": q_text,
            "marks": q_marks,
            "rubric": f"Award {q_marks} marks for a complete, accurate answer with examples."
        })
    return {
        "title": f"Assignment: {topic or subject}",
        "instructions": f"Answer all questions. Total: {total_marks} marks. Difficulty: {difficulty.capitalize()}.",
        "total_marks": total_marks,
        "questions": questions,
        "generated": False,
        "note": "Template questions (configure AI_API_KEY for AI-generated questions)"
    }


# ─── Class Sentiment (demo data) ──────────────────────────────────────────────
@router.get("/sentiment")
def get_sentiment(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return {"overall": 72, "positive": 58, "neutral": 28, "negative": 14, "responses": 42}

@router.get("/sentiment-all")
def get_sentiment_all(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return [
        {"date": "2025-01-20", "score": 68}, {"date": "2025-01-27", "score": 72},
        {"date": "2025-02-03", "score": 75}, {"date": "2025-02-10", "score": 70},
        {"date": "2025-02-17", "score": 78},
    ]

@router.get("/sentiment/{student_id}")
def get_student_sentiment(
    student_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return {"mood": "positive", "score": 75, "message": "Feeling good about studies"}


# ─── Gamification / Leaderboard ───────────────────────────────────────────────
@router.get("/gamification/{student_id}")
def get_gamification(
    student_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return {
        "xp": 1250, "level": 8, "badges": ["Attendance Star", "Assignment Pro"],
        "streak": 12, "rank": 5
    }

@router.get("/leaderboard")
def get_leaderboard(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    students = db.query(models.Student).options(joinedload(models.Student.user)).limit(10).all()
    board = []
    for i, s in enumerate(students):
        if s.user:
            board.append({"rank": i + 1, "name": s.user.name, "xp": 2000 - i * 150, "level": 12 - i})
    return board


# ─── Parent Dashboard ─────────────────────────────────────────────────────────
@router.get("/parent-dashboard/{student_id}")
def get_parent_dashboard(
    student_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return child overview for the parent portal."""
    student = db.query(models.Student).filter(models.Student.id == student_id).options(
        joinedload(models.Student.user),
        joinedload(models.Student.department),
        joinedload(models.Student.attendance),
        joinedload(models.Student.internal_marks),
    ).first()
    if not student:
        raise HTTPException(404, "Student not found")

    # Attendance per course
    att_by_course = {}
    for a in (student.attendance or []):
        cid = a.course_id
        if cid not in att_by_course:
            att_by_course[cid] = {"total": 0, "present": 0}
        att_by_course[cid]["total"] += 1
        if a.status in ("P", "OD"):
            att_by_course[cid]["present"] += 1

    courses = db.query(models.Course).filter(models.Course.id.in_(att_by_course.keys())).all()
    course_map = {c.id: c.name for c in courses}

    attendance_summary = []
    for cid, counts in att_by_course.items():
        pct = round(counts["present"] / counts["total"] * 100, 1) if counts["total"] > 0 else 0
        attendance_summary.append({
            "course": course_map.get(cid, f"Course {cid}"),
            "present": counts["present"],
            "total": counts["total"],
            "percentage": pct,
            "is_low": pct < 75,
        })

    # CAT marks summary
    marks_summary = []
    for m in (student.internal_marks or []):
        course = db.query(models.Course).filter(models.Course.id == m.course_id).first()
        marks_summary.append({
            "course": course.name if course else f"Course {m.course_id}",
            "cat1": float(m.cat1 or 0), "cat2": float(m.cat2 or 0), "cat3": float(m.cat3 or 0),
            "internal_total": float(m.internal_total),
        })

    low_att = [a for a in attendance_summary if a["is_low"]]

    return {
        "student": {
            "name": student.user.name if student.user else "",
            "register_number": student.register_number,
            "department": student.department.name if student.department else "",
            "semester": student.current_semester,
            "section": student.section,
            "cgpa": float(student.cgpa or 0),
        },
        "attendance": attendance_summary,
        "marks": marks_summary,
        "alerts": {
            "low_attendance_count": len(low_att),
            "low_attendance_courses": [a["course"] for a in low_att],
        }
    }