from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import engine
import models
from attendance import router as attendance_router
from event import router as event_router


# Create tables
models.Base.metadata.create_all(bind=engine)

# Create app
app = FastAPI(title="Multi-Institution ERP System")

# CORS (for frontend access)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For hackathon/demo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(attendance_router, tags=["Attendance"])
app.include_router(event_router, tags=["Events"])

# Serve frontend folder
app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

# Root endpoint
@app.get("/")
def home():
    return {"message": "ERP Backend Running Successfully"}