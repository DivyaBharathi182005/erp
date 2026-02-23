from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from routers import auth, student, faculty, admin, features as features_router
from routers import ws as ws_router
import time
import logging
import os
import httpx
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="College ERP System API",
    description="Full-featured ERP for Students, Faculty, and Admin — Hackathon Edition",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS (restrict in production — list specific origins) ─────────────────
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,   # 🔒 No wildcard "*" in production
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# ─── Request Timing Middleware ──────────────────────────────────────────────
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 2)
    response.headers["X-Process-Time-Ms"] = str(duration)
    logger.info(f"{request.method} {request.url.path} → {response.status_code} ({duration}ms)")
    return response

# ─── Global Exception Handler ──────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# ─── Routers ───────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(student.router)
app.include_router(faculty.router)
app.include_router(admin.router)
app.include_router(features_router.router)
app.include_router(ws_router.router)


@app.get("/", tags=["Meta"])
def root():
    return {
        "system": "College ERP — Hackathon Edition v2.0",
        "status": "running",
        "docs": "/docs",
        "features": ["JWT Auth", "Role-Based Access", "AI Advisor", "Analytics"]
    }


@app.get("/health", tags=["Meta"])
def health():
    return {"status": "ok", "version": "2.0.0"}


# ─── AI PROXY ─────────────────────────────────────────────────────────────────
# Keeps API keys server-side so they never get exposed in browser.
# Configure your key in backend/.env:  AI_API_KEY=gsk_xxx  (Groq) or  AI_API_KEY=sk-ant-xxx  (Anthropic)
# Set AI_PROVIDER to "groq" (default, free) or "anthropic"

class ChatMessage(BaseModel):
    role: str
    content: str

class AIRequest(BaseModel):
    system: str
    message: str
    history: Optional[List[ChatMessage]] = []

AI_API_KEY   = os.getenv("AI_API_KEY", "")
AI_PROVIDER  = os.getenv("AI_PROVIDER", "groq")   # "groq" | "anthropic"

@app.post("/ai/chat", tags=["AI"])
async def ai_chat(req: AIRequest):
    if not AI_API_KEY:
        return JSONResponse(
            status_code=503,
            content={"detail": "AI not configured. Add AI_API_KEY to backend/.env"}
        )

    history_msgs = [{"role": m.role, "content": m.content} for m in (req.history or [])]

    async with httpx.AsyncClient(timeout=30) as client:
        if AI_PROVIDER == "anthropic":
            # ── Anthropic Claude ──────────────────────────────────────────
            messages = history_msgs + [{"role": "user", "content": req.message}]
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": AI_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-20240307",
                    "max_tokens": 500,
                    "system": req.system,
                    "messages": messages,
                },
            )
            if r.status_code != 200:
                return JSONResponse(status_code=r.status_code, content={"detail": r.text})
            data = r.json()
            reply = data["content"][0]["text"]

        else:
            # ── Groq (default — free, fast, CORS-safe via proxy) ─────────
            messages = [{"role": "system", "content": req.system}] + history_msgs + [{"role": "user", "content": req.message}]
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {AI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model":"llama-3.3-70b-versatile",
                    "messages": messages,
                    "max_tokens": 500,
                },
            )
            if r.status_code != 200:
                return JSONResponse(status_code=r.status_code, content={"detail": r.text})
            data = r.json()
            reply = data["choices"][0]["message"]["content"]

    return {"reply": reply}