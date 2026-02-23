# ERP College — Enhanced Version

## 🚀 New Features Added

### Student Portal
| Feature | Description |
|---------|-------------|
| **Profile Photo Upload** | Click on your avatar in My Profile to upload a photo — saved locally, included in PDF reports |
| **OD Application Letter** | Auto-filled form with your details. AI drafts the reason. Draw digital signature. Upload event proof image. Download PDF to submit to HOD |
| **Internship Application Letter** | Same workflow — upload offer letter image, draw signature, generate formal PDF |
| **Fee Receipt Download** | After paying exam fees, click "Receipt" to download a formatted PDF receipt |
| **PDF Export everywhere** | Marks, Attendance, and Profile all have "Download PDF" buttons |

### Faculty Portal
| Feature | Description |
|---------|-------------|
| **OD/Internship Approvals** | View student applications, draw your digital signature once, click "Approve & Sign" |
| **Download Signed PDF** | After approval, download the letter with faculty signature embedded |

### AI Chatbot
| Feature | Description |
|---------|-------------|
| **Multi-provider AI** | Supports Groq (free), OpenAI, or Anthropic — set your key in App.jsx |
| **Context-aware** | Chatbot knows your role and name for personalized responses |
| **Multi-turn conversations** | Full chat history maintained for follow-up questions |

---

## 🔑 Setting Up the AI Key

Open `frontend/src/App.jsx` and set one of these at the top of the file:

```javascript
const GROQ_API_KEY = "gsk_xxx";           // FREE — get at console.groq.com
const OPENAI_API_KEY = "sk-...";          // get at platform.openai.com
const ANTHROPIC_API_KEY = "sk-ant-...";   // get at console.anthropic.com
```

**Groq is recommended** — it's free and very fast (uses Llama 3 70B).

---

## 🏃 Running the Project

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Then open: http://localhost:5173

### Demo Accounts
| Role | Email | Password |
|------|-------|----------|
| Student | arjun.mehta@college.edu | Student@123 |
| Faculty | priya.sharma@college.edu | Faculty@123 |
| Admin | admin@college.edu | Admin@123 |

---

## 📋 Feature Walkthrough

### Student → OD Application
1. Go to **OD Application** in sidebar
2. Your name, register number, class are pre-filled
3. Enter reason manually or click **AI Draft**
4. Upload event proof image (photo of event poster, invite, etc.)
5. Click **Draw Signature** → draw on canvas → Save
6. Click **Preview & Download PDF** → browser print dialog → Save as PDF
7. Share the PDF with your faculty

### Student → Internship Letter
1. Go to **Internship Letter** in sidebar
2. Same workflow as OD
3. Upload your offer letter image/screenshot
4. PDF includes your offer letter + signature

### Faculty → Approve OD/Internship
1. Go to **OD/Internship Approvals**
2. Draw your signature once (saved for the session)
3. Click **Approve & Sign** on a pending application
4. Click **Signed PDF** to download the approval letter with your signature

### Student → Fee Receipt
1. Go to **Fees & Receipts**
2. Pay with transaction ID
3. After payment, click **Receipt** to download formatted PDF

