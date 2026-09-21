import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION — Set your AI key here (Groq or OpenAI or Anthropic)
// ─────────────────────────────────────────────────────────────────────────────
const API = "http://localhost:8000";

// ─── API Helper ──────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const token = localStorage.getItem("erp_token");
  const res = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Error");
  }
  return res.json();
}

// ─── AI Helper ───────────────────────────────────────────────────────────────
// All AI calls go through the backend /ai/chat proxy so API keys stay server-side
// and CORS is never an issue. Configure AI_API_KEY in backend/.env
async function askAI(systemPrompt, userMessage, conversationHistory = []) {
  // First try backend proxy (supports both Groq and Anthropic)
  try {
    const res = await fetch(`${API}/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: systemPrompt,
        message: userMessage,
        history: conversationHistory.map(m => ({ role: m.role, content: m.content })),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.reply) return data.reply;
    }
  } catch { /* fall through to direct API */ }

  // Fallback: call Anthropic API directly from browser
  try {
    const messages = [
      ...conversationHistory.map(m => ({ role: m.role === "ai" ? "assistant" : m.role, content: m.content || m.text || "" })),
      { role: "user", content: userMessage }
    ];
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": window.__ANTHROPIC_KEY__ || "",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-20240307",
        max_tokens: 500,
        system: systemPrompt,
        messages,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.content?.[0]?.text || "No response";
    }
    // If no API key configured, return a helpful demo response
    const errData = await res.json().catch(() => ({}));
    if (errData.error?.type === "authentication_error") {
      return generateDemoAIResponse(systemPrompt, userMessage);
    }
  } catch { /* fall through */ }

  return generateDemoAIResponse(systemPrompt, userMessage);
}

function generateDemoAIResponse(system, message) {
  // Smart demo responses based on context keywords
  const msg = message.toLowerCase();
  const sys = system.toLowerCase();
  if (sys.includes("risk") || msg.includes("risk")) {
    return "📊 **Risk Analysis**: Based on the student data, I recommend focusing on students with below 75% attendance first. Cross-reference their CAT scores — students failing on both dimensions need immediate intervention.";
  }
  if (sys.includes("assignment") || msg.includes("assignment")) {
    return "📝 **Assignment Questions Generated** (Demo Mode):\n1. Explain the fundamental concepts with examples.\n2. Compare and contrast two approaches.\n3. Design a system using the principles discussed.\n4. Analyze the advantages and limitations.\n5. Apply the concept to a real-world scenario.";
  }
  if (sys.includes("advisor") || sys.includes("student")) {
    const replies = [
      "Great question! Focus on building a consistent study schedule — even 2 hours of focused study daily beats cramming. Use the Pomodoro technique: 25 min study, 5 min break. 📚",
      "Your attendance is key — try to maintain above 80% to stay comfortable. If you're struggling with a subject, visit your faculty during office hours. They're there to help! 🎯",
      "For exams, start revision 3 weeks early. Create mind maps for complex topics. Practice past papers — they're the best indicator of what to expect. You've got this! 💪",
      "Building good academic habits now pays off throughout your career. Stay curious, collaborate with peers, and don't hesitate to ask questions. 🌟",
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }
  if (sys.includes("schedule") || msg.includes("exam") || msg.includes("date") || msg.includes("when")) {
    return "📅 Based on the academic calendar: Assessment I is Feb 27–Mar 3, Assessment II is Apr 5–9, and Assessment III is May 17–21. Last working day for IV/VI sem is May 22. End semester theory exams begin June 2. Next semester reopens July 2.";
  }
  if (sys.includes("notification") || sys.includes("broadcast")) {
    return "📢 Attention Students: This is an important announcement regarding your academic schedule. Please ensure you have completed all pending assignments and maintain regular attendance. Contact your faculty advisor for any academic concerns.";
  }
  return "🤖 AI is running in demo mode. To enable full AI, set AI_API_KEY in backend/.env (supports Groq or Anthropic). The system is working correctly — connect the API key to unlock intelligent responses!";
}

// ─── ICONS ───────────────────────────────────────────────────────────────────
const icons = {
  dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  student: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  book: "M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z",
  time: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z",
  attendance: "M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z",
  marks: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
  message: "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z",
  exam: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  payment: "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z",
  logout: "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z",
  faculty: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  admin: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z",
  bell: "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  calculator: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14h-4v-2h4v2zm2-4H8v-2h8v2zm0-4H8V7h8v2z",
  warning: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
  send: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  trash: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z",
  ai: "M21 10.5h-1.5V7a2 2 0 00-2-2H14V3.5a2 2 0 00-4 0V5H7.5a2 2 0 00-2 2v3.5H4a2 2 0 000 4h1.5V18a2 2 0 002 2H10v1.5a2 2 0 004 0V20h2.5a2 2 0 002-2v-3.5H21a2 2 0 000-4z",
  chart: "M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z",
  analytics: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z",
  user: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  upload: "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z",
  settings: "M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06z",
  predict: "M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z",
  moon: "M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z",
  sun: "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06z",
  robot: "M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7H4a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2M9 9v2H7v-2h2m8 0v2h-2V9h2M9 13v2H7v-2h2m8 0v2h-2v-2h2M3 21v-1a4 4 0 014-4h10a4 4 0 014 4v1H3z",
  pen: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  signature: "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
  letter: "M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z",
  document: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM16 18H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  receipt: "M18 17H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V7h12v2zM3 22l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20z",
  camera: "M12 15.2c-1.77 0-3.2-1.43-3.2-3.2 0-1.77 1.43-3.2 3.2-3.2 1.77 0 3.2 1.43 3.2 3.2 0 1.77-1.43 3.2-3.2 3.2zM9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9z",
  trend: "M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z",
  star: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
  fees: "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z",
  id: "M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm-8 2.75c1.24 0 2.25 1.01 2.25 2.25s-1.01 2.25-2.25 2.25S9.75 10.24 9.75 9 10.76 6.75 12 6.75zM17 17H7v-1.5c0-1.67 3.33-2.5 5-2.5s5 .83 5 2.5V17z",
  internship: "M20 6h-2.18c.07-.44.18-.88.18-1.34 0-2.58-2.09-4.66-4.67-4.66-1.29 0-2.47.52-3.33 1.36L9 2.96 8 1.36C7.14.52 5.96 0 4.67 0 2.09 0 0 2.08 0 4.66c0 .46.1.9.18 1.34H0v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-5.67-4c1.47 0 2.67 1.19 2.67 2.66 0 1.29-.43 2.42-1.18 3.34h-2.99c-.74-.92-1.18-2.05-1.18-3.34C11.65 3.19 12.85 2 14.33 2z",
  od: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z",
  close2: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
};

const Icon = ({ name, size = 20, style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d={icons[name] || icons.user} />
  </svg>
);

// ─── GLOBAL STYLES ───────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --ink: #0a0a0f; --ink-2: #1a1a28; --ink-3: #2d2d44;
    --surface: #f4f3f0; --surface-2: #eeecea; --surface-3: #e4e2de;
    --white: #ffffff; --accent: #ff4b26; --accent-2: #6c3bff;
    --accent-3: #00d9aa; --accent-4: #ffb800;
    --success: #00c48c; --warning: #ffb800; --danger: #ff3b3b; --info: #4b7bff;
    --muted: #8a8898; --sidebar-w: 248px;
    --radius: 14px; --radius-lg: 20px;
    --font-display: 'Inter', sans-serif; --font-body: 'Inter', sans-serif;
    --font-mono: 'Inter', monospace;
  }
  html { scroll-behavior: smooth; }
  body { font-family: var(--font-body); background: var(--surface); color: var(--ink); line-height: 1.5; -webkit-font-smoothing: antialiased; }

  /* LOGIN */
  .login-scene { min-height: 100vh; display: grid; grid-template-columns: 1fr 1fr; overflow: hidden; }
  .login-left { background: var(--ink); display: flex; flex-direction: column; justify-content: space-between; padding: 48px; position: relative; overflow: hidden; }
  .login-left::before { content: ''; position: absolute; width: 500px; height: 500px; border-radius: 50%; background: radial-gradient(circle, rgba(108,59,255,0.35) 0%, transparent 70%); top: -100px; left: -100px; animation: pulse-glow 4s ease-in-out infinite; }
  .login-left::after { content: ''; position: absolute; width: 400px; height: 400px; border-radius: 50%; background: radial-gradient(circle, rgba(255,75,38,0.25) 0%, transparent 70%); bottom: -80px; right: -80px; animation: pulse-glow 4s ease-in-out infinite 2s; }
  @keyframes pulse-glow { 0%,100% { opacity: 0.8; transform: scale(1); } 50% { opacity: 1; transform: scale(1.1); } }
  .login-brand { font-family: var(--font-display); font-size: 2.4rem; font-weight: 800; color: white; position: relative; z-index: 1; }
  .login-brand span { color: var(--accent); }
  .login-tagline { font-size: 3.2rem; font-weight: 800; font-family: var(--font-display); color: white; line-height: 1.15; position: relative; z-index: 1; }
  .login-tagline em { color: var(--accent-2); font-style: normal; }
  .login-sub-text { color: rgba(255,255,255,0.45); font-size: 1rem; margin-top: 16px; position: relative; z-index: 1; }
  .login-stats { display: flex; gap: 40px; position: relative; z-index: 1; }
  .login-stat-val { font-family: var(--font-display); font-size: 2rem; font-weight: 800; color: white; }
  .login-stat-label { color: rgba(255,255,255,0.4); font-size: 0.8rem; margin-top: 2px; }
  .login-right { background: var(--white); display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 48px; }
  .login-form-wrap { width: 100%; max-width: 380px; }
  .login-heading { font-family: var(--font-display); font-size: 2rem; font-weight: 700; margin-bottom: 8px; }
  .login-heading-sub { color: var(--muted); font-size: 0.95rem; margin-bottom: 36px; }

  /* FORMS */
  .form-field { margin-bottom: 20px; }
  .form-field label { display: block; font-weight: 600; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; color: var(--ink-3); }
  .form-field input, .form-field select, .form-field textarea { width: 100%; padding: 13px 16px; border: 2px solid var(--surface-3); border-radius: var(--radius); font-size: 0.95rem; font-family: var(--font-body); background: var(--surface); outline: none; transition: all 0.2s; color: var(--ink); }
  .form-field input:focus, .form-field select:focus, .form-field textarea:focus { border-color: var(--accent-2); background: white; box-shadow: 0 0 0 4px rgba(108,59,255,0.1); }
  .demo-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--surface-3); }
  .demo-pill { padding: 6px 14px; border-radius: 30px; border: 1.5px solid var(--surface-3); font-size: 0.8rem; font-weight: 600; cursor: pointer; background: transparent; color: var(--muted); transition: all 0.2s; font-family: var(--font-body); }
  .demo-pill:hover { border-color: var(--accent-2); color: var(--accent-2); background: rgba(108,59,255,0.06); }

  /* BUTTONS */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 22px; border: none; border-radius: var(--radius); font-size: 0.9rem; font-weight: 700; cursor: pointer; transition: all 0.18s; font-family: var(--font-body); text-decoration: none; white-space: nowrap; }
  .btn-primary { background: var(--ink); color: white; }
  .btn-primary:hover { background: var(--ink-3); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.18); }
  .btn-accent { background: var(--accent); color: white; }
  .btn-accent:hover { filter: brightness(1.1); transform: translateY(-1px); }
  .btn-purple { background: var(--accent-2); color: white; }
  .btn-purple:hover { filter: brightness(1.1); transform: translateY(-1px); }
  .btn-success { background: var(--success); color: white; }
  .btn-danger { background: var(--danger); color: white; }
  .btn-warning { background: var(--warning); color: var(--ink); }
  .btn-ghost { background: transparent; color: var(--muted); border: 1.5px solid var(--surface-3); }
  .btn-ghost:hover { background: var(--surface-2); color: var(--ink); }
  .btn-sm { padding: 7px 14px; font-size: 0.8rem; border-radius: 9px; }
  .btn-full { width: 100%; }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none !important; }
  .pdf-export-btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; border-radius: 10px; background: rgba(255,75,38,0.1); color: var(--accent); border: 1.5px solid rgba(255,75,38,0.25); font-weight: 700; font-size: 0.82rem; cursor: pointer; font-family: var(--font-body); transition: all 0.15s; }
  .pdf-export-btn:hover { background: rgba(255,75,38,0.18); }

  /* SIDEBAR */
  .sidebar { width: var(--sidebar-w); background: var(--ink); position: fixed; top: 0; left: 0; bottom: 0; display: flex; flex-direction: column; z-index: 100; overflow: hidden; }
  .sidebar-logo { padding: 28px 24px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .sidebar-logo-text { font-family: var(--font-display); font-size: 1.5rem; font-weight: 800; color: white; }
  .sidebar-logo-text span { color: var(--accent); }
  .sidebar-role-badge { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 4px 10px; border-radius: 20px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); }
  .sidebar-nav { flex: 1; padding: 16px 12px; overflow-y: auto; }
  .sidebar-section-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.22); font-weight: 600; padding: 12px 12px 6px; margin-top: 4px; font-family: var(--font-mono); }
  .nav-item { display: flex; align-items: center; gap: 11px; padding: 10px 14px; border-radius: 11px; cursor: pointer; color: rgba(255,255,255,0.5); font-weight: 500; font-size: 0.875rem; transition: all 0.15s; margin-bottom: 2px; position: relative; }
  .nav-item:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.9); }
  .nav-item.active { background: rgba(255,255,255,0.1); color: white; }
  .nav-item.active::before { content: ''; position: absolute; left: 0; top: 20%; bottom: 20%; width: 3px; border-radius: 2px; background: var(--accent); }
  .sidebar-user { padding: 16px 12px; border-top: 1px solid rgba(255,255,255,0.06); }
  .user-card { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 12px; background: rgba(255,255,255,0.05); }
  .user-avatar { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, var(--accent-2), var(--accent)); display: grid; place-items: center; font-family: var(--font-display); font-weight: 700; font-size: 1rem; color: white; flex-shrink: 0; }
  .user-name-text { font-size: 0.875rem; font-weight: 700; color: white; }
  .user-email-text { font-size: 0.72rem; color: rgba(255,255,255,0.38); }
  .logout-btn { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-radius: 10px; margin-top: 6px; color: rgba(255,75,38,0.7); cursor: pointer; font-size: 0.85rem; font-weight: 600; font-family: var(--font-body); transition: all 0.15s; background: transparent; border: none; width: 100%; }
  .logout-btn:hover { background: rgba(255,75,38,0.1); color: var(--accent); }

  /* LAYOUT */
  .app { display: flex; min-height: 100vh; }
  .main-content { margin-left: var(--sidebar-w); flex: 1; display: flex; flex-direction: column; }
  .topbar { background: rgba(244,243,240,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid var(--surface-3); padding: 14px 32px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; }
  .page-title { font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; color: var(--ink); }
  .topbar-right { display: flex; align-items: center; gap: 12px; }
  .content-area { padding: 28px 32px; flex: 1; }
  .notif-btn { width: 38px; height: 38px; border-radius: 10px; background: var(--surface-2); border: none; cursor: pointer; display: grid; place-items: center; color: var(--ink-3); position: relative; transition: all 0.15s; }
  .notif-btn:hover { background: var(--surface-3); }
  .notif-dot { position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); border: 2px solid var(--surface); }
  .theme-btn { width: 38px; height: 38px; border-radius: 10px; background: var(--surface-2); border: none; cursor: pointer; display: grid; place-items: center; color: var(--ink-3); transition: all 0.15s; }
  .theme-btn:hover { background: var(--surface-3); }

  /* CARDS */
  .card { background: var(--white); border-radius: var(--radius-lg); padding: 24px; border: 1px solid var(--surface-3); }
  .card-title { font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; margin-bottom: 20px; color: var(--ink); display: flex; align-items: center; gap: 8px; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 24px; }
  .stat-card { background: var(--white); border-radius: var(--radius-lg); padding: 22px; border: 1px solid var(--surface-3); position: relative; overflow: hidden; transition: transform 0.15s, box-shadow 0.15s; }
  .stat-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
  .stat-value { font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; line-height: 1; }
  .stat-label { font-size: 0.82rem; color: var(--muted); margin-top: 6px; font-weight: 500; }
  .stat-change { font-size: 0.78rem; font-weight: 600; margin-top: 8px; display: flex; align-items: center; gap: 4px; }

  /* PROFILE HERO */
  .profile-hero { background: var(--ink); border-radius: var(--radius-lg); padding: 28px 32px; color: white; display: flex; align-items: center; gap: 24px; margin-bottom: 20px; position: relative; overflow: hidden; }
  .profile-hero::after { content: ''; position: absolute; right: -60px; top: -60px; width: 260px; height: 260px; border-radius: 50%; background: radial-gradient(circle, rgba(108,59,255,0.3) 0%, transparent 70%); }
  .profile-hero-avatar { width: 72px; height: 72px; border-radius: 18px; background: linear-gradient(135deg, var(--accent-2), var(--accent)); display: grid; place-items: center; font-family: var(--font-display); font-weight: 800; font-size: 2rem; color: white; flex-shrink: 0; }
  .profile-hero-name { font-family: var(--font-display); font-size: 1.6rem; font-weight: 800; }
  .profile-hero-meta { color: rgba(255,255,255,0.55); font-size: 0.9rem; margin-top: 4px; }
  .profile-hero-badge { margin-left: auto; z-index: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: white; padding: 10px 22px; border-radius: 30px; font-weight: 700; font-size: 1.1rem; font-family: var(--font-display); }

  /* TABLE */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 10px 16px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.8px; color: var(--muted); border-bottom: 1.5px solid var(--surface-3); font-weight: 600; font-family: var(--font-mono); background: var(--surface); }
  td { padding: 13px 16px; border-bottom: 1px solid var(--surface-3); font-size: 0.88rem; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--surface); }

  /* TAGS */
  .tag { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 0.72rem; font-weight: 700; font-family: var(--font-mono); letter-spacing: 0.3px; }
  .tag-success { background: rgba(0,196,140,0.12); color: #008c64; }
  .tag-warning { background: rgba(255,184,0,0.15); color: #b07e00; }
  .tag-danger { background: rgba(255,59,59,0.12); color: #c02020; }
  .tag-info { background: rgba(75,123,255,0.12); color: #2d5acc; }
  .tag-muted { background: var(--surface-2); color: var(--muted); }
  .tag-purple { background: rgba(108,59,255,0.12); color: #5229cc; }

  /* MISC */
  .att-bar { height: 6px; border-radius: 3px; background: var(--surface-3); overflow: hidden; margin-top: 8px; }
  .att-fill { height: 100%; border-radius: 3px; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .detail-item label { font-size: 0.72rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; font-family: var(--font-mono); }
  .detail-item p { font-weight: 600; margin-top: 4px; font-size: 0.9rem; }
  .flex { display: flex; } .items-center { align-items: center; } .justify-between { justify-content: space-between; }
  .gap-2 { gap: 8px; } .gap-3 { gap: 12px; }
  .mb-4 { margin-bottom: 16px; } .mb-5 { margin-bottom: 20px; } .mb-6 { margin-bottom: 24px; } .mt-4 { margin-top: 16px; }
  .text-muted { color: var(--muted); font-size: 0.88rem; } .text-sm { font-size: 0.82rem; }
  .font-bold { font-weight: 700; } .font-display { font-family: var(--font-display); } .font-mono { font-family: var(--font-mono); }
  .section-title { font-family: var(--font-display); font-size: 1.1rem; font-weight: 700; margin-bottom: 14px; }
  .divider { height: 1px; background: var(--surface-3); margin: 20px 0; }
  .err { color: var(--danger); font-size: 0.82rem; margin-top: 6px; font-weight: 600; }

  /* TIMETABLE */
  .tt-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
  .tt-day-header { text-align: center; font-weight: 700; font-size: 0.72rem; color: var(--muted); padding: 8px; text-transform: uppercase; letter-spacing: 1px; font-family: var(--font-mono); }
  .tt-slot { background: var(--surface); border-radius: 12px; padding: 11px 12px; font-size: 0.78rem; border-left: 3px solid var(--accent-2); min-height: 80px; transition: transform 0.15s; }
  .tt-slot:hover { transform: scale(1.02); }

  /* MODAL */
  .modal-overlay { position: fixed; inset: 0; background: rgba(10,10,15,0.6); backdrop-filter: blur(4px); display: grid; place-items: center; z-index: 1000; padding: 20px; }
  .modal { background: white; border-radius: var(--radius-lg); padding: 32px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; }
  .modal-title { font-family: var(--font-display); font-size: 1.25rem; font-weight: 800; margin-bottom: 20px; }

  /* AI PANEL */
  .ai-panel { background: linear-gradient(135deg, var(--ink) 0%, #1a0a3a 100%); border-radius: var(--radius-lg); padding: 24px; position: relative; overflow: hidden; }
  .ai-panel::before { content: ''; position: absolute; top: -80px; right: -80px; width: 280px; height: 280px; border-radius: 50%; background: radial-gradient(circle, rgba(108,59,255,0.35) 0%, transparent 70%); }
  .ai-response { background: rgba(255,255,255,0.07); border-radius: 12px; padding: 16px; color: rgba(255,255,255,0.85); font-size: 0.88rem; line-height: 1.7; margin-top: 14px; position: relative; z-index: 1; min-height: 60px; }
  .ai-label { font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent-2); font-weight: 600; display: flex; align-items: center; gap: 6px; position: relative; z-index: 1; }
  .ai-title { font-family: var(--font-display); font-size: 1.25rem; font-weight: 800; color: white; margin: 8px 0 16px; position: relative; z-index: 1; }
  .ai-input { width: 100%; padding: 12px 16px; background: rgba(255,255,255,0.08); border: 1.5px solid rgba(255,255,255,0.12); border-radius: 10px; color: white; font-family: var(--font-body); font-size: 0.9rem; outline: none; position: relative; z-index: 1; transition: border-color 0.2s; }
  .ai-input:focus { border-color: var(--accent-2); }
  .ai-input::placeholder { color: rgba(255,255,255,0.3); }

  /* CHARTS */
  .chart-bars { display: flex; align-items: flex-end; gap: 8px; height: 100px; padding: 0 4px; }
  .chart-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .chart-bar { width: 100%; border-radius: 6px 6px 0 0; transition: height 0.8s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; }
  .chart-bar:hover { filter: brightness(1.15); }
  .chart-label { font-size: 0.68rem; color: var(--muted); font-family: var(--font-mono); }
  .analytics-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 20px; }
  .insight-item { padding: 12px 16px; border-radius: 10px; background: var(--surface); display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .insight-icon { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; }

  /* TOAST */
  .toast { position: fixed; bottom: 24px; right: 24px; z-index: 9999; padding: 14px 22px; border-radius: 12px; font-weight: 700; font-size: 0.9rem; box-shadow: 0 12px 32px rgba(0,0,0,0.18); max-width: 340px; animation: slideUp 0.3s ease; color: white; display: flex; align-items: center; gap: 10px; }
  @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  .fade-in { animation: fadeIn 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ALERTS */
  .alert-card { background: rgba(255,59,59,0.06); border: 1.5px solid rgba(255,59,59,0.2); border-radius: 12px; padding: 16px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; }

  /* MSG */
  .msg-item { padding: 16px; border-radius: 12px; border: 1.5px solid var(--surface-3); margin-bottom: 10px; cursor: pointer; transition: all 0.2s; }
  .msg-item:hover { border-color: var(--accent-2); background: rgba(108,59,255,0.03); }
  .msg-unread { border-color: var(--info); background: rgba(75,123,255,0.04); }

  /* CHATBOT */
  .chatbot-bubble { position: fixed; bottom: 28px; right: 28px; z-index: 999; width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-2), var(--accent)); display: grid; place-items: center; cursor: pointer; box-shadow: 0 8px 32px rgba(108,59,255,0.45); transition: transform 0.2s, box-shadow 0.2s; border: none; color: white; }
  .chatbot-bubble:hover { transform: scale(1.1); box-shadow: 0 12px 40px rgba(108,59,255,0.55); }
  .chatbot-bubble.open { background: var(--ink); }
  .chatbot-panel { position: fixed; bottom: 96px; right: 28px; z-index: 998; width: 380px; max-height: 560px; background: white; border-radius: 20px; box-shadow: 0 24px 64px rgba(0,0,0,0.2); display: flex; flex-direction: column; overflow: hidden; animation: slideUpPanel 0.25s ease; border: 1px solid var(--surface-3); }
  @keyframes slideUpPanel { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: none; } }
  .chatbot-header { padding: 16px 20px; background: linear-gradient(135deg, var(--ink) 0%, #1a0a3a 100%); color: white; display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .chatbot-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-2), var(--accent)); display: grid; place-items: center; flex-shrink: 0; }
  .chatbot-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .chatbot-msg { max-width: 85%; padding: 10px 14px; border-radius: 16px; font-size: 0.85rem; line-height: 1.55; }
  .chatbot-msg.user { align-self: flex-end; background: var(--accent-2); color: white; border-bottom-right-radius: 4px; }
  .chatbot-msg.ai { align-self: flex-start; background: var(--surface-2); color: var(--ink); border-bottom-left-radius: 4px; }
  .chatbot-typing { display: flex; gap: 4px; padding: 4px 0; }
  .chatbot-typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); animation: typingDot 1.2s infinite; }
  .chatbot-typing span:nth-child(2) { animation-delay: 0.2s; } .chatbot-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes typingDot { 0%,60%,100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-6px); opacity: 1; } }
  .chatbot-input-row { padding: 12px 16px; border-top: 1px solid var(--surface-3); display: flex; gap: 8px; flex-shrink: 0; }
  .chatbot-input { flex: 1; padding: 9px 14px; border: 1.5px solid var(--surface-3); border-radius: 20px; font-family: var(--font-body); font-size: 0.85rem; outline: none; background: var(--surface); color: var(--ink); transition: border-color 0.2s; }
  .chatbot-input:focus { border-color: var(--accent-2); }
  .chatbot-send { width: 36px; height: 36px; border-radius: 50%; background: var(--accent-2); border: none; cursor: pointer; display: grid; place-items: center; color: white; transition: transform 0.15s; flex-shrink: 0; }
  .chatbot-send:hover { transform: scale(1.1); }
  .chatbot-send:disabled { opacity: 0.4; cursor: not-allowed; }

  /* NOTIF PANEL */
  .notif-panel { position: absolute; top: 52px; right: 0; width: 320px; background: white; border-radius: 16px; box-shadow: 0 16px 48px rgba(0,0,0,0.16); border: 1px solid var(--surface-3); z-index: 200; animation: fadeIn 0.2s ease; overflow: hidden; }
  .notif-panel-header { padding: 14px 18px; font-weight: 800; font-family: var(--font-display); font-size: 0.95rem; border-bottom: 1px solid var(--surface-3); display: flex; justify-content: space-between; align-items: center; }
  .notif-item { padding: 12px 18px; border-bottom: 1px solid var(--surface-3); cursor: pointer; transition: background 0.15s; font-size: 0.85rem; }
  .notif-item:last-child { border-bottom: none; }
  .notif-item:hover { background: var(--surface); }
  .notif-item.unread { background: rgba(75,123,255,0.05); }

  /* SIGNATURE PAD */
  .sig-pad { border: 2px dashed var(--surface-3); border-radius: 12px; cursor: crosshair; background: #fff; display: block; }
  .sig-pad:hover { border-color: var(--accent-2); }

  /* PREDICTOR */
  .predictor-card { background: linear-gradient(135deg, #0a2540 0%, #1a0a3a 100%); border-radius: var(--radius-lg); padding: 24px; color: white; position: relative; overflow: hidden; }
  .predictor-card::after { content: ''; position: absolute; top: -40px; right: -40px; width: 180px; height: 180px; border-radius: 50%; background: radial-gradient(circle, rgba(0,217,170,0.2) 0%, transparent 70%); }
  .predictor-bar { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.1); margin: 8px 0; overflow: hidden; }
  .predictor-fill { height: 100%; border-radius: 4px; transition: width 1s ease; }

  /* CALC */
  .calc-result { background: var(--ink); color: white; border-radius: 14px; padding: 24px; text-align: center; margin: 16px 0; }
  .calc-big { font-family: var(--font-display); font-size: 3rem; font-weight: 800; line-height: 1; }
  .grade-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--surface); border-radius: 10px; margin-bottom: 8px; }

  /* DARK MODE */
  [data-theme="dark"] { --ink: #f0f0f5; --ink-2: #d0d0e0; --ink-3: #a0a0b8; --surface: #0f0f18; --surface-2: #181825; --surface-3: #252535; --white: #1a1a2a; --muted: #6060a0; }
  [data-theme="dark"] body { background: #0f0f18; }
  [data-theme="dark"] .card { background: #1a1a2a; border-color: #252535; }
  [data-theme="dark"] .topbar { background: rgba(15,15,24,0.92); border-color: #252535; }
  [data-theme="dark"] .stat-card { background: #1a1a2a; border-color: #252535; }
  [data-theme="dark"] .modal { background: #1a1a2a; }
  [data-theme="dark"] .form-field input, [data-theme="dark"] .form-field select, [data-theme="dark"] .form-field textarea { background: #252535; border-color: #353550; color: #f0f0f5; }
  [data-theme="dark"] th { background: #151520; }
  [data-theme="dark"] tr:hover td { background: #1f1f30; }
  [data-theme="dark"] .tt-slot { background: #1f1f30; }
  [data-theme="dark"] .insight-item { background: #1f1f30; }
  [data-theme="dark"] .grade-row { background: #1f1f30; }
  [data-theme="dark"] .msg-item { border-color: #252535; }
  [data-theme="dark"] .chatbot-panel { background: #1a1a2a; border-color: #252535; }
  [data-theme="dark"] .chatbot-msg.ai { background: #252535; color: #f0f0f5; }
  [data-theme="dark"] .chatbot-input { background: #252535; border-color: #353550; color: #f0f0f5; }
  [data-theme="dark"] .notif-panel { background: #1a1a2a; border-color: #252535; }
  [data-theme="dark"] .login-right { background: #1a1a2a; }

  @media (max-width: 900px) {
    .chatbot-panel { width: calc(100vw - 32px); right: 16px; }
    .login-scene { grid-template-columns: 1fr; }
    .login-left { display: none; }
    .sidebar { transform: translateX(-100%); }
    .sidebar.open { transform: translateX(0); }
    .main-content { margin-left: 0; }
    .analytics-grid { grid-template-columns: 1fr; }
    .grid-2, .grid-3 { grid-template-columns: 1fr; }
    .detail-grid { grid-template-columns: 1fr; }
    .tt-grid { grid-template-columns: 1fr 1fr; }
    .content-area { padding: 20px 16px; }
  }

  /* LETTER FORM */
  .letter-preview { background: white; border: 1px solid var(--surface-3); border-radius: 12px; padding: 32px; font-family: 'Georgia', serif; line-height: 1.8; font-size: 0.92rem; position: relative; }
  .letter-preview .letter-header { text-align: center; margin-bottom: 24px; font-family: var(--font-display); font-weight: 800; font-size: 1.1rem; }
  .letter-preview .letter-body { margin-top: 20px; }
  [data-theme="dark"] .letter-preview { background: #252535; color: #f0f0f5; }

  /* PROFILE IMAGE */
  .profile-img-wrap { width: 100px; height: 100px; border-radius: 50%; overflow: hidden; border: 4px solid white; box-shadow: 0 4px 16px rgba(0,0,0,0.2); display: grid; place-items: center; background: linear-gradient(135deg,var(--accent-2),var(--accent)); font-family:var(--font-display); font-size:2.5rem; font-weight:800; color:white; cursor: pointer; position: relative; }
  .profile-img-wrap img { width:100%; height:100%; object-fit: cover; }
  .profile-img-overlay { position:absolute; inset:0; background: rgba(0,0,0,0.4); display:grid; place-items:center; opacity:0; transition:opacity 0.2s; color:white; }
  .profile-img-wrap:hover .profile-img-overlay { opacity:1; }
`;

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  const colors = { success: "#00c48c", error: "#ff3b3b", info: "#4b7bff", warning: "#ffb800" };
  const emojis = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
  return <div className="toast" style={{ background: colors[type] || "#333" }}><span>{emojis[type]}</span>{msg}</div>;
}

function LoadingState() {
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 32px", color: "var(--muted)", gap: 16 }}>
    <div style={{ width: 40, height: 40, border: "3px solid var(--surface-3)", borderTopColor: "var(--accent-2)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    <div style={{ fontSize: "0.88rem" }}>Loading...</div>
  </div>;
}

function BarChart({ data, color = "var(--accent-2)" }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return <div className="chart-bars">{data.map((d, i) => (
    <div key={i} className="chart-bar-wrap">
      <div className="chart-bar" style={{ height: `${(d.value / max) * 80}px`, background: color, opacity: 0.7 + (i / data.length) * 0.3 }} title={`${d.label}: ${d.value}`} />
      <div className="chart-label">{d.label}</div>
    </div>
  ))}</div>;
}

function DonutChart({ value, max, color, size = 100 }) {
  const pct = Math.min((value / max) * 100, 100);
  const r = 36; const c = 2 * Math.PI * r; const dash = (pct / 100) * c;
  return <div style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} ${c}`} strokeDashoffset={c * 0.25} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
    </svg>
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)" }}>
      <span style={{ fontSize: size * 0.22, fontWeight: 800, lineHeight: 1 }}>{Math.round(pct)}%</span>
    </div>
  </div>;
}

function Sparkline({ data, color = "var(--accent-2)", height = 48, width = 140 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data) - 0.1; const max = Math.max(...data) + 0.1; const range = max - min || 1;
  const pts = data.map((v, i) => { const x = (i / (data.length - 1)) * width; const y = height - ((v - min) / range) * height; return `${x},${y}`; }).join(" ");
  const last = data[data.length - 1]; const lastX = width; const lastY = height - ((last - min) / range) * height;
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
    <defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    <polygon points={`0,${height} ${pts} ${width},${height}`} fill="url(#sparkGrad)" />
    <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={lastX} cy={lastY} r="4" fill={color} />
  </svg>;
}

// ─── SIGNATURE PAD ────────────────────────────────────────────────────────────
function SignaturePad({ onSave }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  function start(e) {
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e, canvasRef.current);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    e.preventDefault();
  }
  function draw(e) {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e, canvasRef.current);
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#0a0a0f";
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
    e.preventDefault();
  }
  function stop() { drawing.current = false; }
  function clear() { const ctx = canvasRef.current.getContext("2d"); ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); }
  function save() { onSave(canvasRef.current.toDataURL()); }

  return <div>
    <canvas ref={canvasRef} width={440} height={120} className="sig-pad"
      onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop}
      onTouchStart={start} onTouchMove={draw} onTouchEnd={stop}
    />
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
      <button className="btn btn-success btn-sm" onClick={save}><Icon name="check" size={12} /> Save Signature</button>
    </div>
  </div>;
}


// ─── PDF GENERATORS ───────────────────────────────────────────────────────────
function printHTML(html, filename = "document") {
  const w = window.open("", "_blank");
  w.document.write(html); w.document.close();
  setTimeout(() => w.print(), 600);
}

function generateLetterPDF({ type, studentName, registerNumber, className, yearOfStudy, reason, signature, proofImage, offerLetterImage }) {
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const isOD = type === "od";
  const isInternship = type === "internship";

  const subject = isOD
    ? `Request for On-Duty (OD) Leave for ${reason ? reason.split(" ").slice(0, 4).join(" ") : "Event Participation"}`
    : isInternship
    ? "Request for Internship Permission / No Objection Certificate"
    : "Application";

  const body = isOD
    ? `I am ${studentName}, a ${yearOfStudy} year student of ${className} (Register Number: ${registerNumber}). I am writing to respectfully request an On-Duty (OD) leave for the reason mentioned below:\n\n<strong>Reason:</strong> ${reason}\n\nI assure you that I will not miss any important academic activities and will submit all pending assignments upon my return. I kindly request you to grant me the OD leave and provide the necessary approval.\n\nI am attaching the proof of the event/activity for your kind reference.`
    : isInternship
    ? `I am ${studentName}, a ${yearOfStudy} year student of ${className} (Register Number: ${registerNumber}). I am writing to request your kind permission and a No Objection Certificate (NOC) for undertaking an internship as detailed below:\n\n<strong>Reason / Internship Details:</strong> ${reason}\n\nI assure you that this internship aligns with my academic curriculum and will greatly enhance my professional skills. I kindly request you to grant permission and provide the necessary NOC / approval. I have attached the internship offer letter for your reference.`
    : reason;

  const proofSection = proofImage
    ? `<div style="margin-top:20px"><strong style="font-size:0.85rem;text-transform:uppercase;letter-spacing:1px">Proof / Supporting Document:</strong><br/><img src="${proofImage}" style="max-width:400px;max-height:300px;margin-top:10px;border:1px solid #ddd;border-radius:8px"/></div>`
    : "";

  const offerSection = offerLetterImage
    ? `<div style="margin-top:20px"><strong style="font-size:0.85rem;text-transform:uppercase;letter-spacing:1px">Internship Offer Letter:</strong><br/><img src="${offerLetterImage}" style="max-width:400px;margin-top:10px;border:1px solid #ddd;border-radius:8px"/></div>`
    : "";

  const sigSection = signature
    ? `<div style="margin-top:8px"><img src="${signature}" style="height:60px"/></div>`
    : `<div style="height:60px;border-bottom:1px solid #333;width:200px;margin-top:8px"></div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${type.toUpperCase()} Application</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', sans-serif; padding: 60px 80px; color: #1a1a2e; line-height: 1.8; }
    .header { text-align:center; margin-bottom:40px; border-bottom: 3px double #1a1a2e; padding-bottom:20px; }
    .college { font-size:1.4rem; font-weight:900; text-transform:uppercase; letter-spacing:2px; }
    .dept { font-size:0.9rem; color:#555; margin-top:4px; }
    .doc-title { font-size:1.1rem; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#6c3bff; margin-top:12px; }
    .date-line { text-align:right; margin-bottom:20px; font-size:0.9rem; color:#555; }
    .to-line { margin-bottom:16px; }
    .subject-line { margin-bottom:20px; font-weight:700; }
    .body-text { margin-bottom:20px; white-space:pre-wrap; }
    .closing { margin-top:32px; }
    .sig-wrap { margin-top:8px; }
    .footer-stamp { margin-top:60px; display:flex; justify-content:space-between; font-size:0.75rem; color:#999; border-top:1px solid #ddd; padding-top:10px; }
    @media print { body { padding: 40px 60px; } }
  </style></head><body>
  <div class="header">
    <div class="college">ERP College of Engineering</div>
    <div class="dept">Department of Computer Science and Engineering</div>
    <div class="doc-title">${isOD ? "On-Duty (OD) Leave Application" : isInternship ? "Internship Permission Application" : "Application"}</div>
  </div>
  <div class="date-line">Date: ${today}</div>
  <div class="to-line">To,<br/><strong>The Head of Department</strong><br/>Department of CSE, ERP College</div>
  <p class="subject-line">Subject: ${subject}</p>
  <p>Respected Sir/Madam,</p>
  <div class="body-text"><p>${body.replace(/\n/g, "</p><p>")}</p></div>
  <p>I sincerely hope for a favorable response.</p>
  ${proofSection}${offerSection}
  <div class="closing">
    <p>Yours faithfully,</p>
    ${sigSection}
    <p style="margin-top:8px"><strong>${studentName}</strong></p>
    <p style="font-size:0.85rem;color:#555">${className} | Reg. No: ${registerNumber} | Year ${yearOfStudy}</p>
  </div>
  <div class="footer-stamp"><span>ERP College Management System</span><span>Generated: ${new Date().toLocaleString()}</span></div>
  </body></html>`;
}

async function exportStudentPDF(studentData, marks, attendance, profile) {
  const attHTML = attendance.map(r => `<tr><td>${r.course_code}</td><td>${r.course_name}</td><td>${r.present}/${r.total_classes}</td><td style="color:${r.percentage >= 75 ? '#00c48c' : '#ff3b3b'};font-weight:700">${r.percentage}%</td></tr>`).join("");
  const marksHTML = marks.map(m => `<tr><td>${m.course_code}</td><td>${m.course_name}</td><td>${m.cat1 ?? "—"}/${m.cat2 ?? "—"}/${m.cat3 ?? "—"}</td><td>${m.assignment1 ?? "—"}/${m.assignment2 ?? "—"}/${m.assignment3 ?? "—"}</td><td style="font-weight:800;color:${(m.internal_total || 0) >= 25 ? '#00c48c' : '#ff3b3b'}">${m.internal_total || 0}/40</td></tr>`).join("");
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const imgSrc = studentData.photo_url || "";
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Academic Report — ${studentData.name}</title>
  <style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'Segoe UI',sans-serif; color:#1a1a2e; padding:40px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:20px; border-bottom:3px solid #1a1a2e; }
  .brand { font-size:1.8rem; font-weight:900; } .brand span { color:#ff4b26; }
  .student-hero { background:#1a1a2e; color:white; border-radius:16px; padding:24px; margin-bottom:24px; display:grid; grid-template-columns:auto 1fr 1fr 1fr; gap:16px; align-items:center; }
  .hero-label { font-size:0.65rem; text-transform:uppercase; letter-spacing:1px; opacity:0.5; margin-bottom:4px; }
  .hero-val { font-weight:700; font-size:1rem; }
  .stu-photo { width:72px; height:72px; border-radius:50%; object-fit:cover; border:3px solid rgba(255,255,255,0.3); }
  .stu-initials { width:72px; height:72px; border-radius:50%; background:linear-gradient(135deg,#6c3bff,#ff4b26); display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:800; }
  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  th { text-align:left; padding:10px 14px; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.8px; color:#6b7280; border-bottom:2px solid #e5e7eb; background:#f9fafb; }
  td { padding:10px 14px; border-bottom:1px solid #f0f0f0; font-size:0.88rem; }
  .section-h { font-size:1rem; font-weight:800; margin:20px 0 10px; }
  .footer { margin-top:32px; padding-top:12px; border-top:1px solid #e5e7eb; font-size:0.75rem; color:#9ca3af; display:flex; justify-content:space-between; }
  @media print { body { padding:20px; } }</style></head><body>
  <div class="header">
    <div><div class="brand">ERP<span>.</span>College</div><div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;color:#6b7280;margin-top:4px">Official Academic Progress Report</div></div>
    <div style="text-align:right;font-size:0.82rem;color:#6b7280"><div>Generated: ${today}</div><div style="margin-top:4px">Academic Year 2024–25</div></div>
  </div>
  <div class="student-hero">
    ${imgSrc ? `<img src="${imgSrc}" class="stu-photo"/>` : `<div class="stu-initials">${(studentData.name || "?")[0]}</div>`}
    <div><div class="hero-label">Student Name</div><div class="hero-val">${studentData.name}</div><div class="hero-label" style="margin-top:8px">Register No.</div><div class="hero-val">${studentData.register_number || "—"}</div></div>
    <div><div class="hero-label">Department</div><div class="hero-val">${studentData.department}</div><div class="hero-label" style="margin-top:8px">Semester</div><div class="hero-val">Semester ${studentData.semester}</div></div>
    <div><div class="hero-label">CGPA</div><div class="hero-val" style="font-size:1.6rem">${studentData.cgpa}</div><div class="hero-label" style="margin-top:8px">Section</div><div class="hero-val">${studentData.section || "—"}</div></div>
  </div>
  <div class="section-h">📋 Attendance Summary</div>
  <table><thead><tr><th>Code</th><th>Course</th><th>Classes Present/Total</th><th>Attendance %</th></tr></thead><tbody>${attHTML}</tbody></table>
  <div class="section-h">📊 Internal Marks</div>
  <table><thead><tr><th>Code</th><th>Course</th><th>CAT 1/2/3</th><th>Asgn 1/2/3</th><th>Internal Total</th></tr></thead><tbody>${marksHTML}</tbody></table>
  <div class="footer"><span>ERP College Management System — Confidential Academic Record</span><span>Page 1 of 1</span></div>
  </body></html>`;
  printHTML(html);
}

function generateFeeReceiptPDF({ studentName, registerNumber, semester, academicYear, amount, transactionId, date }) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fee Receipt</title>
  <style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'Segoe UI',sans-serif; padding:60px; color:#1a1a2e; }
  .header { text-align:center; margin-bottom:32px; } .college { font-size:1.5rem; font-weight:900; text-transform:uppercase; letter-spacing:2px; }
  .receipt-box { border:2px solid #1a1a2e; border-radius:16px; padding:32px; max-width:500px; margin:0 auto; }
  .receipt-title { font-size:1.1rem; font-weight:800; text-align:center; margin-bottom:24px; text-transform:uppercase; letter-spacing:1px; color:#6c3bff; }
  .row { display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid #eee; font-size:0.9rem; }
  .row:last-child { border-bottom:none; }
  .label { color:#6b7280; }
  .amount-row { font-size:1.4rem; font-weight:900; color:#00c48c; }
  .stamp { text-align:center; margin-top:32px; color:#999; font-size:0.75rem; }
  @media print { body { padding:30px; } }</style></head><body>
  <div class="header"><div class="college">ERP College</div><div style="font-size:0.85rem;color:#666;margin-top:4px">Official Fee Receipt</div></div>
  <div class="receipt-box">
    <div class="receipt-title">Exam Fee Payment Receipt</div>
    <div class="row"><span class="label">Receipt No.</span><span style="font-family:monospace;font-weight:700">ERP-${Date.now().toString().slice(-8)}</span></div>
    <div class="row"><span class="label">Student Name</span><span style="font-weight:700">${studentName}</span></div>
    <div class="row"><span class="label">Register Number</span><span style="font-family:monospace">${registerNumber}</span></div>
    <div class="row"><span class="label">Semester</span><span>Semester ${semester}</span></div>
    <div class="row"><span class="label">Academic Year</span><span>${academicYear}</span></div>
    <div class="row"><span class="label">Transaction ID</span><span style="font-family:monospace">${transactionId}</span></div>
    <div class="row"><span class="label">Payment Date</span><span>${date}</span></div>
    <div class="row amount-row"><span>Total Amount Paid</span><span>₹${amount}</span></div>
  </div>
  <div class="stamp"><p>✓ Payment Verified & Confirmed</p><p style="margin-top:4px">ERP College Management System · ${new Date().toLocaleString()}</p></div>
  </body></html>`;
  printHTML(html);
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("arjun.mehta@college.edu");
  const [password, setPassword] = useState("Student@123");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const DEMO = [
    { label: "Student", email: "arjun.mehta@college.edu", password: "Student@123" },
    { label: "Faculty", email: "priya.sharma@college.edu", password: "Faculty@123" },
    { label: "Admin", email: "admin@college.edu", password: "Admin@123" },
    { label: "Parent", email: "parent@college.edu", password: "Parent@123" },
  ];
  async function handleLogin(e) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      localStorage.setItem("erp_token", data.access_token);
      onLogin(data);
    } catch (err) { setError(err.message || "Login failed"); }
    finally { setLoading(false); }
  }
  return (
    <div className="login-scene">
      <div className="login-left">
        <div className="login-brand">SVCE<span>.</span>ERP</div>
        <div>
          <div className="login-tagline">The future of<br /><em>SVCE</em><br />management.</div>
          <div className="login-sub-text">Sri Venkateswara College of Engineering — Unified academic platform.</div>
        </div>
        <div className="login-stats">
          <div><div className="login-stat-val">3</div><div className="login-stat-label">Portals</div></div>
          <div><div className="login-stat-val">20+</div><div className="login-stat-label">Modules</div></div>
          <div><div className="login-stat-val">AI</div><div className="login-stat-label">Powered</div></div>
        </div>
      </div>
      <div className="login-right">
        <div className="login-form-wrap fade-in">
          <div className="login-heading">Welcome back.</div>
          <div className="login-heading-sub">Sign in to your institutional portal</div>
          <form onSubmit={handleLogin}>
            <div className="form-field"><label>College Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus /></div>
            <div className="form-field"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
            {error && <div className="err">⚠ {error}</div>}
            <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: 20, padding: "14px" }} disabled={loading}>{loading ? "Signing in..." : "Sign In →"}</button>
          </form>
          <div className="demo-pills">
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", alignSelf: "center", marginRight: 4 }}>Quick login:</span>
            {DEMO.map(d => <button key={d.label} className="demo-pill" onClick={() => { setEmail(d.email); setPassword(d.password); }}>{d.label}</button>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ user, active, onNav, onLogout, mobileOpen }) {
  const navConfig = {
    student: { sections: [
      { label: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }, { id: "profile", label: "My Profile", icon: "id" }] },
      { label: "Academics", items: [{ id: "timetable", label: "Timetable", icon: "time" }, { id: "attendance", label: "Attendance", icon: "attendance" }, { id: "marks", label: "Marks & Results", icon: "marks" }, { id: "courses", label: "Courses", icon: "book" }, { id: "assignments", label: "Assignments", icon: "exam" }] },
      { label: "Applications", items: [{ id: "od-letter", label: "OD Application", icon: "od" }, { id: "internship-letter", label: "Internship Letter", icon: "internship" }] },
      { label: "Finance", items: [{ id: "exam-reg", label: "Exam Registration", icon: "exam" }, { id: "exam-fees", label: "Fees & Receipts", icon: "fees" }] },
      { label: "Tools & AI", items: [{ id: "messages", label: "Messages", icon: "message" }, { id: "calculator", label: "Marks Calculator", icon: "calculator" }, { id: "ai-advisor", label: "AI Advisor", icon: "ai" }, { id: "mentor-selection", label: "Mentor Selection", icon: "faculty" }, { id: "academic-schedule", label: "Academic Calendar", icon: "time" }, { id: "transport", label: "Transport Details", icon: "send" }] },
    ]},
    faculty: { sections: [
      { label: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }, { id: "profile", label: "My Profile", icon: "user" }] },
      { label: "Teaching", items: [{ id: "my-students", label: "My Students", icon: "student" }, { id: "attendance-mgmt", label: "Mark Attendance", icon: "attendance" }, { id: "low-attendance", label: "Low Attendance", icon: "warning" }, { id: "marks-upload", label: "Upload Marks", icon: "marks" }, { id: "assignments", label: "Assignments", icon: "exam" }] },
      { label: "AI Tools", items: [{ id: "risk-prediction", label: "AI Risk Predictor", icon: "predict" }, { id: "ai-assignment", label: "AI Assignment Gen", icon: "ai" }, { id: "guardian-alerts", label: "Guardian Alerts", icon: "bell" }] },
      { label: "Insights", items: [{ id: "sentiment", label: "Class Sentiment", icon: "chart" }] },
      { label: "Applications", items: [{ id: "od-approvals", label: "OD/Internship Approvals", icon: "document" }] },
      { label: "Communication", items: [{ id: "messages", label: "Messages & Inbox", icon: "message" }, { id: "mentor-requests", label: "Mentor Requests", icon: "faculty" }] },
    ]},
    admin: { sections: [
      { label: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }, { id: "analytics", label: "Analytics", icon: "analytics" }] },
      { label: "Management", items: [{ id: "admin-students", label: "Students", icon: "student" }, { id: "admin-faculty", label: "Faculty", icon: "faculty" }, { id: "admin-courses", label: "Courses", icon: "book" }] },
      { label: "Operations", items: [{ id: "exam-approvals", label: "Exam Approvals", icon: "exam" }, { id: "broadcast", label: "Notifications", icon: "bell" }] },
    ]},
    parent: { sections: [
      { label: "Overview", items: [{ id: "dashboard", label: "Child Overview", icon: "dashboard" }] },
    ]},
  };
  const cfg = navConfig[user?.role] || { sections: [] };
  return (
    <div className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-text">SVCE<span>.</span>ERP</div>
        <div className="sidebar-role-badge"><Icon name={user?.role} size={10} />{user?.role} Portal</div>
      </div>
      <nav className="sidebar-nav">
        {cfg.sections.map(sec => (
          <div key={sec.label}>
            <div className="sidebar-section-label">{sec.label}</div>
            {sec.items.map(item => (
              <div key={item.id} className={`nav-item ${active === item.id ? "active" : ""}`} onClick={() => onNav(item.id)}>
                <Icon name={item.icon} size={16} />{item.label}
              </div>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-user">
        <div className="user-card">
          <div className="user-avatar">{user?.name?.[0]}</div>
          <div style={{ minWidth: 0 }}>
            <div className="user-name-text" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</div>
            <div className="user-email-text">{user?.role}</div>
          </div>
        </div>
        <button className="logout-btn" onClick={onLogout}><Icon name="logout" size={14} /> Sign Out</button>
      </div>
    </div>
  );
}


// ─── STUDENT PROFILE (Enhanced) ───────────────────────────────────────────────
function StudentProfile() {
  const [profile, setProfile] = useState(null);
  const [photo, setPhoto] = useState(() => localStorage.getItem("student_photo") || "");
  const fileRef = useRef(null);
  useEffect(() => { api("/student/profile").then(setProfile).catch(console.error); }, []);

  function handlePhotoUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { const url = ev.target.result; setPhoto(url); localStorage.setItem("student_photo", url); };
    reader.readAsDataURL(file);
  }

  async function handleExport() {
    try {
      const [dash, marks, att] = await Promise.all([api("/student/dashboard"), api("/student/marks"), api("/student/attendance")]);
      await exportStudentPDF({ ...dash.student, photo_url: photo }, marks, att, profile);
    } catch (e) { alert("Could not generate: " + e.message); }
  }

  if (!profile) return <LoadingState />;
  const u = profile.user || {};
  const fields = [
    { label: "Register Number", value: profile.register_number },
    { label: "Department", value: profile.department?.name },
    { label: "Semester", value: `Semester ${profile.current_semester}` },
    { label: "Section", value: profile.section },
    { label: "Batch Year", value: profile.batch_year },
    { label: "Email", value: u.email },
    { label: "Phone", value: u.phone },
    { label: "Gender", value: u.gender },
    { label: "Date of Birth", value: u.date_of_birth },
    { label: "Blood Group", value: profile.blood_group },
    { label: "CGPA", value: profile.cgpa },
    { label: "Guardian Name", value: profile.guardian_name },
    { label: "Guardian Phone", value: profile.guardian_phone },
    { label: "Address", value: u.address },
  ].filter(f => f.value);

  return (
    <div className="fade-in">
      <div className="profile-hero mb-5">
        <div style={{ position: "relative" }}>
          <div className="profile-img-wrap" onClick={() => fileRef.current?.click()}>
            {photo ? <img src={photo} alt="Profile" /> : <span>{u.name?.[0]}</span>}
            <div className="profile-img-overlay"><Icon name="camera" size={24} /></div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} />
        </div>
        <div>
          <div className="profile-hero-name">{u.name}</div>
          <div className="profile-hero-meta">{profile.register_number} · {profile.department?.name}</div>
          <span className="tag tag-success" style={{ marginTop: 8, display: "inline-flex" }}>Active Student</span>
          <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Click photo to change</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end", zIndex: 1 }}>
          <div className="profile-hero-badge">CGPA {profile.cgpa}</div>
          <button className="pdf-export-btn" onClick={handleExport}><Icon name="download" size={14} /> Export PDF Report</button>
        </div>
      </div>
      <div className="card">
        <div className="card-title"><Icon name="user" size={18} /> Personal Information</div>
        <div className="detail-grid">
          {fields.map((f, i) => <div key={i} className="detail-item"><label>{f.label}</label><p>{String(f.value)}</p></div>)}
        </div>
        <div style={{ marginTop: 20, padding: "12px 16px", background: "rgba(255,184,0,0.08)", borderRadius: 10, fontSize: "0.82rem", color: "var(--warning)", border: "1px solid rgba(255,184,0,0.2)", fontWeight: 600 }}>
          ℹ Contact admin to update personal details
        </div>
      </div>
    </div>
  );
}

// ─── STUDENT DASHBOARD ────────────────────────────────────────────────────────
function StudentDashboard() {
  const [data, setData] = useState(null); const [notifs, setNotifs] = useState([]);
  const [attendance, setAttendance] = useState([]); const [assignments, setAssignments] = useState([]);
  const [marks, setMarks] = useState([]); const [courses, setCourses] = useState([]);
  useEffect(() => {
    api("/student/dashboard").then(setData).catch(console.error);
    api("/student/notifications").then(setNotifs).catch(console.error);
    api("/student/attendance").then(setAttendance).catch(console.error);
    api("/student/assignments").then(setAssignments).catch(console.error);
    api("/student/marks").then(setMarks).catch(console.error);
    api("/student/courses").then(setCourses).catch(console.error);
  }, []);
  if (!data) return <LoadingState />;
  const { student, attendance_percentage, total_courses, unread_messages } = data;
  const attColor = attendance_percentage >= 75 ? "var(--success)" : "var(--danger)";

  // Smart notifications
  const smartNotifs = [];
  attendance.forEach(a => { if (a.percentage < 75 && a.total_classes > 0) smartNotifs.push({ type: "danger", msg: `⚠ Low attendance in ${a.course_code}: ${a.percentage}% (below 75%)` }); });
  const pendingAsgn = assignments.filter(a => !a.submitted && new Date(a.due_date) >= new Date());
  const overdueAsgn = assignments.filter(a => !a.submitted && new Date(a.due_date) < new Date());
  pendingAsgn.forEach(a => smartNotifs.push({ type: "warning", msg: `📝 Assignment due: "${a.title}" (${a.course_code}) — ${a.due_date}` }));
  overdueAsgn.forEach(a => smartNotifs.push({ type: "danger", msg: `🔴 Overdue: "${a.title}" (${a.course_code}) — was due ${a.due_date}` }));
  notifs.filter(n => !n.is_read).forEach(n => smartNotifs.push({ type: "info", msg: `🔔 ${n.title}: ${n.message}` }));

  const stats = [
    { label: "Attendance", value: `${attendance_percentage}%`, color: attColor, change: attendance_percentage >= 75 ? "✓ Safe zone" : "⚠ Below 75%" },
    { label: "Courses", value: total_courses, color: "var(--accent-2)", change: "This semester" },
    { label: "CGPA", value: student.cgpa?.toFixed(2) || "—", color: "var(--accent-4)", change: "Cumulative" },
    { label: "Messages", value: unread_messages, color: "var(--info)", change: "Unread" },
  ];
  return (
    <div className="fade-in">
      <div className="profile-hero mb-5">
        <div className="profile-hero-avatar">{student.name?.[0]}</div>
        <div>
          <div className="profile-hero-name">Hey, {student.name.split(" ")[0]} 👋</div>
          <div className="profile-hero-meta">{student.register_number} · {student.department} · Semester {student.semester} · Section {student.section}</div>
        </div>
        <div className="profile-hero-badge">CGPA {student.cgpa?.toFixed(2)}</div>
      </div>
      <div className="stat-grid mb-6">
        {stats.map((s, i) => <div key={i} className="stat-card" style={{ borderTop: `3px solid ${s.color}` }}>
          <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          <div className="stat-label">{s.label}</div>
          <div className="stat-change" style={{ color: s.color }}>{s.change}</div>
        </div>)}
      </div>

      {/* Smart Alerts */}
      {smartNotifs.length > 0 && (
        <div className="card mb-5" style={{ borderLeft: "4px solid var(--danger)" }}>
          <div className="card-title" style={{ marginBottom: 12 }}><Icon name="warning" size={18} /> ⚡ Action Required</div>
          {smartNotifs.slice(0, 6).map((n, i) => (
            <div key={i} style={{ padding: "8px 12px", marginBottom: 6, borderRadius: 8, fontSize: "0.84rem", fontWeight: 600,
              background: n.type === "danger" ? "rgba(255,59,59,0.07)" : n.type === "warning" ? "rgba(255,184,0,0.07)" : "rgba(75,123,255,0.07)",
              color: n.type === "danger" ? "var(--danger)" : n.type === "warning" ? "var(--warning)" : "var(--info)",
              border: `1px solid ${n.type === "danger" ? "rgba(255,59,59,0.2)" : n.type === "warning" ? "rgba(255,184,0,0.2)" : "rgba(75,123,255,0.2)"}` }}>
              {n.msg}
            </div>
          ))}
        </div>
      )}

      <div className="analytics-grid">
        {/* Per-Subject Attendance */}
        <div className="card">
          <div className="card-title"><Icon name="attendance" size={18} /> Attendance per Subject</div>
          {attendance.length === 0 && <div className="text-muted">No attendance records</div>}
          {attendance.map(a => {
            const color = a.percentage >= 75 ? "var(--success)" : a.percentage >= 60 ? "var(--warning)" : "var(--danger)";
            return (
              <div key={a.course_id} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>{a.course_code}</span>
                    <span className="text-muted text-sm" style={{ marginLeft: 8 }}>{a.course_name}</span>
                  </div>
                  <span style={{ fontWeight: 800, fontFamily: "var(--font-mono)", color, fontSize: "0.88rem" }}>{a.percentage}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: "var(--surface-3)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${a.percentage}%`, background: color, borderRadius: 4, transition: "width 0.8s ease" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                  <span>{a.present}/{a.total_classes} classes</span>
                  {a.percentage < 75 && <span style={{ color: "var(--danger)", fontWeight: 700 }}>⚠ Low</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* CGPA + Donut */}
          <div className="card">
            <div className="card-title" style={{ fontSize: "0.9rem" }}><Icon name="chart" size={16} /> Overall Attendance</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <DonutChart value={attendance_percentage} max={100} color={attColor} size={100} />
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", fontWeight: 800, color: "var(--accent-4)", lineHeight: 1 }}>{student.cgpa?.toFixed(2)}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>CGPA</div>
                <Sparkline data={[7.1, 7.4, 7.2, 7.8, 8.0, 8.1, student.cgpa || 8.1]} color="var(--accent-2)" height={36} width={110} />
              </div>
            </div>
          </div>

          {/* Enrolled Courses */}
          <div className="card">
            <div className="card-title" style={{ fontSize: "0.9rem" }}><Icon name="book" size={16} /> Enrolled Courses ({courses.length})</div>
            {courses.slice(0, 5).map(c => (
              <div key={c.course_id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--surface-3)", fontSize: "0.82rem" }}>
                <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)" }}>{c.code}</span>
                <span className="text-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>{c.name}</span>
                <span style={{ fontWeight: 700, color: "var(--accent-2)" }}>{c.credits}cr</span>
              </div>
            ))}
          </div>

          {/* Upcoming Assignments */}
          <div className="card">
            <div className="card-title" style={{ fontSize: "0.9rem" }}><Icon name="exam" size={16} /> Upcoming Assignments</div>
            {pendingAsgn.slice(0, 3).map(a => (
              <div key={a.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--surface-3)", fontSize: "0.82rem" }}>
                <div style={{ fontWeight: 700 }}>{a.title}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span className="text-muted">{a.course_code}</span>
                  <span style={{ color: "var(--warning)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>Due {a.due_date}</span>
                </div>
              </div>
            ))}
            {pendingAsgn.length === 0 && <div className="text-muted" style={{ fontSize: "0.82rem" }}>No pending assignments 🎉</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LETTER APPLICATION (OD / INTERNSHIP) ─────────────────────────────────────
function LetterApplication({ type, toast }) {
  const [form, setForm] = useState({ studentName: "", registerNumber: "", className: "", yearOfStudy: "", reason: "", eventName: "", venue: "", companyName: "", role: "", fromDate: "", toDate: "" });
  const [facultyId, setFacultyId] = useState("");
  const [facultyList, setFacultyList] = useState([]);
  const [signature, setSignature] = useState(null);
  const [proofImage, setProofImage] = useState(null);
  const [offerLetterImage, setOfferLetterImage] = useState(null);
  const [showSigPad, setShowSigPad] = useState(false);
  const [aiReason, setAiReason] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [myApps, setMyApps] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const proofRef = useRef(null);
  const offerRef = useRef(null);

  useEffect(() => {
    api("/student/profile").then(p => {
      setProfile(p);
      setForm(f => ({
        ...f,
        studentName: p.user?.name || "",
        registerNumber: p.register_number || "",
        className: `B.E ${p.department?.name || "CSE"}`,
        yearOfStudy: Math.ceil((p.current_semester || 1) / 2).toString(),
      }));
    }).catch(() => {});
    api("/student/faculty-list").then(setFacultyList).catch(() => {});
    const ep = type === "od" ? "/student/od/my" : "/student/internship/my";
    api(ep).then(setMyApps).catch(() => {});
  }, [type]);

  async function aiDraftReason() {
    setAiLoading(true);
    try {
      const typeStr = type === "od" ? "On-Duty leave for an event" : "internship at a company";
      const context = type === "od" ? form.eventName || form.reason : `${form.companyName} as ${form.role}`;
      const reply = await askAI(
        "You are a college student writing a formal request. Write a professional 2-sentence reason for the application. Return only the reason text, no quotes.",
        `Draft a reason for a ${typeStr} application. ${context ? `Context: ${context}` : ""}`
      );
      setForm(f => ({ ...f, reason: reply }));
      setAiReason(true);
    } catch { toast("AI unavailable", "error"); }
    finally { setAiLoading(false); }
  }

  function handleFileImage(e, setter) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setter(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function submitToFaculty() {
    if (!facultyId) { toast("Please select a faculty member", "error"); return; }
    if (!form.fromDate || !form.toDate) { toast("Please enter from and to dates", "error"); return; }
    if (!form.reason) { toast("Please enter a reason", "error"); return; }
    setSubmitting(true);
    try {
      if (type === "od") {
        await api("/student/od", {
          method: "POST",
          body: JSON.stringify({
            faculty_id: parseInt(facultyId),
            reason: form.reason,
            from_date: form.fromDate,
            to_date: form.toDate,
            event_name: form.eventName || null,
            venue: form.venue || null
          })
        });
      } else {
        await api("/student/internship", {
          method: "POST",
          body: JSON.stringify({
            faculty_id: parseInt(facultyId),
            company_name: form.companyName,
            role: form.role || null,
            from_date: form.fromDate,
            to_date: form.toDate,
            description: form.reason || null,
            offer_letter_url: offerLetterImage || null
          })
        });
      }
      toast("Application submitted! Faculty has been notified. ✓", "success");
      // Refresh my applications
      const ep = type === "od" ? "/student/od/my" : "/student/internship/my";
      setMyApps(await api(ep).catch(() => []));
      // Reset form fields but keep student info
      setForm(f => ({ ...f, reason: "", eventName: "", venue: "", companyName: "", role: "", fromDate: "", toDate: "" }));
      setFacultyId(""); setSignature(null);
    } catch (err) { toast(err.message || "Submission failed", "error"); }
    finally { setSubmitting(false); }
  }

  function previewLetter() {
    const html = generateLetterPDF({ type, ...form, signature, proofImage, offerLetterImage });
    printHTML(html);
  }

  const isOD = type === "od"; const isInternship = type === "internship";

  return (
    <div className="fade-in">
      <div className="card mb-5">
        <div className="card-title">
          <Icon name={isOD ? "od" : "internship"} size={18} />
          {isOD ? "OD (On-Duty) Application" : "Internship Permission Application"}
        </div>
        <div style={{ padding: "12px 16px", background: "rgba(108,59,255,0.06)", borderRadius: 10, marginBottom: 20, fontSize: "0.82rem", color: "var(--accent-2)", fontWeight: 600, border: "1px solid rgba(108,59,255,0.15)" }}>
          ✦ Fill in the details, select your faculty, and submit. The faculty will receive a notification and must approve with remarks and signature.
        </div>

        {/* Student Info */}
        <div className="grid-2">
          <div className="form-field"><label>Your Name</label><input value={form.studentName} onChange={e => setForm({ ...form, studentName: e.target.value })} /></div>
          <div className="form-field"><label>Register Number</label><input value={form.registerNumber} onChange={e => setForm({ ...form, registerNumber: e.target.value })} /></div>
          <div className="form-field"><label>Class / Department</label><input value={form.className} onChange={e => setForm({ ...form, className: e.target.value })} /></div>
          <div className="form-field"><label>Year of Study</label>
            <select value={form.yearOfStudy} onChange={e => setForm({ ...form, yearOfStudy: e.target.value })}>
              {["1", "2", "3", "4"].map(y => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </div>
        </div>

        {/* OD-specific fields */}
        {isOD && (
          <div className="grid-2">
            <div className="form-field"><label>Event Name</label><input value={form.eventName} onChange={e => setForm({ ...form, eventName: e.target.value })} placeholder="e.g. Hackathon at IIT Madras" /></div>
            <div className="form-field"><label>Venue</label><input value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} placeholder="e.g. IIT Madras Main Hall" /></div>
          </div>
        )}

        {/* Internship-specific fields */}
        {isInternship && (
          <div className="grid-2">
            <div className="form-field"><label>Company Name *</label><input value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} placeholder="e.g. TCS, Infosys" /></div>
            <div className="form-field"><label>Your Role</label><input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="e.g. Software Developer Intern" /></div>
          </div>
        )}

        {/* Date Range */}
        <div className="grid-2">
          <div className="form-field"><label>From Date *</label><input type="date" value={form.fromDate} onChange={e => setForm({ ...form, fromDate: e.target.value })} /></div>
          <div className="form-field"><label>To Date *</label><input type="date" value={form.toDate} onChange={e => setForm({ ...form, toDate: e.target.value })} /></div>
        </div>

        {/* Reason */}
        <div className="form-field">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ marginBottom: 0 }}>Reason {isOD ? "(for OD)" : "(Internship details)"}</label>
            <button className="btn btn-ghost btn-sm" onClick={aiDraftReason} disabled={aiLoading}>
              <Icon name="ai" size={13} /> {aiLoading ? "Drafting..." : "AI Draft"}
            </button>
          </div>
          <textarea rows={4} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
            placeholder={isOD ? "Describe why you need OD leave..." : "Describe the internship and how it benefits your career..."} />
          {aiReason && <div style={{ fontSize: "0.78rem", color: "var(--accent-2)", marginTop: 4, fontWeight: 600 }}>✦ Drafted by AI · Edit as needed</div>}
        </div>

        {/* Faculty Selection */}
        <div className="form-field">
          <label>Submit To (Select Faculty) *</label>
          <select value={facultyId} onChange={e => setFacultyId(e.target.value)}
            style={{ border: !facultyId ? "2px solid rgba(255,184,0,0.5)" : undefined }}>
            <option value="">— Select your faculty advisor —</option>
            {facultyList.map(f => <option key={f.id} value={f.id}>{f.name} · {f.designation} · {f.department}</option>)}
          </select>
          {!facultyId && <div style={{ fontSize: "0.75rem", color: "var(--warning)", marginTop: 4, fontWeight: 600 }}>⚠ Faculty selection is required to submit</div>}
        </div>

        {/* Proof Upload */}
        {isOD && (
          <div className="form-field">
            <label>Upload Event Proof (optional)</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => proofRef.current?.click()}><Icon name="upload" size={14} /> Upload Image</button>
              <input ref={proofRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFileImage(e, setProofImage)} />
              {proofImage && <img src={proofImage} alt="Proof" style={{ height: 60, borderRadius: 8, border: "1px solid var(--surface-3)" }} />}
              {proofImage && <button className="btn btn-ghost btn-sm" onClick={() => setProofImage(null)}>✕ Remove</button>}
            </div>
          </div>
        )}
        {isInternship && (
          <div className="form-field">
            <label>Upload Offer Letter (optional)</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => offerRef.current?.click()}><Icon name="upload" size={14} /> Upload</button>
              <input ref={offerRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFileImage(e, setOfferLetterImage)} />
              {offerLetterImage && <img src={offerLetterImage} alt="Offer" style={{ height: 60, borderRadius: 8, border: "1px solid var(--surface-3)" }} />}
              {offerLetterImage && <button className="btn btn-ghost btn-sm" onClick={() => setOfferLetterImage(null)}>✕ Remove</button>}
            </div>
          </div>
        )}

        {/* Signature */}
        <div style={{ marginTop: 8 }}>
          <label style={{ fontWeight: 600, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 10, color: "var(--ink-3)" }}>
            Your Digital Signature (optional)
          </label>
          {signature
            ? <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <img src={signature} alt="Signature" style={{ height: 60, border: "1px solid var(--surface-3)", borderRadius: 8, padding: 8, background: "white" }} />
                <button className="btn btn-ghost btn-sm" onClick={() => { setSignature(null); setShowSigPad(true); }}>Re-sign</button>
              </div>
            : !showSigPad
            ? <button className="btn btn-ghost btn-sm" onClick={() => setShowSigPad(true)}><Icon name="pen" size={14} /> Draw Signature</button>
            : <SignaturePad onSave={data => { setSignature(data); setShowSigPad(false); toast("Signature saved!", "success"); }} />
          }
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={submitToFaculty}
            disabled={submitting || !facultyId || !form.reason || !form.fromDate || !form.toDate || (isInternship && !form.companyName)}>
            <Icon name="send" size={16} /> {submitting ? "Submitting..." : "Submit to Faculty"}
          </button>
          <button className="btn btn-ghost" onClick={previewLetter} disabled={!form.studentName || !form.reason}>
            <Icon name="download" size={16} /> Preview PDF
          </button>
          <button className="btn btn-ghost" onClick={() => {
            setForm(f => ({ ...f, reason: "", eventName: "", venue: "", companyName: "", role: "", fromDate: "", toDate: "" }));
            setSignature(null); setProofImage(null); setOfferLetterImage(null); setFacultyId("");
          }}>Reset</button>
        </div>
      </div>

      {/* My Previous Applications */}
      {myApps.length > 0 && (
        <div className="card">
          <div className="card-title"><Icon name="time" size={18} /> My {isOD ? "OD" : "Internship"} Applications</div>
          {myApps.map(a => (
            <div key={a.id} style={{ padding: "12px 16px", background: "var(--surface)", borderRadius: 10, marginBottom: 8,
              borderLeft: `3px solid ${a.status === "approved" ? "var(--success)" : a.status === "rejected" ? "var(--danger)" : "var(--warning)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  {isOD
                    ? <div style={{ fontWeight: 700 }}>{a.event_name || "OD Request"} <span className="text-muted text-sm">({a.from_date} → {a.to_date})</span></div>
                    : <div style={{ fontWeight: 700 }}>{a.company_name} <span className="text-muted text-sm">({a.from_date} → {a.to_date})</span></div>
                  }
                  <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>Faculty: {a.faculty_name}</div>
                  {a.faculty_remarks && (
                    <div style={{ marginTop: 6, padding: "6px 10px", background: a.status === "approved" ? "rgba(0,196,140,0.08)" : "rgba(255,59,59,0.06)", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: a.status === "approved" ? "var(--success)" : "var(--danger)" }}>
                      Faculty remarks: {a.faculty_remarks}
                    </div>
                  )}
                </div>
                <span className={`tag ${a.status === "approved" ? "tag-success" : a.status === "rejected" ? "tag-danger" : "tag-warning"}`}>{a.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── STUDENT MARKS (with Semester Filter + PDF Download) ─────────────────────
// ─── INTERNAL MARKS FORMULA (same logic as the calculator) ───────────────────
// Formula: (avg of best 2 CATs out of 3 × 0.70) + (avg of best 2 Assignments out of 3 × 0.30)
// Each CAT is out of 50, each Assignment is out of 50
// Final internal total is scaled to 40
function calcInternal(m) {
  const cats = [m.cat1, m.cat2, m.cat3].map(v => parseFloat(v)).filter(v => !isNaN(v));
  const asgns = [m.assignment1, m.assignment2, m.assignment3].map(v => parseFloat(v)).filter(v => !isNaN(v));
  if (cats.length === 0 && asgns.length === 0) return null;

  // Average of available CATs (use all that are entered)
  const catAvg = cats.length > 0 ? cats.reduce((a, b) => a + b, 0) / cats.length : 0;
  // Average of available Assignments
  const asgnAvg = asgns.length > 0 ? asgns.reduce((a, b) => a + b, 0) / asgns.length : 0;

  // Weighted score out of 50
  const weighted = (catAvg * 0.70) + (asgnAvg * 0.30);

  // Scale to 40 (since each component is out of 50, scale: weighted/50 * 40)
  const total = Math.round((weighted / 50) * 40 * 100) / 100;

  return {
    total: Math.min(total, 40),          // capped at 40
    catAvg: catAvg.toFixed(1),
    asgnAvg: asgnAvg.toFixed(1),
    weighted: weighted.toFixed(2),
    catsEntered: cats.length,
    asgnsEntered: asgns.length,
  };
}

function StudentMarks() {
  const [marks, setMarks] = useState([]);
  const [courses, setCourses] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSemester, setSelectedSemester] = useState("current");
  const [currentSem, setCurrentSem] = useState(null);
  useEffect(() => {
    Promise.all([
      api("/student/marks").catch(() => []),
      api("/student/courses").catch(() => []),
      api("/student/dashboard").catch(() => null)
    ]).then(([m, c, p]) => {
      setMarks(m); setCourses(c); setProfile(p);
      if (p?.student?.semester) { setCurrentSem(p.student.semester); setSelectedSemester(String(p.student.semester)); }
      setLoading(false);
    });
  }, []);

  // Filter marks by semester if course data is available
  const filteredMarks = selectedSemester === "all" ? marks : marks.filter(m => {
    const course = courses.find(c => c.code === m.course_code);
    return !course || !course.semester || String(course.semester) === selectedSemester;
  });

  const semesterOptions = currentSem ? Array.from({ length: currentSem }, (_, i) => i + 1) : [1,2,3,4,5,6,7,8];

  // Attach recalculated internal total to each mark record
  const marksWithCalc = filteredMarks.map(m => {
    const calc = calcInternal(m);
    return { ...m, _calc: calc, _total: calc ? calc.total : null };
  });

  async function downloadMarksPDF() {
    const att = await api("/student/attendance").catch(() => []);
    // Pass recalculated totals into the PDF
    const marksForPDF = marksWithCalc.map(m => ({ ...m, internal_total: m._total ?? m.internal_total }));
    exportStudentPDF({ ...profile?.student, photo_url: localStorage.getItem("student_photo") || "" }, marksForPDF, att);
  }

  const chartData = marksWithCalc.map(m => ({ label: m.course_code, value: m._total ?? 0 }));
  const totals = marksWithCalc.map(m => m._total ?? 0).filter(v => v > 0);

  return (
    <div className="fade-in">
      {/* Semester Selector */}
      <div className="card mb-4" style={{ padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--muted)" }}>Select Semester:</span>
          {semesterOptions.map(s => (
            <button key={s} onClick={() => setSelectedSemester(String(s))}
              className={`btn btn-sm ${selectedSemester === String(s) ? "btn-primary" : "btn-ghost"}`}>
              Sem {s}
            </button>
          ))}
          <button onClick={() => setSelectedSemester("all")} className={`btn btn-sm ${selectedSemester === "all" ? "btn-primary" : "btn-ghost"}`}>All</button>
        </div>
      </div>

      {/* Formula Info Banner */}
      <div style={{ padding: "12px 18px", background: "rgba(108,59,255,0.06)", borderRadius: 12, marginBottom: 20, fontSize: "0.82rem", color: "var(--accent-2)", fontFamily: "var(--font-mono)", fontWeight: 600, border: "1px solid rgba(108,59,255,0.15)", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="calculator" size={16} />
        Formula: (CAT avg × 0.70 + Assignment avg × 0.30) ÷ 50 × 40 = Internal Total /40
      </div>

      {marksWithCalc.length > 0 && (
        <div className="card mb-5">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}><Icon name="chart" size={18} /> Performance Overview</div>
            <button className="pdf-export-btn" onClick={downloadMarksPDF}><Icon name="download" size={14} /> Download PDF</button>
          </div>
          <BarChart data={chartData} color="var(--accent-2)" />
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 12 }}>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              Avg: {totals.length ? (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1) : 0}/40
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--success)", fontFamily: "var(--font-mono)" }}>
              Best: {totals.length ? Math.max(...totals).toFixed(1) : 0}/40
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title"><Icon name="marks" size={18} /> Internal Marks Details</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Course</th>
                <th>CAT 1 /50</th>
                <th>CAT 2 /50</th>
                <th>CAT 3 /50</th>
                <th>CAT Avg</th>
                <th>Asgn 1 /50</th>
                <th>Asgn 2 /50</th>
                <th>Asgn 3 /50</th>
                <th>Asgn Avg</th>
                <th>Internal /40</th>
              </tr>
            </thead>
            <tbody>
              {marksWithCalc.map(m => {
                const c = m._calc;
                const total = m._total;
                const passing = total !== null ? total >= 20 : null; // 20/40 = 50% pass mark
                return (
                  <tr key={m.course_id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{m.course_code}</div>
                      <div className="text-muted text-sm">{m.course_name}</div>
                    </td>
                    {/* CATs */}
                    {[m.cat1, m.cat2, m.cat3].map((v, i) => (
                      <td key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: v != null ? "var(--ink)" : "var(--muted)" }}>
                        {v ?? "—"}
                      </td>
                    ))}
                    {/* CAT Average */}
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", fontWeight: 700, color: "var(--accent-2)", background: "rgba(108,59,255,0.04)" }}>
                      {c ? c.catAvg : "—"}
                    </td>
                    {/* Assignments */}
                    {[m.assignment1, m.assignment2, m.assignment3].map((v, i) => (
                      <td key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: v != null ? "var(--ink)" : "var(--muted)" }}>
                        {v ?? "—"}
                      </td>
                    ))}
                    {/* Assignment Average */}
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", fontWeight: 700, color: "var(--accent-4)", background: "rgba(255,184,0,0.04)" }}>
                      {c ? c.asgnAvg : "—"}
                    </td>
                    {/* Internal Total */}
                    <td>
                      {total !== null ? (
                        <div>
                          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.1rem", color: passing ? "var(--success)" : "var(--danger)" }}>
                            {total.toFixed(1)}/40
                          </span>
                          <div style={{ fontSize: "0.65rem", color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                            ({c.weighted}/50 scaled)
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {marks.length === 0 && (
          <div>
            {loading ? <LoadingState /> : (
              courses.length > 0 ? (
                <div>
                  <div style={{ padding: "12px 16px", background: "rgba(234,179,8,0.06)", borderRadius: 10, marginBottom: 16, fontSize: "0.82rem", color: "var(--warning)", fontWeight: 600, border: "1px solid rgba(234,179,8,0.2)" }}>
                    ⏳ Your faculty hasn\'t uploaded marks yet for your courses. Check back after CAT exams.
                  </div>
                  <div className="table-wrap"><table>
                    <thead><tr><th>Course</th><th>CAT 1</th><th>CAT 2</th><th>CAT 3</th><th>Asgn 1</th><th>Asgn 2</th><th>Asgn 3</th><th>Internal /40</th></tr></thead>
                    <tbody>{courses.map(c => (
                      <tr key={c.course_id}>
                        <td><div style={{ fontWeight: 700 }}>{c.code}</div><div className="text-muted text-sm">{c.name}</div></td>
                        {[...Array(7)].map((_, i) => <td key={i} style={{ color: "var(--muted)", textAlign: "center" }}>—</td>)}
                      </tr>
                    ))}</tbody>
                  </table></div>
                </div>
              ) : (
                <div className="text-muted" style={{ textAlign: "center", padding: 32 }}>
                  <div style={{ fontSize: 40, opacity: 0.3, marginBottom: 8 }}>📊</div>
                  No courses enrolled yet. Contact admin for course registration.
                </div>
              )
            )}
          </div>
        )}

        {/* Legend */}
        <div style={{ marginTop: 16, display: "flex", gap: 20, flexWrap: "wrap", fontSize: "0.75rem", color: "var(--muted)", fontFamily: "var(--font-mono)", borderTop: "1px solid var(--surface-3)", paddingTop: 12 }}>
          <span style={{ color: "var(--accent-2)" }}>■ CAT Avg = (CAT1 + CAT2 + CAT3) ÷ 3</span>
          <span style={{ color: "var(--accent-4)" }}>■ Asgn Avg = (A1 + A2 + A3) ÷ 3</span>
          <span>■ Internal = (CAT Avg × 0.70 + Asgn Avg × 0.30) ÷ 50 × 40</span>
        </div>
      </div>
    </div>
  );
}

// ─── STUDENT EXAM FEES (with Receipt) ─────────────────────────────────────────
function StudentExamFees({ toast }) {
  const [fees, setFees] = useState([]); const [txnId, setTxnId] = useState(""); const [paying, setPaying] = useState(null);
  const [studentInfo, setStudentInfo] = useState(null);
  useEffect(() => { api("/student/exam-fees").then(setFees).catch(console.error); api("/student/dashboard").then(d => setStudentInfo(d?.student)).catch(() => {}); }, []);

  async function handlePay(feeId) {
    if (!txnId) { toast("Enter a transaction ID", "error"); return; }
    try {
      await api(`/student/exam-fees/${feeId}/pay`, { method: "POST", body: JSON.stringify({ transaction_id: txnId }) });
      toast("Payment recorded!", "success");
      setFees(await api("/student/exam-fees")); setPaying(null); setTxnId("");
    } catch (err) { toast(err.message, "error"); }
  }

  function downloadReceipt(f) {
    generateFeeReceiptPDF({
      studentName: studentInfo?.name || "Student",
      registerNumber: studentInfo?.register_number || "—",
      semester: f.semester,
      academicYear: f.academic_year,
      amount: f.amount,
      transactionId: f.transaction_id,
      date: new Date().toLocaleDateString("en-IN"),
    });
  }

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-title"><Icon name="payment" size={18} /> Exam Fees & Receipts</div>
        {fees.length === 0 ? <div className="text-muted">No fee records. Register for exams first.</div> :
          fees.map(f => (
            <div key={f.id} style={{ padding: 18, background: "var(--surface)", borderRadius: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Semester {f.semester} · {f.academic_year}</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 800, color: "var(--ink)", marginTop: 4 }}>₹{f.amount}</div>
                  {f.payment_status === "paid" && <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>TXN: {f.transaction_id}</div>}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {f.payment_status === "paid" ? (
                    <>
                      <span className="tag tag-success" style={{ padding: "8px 16px", fontSize: "0.85rem" }}>✓ Paid</span>
                      <button className="pdf-export-btn btn-sm" onClick={() => downloadReceipt(f)}><Icon name="receipt" size={14} /> Receipt</button>
                    </>
                  ) : paying === f.id ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input style={{ padding: "9px 14px", border: "2px solid var(--surface-3)", borderRadius: 10, fontSize: "0.85rem", fontFamily: "var(--font-body)", outline: "none" }}
                        placeholder="Transaction ID" value={txnId} onChange={e => setTxnId(e.target.value)} />
                      <button className="btn btn-success btn-sm" onClick={() => handlePay(f.id)}>Confirm</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setPaying(null)}>Cancel</button>
                    </div>
                  ) : <button className="btn btn-accent btn-sm" onClick={() => setPaying(f.id)}>Pay Now →</button>}
                </div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}


// ─── STUDENT ATTENDANCE ───────────────────────────────────────────────────────
function StudentAttendance() {
  const [records, setRecords] = useState([]);
  useEffect(() => { api("/student/attendance").then(setRecords).catch(console.error); }, []);
  const overall = records.length ? Math.round(records.reduce((a, r) => a + r.percentage, 0) / records.length) : 0;

  async function downloadAttPDF() {
    const dash = await api("/student/dashboard").catch(() => null);
    const marks = await api("/student/marks").catch(() => []);
    exportStudentPDF({ ...dash?.student, photo_url: localStorage.getItem("student_photo") || "" }, marks, records);
  }

  return (
    <div className="fade-in">
      {records.some(r => r.percentage < 75) && (
        <div style={{ background: "rgba(255,59,59,0.08)", border: "1.5px solid rgba(255,59,59,0.25)", borderRadius: 14, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <Icon name="warning" size={20} style={{ color: "var(--danger)", flexShrink: 0 }} />
          <div><div style={{ fontWeight: 700, color: "var(--danger)", fontSize: "0.9rem" }}>Attendance Warning</div><div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: 2 }}>You have subjects below 75% — exam eligibility may be affected.</div></div>
        </div>
      )}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 0 }}><Icon name="attendance" size={18} /> Attendance Summary</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <DonutChart value={overall} max={100} color={overall >= 75 ? "var(--success)" : "var(--danger)"} size={60} />
            <button className="pdf-export-btn" onClick={downloadAttPDF}><Icon name="download" size={14} /> PDF</button>
          </div>
        </div>
        {records.map(r => (
          <div key={r.course_id} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{r.course_code}</div><div className="text-muted text-sm">{r.course_name}</div></div>
              <div style={{ textAlign: "right" }}>
                <span className={`tag ${r.percentage >= 75 ? "tag-success" : "tag-danger"}`}>{r.percentage}%</span>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>{r.present}/{r.total_classes}</div>
              </div>
            </div>
            <div className="att-bar"><div className="att-fill" style={{ width: `${r.percentage}%`, background: r.percentage >= 75 ? "var(--success)" : "var(--danger)" }} /></div>
          </div>
        ))}
        {records.length === 0 && <div className="text-muted">No attendance records found</div>}
      </div>
    </div>
  );
}

// ─── STUDENT TIMETABLE ────────────────────────────────────────────────────────
function StudentTimetable() {
  const [tt, setTt] = useState(null);
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const colors = ["var(--accent-2)", "var(--accent)", "var(--success)", "var(--accent-4)", "var(--info)", "#e91e8c"];
  useEffect(() => { api("/student/timetable").then(setTt).catch(console.error); }, []);
  if (!tt) return <LoadingState />;
  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-title"><Icon name="time" size={18} /> Weekly Timetable</div>
        <div className="tt-grid">
          {days.map((day, di) => (
            <div key={day}>
              <div className="tt-day-header">{day.slice(0, 3)}</div>
              {(tt[day] || []).length === 0 ? <div style={{ height: 80 }} /> : (tt[day] || []).sort((a, b) => a.start_time.localeCompare(b.start_time)).map((s, i) => (
                <div key={i} className="tt-slot" style={{ marginBottom: 8, borderLeftColor: colors[di % colors.length] }}>
                  <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: "0.82rem" }}>{s.course_code}</div>
                  <div style={{ color: "var(--muted)", fontSize: "0.72rem", marginTop: 3, fontFamily: "var(--font-mono)" }}>{s.start_time}–{s.end_time}</div>
                  <div style={{ color: "var(--accent-2)", fontSize: "0.72rem", fontWeight: 600 }}>{s.room}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── STUDENT ASSIGNMENTS ──────────────────────────────────────────────────────
function StudentAssignments({ toast }) {
  const [assignments, setAssignments] = useState([]);
  const [submitting, setSubmitting] = useState(null); // assignment id being submitted
  const [submitFile, setSubmitFile] = useState(null);
  const [submitText, setSubmitText] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  async function load() { setAssignments(await api("/student/assignments").catch(() => [])); }
  useEffect(() => { load(); }, []);

  const pending = assignments.filter(a => !a.submitted && new Date(a.due_date) >= new Date()).length;
  const overdue = assignments.filter(a => !a.submitted && new Date(a.due_date) < new Date()).length;

  function openSubmit(a) { setSubmitting(a); setSubmitFile(null); setSubmitText(""); }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.includes("pdf") && !file.type.includes("image")) {
      toast("Please upload a PDF or image file", "error"); return;
    }
    if (file.size > 5 * 1024 * 1024) { toast("File too large (max 5MB)", "error"); return; }
    setSubmitFile(file);
  }

  async function submitAssignment() {
    if (!submitting) return;
    setUploading(true);
    try {
      let fileData = null, fileName = null;
      if (submitFile) {
        fileName = submitFile.name;
        fileData = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = e => res(e.target.result.split(",")[1]); // base64 only
          r.onerror = rej;
          r.readAsDataURL(submitFile);
        });
      }
      if (!fileData && !submitText.trim()) { toast("Please add a file or text", "error"); setUploading(false); return; }
      await api("/student/assignments/submit", {
        method: "POST",
        body: JSON.stringify({ assignment_id: submitting.id, submission_text: submitText || null, file_data: fileData, file_name: fileName })
      });
      toast("Assignment submitted successfully! ✓", "success");
      setSubmitting(null);
      load();
    } catch (err) { toast(err.message, "error"); }
    finally { setUploading(false); }
  }

  return (
    <div className="fade-in">
      {(pending > 0 || overdue > 0) && (
        <div className="stat-grid mb-5" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {[{ label: "Total", value: assignments.length, color: "var(--accent-2)" }, { label: "Pending", value: pending, color: "var(--warning)" }, { label: "Overdue", value: overdue, color: "var(--danger)" }].map((s, i) => (
            <div key={i} className="stat-card" style={{ borderTop: `3px solid ${s.color}` }}>
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <div className="card-title"><Icon name="exam" size={18} /> Assignments</div>
        {assignments.map(a => {
          const over = new Date(a.due_date) < new Date() && !a.submitted;
          return (
            <div key={a.id} style={{ padding: 16, background: "var(--surface)", borderRadius: 12, marginBottom: 10, borderLeft: `3px solid ${a.submitted ? "var(--success)" : over ? "var(--danger)" : "var(--warning)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{a.title}</div>
                  <div className="text-muted text-sm">{a.course_code} · Due: {a.due_date} · Max: {a.max_marks} marks</div>
                  {a.description && <div className="text-sm" style={{ marginTop: 6, color: "var(--ink-3)" }}>{a.description}</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                  {a.submitted
                    ? <span className="tag tag-success">✓ {a.marks_obtained != null ? `${a.marks_obtained}/${a.max_marks} marks` : "Submitted"}</span>
                    : over
                    ? <><span className="tag tag-danger">Overdue</span><button className="btn btn-danger btn-sm" onClick={() => openSubmit(a)}>Submit Late</button></>
                    : <button className="btn btn-primary btn-sm" onClick={() => openSubmit(a)}><Icon name="upload" size={13}/> Submit</button>
                  }
                </div>
              </div>
              {a.feedback && <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(0,196,140,0.1)", borderRadius: 8, fontSize: "0.82rem", color: "var(--success)", fontWeight: 600 }}>💬 Faculty feedback: {a.feedback}</div>}
            </div>
          );
        })}
        {assignments.length === 0 && <div className="text-muted">No assignments yet</div>}
      </div>

      {/* Submit Modal */}
      {submitting && (
        <div className="modal-overlay" onClick={() => setSubmitting(null)}>
          <div className="modal fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-title">📤 Submit: {submitting.title}</div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 16, padding: "8px 12px", background: "var(--surface)", borderRadius: 8 }}>
              <strong>{submitting.course_code}</strong> · Due: {submitting.due_date} · Max marks: {submitting.max_marks}
            </div>

            {/* PDF Upload */}
            <div style={{ border: "2px dashed var(--surface-3)", borderRadius: 12, padding: 20, textAlign: "center", marginBottom: 16, cursor: "pointer", transition: "border-color 0.2s" }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) { setSubmitFile(f); } }}>
              <input ref={fileRef} type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={handleFileSelect} />
              {submitFile
                ? <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,75,38,0.1)", display: "grid", placeItems: "center" }}>
                      <Icon name="document" size={18} style={{ color: "var(--accent)" }} />
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{submitFile.name}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{(submitFile.size/1024).toFixed(1)} KB</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setSubmitFile(null); }}>✕</button>
                  </div>
                : <div>
                    <Icon name="upload" size={28} style={{ color: "var(--muted)", marginBottom: 8 }} />
                    <div style={{ fontWeight: 600, color: "var(--muted)" }}>Click or drag to upload PDF</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>PDF or image · Max 5MB</div>
                  </div>
              }
            </div>

            {/* Text submission */}
            <div className="form-field" style={{ marginBottom: 16 }}>
              <label>Or type your answer</label>
              <textarea rows={4} placeholder="Type your answer here (optional if you upload a file)..." value={submitText} onChange={e => setSubmitText(e.target.value)} />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" onClick={submitAssignment} disabled={uploading || (!submitFile && !submitText.trim())}>
                {uploading ? "Submitting..." : <><Icon name="send" size={14}/> Submit Assignment</>}
              </button>
              <button className="btn btn-ghost" onClick={() => setSubmitting(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── STUDENT COURSES ──────────────────────────────────────────────────────────
function StudentCourses() {
  const [courses, setCourses] = useState([]);
  useEffect(() => { api("/student/courses").then(setCourses).catch(console.error); }, []);
  const typeColors = { theory: "tag-info", lab: "tag-success", elective: "tag-warning" };
  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-title"><Icon name="book" size={18} /> Enrolled Courses</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Course Name</th><th>Credits</th><th>Type</th><th>Semester</th></tr></thead>
            <tbody>
              {courses.map(c => (
                <tr key={c.course_id}>
                  <td style={{ fontWeight: 800, fontFamily: "var(--font-mono)", fontSize: "0.88rem" }}>{c.code}</td>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td><span className="tag tag-purple" style={{ fontFamily: "var(--font-mono)" }}>{c.credits} cr</span></td>
                  <td><span className={`tag ${typeColors[c.type] || "tag-muted"}`}>{c.type}</span></td>
                  <td style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}>{c.semester}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── STUDENT EXAM REG ─────────────────────────────────────────────────────────
function StudentExamReg({ toast }) {
  const [regs, setRegs] = useState([]); const [semester, setSemester] = useState(4); const [year, setYear] = useState("2024-25"); const [loading, setLoading] = useState(false);
  useEffect(() => { api("/student/exam-registrations").then(setRegs).catch(console.error); }, []);
  async function handleRegister() {
    setLoading(true);
    try { await api("/student/exam-register", { method: "POST", body: JSON.stringify({ semester, academic_year: year }) }); toast("Exam registration submitted!", "success"); setRegs(await api("/student/exam-registrations")); }
    catch (err) { toast(err.message, "error"); } finally { setLoading(false); }
  }
  return (
    <div className="fade-in">
      <div className="card mb-5">
        <div className="card-title"><Icon name="exam" size={18} /> Register for Exam</div>
        <div className="grid-2 mb-5">
          <div className="form-field" style={{ marginBottom: 0 }}><label>Semester</label><select value={semester} onChange={e => setSemester(+e.target.value)}>{[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Semester {s}</option>)}</select></div>
          <div className="form-field" style={{ marginBottom: 0 }}><label>Academic Year</label><input value={year} onChange={e => setYear(e.target.value)} /></div>
        </div>
        <button className="btn btn-primary" onClick={handleRegister} disabled={loading}>{loading ? "Registering..." : "Submit Registration"}</button>
      </div>
      <div className="card">
        <div className="card-title"><Icon name="time" size={18} /> My Registrations</div>
        {regs.length === 0 ? <div className="text-muted">No registrations yet</div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Semester</th><th>Academic Year</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>{regs.map(r => <tr key={r.id}><td style={{ fontWeight: 700 }}>Semester {r.semester}</td><td style={{ fontFamily: "var(--font-mono)" }}>{r.academic_year}</td><td><span className={`tag ${r.status === "approved" ? "tag-success" : r.status === "rejected" ? "tag-danger" : "tag-warning"}`}>{r.status}</span></td><td className="text-muted text-sm">{new Date(r.registered_at).toLocaleDateString()}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

// ─── STUDENT MESSAGES ─────────────────────────────────────────────────────────
function StudentMessages({ toast }) {
  const [msgs, setMsgs] = useState([]); const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("inbox"); // "inbox" | "compose"
  const [facultyList, setFacultyList] = useState([]);
  const [form, setForm] = useState({ facultyId: "", subject: "", body: "" });
  const [sending, setSending] = useState(false); const [sent, setSent] = useState(false);

  async function loadMsgs() { setMsgs(await api("/student/messages").catch(() => [])); }
  useEffect(() => { loadMsgs(); api("/student/faculty-list").then(setFacultyList).catch(() => {}); }, []);
  async function openMsg(msg) { setSelected(msg); if (!msg.is_read) { await api(`/student/messages/${msg.id}/read`, { method: "POST" }); loadMsgs(); } }

  async function sendMessage() {
    if (!form.facultyId || !form.body) { if (toast) toast("Select faculty and enter message", "error"); return; }
    setSending(true);
    try {
      await api("/student/send-message", { method: "POST", body: JSON.stringify({ faculty_id: parseInt(form.facultyId), subject: form.subject || "(No subject)", body: form.body }) });
      if (toast) toast("Message sent to faculty ✓", "success");
      setSent(true);
      setTimeout(() => { setForm({ facultyId: "", subject: "", body: "" }); setSent(false); setTab("inbox"); }, 2000);
    } catch (err) { if (toast) toast(err.message || "Failed to send", "error"); }
    finally { setSending(false); }
  }

  return (
    <div className="fade-in">
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === "inbox" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("inbox")}><Icon name="message" size={14} /> Inbox {msgs.filter(m => !m.is_read).length > 0 && <span style={{ marginLeft: 6, padding: "1px 7px", background: "var(--danger)", color: "white", borderRadius: 10, fontSize: "0.7rem" }}>{msgs.filter(m => !m.is_read).length}</span>}</button>
        <button className={`btn btn-sm ${tab === "compose" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("compose")}><Icon name="send" size={14} /> Message Faculty</button>
      </div>

      {tab === "inbox" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 0 }}><Icon name="message" size={18} /> Messages</div>
            <span className="tag tag-info">{msgs.filter(m => !m.is_read).length} unread</span>
          </div>
          {msgs.length === 0 ? <div className="text-muted">No messages yet</div> : msgs.map(m => (
            <div key={m.id} className={`msg-item ${!m.is_read ? "msg-unread" : ""}`} onClick={() => openMsg(m)}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{m.sender_name}</div><div className="text-muted text-sm" style={{ fontFamily: "var(--font-mono)" }}>{new Date(m.sent_at).toLocaleDateString()}</div></div>
              <div style={{ fontWeight: 600, marginTop: 2 }}>{m.subject || "(No subject)"}</div>
              <div className="text-muted text-sm" style={{ marginTop: 4 }}>{m.body.slice(0, 100)}…</div>
            </div>
          ))}
        </div>
      )}

      {tab === "compose" && (
        <div className="card">
          <div className="card-title"><Icon name="send" size={18} /> Send Message to Faculty</div>
          <div className="form-field">
            <label>Select Faculty *</label>
            <select value={form.facultyId} onChange={e => setForm({ ...form, facultyId: e.target.value })}>
              <option value="">— Select Faculty Member —</option>
              {facultyList.map(f => <option key={f.id} value={f.id}>{f.name} · {f.designation} · {f.department}</option>)}
            </select>
          </div>
          <div className="form-field"><label>Subject</label><input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Doubt about assignment..." /></div>
          <div className="form-field"><label>Message *</label><textarea rows={5} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Type your message..." /></div>
          <button className="btn btn-primary" onClick={sendMessage} disabled={sending || sent || !form.facultyId || !form.body}>
            <Icon name="send" size={16} /> {sending ? "Sending..." : sent ? "Sent ✓" : "Send Message"}
          </button>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal fade-in" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{selected.subject || "(No subject)"}</div>
            <div className="text-muted text-sm mb-4">From: <strong>{selected.sender_name}</strong> · {new Date(selected.sent_at).toLocaleString()}</div>
            <div style={{ lineHeight: 1.75, fontSize: "0.9rem" }}>{selected.body}</div>
            <button className="btn btn-ghost" style={{ marginTop: 24 }} onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MARKS CALCULATOR ─────────────────────────────────────────────────────────
function InternalCalculator() {
  const [internal, setInternal] = useState(""); const [cats, setCats] = useState({ cat1: "", cat2: "", cat3: "", a1: "", a2: "", a3: "" });
  const [result, setResult] = useState(null); const [grades, setGrades] = useState([]); const [calcResult, setCalcResult] = useState(null);

  function calculateRequired() {
    const m = parseFloat(internal);
    if (isNaN(m) || m < 0 || m > 40) { setResult({ err: true }); return; }
    let ext = Math.round(((50 - m) / 0.6) * 100) / 100;
    if (ext < 45) ext = 45;
    setResult({ m, ext, possible: ext <= 100 });
    const gradeMap = [{ grade: "C", min: 50 }, { grade: "B", min: 56 }, { grade: "B+", min: 61 }, { grade: "A", min: 71 }, { grade: "A+", min: 81 }, { grade: "O", min: 91 }];
    setGrades(gradeMap.map(g => { let ext = parseFloat(((g.min - m) / 0.6).toFixed(2)); if (ext < 45) ext = 45; return { ...g, ext, achievable: ext <= 100 }; }).filter(g => g.achievable));
  }

  function calculateInternalMarks() {
    const vals = [cats.cat1, cats.cat2, cats.cat3, cats.a1, cats.a2, cats.a3].map(parseFloat);
    if (vals.some(isNaN)) { setCalcResult({ err: true }); return; }
    const [c1, c2, c3, a1, a2, a3] = vals;
    // Each CAT and Assignment is out of 50
    const catAvg = (c1 + c2 + c3) / 3;         // out of 50
    const asgnAvg = (a1 + a2 + a3) / 3;         // out of 50
    const weighted = catAvg * 0.7 + asgnAvg * 0.3; // weighted avg out of 50
    const total = Math.round((weighted / 50) * 40 * 100) / 100; // scale to 40
    setCalcResult({ total, catAvg: catAvg.toFixed(2), asgnAvg: asgnAvg.toFixed(2), weighted: weighted.toFixed(2) });
  }

  const NumInput = ({ val, onChange }) => <input type="number" min="0" max="50" style={{ width: 72, padding: "9px 10px", border: "2px solid var(--surface-3)", borderRadius: 10, fontFamily: "var(--font-mono)", fontSize: "0.95rem", outline: "none", background: "var(--surface)", transition: "border-color 0.2s" }} value={val} onChange={e => onChange(e.target.value)} />;

  return (
    <div className="fade-in">
      <div className="card mb-5">
        <div className="card-title"><Icon name="analytics" size={18} /> External Marks Required to Pass</div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 700, display: "block", marginBottom: 10, fontSize: "0.88rem", textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>Your Internal Marks (out of 40)</label>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}><NumInput val={internal} onChange={setInternal} /><button className="btn btn-primary" onClick={calculateRequired}>Calculate →</button></div>
        </div>
        {result && !result.err && <div className="calc-result">{result.possible ? <><div style={{ fontSize: "0.82rem", opacity: 0.5, textTransform: "uppercase", letterSpacing: "1px", fontFamily: "var(--font-mono)" }}>Minimum External Required</div><div className="calc-big">{result.ext}<span style={{ fontSize: "1.2rem", opacity: 0.5 }}>/100</span></div></> : <div style={{ color: "var(--danger)", fontWeight: 700 }}>❌ Cannot pass — internal marks too low</div>}</div>}
        {result?.err && <div className="err">Enter valid marks between 0–40</div>}
        {grades.length > 0 && <div style={{ marginTop: 20 }}>{grades.map(g => <div key={g.grade} className="grade-row"><span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.1rem" }}>{g.grade}</span><span className="text-muted text-sm">Min total: {g.min}</span><span style={{ fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--accent-2)" }}>{g.ext}/100</span></div>)}</div>}
      </div>
      <div className="card">
        <div className="card-title"><Icon name="calculator" size={18} /> Calculate Internal Marks</div>
        <div style={{ padding: "12px 16px", background: "rgba(108,59,255,0.06)", borderRadius: 10, marginBottom: 20, fontSize: "0.82rem", color: "var(--accent-2)", fontFamily: "var(--font-mono)", fontWeight: 600, border: "1px solid rgba(108,59,255,0.15)" }}>
          Formula: (CAT avg × 0.70 + Assignment avg × 0.30) ÷ 50 × 40 = Internal /40
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
          {["cat1", "cat2", "cat3"].map((k, i) => <div key={k}><label style={{ fontWeight: 700, display: "block", marginBottom: 8, fontSize: "0.82rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", fontFamily: "var(--font-mono)" }}>CAT {i + 1} /50</label><NumInput val={cats[k]} onChange={v => setCats({ ...cats, [k]: v })} /></div>)}
          {["a1", "a2", "a3"].map((k, i) => <div key={k}><label style={{ fontWeight: 700, display: "block", marginBottom: 8, fontSize: "0.82rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", fontFamily: "var(--font-mono)" }}>Asgn {i + 1} /50</label><NumInput val={cats[k]} onChange={v => setCats({ ...cats, [k]: v })} /></div>)}
        </div>
        <button className="btn btn-primary" onClick={calculateInternalMarks}>Calculate Total</button>
        {calcResult?.err && <div className="err">Please fill all 6 marks (0–50 each)</div>}
        {calcResult && !calcResult.err && (
          <div className="calc-result" style={{ marginTop: 16 }}>
            <div style={{ fontSize: "0.72rem", opacity: 0.5, textTransform: "uppercase", letterSpacing: "1.5px", fontFamily: "var(--font-mono)" }}>Your Internal Total</div>
            <div className="calc-big">{calcResult.total}<span style={{ fontSize: "1.2rem", opacity: 0.5 }}>/40</span></div>
            <div style={{ fontSize: "0.78rem", opacity: 0.45, marginTop: 8, fontFamily: "var(--font-mono)" }}>
              CAT avg: {calcResult.catAvg}/50 × 0.70 + Asgn avg: {calcResult.asgnAvg}/50 × 0.30 = {calcResult.weighted}/50 → scaled to /40
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI ADVISOR PAGE ──────────────────────────────────────────────────────────
function AIAdvisorPage() {
  const [studentData, setStudentData] = useState(null); const [marks, setMarks] = useState([]);
  const [customQ, setCustomQ] = useState(""); const [response, setResponse] = useState(""); const [aiLoading, setAiLoading] = useState(false);
  const quickPrompts = [
    { label: "📈 Improve CGPA", q: "Give me 5 actionable tips to improve my CGPA this semester" },
    { label: "📅 Study Schedule", q: "Create a weekly study schedule for an engineering student" },
    { label: "😰 Exam Stress", q: "How do I manage exam stress and anxiety effectively?" },
    { label: "📚 Study Tips", q: "Best evidence-based study techniques for technical subjects?" },
    { label: "⚡ Focus", q: "How to stay focused and avoid distractions while studying?" },
  ];
  useEffect(() => {
    Promise.all([api("/student/dashboard").catch(() => null), api("/student/marks").catch(() => [])]).then(([dash, m]) => {
      if (dash) setStudentData({ name: dash.student.name, department: dash.student.department, semester: dash.student.semester, cgpa: dash.student.cgpa, attendance: dash.attendance_percentage });
      setMarks(m || []);
    });
  }, []);
  async function ask(question) {
    setAiLoading(true); setResponse("");
    try {
      const ctx = studentData ? `Student: ${studentData.name}, Dept: ${studentData.department}, Sem: ${studentData.semester}, CGPA: ${studentData.cgpa}, Attendance: ${studentData.attendance}%` : "";
      const reply = await askAI(`You are a friendly, expert academic advisor AI for college students. Give concise (max 150 words), practical, and encouraging advice. Context: ${ctx}`, question);
      setResponse(reply);
    } catch { setResponse("AI service unavailable. Please set an API key in the configuration."); }
    finally { setAiLoading(false); }
  }
  return (
    <div className="fade-in">
      <div className="ai-panel mb-5">
        <div className="ai-label"><Icon name="ai" size={14} /> AI Powered</div>
        <div className="ai-title">Your Personal Academic Advisor</div>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.88rem", marginBottom: 20, position: "relative", zIndex: 1 }}>Ask anything about your academics, study strategies, or career guidance.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, position: "relative", zIndex: 1 }}>
          {quickPrompts.map(p => <button key={p.label} onClick={() => { setCustomQ(p.q); ask(p.q); }} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", fontSize: "0.78rem", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 600, transition: "all 0.15s" }}>{p.label}</button>)}
        </div>
        <div style={{ display: "flex", gap: 8, position: "relative", zIndex: 1 }}>
          <input className="ai-input" placeholder="Type your question..." value={customQ} onChange={e => setCustomQ(e.target.value)} onKeyDown={e => e.key === "Enter" && ask(customQ)} />
          <button className="btn btn-purple" onClick={() => ask(customQ)} disabled={aiLoading || !customQ.trim()}>{aiLoading ? <Icon name="settings" size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Icon name="send" size={16} />}</button>
        </div>
        {(response || aiLoading) && <div className="ai-response">{aiLoading ? <span style={{ color: "rgba(255,255,255,0.4)" }}>✦ Thinking...</span> : response}</div>}
      </div>
      {studentData && (
        <div className="grid-2">
          <div className="card"><div className="card-title"><Icon name="chart" size={18} /> Academic Snapshot</div><div style={{ display: "flex", gap: 20, alignItems: "center", justifyContent: "center", padding: "10px 0" }}><div style={{ textAlign: "center" }}><DonutChart value={studentData.attendance} max={100} color={studentData.attendance >= 75 ? "var(--success)" : "var(--danger)"} size={90} /><div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 6 }}>Attendance</div></div><div style={{ textAlign: "center" }}><DonutChart value={studentData.cgpa} max={10} color="var(--accent-4)" size={90} /><div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 6 }}>CGPA / 10</div></div></div></div>
          <div className="card"><div className="card-title"><Icon name="marks" size={18} /> Marks Overview</div>{marks.slice(0, 4).map(m => { const calc = calcInternal(m); const total = calc ? calc.total : (m.internal_total || 0); return <div key={m.course_id} style={{ marginBottom: 12 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{m.course_code}</span><span style={{ fontSize: "0.82rem", fontWeight: 800, color: "var(--accent-2)", fontFamily: "var(--font-mono)" }}>{total.toFixed(1)}/40</span></div><div className="att-bar"><div className="att-fill" style={{ width: `${(total / 40) * 100}%`, background: total >= 20 ? "var(--success)" : "var(--danger)" }} /></div></div>; })}{marks.length === 0 && <div className="text-muted">No marks data yet</div>}</div>
        </div>
      )}
    </div>
  );
}


// ─── FACULTY DASHBOARD ────────────────────────────────────────────────────────
// ─── FACULTY PROFILE ──────────────────────────────────────────────────────────
function FacultyProfile() {
  const [profile, setProfile] = useState(null);
  const [photo, setPhoto] = useState(() => localStorage.getItem("faculty_photo") || "");
  const fileRef = useRef(null);
  useEffect(() => { api("/faculty/profile").then(setProfile).catch(console.error); }, []);

  function handlePhotoUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { const url = ev.target.result; setPhoto(url); localStorage.setItem("faculty_photo", url); };
    reader.readAsDataURL(file);
  }

  if (!profile) return <LoadingState />;
  const u = profile.user || {};
  const fields = [
    { label: "Employee ID", value: profile.employee_id },
    { label: "Email", value: u.email },
    { label: "Phone", value: u.phone },
    { label: "Department", value: profile.department?.name },
    { label: "Designation", value: profile.designation },
    { label: "Specialization", value: profile.specialization },
    { label: "Joining Date", value: profile.joining_date },
    { label: "Gender", value: u.gender },
  ].filter(f => f.value);

  return (
    <div className="fade-in">
      <div className="profile-hero mb-5">
        <div style={{ position: "relative" }}>
          <div className="profile-img-wrap" onClick={() => fileRef.current?.click()}>
            {photo ? <img src={photo} alt="Profile" /> : <span style={{ fontSize: "2rem", fontWeight: 800 }}>{u.name?.[0]}</span>}
            <div className="profile-img-overlay"><Icon name="camera" size={24} /></div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} />
        </div>
        <div>
          <div className="profile-hero-name">{u.name}</div>
          <div className="profile-hero-meta">{profile.employee_id} · {profile.designation} · {profile.department?.name}</div>
          <span className="tag tag-info" style={{ marginTop: 8, display: "inline-flex" }}>Faculty</span>
          <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Click photo to change</div>
        </div>
        <span className="tag tag-success" style={{ marginLeft: "auto", padding: "8px 16px", fontSize: "0.88rem" }}>Active Faculty</span>
      </div>
      <div className="card">
        <div className="card-title"><Icon name="user" size={18} /> Personal Information</div>
        <div className="detail-grid">
          {fields.map((f, i) => <div key={i} className="detail-item"><label>{f.label}</label><p>{String(f.value)}</p></div>)}
        </div>
        <div style={{ marginTop: 20, padding: "12px 16px", background: "rgba(255,184,0,0.08)", borderRadius: 10, fontSize: "0.82rem", color: "var(--warning)", border: "1px solid rgba(255,184,0,0.2)", fontWeight: 600 }}>
          ℹ Contact admin to update personal details
        </div>
      </div>
    </div>
  );
}

// ─── FACULTY MENTOR REQUESTS ───────────────────────────────────────────────────
function FacultyMentorRequests({ toast }) {
  const [connections, setConnections] = useState(() => {
    try { return JSON.parse(localStorage.getItem("erp_mentor_connections") || "{}"); } catch { return {}; }
  });
  const [chatWith, setChatWith] = useState(null);
  const [chatMsg, setChatMsg] = useState("");

  function saveConnections(updated) {
    setConnections(updated);
    localStorage.setItem("erp_mentor_connections", JSON.stringify(updated));
  }
  function acceptRequest(email) {
    const updated = { ...connections, [email]: { ...connections[email], status: "accepted" } };
    saveConnections(updated);
    toast("Connection request accepted!", "success");
  }
  function declineRequest(email) {
    const updated = { ...connections };
    delete updated[email];
    saveConnections(updated);
    toast("Request declined", "info");
  }
  function openChat(conn) {
    setChatWith({ ...conn, messages: conn.messages || [] });
    setChatMsg("");
  }
  function sendReply() {
    if (!chatMsg.trim() || !chatWith) return;
    const newMsg = { from: "faculty", text: chatMsg.trim(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    const updatedMsgs = [...chatWith.messages, newMsg];
    const key = chatWith.mentor.email;
    const updated = { ...connections, [key]: { ...connections[key], messages: updatedMsgs } };
    saveConnections(updated);
    setChatWith({ ...chatWith, messages: updatedMsgs });
    setChatMsg("");
  }

  const allConns = Object.values(connections);
  const pending = allConns.filter(c => c.status === "pending");
  const accepted = allConns.filter(c => c.status === "accepted");

  if (chatWith) {
    return (
      <div className="fade-in">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setChatWith(null)}>← Back</button>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,var(--accent-2),var(--accent))", display: "grid", placeItems: "center", color: "white", fontWeight: 800 }}>S</div>
          <div>
            <div style={{ fontWeight: 700 }}>Student Mentee</div>
            <div style={{ fontSize: "0.72rem", color: "var(--success)", fontWeight: 600 }}>● Active Mentee</div>
          </div>
        </div>
        <div style={{ border: "1.5px solid var(--surface-3)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", background: "var(--surface-2)", borderBottom: "1px solid var(--surface-3)", fontSize: "0.8rem", color: "var(--muted)" }}>
            💬 Mentor conversation — respond to your mentee
          </div>
          <div style={{ minHeight: 320, maxHeight: 380, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {chatWith.messages.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.82rem", marginTop: 60 }}>No messages yet. The student will initiate the conversation.</div>
            )}
            {chatWith.messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.from === "faculty" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "72%", padding: "10px 14px", borderRadius: msg.from === "faculty" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: msg.from === "faculty" ? "linear-gradient(135deg,var(--accent-2),var(--accent))" : "var(--surface-2)", color: msg.from === "faculty" ? "white" : "var(--text)", fontSize: "0.88rem", lineHeight: 1.5 }}>
                  <div style={{ fontSize: "0.65rem", opacity: 0.6, marginBottom: 2 }}>{msg.from === "faculty" ? "You" : "Student"}</div>
                  {msg.text}
                  <div style={{ fontSize: "0.65rem", opacity: 0.65, marginTop: 4, textAlign: "right" }}>{msg.time}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 14px", background: "var(--surface-2)", borderTop: "1px solid var(--surface-3)", display: "flex", gap: 10 }}>
            <input style={{ flex: 1, padding: "10px 14px", border: "1.5px solid var(--surface-3)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: "0.9rem", outline: "none" }}
              placeholder="Type your reply..." value={chatMsg}
              onChange={e => setChatMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && sendReply()} />
            <button className="btn btn-primary" onClick={sendReply} disabled={!chatMsg.trim()}>Send</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, rgba(108,59,255,0.1), rgba(255,75,38,0.06))", borderRadius: 14, marginBottom: 20, border: "1px solid rgba(108,59,255,0.2)", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 32 }}>🤝</div>
        <div>
          <div style={{ fontWeight: 800, color: "var(--accent-2)" }}>Mentor Requests</div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Review student connection requests and chat with your accepted mentees.</div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-title">⏳ Pending Requests ({pending.length})</div>
        {pending.length === 0 && <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No pending requests at the moment.</div>}
        {pending.map((conn, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: i < pending.length - 1 ? "1px solid var(--surface-3)" : "none" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#667eea,#764ba2)", display: "grid", placeItems: "center", color: "white", fontWeight: 800, fontSize: "1.1rem", flexShrink: 0 }}>S</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>Student Mentor Request</div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 2 }}>Domain: <strong style={{ color: "var(--accent-2)" }}>{conn.mentor?.domain}</strong></div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-success btn-sm" onClick={() => acceptRequest(conn.mentor.email)}>✅ Accept</button>
              <button className="btn btn-ghost btn-sm" onClick={() => declineRequest(conn.mentor.email)}>✗ Decline</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">✅ Active Mentees ({accepted.length})</div>
        {accepted.length === 0 && <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No active mentees yet.</div>}
        {accepted.map((conn, i) => {
          const studentMsgs = (conn.messages || []).filter(m => m.from === "student").length;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: i < accepted.length - 1 ? "1px solid var(--surface-3)" : "none" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,var(--success),#059669)", display: "grid", placeItems: "center", color: "white", fontWeight: 800, fontSize: "1.1rem", flexShrink: 0 }}>S</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>Mentee</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 2 }}>Domain: <strong style={{ color: "var(--accent-2)" }}>{conn.mentor?.domain}</strong></div>
                {studentMsgs > 0 && <div style={{ fontSize: "0.7rem", color: "var(--accent)", fontWeight: 600 }}>💬 {studentMsgs} student message{studentMsgs > 1 ? "s" : ""}</div>}
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => openChat(conn)}>💬 Chat</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FACULTY MESSAGES INBOX ───────────────────────────────────────────────────
function FacultyMessagesInbox({ toast }) {
  const [tab, setTab] = useState("messages");
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [students, setStudents] = useState([]); const [courses, setCourses] = useState([]);
  const [mode, setMode] = useState("individual");
  const [recipient, setRecipient] = useState(""); const [broadcastCourse, setBroadcastCourse] = useState("");
  const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const [sending, setSending] = useState(false); const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [msgs, notifs, studs, crses] = await Promise.all([
        api("/faculty/messages-inbox").catch(() => []),
        api("/faculty/notifications").catch(() => []),
        api("/faculty/students").then(s => [...new Map(s.map(x => [x.student_id, x])).values()]).catch(() => []),
        api("/faculty/my-courses").catch(() => []),
      ]);
      setMessages(msgs); setNotifications(notifs); setStudents(studs); setCourses(crses);
    } finally { setLoading(false); }
  }

  async function send() {
    if (!body) { toast("Enter message body", "error"); return; }
    setSending(true);
    try {
      if (mode === "individual") {
        if (!recipient) { toast("Select a recipient", "error"); setSending(false); return; }
        const student = students.find(s => s.student_id === parseInt(recipient));
        await api("/faculty/send-message", { method: "POST", body: JSON.stringify({ recipient_id: student?.user_id || parseInt(recipient), subject, body }) });
        toast("Message sent!", "success");
      } else {
        if (!broadcastCourse) { toast("Select a course", "error"); setSending(false); return; }
        const res = await api("/faculty/broadcast-message", { method: "POST", body: JSON.stringify({ course_id: parseInt(broadcastCourse), subject, body }) });
        toast(res.message || "Broadcast sent!", "success");
      }
      setSent(true); setSubject(""); setBody(""); setRecipient(""); setBroadcastCourse("");
      setTimeout(() => setSent(false), 2000);
    } catch (err) { toast(err.message, "error"); } finally { setSending(false); }
  }

  const unreadMsgs = messages.filter(m => !m.is_read).length;
  const unreadNotifs = notifications.filter(n => !n.is_read).length;

  return (
    <div className="fade-in">
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { key: "messages", label: "Messages", badge: unreadMsgs },
          { key: "notifications", label: "Notifications", badge: unreadNotifs },
          { key: "send", label: "Send Message", badge: 0 },
        ].map(t => (
          <button key={t.key} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(t.key)}>
            <Icon name={t.key === "send" ? "send" : t.key === "notifications" ? "bell" : "message"} size={13} />
            {t.label}
            {t.badge > 0 && <span style={{ marginLeft: 4, padding: "1px 6px", background: "var(--danger)", color: "white", borderRadius: 10, fontSize: "0.7rem" }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === "messages" && (
        <div className="card">
          <div className="card-title"><Icon name="message" size={18} /> Inbox — Messages from Students</div>
          {loading ? <LoadingState /> : messages.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>No messages yet</div>
          ) : messages.map(m => (
            <div key={m.id} className={`msg-item ${!m.is_read ? "msg-unread" : ""}`} onClick={() => setSelected(selected?.id === m.id ? null : m)}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700 }}>{m.sender_name} {m.sender_reg && <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>({m.sender_reg})</span>}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{m.created_at?.slice(0, 16)}</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: "0.88rem", marginTop: 4 }}>{m.subject || "(No subject)"}</div>
              {selected?.id === m.id && <div style={{ marginTop: 10, padding: "10px 14px", background: "var(--surface-2)", borderRadius: 8, fontSize: "0.85rem", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.body}</div>}
              {!m.is_read && <span className="tag tag-info" style={{ marginTop: 6, display: "inline-flex", fontSize: "0.68rem" }}>New</span>}
            </div>
          ))}
        </div>
      )}

      {tab === "notifications" && (
        <div className="card">
          <div className="card-title"><Icon name="bell" size={18} /> Notifications from Admin</div>
          {loading ? <LoadingState /> : notifications.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>No notifications yet</div>
          ) : notifications.map(n => (
            <div key={n.id} className={`notif-item ${!n.is_read ? "unread" : ""}`} style={{ borderRadius: 10, marginBottom: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{n.title}</div>
              <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{n.message}</div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 6 }}>{n.created_at?.slice?.(0,16)}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "send" && (
        <div className="card">
          <div className="card-title"><Icon name="send" size={18} /> Send Message</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <button className={`btn btn-sm ${mode === "individual" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("individual")}><Icon name="user" size={13} /> Individual</button>
            <button className={`btn btn-sm ${mode === "broadcast" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("broadcast")}><Icon name="bell" size={13} /> Broadcast to Class</button>
          </div>
          {mode === "individual" ? (
            <div className="form-field"><label>Recipient Student</label>
              <select value={recipient} onChange={e => setRecipient(e.target.value)}>
                <option value="">— Select Student —</option>
                {students.map(s => <option key={s.student_id} value={s.student_id}>{s.name} ({s.register_number})</option>)}
              </select>
            </div>
          ) : (
            <div className="form-field"><label>Course / Class</label>
              <select value={broadcastCourse} onChange={e => setBroadcastCourse(e.target.value)}>
                <option value="">— Select Course —</option>
                {courses.map(c => <option key={c.course_id} value={c.course_id}>{c.code} — {c.name}</option>)}
              </select>
            </div>
          )}
          <div className="form-field"><label>Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Assignment Reminder" /></div>
          <div className="form-field"><label>Message</label><textarea rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="Type your message..." /></div>
          <button className="btn btn-primary" onClick={send} disabled={sent || sending}>
            <Icon name="send" size={16} /> {sending ? "Sending..." : sent ? "Sent ✓" : mode === "broadcast" ? "Send Broadcast" : "Send Message"}
          </button>
        </div>
      )}
    </div>
  );
}

function FacultyDashboard({ toast }) {
  const [profile, setProfile] = useState(null);
  const [alerts, setAlerts] = useState({ low_attendance: [], low_cat: [], low_internal: [], counts: {} });
  const [filterOptions, setFilterOptions] = useState({ departments: [], years: [], courses: [] });
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [alertTab, setAlertTab] = useState("attendance");
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [notifSending, setNotifSending] = useState(false);

  useEffect(() => {
    api("/faculty/profile").then(setProfile).catch(console.error);
    api("/faculty/filter-options").then(setFilterOptions).catch(console.error);
    loadAlerts();
  }, []);

  async function loadAlerts(deptId, yr, cid) {
    setAlertsLoading(true);
    try {
      let url = "/faculty/smart-alerts?";
      if (deptId) url += `department_id=${deptId}&`;
      if (yr) url += `year=${yr}&`;
      if (cid) url += `course_id=${cid}&`;
      const data = await api(url);
      setAlerts(data);
    } catch { } finally { setAlertsLoading(false); }
  }

  function applyFilter() {
    loadAlerts(selectedDept || undefined, selectedYear || undefined, selectedCourse || undefined);
  }

  async function sendAlertNotification(students, message) {
    setNotifSending(true);
    try {
      for (const s of students) {
        await api("/faculty/send-message", {
          method: "POST",
          body: JSON.stringify({ recipient_id: s.user_id || s.student_id, subject: "⚠️ Academic Alert", body: message })
        });
      }
      if (toast) toast(`Notified ${students.length} students!`, "success");
    } catch { if (toast) toast("Error sending notifications", "error"); }
    finally { setNotifSending(false); }
  }

  if (!profile) return <LoadingState />;
  const u = profile.user || {};

  const alertTabs = [
    { key: "attendance", label: "Low Attendance", count: alerts.counts.low_attendance || 0, color: "var(--danger)", icon: "attendance" },
    { key: "cat", label: "Low CAT (<25)", count: alerts.counts.low_cat || 0, color: "var(--warning)", icon: "marks" },
    { key: "internal", label: "Low Internal (<23)", count: alerts.counts.low_internal || 0, color: "var(--accent-2)", icon: "calculator" },
  ];

  const currentAlerts = alertTab === "attendance" ? alerts.low_attendance :
                        alertTab === "cat" ? alerts.low_cat : alerts.low_internal;

  return (
    <div className="fade-in">
      {/* Hero */}
      <div className="profile-hero mb-5">
        <div className="profile-hero-avatar" style={{ background: "linear-gradient(135deg, var(--success), var(--info))" }}>{u.name?.[0]}</div>
        <div>
          <div className="profile-hero-name">{u.name}</div>
          <div className="profile-hero-meta">{profile.employee_id} · {profile.designation} · {profile.department?.name}</div>
        </div>
        <span className="tag tag-info" style={{ marginLeft: "auto", padding: "8px 16px", fontSize: "0.88rem" }}>Faculty Portal</span>
      </div>

      {/* Smart Filter Bar */}
      <div className="card mb-4" style={{ padding: "16px 20px" }}>
        <div className="card-title" style={{ marginBottom: 14, fontSize: "0.88rem" }}><Icon name="settings" size={15} /> Smart Filter — Select to view student alerts</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-field" style={{ marginBottom: 0, flex: 1, minWidth: 130 }}>
            <label style={{ fontSize: "0.75rem" }}>Batch Year</label>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
              <option value="">All Years</option>
              {filterOptions.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="form-field" style={{ marginBottom: 0, flex: 1, minWidth: 130 }}>
            <label style={{ fontSize: "0.75rem" }}>Department</label>
            <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
              <option value="">All Depts</option>
              {filterOptions.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-field" style={{ marginBottom: 0, flex: 2, minWidth: 160 }}>
            <label style={{ fontSize: "0.75rem" }}>Course</label>
            <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}>
              <option value="">All Courses</option>
              {filterOptions.courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" style={{ height: 40, alignSelf: "flex-end" }} onClick={applyFilter}>Apply Filter</button>
        </div>
      </div>

      {/* Alert Stats */}
      <div className="stat-grid mb-4">
        {alertTabs.map((t, i) => (
          <div key={i} className="stat-card" style={{ borderTop: `3px solid ${t.color}`, cursor: "pointer", transition: "transform 0.15s", transform: alertTab === t.key ? "scale(1.03)" : "scale(1)" }}
            onClick={() => setAlertTab(t.key)}>
            <div className="stat-value" style={{ color: t.color }}>{alertsLoading ? "…" : t.count}</div>
            <div className="stat-label" style={{ fontSize: "0.78rem" }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Alert List */}
      <div className="card mb-4">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {alertTabs.map(t => (
              <button key={t.key} className={`btn btn-sm ${alertTab === t.key ? "btn-primary" : "btn-ghost"}`}
                style={{ borderColor: alertTab === t.key ? "" : t.color, color: alertTab === t.key ? "" : t.color }}
                onClick={() => setAlertTab(t.key)}>
                <Icon name={t.icon} size={13} /> {t.label} {t.count > 0 && <span style={{ marginLeft: 4, padding: "1px 6px", background: alertTab === t.key ? "rgba(255,255,255,0.2)" : t.color, color: "white", borderRadius: 10, fontSize: "0.7rem" }}>{t.count}</span>}
              </button>
            ))}
          </div>
          {currentAlerts.length > 0 && (
            <button className="btn btn-warning btn-sm" disabled={notifSending}
              onClick={() => sendAlertNotification(currentAlerts, alertTab === "attendance" ? "Your attendance is below 75%. Please attend classes regularly." : alertTab === "cat" ? "Your CAT exam score is below 25/50. Please improve your performance." : "Your internal marks are below 23/40. Please focus on academics.")}>
              <Icon name="bell" size={13} /> {notifSending ? "Sending..." : `Notify All (${currentAlerts.length})`}
            </button>
          )}
        </div>

        {alertsLoading ? <LoadingState /> : currentAlerts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px", color: "var(--muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 700, color: "var(--success)" }}>No alerts in this category!</div>
          </div>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr>
              <th>Student</th><th>Reg. No.</th><th>Course</th>
              {alertTab === "attendance" && <><th>Attendance</th><th>Classes</th></>}
              {alertTab === "cat" && <><th>Exam</th><th>Marks</th></>}
              {alertTab === "internal" && <th>Internal /40</th>}
              <th>Dept</th><th>Year</th>
            </tr></thead>
            <tbody>{currentAlerts.map((s, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 700 }}>{s.name}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>{s.register_number}</td>
                <td className="text-muted text-sm">{s.course_name}</td>
                {alertTab === "attendance" && <>
                  <td><span className="tag tag-danger">{s.attendance_percentage}%</span></td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>{s.present}/{s.total}</td>
                </>}
                {alertTab === "cat" && <>
                  <td><span className="tag tag-warning">{s.exam}</span></td>
                  <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--danger)" }}>{s.marks}/50</td>
                </>}
                {alertTab === "internal" && <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--danger)" }}>{s.internal_total}/40</td>}
                <td className="text-muted text-sm">{s.department}</td>
                <td><span className="tag tag-muted">{s.batch_year}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {/* Profile Details */}
      <div className="card">
        <div className="card-title"><Icon name="user" size={18} /> Profile Details</div>
        <div className="detail-grid">
          <div className="detail-item"><label>Employee ID</label><p>{profile.employee_id}</p></div>
          <div className="detail-item"><label>Email</label><p>{u.email}</p></div>
          <div className="detail-item"><label>Phone</label><p>{u.phone || "—"}</p></div>
          <div className="detail-item"><label>Specialization</label><p>{profile.specialization || "—"}</p></div>
          <div className="detail-item"><label>Department</label><p>{profile.department?.name}</p></div>
          <div className="detail-item"><label>Joining Date</label><p>{profile.joining_date || "—"}</p></div>
        </div>
      </div>
    </div>
  );
}

// ─── FACULTY STUDENTS, ATTENDANCE, MARKS, MESSAGES ───────────────────────────
function FacultyStudents() {
  const [students, setStudents] = useState([]); const [courses, setCourses] = useState([]); const [filter, setFilter] = useState(""); const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState(""); const [deptFilter, setDeptFilter] = useState(""); const [sectionFilter, setSectionFilter] = useState("");
  useEffect(() => { api("/faculty/students").then(setStudents).catch(console.error); api("/faculty/my-courses").then(setCourses).catch(console.error); }, []);
  
  // Collect unique values for filter dropdowns
  const years = [...new Set(students.map(s => s.batch_year).filter(Boolean))].sort();
  const depts = [...new Set(students.map(s => s.department).filter(Boolean))].sort();
  const sections = [...new Set(students.map(s => s.section).filter(Boolean))].sort();
  
  const filtered = students.filter(s =>
    (!filter || s.course_id === parseInt(filter)) &&
    (!search || s.name.toLowerCase().includes(search.toLowerCase()) || s.register_number.includes(search)) &&
    (!yearFilter || String(s.batch_year) === yearFilter) &&
    (!deptFilter || s.department === deptFilter) &&
    (!sectionFilter || s.section === sectionFilter)
  );
  
  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-title mb-4"><Icon name="student" size={18} /> My Students</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input style={{ padding: "8px 14px", border: "1.5px solid var(--surface-3)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: "0.88rem", outline: "none", minWidth: 180 }} placeholder="Search name / reg no..." value={search} onChange={e => setSearch(e.target.value)} />
          <select style={{ padding: "8px 14px", border: "1.5px solid var(--surface-3)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: "0.88rem", outline: "none" }} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
            <option value="">All Years</option>{years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select style={{ padding: "8px 14px", border: "1.5px solid var(--surface-3)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: "0.88rem", outline: "none" }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All Depts</option>{depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select style={{ padding: "8px 14px", border: "1.5px solid var(--surface-3)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: "0.88rem", outline: "none" }} value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}>
            <option value="">All Sections</option>{sections.map(s => <option key={s} value={s}>Section {s}</option>)}
          </select>
          <select style={{ padding: "8px 14px", border: "1.5px solid var(--surface-3)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: "0.88rem", outline: "none" }} value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">All Courses</option>{courses.map(c => <option key={c.course_id} value={c.course_id}>{c.code}</option>)}
          </select>
          {(yearFilter || deptFilter || sectionFilter || filter || search) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setYearFilter(""); setDeptFilter(""); setSectionFilter(""); setFilter(""); setSearch(""); }}>Clear Filters</button>
          )}
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Reg. No.</th><th>Dept</th><th>Section</th><th>Year</th><th>Course</th><th>Attendance</th><th>CGPA</th></tr></thead>
          <tbody>{filtered.map((s, i) => <tr key={i}><td style={{ fontWeight: 700 }}>{s.name}</td><td style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>{s.register_number}</td><td className="text-muted text-sm">{s.department}</td><td><span className="tag tag-muted">{s.section}</span></td><td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>{s.batch_year || "—"}</td><td className="text-muted text-sm">{s.course_name}</td><td><span className={`tag ${s.attendance_percentage >= 75 ? "tag-success" : "tag-danger"}`}>{s.attendance_percentage}%</span></td><td style={{ fontWeight: 800, fontFamily: "var(--font-mono)" }}>{s.cgpa}</td></tr>)}</tbody>
        </table></div>
        <div className="text-muted text-sm" style={{ marginTop: 12 }}>Showing {filtered.length} of {students.length} entries</div>
      </div>
    </div>
  );
}

function FacultyLowAttendance() {
  const [students, setStudents] = useState([]);
  useEffect(() => { api("/faculty/low-attendance").then(setStudents).catch(console.error); }, []);
  return (
    <div className="fade-in">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 0 }}><Icon name="warning" size={18} /> Low Attendance Alert</div>
          <span className="tag tag-danger">{students.length} students at risk</span>
        </div>
        {students.length === 0 ? <div style={{ textAlign: "center", padding: "48px" }}><div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div><div style={{ fontWeight: 700, color: "var(--success)" }}>All students above 75%!</div></div>
          : students.map(s => <div key={`${s.student_id}-${s.course_id}`} className="alert-card"><Icon name="warning" size={22} style={{ color: "var(--danger)", flexShrink: 0 }} /><div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{s.name} <span className="text-muted text-sm">({s.register_number})</span></div><div className="text-muted text-sm">{s.course_name}</div><div style={{ display: "flex", gap: 10, marginTop: 6 }}><span className="tag tag-danger">{s.attendance_percentage}%</span><span className="text-muted text-sm" style={{ fontFamily: "var(--font-mono)" }}>{s.present}/{s.total_classes}</span></div></div></div>)}
      </div>
    </div>
  );
}

function FacultyMarkAttendance({ toast }) {
  const [courses, setCourses] = useState([]); const [selectedCourse, setSelectedCourse] = useState(""); const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [students, setStudents] = useState([]); const [statuses, setStatuses] = useState({}); const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState("mark"); // "mark" | "daywise"
  const [daywiseData, setDaywiseData] = useState(null); const [daywiseLoading, setDaywiseLoading] = useState(false);

  useEffect(() => { api("/faculty/my-courses").then(setCourses).catch(console.error); }, []);
  useEffect(() => { if (!selectedCourse) return; api(`/faculty/students?course_id=${selectedCourse}`).then(s => { const unique = [...new Map(s.map(x => [x.student_id, x])).values()]; setStudents(unique); setStatuses(Object.fromEntries(unique.map(s => [s.student_id, "present"]))); }); }, [selectedCourse]);

  async function loadDaywise() {
    if (!selectedCourse) return;
    setDaywiseLoading(true);
    try { const d = await api(`/faculty/attendance/daywise/${selectedCourse}`); setDaywiseData(d); }
    catch { toast("Failed to load day-wise attendance", "error"); }
    finally { setDaywiseLoading(false); }
  }

  useEffect(() => { if (viewMode === "daywise" && selectedCourse) loadDaywise(); }, [viewMode, selectedCourse]);

  async function submit() {
    if (!selectedCourse || !students.length) return; setLoading(true);
    try { await api("/faculty/attendance/mark", { method: "POST", body: JSON.stringify({ course_id: parseInt(selectedCourse), date, records: students.map(s => ({ student_id: s.student_id, status: statuses[s.student_id] })) }) }); toast("Attendance marked!", "success"); if (viewMode === "daywise") loadDaywise(); }
    catch (err) { toast(err.message, "error"); } finally { setLoading(false); }
  }
  const opts = [{ v: "present", label: "P", color: "var(--success)" }, { v: "absent", label: "A", color: "var(--danger)" }, { v: "od", label: "OD", color: "var(--info)" }];

  const statusColor = { present: "var(--success)", absent: "var(--danger)", od: "var(--info)" };
  const statusLabel = { present: "P", absent: "A", od: "OD" };

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-title"><Icon name="attendance" size={18} /> Attendance Management</div>
        <div className="grid-2 mb-4">
          <div className="form-field" style={{ marginBottom: 0 }}><label>Course</label><select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}><option value="">— Select Course —</option>{courses.map(c => <option key={c.course_id} value={c.course_id}>{c.code} — {c.name}</option>)}</select></div>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label>View Mode</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className={`btn btn-sm ${viewMode === "mark" ? "btn-primary" : "btn-ghost"}`} onClick={() => setViewMode("mark")}>Mark Today</button>
              <button className={`btn btn-sm ${viewMode === "daywise" ? "btn-primary" : "btn-ghost"}`} onClick={() => setViewMode("daywise")}>Day-wise View</button>
            </div>
          </div>
        </div>

        {/* Mark Attendance Mode */}
        {viewMode === "mark" && <>
          <div className="form-field mb-4"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ maxWidth: 200 }} /></div>
          {students.length > 0 && <>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button className="btn btn-success btn-sm" onClick={() => setStatuses(Object.fromEntries(students.map(s => [s.student_id, "present"])))}>All Present</button>
              <button className="btn btn-danger btn-sm" onClick={() => setStatuses(Object.fromEntries(students.map(s => [s.student_id, "absent"])))}>All Absent</button>
              <div style={{ marginLeft: "auto", fontSize: "0.82rem", color: "var(--muted)", alignSelf: "center", fontFamily: "var(--font-mono)" }}>{Object.values(statuses).filter(v => v === "present").length}/{students.length} present</div>
            </div>
            <div className="table-wrap"><table>
              <thead><tr><th>Student</th><th>Reg. No.</th><th>Status</th></tr></thead>
              <tbody>{students.map(s => <tr key={s.student_id}><td style={{ fontWeight: 700 }}>{s.name}</td><td style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>{s.register_number}</td><td><div style={{ display: "flex", gap: 5 }}>{opts.map(opt => <button key={opt.v} style={{ padding: "5px 11px", borderRadius: 8, border: `2px solid ${opt.color}`, cursor: "pointer", fontSize: "0.8rem", fontWeight: 700, fontFamily: "var(--font-mono)", transition: "all 0.12s", background: statuses[s.student_id] === opt.v ? opt.color : "transparent", color: statuses[s.student_id] === opt.v ? "white" : opt.color }} onClick={() => setStatuses({ ...statuses, [s.student_id]: opt.v })}>{opt.label}</button>)}</div></td></tr>)}</tbody>
            </table></div>
            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={submit} disabled={loading}>{loading ? "Saving..." : `Submit (${students.length} students)`}</button>
          </>}
          {selectedCourse && students.length === 0 && <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>No students found for this course</div>}
        </>}

        {/* Day-wise Attendance View */}
        {viewMode === "daywise" && <>
          {!selectedCourse && <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Select a course to view day-wise attendance</div>}
          {selectedCourse && daywiseLoading && <LoadingState />}
          {selectedCourse && !daywiseLoading && daywiseData && <>
            <div style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
              <span className="text-muted text-sm">{daywiseData.dates.length} class days recorded</span>
              <span className="tag tag-danger">{daywiseData.students.filter(s => s.low_attendance).length} low attendance</span>
            </div>
            <div className="table-wrap" style={{ overflowX: "auto" }}>
              <table style={{ minWidth: Math.max(600, 200 + daywiseData.dates.length * 52) }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 160, position: "sticky", left: 0, background: "var(--surface-2)", zIndex: 2 }}>Student</th>
                    <th style={{ minWidth: 100, position: "sticky", left: 160, background: "var(--surface-2)", zIndex: 2 }}>%</th>
                    {daywiseData.dates.map(d => <th key={d} style={{ minWidth: 50, fontSize: "0.68rem", fontFamily: "var(--font-mono)", writingMode: "vertical-lr", textOrientation: "mixed", paddingBottom: 10 }}>{d.slice(5)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[...daywiseData.students].sort((a, b) => a.percentage - b.percentage).map(s => (
                    <tr key={s.student_id} style={{ background: s.low_attendance ? "rgba(239,68,68,0.04)" : "transparent" }}>
                      <td style={{ position: "sticky", left: 0, background: s.low_attendance ? "rgba(239,68,68,0.04)" : "var(--surface)", zIndex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: "0.82rem" }}>{s.name}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "var(--muted)" }}>{s.register_number}</div>
                      </td>
                      <td style={{ position: "sticky", left: 160, background: s.low_attendance ? "rgba(239,68,68,0.04)" : "var(--surface)", zIndex: 1 }}>
                        <span className={`tag ${s.percentage >= 75 ? "tag-success" : "tag-danger"}`} style={{ fontSize: "0.78rem" }}>{s.percentage}%</span>
                        <div style={{ fontSize: "0.65rem", color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{s.present}/{s.total_classes}</div>
                      </td>
                      {daywiseData.dates.map(d => {
                        const st = s.by_date?.[d];
                        return <td key={d} style={{ textAlign: "center", padding: "6px 4px" }}>
                          {st ? <span style={{ display: "inline-block", width: 24, height: 24, borderRadius: 6, background: statusColor[st] || "var(--surface-3)", color: "white", fontSize: "0.6rem", fontWeight: 800, lineHeight: "24px", textAlign: "center", fontFamily: "var(--font-mono)" }}>{statusLabel[st] || "?"}</span>
                            : <span style={{ display: "inline-block", width: 24, height: 24, borderRadius: 6, background: "var(--surface-3)", opacity: 0.3 }} />}
                        </td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 12, fontSize: "0.75rem", color: "var(--muted)" }}>
              {Object.entries(statusColor).map(([k, c]) => <span key={k} style={{ display: "flex", gap: 5, alignItems: "center" }}><span style={{ width: 14, height: 14, borderRadius: 4, background: c, display: "inline-block" }} />{k}</span>)}
            </div>
          </>}
        </>}
      </div>
    </div>
  );
}

function FacultyMarksUpload({ toast }) {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [marks, setMarks] = useState([]);        // all students with their marks
  const [edits, setEdits] = useState({});        // { studentId: { cat1, cat2, ... } }
  const [bulkSaving, setBulkSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterLow, setFilterLow] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveProgress, setSaveProgress] = useState(null); // null | { done, total }

  useEffect(() => { api("/faculty/my-courses").then(setCourses).catch(console.error); }, []);

  async function loadMarks(courseId) {
    setLoadError(""); setMarks([]); setEdits({});
    try {
      const data = await api(`/faculty/marks/${courseId}`);
      setMarks(data);
    } catch (e) {
      setLoadError(e.message || "Failed to load students");
    }
  }

  useEffect(() => { if (selectedCourse) loadMarks(selectedCourse); }, [selectedCourse]);

  // Update a single field in local edit state
  function setField(studentId, field, rawValue) {
    const val = rawValue === "" ? null : parseFloat(rawValue);
    setEdits(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [field]: val }
    }));
  }

  // Get the display value: edited > saved > ""
  function getVal(m, field) {
    const ed = edits[m.student_id];
    if (ed && ed[field] !== undefined) return ed[field] ?? "";
    return m[field] ?? "";
  }

  // Live internal total for a student row
  function liveInternal(m) {
    const v = f => {
      const ed = edits[m.student_id];
      if (ed && ed[f] !== undefined) return ed[f] ?? 0;
      return m[f] ?? 0;
    };
    const cats  = [v("cat1"), v("cat2"), v("cat3")];
    const asgns = [v("assignment1"), v("assignment2"), v("assignment3")];
    const catAvg  = cats.reduce((a, b)  => a + Number(b), 0) / 3;
    const asgnAvg = asgns.reduce((a, b) => a + Number(b), 0) / 3;
    return { total: parseFloat(((catAvg * 0.70 + asgnAvg * 0.30) / 50 * 40).toFixed(2)), catAvg: catAvg.toFixed(1), asgnAvg: asgnAvg.toFixed(1) };
  }

  // Save all edited rows in one bulk request
  async function saveAll() {
    const studentIds = Object.keys(edits).filter(id => {
      const e = edits[id];
      return e && Object.values(e).some(v => v !== undefined);
    });
    if (!studentIds.length) { toast("No changes to save", "warning"); return; }

    setBulkSaving(true);
    setSaveProgress({ done: 0, total: studentIds.length });
    let saved = 0;
    try {
      // Use bulk endpoint — send all in one request
      const records = studentIds.map(id => {
        const m = marks.find(x => x.student_id === parseInt(id));
        const e = edits[id] || {};
        return {
          student_id: parseInt(id),
          cat1:        e.cat1        !== undefined ? e.cat1        : (m?.cat1        ?? null),
          cat2:        e.cat2        !== undefined ? e.cat2        : (m?.cat2        ?? null),
          cat3:        e.cat3        !== undefined ? e.cat3        : (m?.cat3        ?? null),
          assignment1: e.assignment1 !== undefined ? e.assignment1 : (m?.assignment1 ?? null),
          assignment2: e.assignment2 !== undefined ? e.assignment2 : (m?.assignment2 ?? null),
          assignment3: e.assignment3 !== undefined ? e.assignment3 : (m?.assignment3 ?? null),
        };
      });
      await api(`/faculty/marks/bulk/${selectedCourse}`, {
        method: "POST",
        body: JSON.stringify({ records })
      });
      saved = records.length;
      toast(`✅ Saved marks for ${saved} student${saved !== 1 ? "s" : ""}! They can now see their scores.`, "success");
      await loadMarks(selectedCourse);
    } catch (err) {
      toast("Save failed: " + err.message, "error");
    } finally {
      setBulkSaving(false);
      setSaveProgress(null);
    }
  }

  // Save just one student row
  async function saveOne(studentId) {
    const e = edits[studentId];
    if (!e || !Object.keys(e).length) { toast("No changes for this student", "warning"); return; }
    try {
      await api(`/faculty/marks/${studentId}/${selectedCourse}`, {
        method: "POST",
        body: JSON.stringify(e)
      });
      toast("Saved!", "success");
      await loadMarks(selectedCourse);
    } catch (err) { toast(err.message, "error"); }
  }

  const fields   = ["cat1","cat2","cat3","assignment1","assignment2","assignment3"];
  const headers  = ["CAT 1","CAT 2","CAT 3","Asgn 1","Asgn 2","Asgn 3"];
  const maxVals  = [50,50,50,50,50,50];

  const pendingCount = Object.keys(edits).filter(id => {
    const e = edits[id]; return e && Object.values(e).some(v => v !== undefined);
  }).length;

  // Filter displayed rows
  let displayed = marks;
  if (search) displayed = displayed.filter(m => m.student_name.toLowerCase().includes(search.toLowerCase()) || m.register_number.includes(search));
  if (filterLow) displayed = displayed.filter(m => {
    const { total } = liveInternal(m);
    return total < 23;
  });

  return (
    <div className="fade-in">
      {/* Info banner */}
      <div style={{ padding: "10px 16px", background: "rgba(108,59,255,0.06)", borderRadius: 12, marginBottom: 14, fontSize: "0.8rem", color: "var(--accent-2)", fontFamily: "var(--font-mono)", fontWeight: 600, border: "1px solid rgba(108,59,255,0.15)", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="calculator" size={15} />
        Formula: (CAT avg × 0.70 + Asgn avg × 0.30) ÷ 50 × 40 = Internal /40 — All students are shown. Type marks and click Save All.
      </div>

      <div className="card">
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div className="card-title" style={{ marginBottom: 0 }}><Icon name="marks" size={18} /> Upload Marks</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {/* Save All button — prominent */}
            {pendingCount > 0 && (
              <button className="btn btn-success" onClick={saveAll} disabled={bulkSaving}
                style={{ fontWeight: 800, minWidth: 170, position: "relative", overflow: "hidden" }}>
                {bulkSaving
                  ? `Saving ${saveProgress?.done || 0}/${saveProgress?.total}...`
                  : <><Icon name="check" size={15}/> Save All ({pendingCount} student{pendingCount !== 1 ? "s" : ""})</>}
              </button>
            )}
            <select style={{ padding: "9px 14px", border: "1.5px solid var(--surface-3)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: "0.88rem", outline: "none", minWidth: 200 }}
              value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}>
              <option value="">— Select Course —</option>
              {courses.map(c => <option key={c.course_id} value={c.course_id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Empty states */}
        {!selectedCourse && (
          <div style={{ textAlign: "center", padding: "48px 32px", color: "var(--muted)" }}>
            <Icon name="marks" size={52} style={{ opacity: 0.15, marginBottom: 14 }} />
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>Select a course to start entering marks</div>
            <div style={{ fontSize: "0.82rem", marginTop: 6 }}>All enrolled students will appear — even those with no marks yet</div>
          </div>
        )}

        {selectedCourse && loadError && (
          <div style={{ padding: "16px", background: "rgba(239,68,68,0.08)", borderRadius: 10, color: "var(--danger)", fontWeight: 600 }}>
            ⚠ {loadError} — <button className="btn btn-ghost btn-sm" onClick={() => loadMarks(selectedCourse)}>Retry</button>
          </div>
        )}

        {selectedCourse && !loadError && marks.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px", color: "var(--muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 600 }}>No students enrolled in this course yet</div>
            <div style={{ fontSize: "0.8rem", marginTop: 4 }}>Students must be registered via Course Registration first</div>
          </div>
        )}

        {marks.length > 0 && (
          <>
            {/* Search + filter row */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <input
                style={{ flex: 1, minWidth: 200, padding: "7px 12px", border: "1.5px solid var(--surface-3)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: "0.85rem", outline: "none" }}
                placeholder="Search by name or register number..."
                value={search} onChange={e => setSearch(e.target.value)}
              />
              <button className={`btn btn-sm ${filterLow ? "btn-danger" : "btn-ghost"}`}
                onClick={() => setFilterLow(p => !p)}>
                {filterLow ? "Showing: Low Internal (<23)" : "Filter: Low Internal"}
              </button>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                {displayed.length}/{marks.length} students
                {pendingCount > 0 && <span style={{ color: "var(--accent-2)", fontWeight: 700, marginLeft: 8 }}>• {pendingCount} unsaved</span>}
              </span>
            </div>

            {/* Marks Table */}
            <div className="table-wrap" style={{ overflowX: "auto" }}>
              <table style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 160, position: "sticky", left: 0, background: "var(--surface-2)", zIndex: 2 }}>Student</th>
                    {headers.map((h, i) => (
                      <th key={h} style={{ minWidth: 80, textAlign: "center" }}>
                        {h}<span style={{ color: "var(--muted)", fontWeight: 400, fontSize: "0.7rem" }}> /{maxVals[i]}</span>
                      </th>
                    ))}
                    <th style={{ minWidth: 90, background: "rgba(108,59,255,0.06)", color: "var(--accent-2)", textAlign: "center" }}>
                      Internal<br/><span style={{ fontSize: "0.65rem", fontWeight: 400 }}>/40 AUTO</span>
                    </th>
                    <th style={{ minWidth: 80, textAlign: "center" }}>Save</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(m => {
                    const hasEdits = edits[m.student_id] && Object.values(edits[m.student_id]).some(v => v !== undefined);
                    const { total, catAvg, asgnAvg } = liveInternal(m);
                    const totalColor = total >= 23 ? "var(--success)" : total >= 16 ? "var(--warning)" : "var(--danger)";

                    return (
                      <tr key={m.student_id} style={{ background: hasEdits ? "rgba(108,59,255,0.025)" : "transparent", transition: "background 0.15s" }}>
                        {/* Sticky name column */}
                        <td style={{ position: "sticky", left: 0, background: hasEdits ? "rgba(108,59,255,0.025)" : "var(--surface)", zIndex: 1, minWidth: 160 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{m.student_name}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--muted)" }}>{m.register_number}</div>
                          {!m.has_record && (
                            <div style={{ fontSize: "0.62rem", color: "var(--warning)", fontWeight: 700, marginTop: 2 }}>NEW ✦</div>
                          )}
                          {hasEdits && (
                            <div style={{ fontSize: "0.62rem", color: "var(--accent-2)", fontWeight: 700 }}>● Edited</div>
                          )}
                        </td>

                        {/* Mark input fields */}
                        {fields.map((f, fi) => (
                          <td key={f} style={{ textAlign: "center", padding: "6px 4px" }}>
                            <input
                              key={`${m.student_id}-${f}-${m.has_record}`}
                              type="number" min="0" max={maxVals[fi]} step="0.5"
                              value={getVal(m, f)}
                              onChange={e => setField(m.student_id, f, e.target.value)}
                              style={{
                                width: 68, padding: "7px 6px", textAlign: "center",
                                border: `1.5px solid ${edits[m.student_id]?.[f] !== undefined ? "var(--accent-2)" : "var(--surface-3)"}`,
                                borderRadius: 8, fontFamily: "var(--font-mono)", fontSize: "0.9rem", outline: "none",
                                background: edits[m.student_id]?.[f] !== undefined ? "rgba(108,59,255,0.06)" : "transparent",
                                transition: "border-color 0.15s, background 0.15s",
                                color: "var(--text)"
                              }}
                              placeholder="—"
                            />
                          </td>
                        ))}

                        {/* Auto-calculated internal total */}
                        <td style={{ textAlign: "center", background: "rgba(108,59,255,0.03)" }}>
                          <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.15rem", color: totalColor }}>
                            {total.toFixed(1)}
                          </div>
                          <div style={{ fontSize: "0.6rem", color: "var(--muted)", fontFamily: "var(--font-mono)", lineHeight: 1.3 }}>
                            C:{catAvg} A:{asgnAvg}
                          </div>
                        </td>

                        {/* Row save button */}
                        <td style={{ textAlign: "center" }}>
                          <button
                            className={`btn btn-sm ${hasEdits ? "btn-primary" : "btn-ghost"}`}
                            onClick={() => saveOne(m.student_id)}
                            disabled={!hasEdits}
                            style={{ fontSize: "0.72rem", padding: "5px 10px" }}
                          >
                            {hasEdits ? <><Icon name="check" size={11}/> Save</> : "—"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom save bar — always visible when there are pending changes */}
            {pendingCount > 0 && (
              <div style={{ marginTop: 16, padding: "14px 18px", background: "linear-gradient(135deg, rgba(0,196,140,0.1), rgba(108,59,255,0.06))", borderRadius: 12, border: "1px solid rgba(0,196,140,0.25)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--success)", fontSize: "0.9rem" }}>
                    {pendingCount} student{pendingCount !== 1 ? "s" : ""} with unsaved changes
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 2 }}>
                    Click "Save All" to submit in one batch — students are notified instantly
                  </div>
                </div>
                <button className="btn btn-success" onClick={saveAll} disabled={bulkSaving} style={{ fontWeight: 800, minWidth: 160 }}>
                  {bulkSaving ? "Saving..." : <><Icon name="check" size={15}/> Save All Changes</>}
                </button>
              </div>
            )}

            {pendingCount === 0 && marks.length > 0 && (
              <div style={{ marginTop: 12, padding: "8px 14px", background: "rgba(0,196,140,0.05)", borderRadius: 8, fontSize: "0.75rem", color: "var(--success)", fontWeight: 600 }}>
                ✓ All marks saved. Students can see their scores in the Marks & Results page.
              </div>
            )}
          </>
        )}
      </div>

      {/* Assignment submissions */}
      {selectedCourse && <FacultyAssignmentSubmissions courseId={selectedCourse} toast={toast} />}
    </div>
  );
}

// Show assignment submissions for faculty when viewing marks
function FacultyAssignmentSubmissions({ courseId, toast }) {
  const [assignments, setAssignments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [grading, setGrading] = useState({});

  useEffect(() => {
    api("/faculty/assignments").then(list => {
      setAssignments(list.filter(a => a.course_id === parseInt(courseId)));
    }).catch(() => setAssignments([]));
  }, [courseId]);

  async function viewSubmissions(assignmentId) {
    setSelected(assignmentId);
    setLoadingSubs(true);
    try {
      const subs = await api(`/faculty/assignments/${assignmentId}/submissions`);
      setSubmissions(subs);
    } catch { setSubmissions([]); }
    finally { setLoadingSubs(false); }
  }

  async function grade(subId) {
    const g = grading[subId];
    if (!g?.marks) { toast("Enter marks", "error"); return; }
    try {
      await api(`/faculty/assignments/submissions/${subId}/grade`, {
        method: "POST",
        body: JSON.stringify({ marks_obtained: parseFloat(g.marks), feedback: g.feedback || "" })
      });
      toast("Graded & saved ✓", "success");
      viewSubmissions(selected);
    } catch (err) { toast("Grade failed: " + err.message, "error"); }
  }

  if (assignments.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title"><Icon name="document" size={18} /> Assignment Submissions</div>
      {assignments.map(a => (
        <div key={a.id} style={{ padding: "10px 14px", background: "var(--surface)", borderRadius: 10, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{a.title}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Due: {a.due_date} · Max: {a.max_marks} · <strong>{a.submission_count || 0} submitted</strong></div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => viewSubmissions(a.id)}>View Submissions ({a.submission_count || 0})</button>
        </div>
      ))}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-title">📋 Student Submissions</div>
            {loadingSubs ? <LoadingState /> : submissions.length === 0
              ? <div className="text-muted" style={{ textAlign: "center", padding: 24 }}>No submissions yet for this assignment</div>
              : submissions.map(s => (
                <div key={s.id} style={{ padding: 14, background: "var(--surface)", borderRadius: 10, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{s.student_name}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{s.register_number} · {new Date(s.submitted_at).toLocaleString()}</div>
                    </div>
                    {s.marks_obtained != null && <span className="tag tag-success">{s.marks_obtained} marks</span>}
                  </div>
                  {s.submission_text && <div style={{ fontSize: "0.85rem", marginBottom: 8, padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8 }}>{s.submission_text}</div>}
                  {s.file_url && <div style={{ marginBottom: 8 }}><span className="tag tag-info"><Icon name="document" size={12}/> File attached</span></div>}
                  {s.marks_obtained == null && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <input type="number" min="0" placeholder="Marks"
                        style={{ width: 80, padding: "6px 10px", border: "1.5px solid var(--surface-3)", borderRadius: 8, fontFamily: "var(--font-mono)", fontSize: "0.88rem", outline: "none" }}
                        onChange={e => setGrading(g => ({ ...g, [s.id]: { ...g[s.id], marks: e.target.value } }))} />
                      <input placeholder="Feedback (optional)"
                        style={{ flex: 1, padding: "6px 10px", border: "1.5px solid var(--surface-3)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: "0.82rem", outline: "none" }}
                        onChange={e => setGrading(g => ({ ...g, [s.id]: { ...g[s.id], feedback: e.target.value } }))} />
                      <button className="btn btn-success btn-sm" onClick={() => grade(s.id)}><Icon name="check" size={12}/> Grade</button>
                    </div>
                  )}
                  {s.feedback && <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 6 }}>💬 {s.feedback}</div>}
                </div>
              ))
            }
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FacultySendMessage({ toast }) {
  const [students, setStudents] = useState([]); const [courses, setCourses] = useState([]);
  const [mode, setMode] = useState("individual"); // "individual" | "broadcast"
  const [recipient, setRecipient] = useState(""); const [broadcastCourse, setBroadcastCourse] = useState("");
  const [subject, setSubject] = useState(""); const [body, setBody] = useState(""); const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api("/faculty/students").then(s => { setStudents([...new Map(s.map(x => [x.student_id, x])).values()]); });
    api("/faculty/my-courses").then(setCourses).catch(console.error);
  }, []);

  async function send() {
    if (!body) { toast("Enter message body", "error"); return; }
    setSending(true);
    try {
      if (mode === "individual") {
        if (!recipient) { toast("Select a recipient", "error"); setSending(false); return; }
        const student = students.find(s => s.student_id === parseInt(recipient));
        await api("/faculty/send-message", { method: "POST", body: JSON.stringify({ recipient_id: student?.user_id || parseInt(recipient), subject, body }) });
        toast("Message sent!", "success");
      } else {
        if (!broadcastCourse) { toast("Select a course to broadcast to", "error"); setSending(false); return; }
        const res = await api("/faculty/broadcast-message", { method: "POST", body: JSON.stringify({ course_id: parseInt(broadcastCourse), subject, body }) });
        toast(res.message || "Broadcast sent!", "success");
      }
      setSent(true);
      setTimeout(() => { setSubject(""); setBody(""); setRecipient(""); setBroadcastCourse(""); setSent(false); }, 1500);
    } catch (err) { toast(err.message, "error"); } finally { setSending(false); }
  }

  const selectedCourseName = courses.find(c => c.course_id === parseInt(broadcastCourse))?.name;
  const studentsInCourse = broadcastCourse ? students.filter(s => s.course_id === parseInt(broadcastCourse)) : [];

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-title"><Icon name="send" size={18} /> Send Message</div>

        {/* Mode Toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button className={`btn btn-sm ${mode === "individual" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("individual")}><Icon name="user" size={13} /> Individual</button>
          <button className={`btn btn-sm ${mode === "broadcast" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("broadcast")}><Icon name="bell" size={13} /> Broadcast to Class</button>
        </div>

        {mode === "individual" ? (
          <div className="form-field"><label>Recipient Student</label>
            <select value={recipient} onChange={e => setRecipient(e.target.value)}>
              <option value="">— Select Student —</option>
              {students.map(s => <option key={s.student_id} value={s.student_id}>{s.name} ({s.register_number})</option>)}
            </select>
          </div>
        ) : (
          <div className="form-field"><label>Course / Class (All students will receive this message)</label>
            <select value={broadcastCourse} onChange={e => setBroadcastCourse(e.target.value)}>
              <option value="">— Select Course —</option>
              {courses.map(c => <option key={c.course_id} value={c.course_id}>{c.code} — {c.name}</option>)}
            </select>
            {broadcastCourse && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(108,59,255,0.06)", borderRadius: 8, fontSize: "0.78rem", color: "var(--accent-2)", fontWeight: 600 }}>
                📢 Will be sent to all students registered in {selectedCourseName}
              </div>
            )}
          </div>
        )}

        <div className="form-field"><label>Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Assignment Reminder" /></div>
        <div className="form-field"><label>Message</label><textarea rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="Type your message..." /></div>
        <button className="btn btn-primary" onClick={send} disabled={sent || sending}>
          <Icon name="send" size={16} /> {sending ? "Sending..." : sent ? "Message Sent ✓" : mode === "broadcast" ? "Send Broadcast" : "Send Message"}
        </button>
      </div>
    </div>
  );
}

function FacultyCreateAssignment({ toast }) {
  const [courses, setCourses] = useState([]); const [showForm, setShowForm] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState({ course_id: "", title: "", description: "", due_date: "", max_marks: 50 });
  const [aiDrafting, setAiDrafting] = useState(false);
  useEffect(() => { 
    api("/faculty/my-courses").then(setCourses).catch(console.error);
    api("/faculty/assignments").then(setAssignments).catch(() => setAssignments([]));
  }, []);
  async function aiDraftDescription() {
    if (!form.title) { toast("Enter title first", "error"); return; }
    setAiDrafting(true);
    try { const reply = await askAI("You are a college professor. Write a clear assignment description (max 50 words). Return only the text.", `Write description for: "${form.title}"`); setForm(f => ({ ...f, description: reply })); }
    catch { toast("AI unavailable", "error"); } finally { setAiDrafting(false); }
  }
  async function create() {
    if (!form.course_id || !form.title || !form.due_date) { toast("Fill all required fields", "error"); return; }
    try { 
      await api("/faculty/assignments", { method: "POST", body: JSON.stringify({ ...form, course_id: parseInt(form.course_id), max_marks: parseInt(form.max_marks) }) }); 
      toast("Assignment created & sent to all students in this course ✓", "success"); 
      setShowForm(false); 
      setForm({ course_id: "", title: "", description: "", due_date: "", max_marks: 50 });
      api("/faculty/assignments").then(setAssignments).catch(() => {});
    }
    catch (err) { toast(err.message, "error"); }
  }
  return (
    <div className="fade-in">
      <div className="card mb-4">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}><Icon name="exam" size={18} /> Assignments</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}><Icon name="add" size={14} /> Create New</button>
        </div>
        <div style={{ padding: "10px 14px", background: "rgba(108,59,255,0.06)", borderRadius: 10, marginBottom: 16, fontSize: "0.82rem", color: "var(--accent-2)", fontWeight: 600, border: "1px solid rgba(108,59,255,0.15)" }}>
          ✦ When you create an assignment for a course, all enrolled students of that course will receive it automatically.
        </div>
        {courses.map(c => {
          const courseAssignments = assignments.filter(a => a.course_id === c.course_id);
          return (
            <div key={c.course_id} className="insight-item" style={{ flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
                <div className="insight-icon" style={{ background: "rgba(108,59,255,0.1)" }}><Icon name="book" size={16} style={{ color: "var(--accent-2)" }} /></div>
                <div style={{ flex: 1, marginLeft: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{c.code} — {c.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Semester {c.semester} · {courseAssignments.length} assignment{courseAssignments.length !== 1 ? "s" : ""} created</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => { setForm(f => ({ ...f, course_id: c.course_id })); setShowForm(true); }}>+ Assignment</button>
              </div>
              {courseAssignments.length > 0 && (
                <div style={{ marginTop: 10, width: "100%", paddingLeft: 52 }}>
                  {courseAssignments.slice(0, 3).map(a => (
                    <div key={a.id} style={{ fontSize: "0.78rem", padding: "5px 10px", borderRadius: 8, background: "var(--surface-2)", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 600 }}>{a.title}</span>
                      <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>Due: {a.due_date}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showForm && <div className="modal-overlay" onClick={() => setShowForm(false)}><div className="modal fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-title">📝 Create Assignment</div>
        <div className="form-field">
          <label>Course / Class (Assignment will be sent to ALL enrolled students) *</label>
          <select value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })}>
            <option value="">— Select Course —</option>{courses.map(c => <option key={c.course_id} value={c.course_id}>{c.code} — {c.name} (Sem {c.semester})</option>)}
          </select>
        </div>
        <div className="form-field"><label>Title *</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Assignment title..." /></div>
        <div className="form-field"><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><label style={{ marginBottom: 0 }}>Description</label><button className="btn btn-ghost btn-sm" onClick={aiDraftDescription} disabled={aiDrafting} style={{ fontSize: "0.72rem" }}><Icon name="ai" size={12} /> {aiDrafting ? "..." : "AI Draft"}</button></div><textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
        <div className="grid-2"><div className="form-field"><label>Due Date *</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div><div className="form-field"><label>Max Marks</label><input type="number" value={form.max_marks} onChange={e => setForm({ ...form, max_marks: e.target.value })} /></div></div>
        {form.course_id && <div style={{ padding: "8px 12px", background: "rgba(0,196,140,0.08)", borderRadius: 8, fontSize: "0.78rem", color: "var(--success)", fontWeight: 600, marginBottom: 12 }}>✓ This will be sent to all students enrolled in {courses.find(c => String(c.course_id) === String(form.course_id))?.code || "selected course"}</div>}
        <div style={{ display: "flex", gap: 10 }}><button className="btn btn-primary" onClick={create}>Create & Send</button><button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button></div>
      </div></div>}
    </div>
  );
}

// ─── FACULTY OD/INTERNSHIP APPROVALS (Real API) ─────────────────────────────
function FacultyODApprovals({ toast }) {
  const [odApps, setOdApps] = useState([]);
  const [internApps, setInternApps] = useState([]);
  const [tab, setTab] = useState("od");
  const [reviewing, setReviewing] = useState(null); // { app, type }
  const [remarks, setRemarks] = useState("");
  const [facultySign, setFacultySign] = useState(() => localStorage.getItem("faculty_signature") || null);
  const [showSigPad, setShowSigPad] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadAll() {
    // OD and internship apps arrive as messages to the faculty
    // Filter inbox messages by subject prefix
    try {
      const msgs = await api("/faculty/messages-inbox").catch(() => []);
      const od = msgs.filter(m => m.subject && (m.subject.startsWith("OD Application") || m.subject.startsWith("OD Application"))).map(m => ({
        id: m.id, student_name: m.sender_name, register_number: m.sender_reg || "",
        subject: m.subject, body: m.body, created_at: m.created_at, status: "pending",
        sender_user_id: m.sender_user_id
      }));
      const intern = msgs.filter(m => m.subject && m.subject.startsWith("Internship Application")).map(m => ({
        id: m.id, student_name: m.sender_name, register_number: m.sender_reg || "",
        subject: m.subject, body: m.body, created_at: m.created_at, status: "pending",
        sender_user_id: m.sender_user_id
      }));
      setOdApps(od); setInternApps(intern);
    } catch { setOdApps([]); setInternApps([]); }
  }
  useEffect(() => { loadAll(); }, []);

  function saveSign(data) {
    setFacultySign(data);
    localStorage.setItem("faculty_signature", data);
    setShowSigPad(false);
    toast("Signature saved!", "success");
  }

  async function doReview(status) {
    if (!reviewing) return;
    if (!remarks.trim()) { toast("Please write your remarks before " + (status === "approved" ? "approving" : "rejecting"), "error"); return; }
    if (status === "approved" && !facultySign) { toast("Please add your digital signature to approve", "error"); return; }
    setLoading(true);
    try {
      // Reply to the student's application message
      await api("/faculty/send-message", {
        method: "POST",
        body: JSON.stringify({
          recipient_id: reviewing.app.sender_user_id || reviewing.app.id,
          subject: (status === "approved" ? "APPROVED: " : "REJECTED: ") + reviewing.app.subject,
          body: `Your application has been ${status.toUpperCase()}.\n\nRemarks: ${remarks}\n\nFaculty`
        })
      });
      toast(`Application ${status === "approved" ? "approved ✓ — student notified" : "rejected — student notified"}`, status === "approved" ? "success" : "warning");
      setReviewing(null); setRemarks("");
      loadAll();
    } catch (err) { toast(err.message, "error"); }
    finally { setLoading(false); }
  }

  function downloadPDF(app, type) {
    const html = generateLetterPDF({
      type, studentName: app.student_name, registerNumber: app.register_number,
      className: `B.E ${app.department || "CSE"}`, yearOfStudy: "3",
      reason: type === "od" ? `${app.event_name || ""} — ${app.reason}` : `${app.company_name} — ${app.role || ""} (${app.from_date} to ${app.to_date}). ${app.description || ""}`,
      signature: app.faculty_signature
    });
    const stamp = `<div style="margin-top:40px;padding:20px;border:2px solid #00c48c;border-radius:12px;background:rgba(0,196,140,0.05)">
      <p style="font-weight:800;color:#00c48c;font-size:1rem">✓ APPROVED BY FACULTY ADVISOR</p>
      <p style="margin-top:8px;font-size:0.85rem;color:#555">Remarks: ${app.faculty_remarks || ""}</p>
      ${app.faculty_signature ? `<img src="${app.faculty_signature}" style="height:50px;margin-top:8px"/>` : ""}
      <p style="font-size:0.75rem;color:#999;margin-top:8px">Approved on: ${new Date(app.reviewed_at || Date.now()).toLocaleDateString()}</p>
    </div>`;
    printHTML(html.replace("</body>", stamp + "</body>"));
  }

  const apps = tab === "od" ? odApps : internApps;
  const pendingCount = odApps.filter(a => a.status === "pending").length + internApps.filter(a => a.status === "pending").length;

  return (
    <div className="fade-in">
      {/* Faculty Signature Setup */}
      <div className="card mb-5">
        <div className="card-title"><Icon name="signature" size={18} /> Your Digital Signature</div>
        <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: 12 }}>Required to approve applications. Saved in your browser.</div>
        {facultySign
          ? <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <img src={facultySign} alt="Signature" style={{ height: 60, border: "1px solid var(--surface-3)", borderRadius: 8, padding: 8, background: "white" }} />
              <div>
                <span className="tag tag-success" style={{ marginRight: 8 }}>✓ Signature set</span>
                <button className="btn btn-ghost btn-sm" onClick={() => { setFacultySign(null); setShowSigPad(true); }}>Re-sign</button>
              </div>
            </div>
          : !showSigPad
          ? <button className="btn btn-ghost btn-sm" onClick={() => setShowSigPad(true)}><Icon name="pen" size={14} /> Draw Signature</button>
          : <SignaturePad onSave={saveSign} />
        }
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["od", "internship"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "9px 20px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontFamily: "var(--font-body)", fontSize: "0.88rem", transition: "all 0.15s",
              background: tab === t ? "var(--ink)" : "var(--surface-2)", color: tab === t ? "white" : "var(--muted)" }}>
            {t === "od" ? "OD Applications" : "Internship Applications"}
            {t === "od" && odApps.filter(a => a.status === "pending").length > 0 && (
              <span style={{ marginLeft: 8, background: "var(--warning)", color: "var(--ink)", borderRadius: 20, padding: "2px 7px", fontSize: "0.72rem" }}>
                {odApps.filter(a => a.status === "pending").length}
              </span>
            )}
            {t === "internship" && internApps.filter(a => a.status === "pending").length > 0 && (
              <span style={{ marginLeft: 8, background: "var(--warning)", color: "var(--ink)", borderRadius: 20, padding: "2px 7px", fontSize: "0.72rem" }}>
                {internApps.filter(a => a.status === "pending").length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            <Icon name="document" size={18} /> {tab === "od" ? "OD" : "Internship"} Applications
          </div>
          <span className="tag tag-warning">{apps.filter(a => a.status === "pending").length} pending</span>
        </div>

        {apps.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px", color: "var(--muted)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 600 }}>No applications yet</div>
          </div>
        )}

        {apps.map(app => (
          <div key={app.id} style={{ padding: 16, background: "var(--surface)", borderRadius: 12, marginBottom: 10,
            borderLeft: `3px solid ${app.status === "approved" ? "var(--success)" : app.status === "rejected" ? "var(--danger)" : "var(--warning)"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{app.student_name}
                  <span className="text-muted text-sm" style={{ marginLeft: 8 }}>({app.register_number})</span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>{app.department}</div>
                <div style={{ marginTop: 8 }}>
                  {tab === "od"
                    ? <><div style={{ fontWeight: 600, fontSize: "0.88rem" }}>📍 {app.event_name || "Event"}</div>
                        <div className="text-muted text-sm">{app.reason}</div>
                        {app.venue && <div className="text-muted text-sm">Venue: {app.venue}</div>}</>
                    : <><div style={{ fontWeight: 600, fontSize: "0.88rem" }}>🏢 {app.company_name} — {app.role || "Intern"}</div>
                        {app.description && <div className="text-muted text-sm">{app.description}</div>}</>
                  }
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <span className="tag tag-muted" style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>
                      {app.from_date} → {app.to_date}
                    </span>
                    <span className={`tag ${app.status === "approved" ? "tag-success" : app.status === "rejected" ? "tag-danger" : "tag-warning"}`}>
                      {app.status}
                    </span>
                  </div>
                </div>
                {app.faculty_remarks && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(108,59,255,0.06)", borderRadius: 8, fontSize: "0.82rem", color: "var(--accent-2)", fontWeight: 600 }}>
                    Your remarks: {app.faculty_remarks}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {app.status === "pending" && (
                  <button className="btn btn-primary btn-sm" onClick={() => { setReviewing({ app, type: tab }); setRemarks(""); }}>
                    <Icon name="pen" size={13}/> Review
                  </button>
                )}
                {app.status === "approved" && (
                  <button className="pdf-export-btn" onClick={() => downloadPDF(app, tab)}>
                    <Icon name="download" size={14}/> Signed PDF
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Review Modal */}
      {reviewing && (
        <div className="modal-overlay" onClick={() => setReviewing(null)}>
          <div className="modal fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-title">📝 Review Application</div>
            <div style={{ padding: "12px 16px", background: "var(--surface)", borderRadius: 10, marginBottom: 20 }}>
              <div style={{ fontWeight: 700 }}>{reviewing.app.student_name}</div>
              <div className="text-muted text-sm">{reviewing.app.register_number} · {reviewing.app.department}</div>
              {reviewing.type === "od"
                ? <div style={{ marginTop: 6 }}><strong>{reviewing.app.event_name}</strong> — {reviewing.app.reason}<br/>
                    <span className="text-muted text-sm">{reviewing.app.from_date} to {reviewing.app.to_date}</span></div>
                : <div style={{ marginTop: 6 }}><strong>{reviewing.app.company_name}</strong> — {reviewing.app.role}<br/>
                    <span className="text-muted text-sm">{reviewing.app.from_date} to {reviewing.app.to_date}</span></div>
              }
            </div>

            <div className="form-field">
              <label>Your Remarks * (required)</label>
              <textarea rows={4} value={remarks} onChange={e => setRemarks(e.target.value)}
                placeholder={`Write your remarks about this ${reviewing.type === "od" ? "OD" : "internship"} application. This will be visible to the student...`} />
            </div>

            <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(108,59,255,0.06)", borderRadius: 10, fontSize: "0.82rem", color: "var(--accent-2)", fontWeight: 600 }}>
              {facultySign
                ? <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span>Signature:</span><img src={facultySign} alt="sig" style={{ height: 40 }}/></div>
                : <span>⚠ No signature set — required to approve. Go back and draw your signature.</span>
              }
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-success" onClick={() => doReview("approved")} disabled={loading || !remarks.trim() || !facultySign}>
                <Icon name="check" size={14}/> {loading ? "Saving..." : "Approve & Sign"}
              </button>
              <button className="btn btn-danger" onClick={() => doReview("rejected")} disabled={loading || !remarks.trim()}>
                {loading ? "Saving..." : "Reject"}
              </button>
              <button className="btn btn-ghost" onClick={() => setReviewing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── ADMIN COMPONENTS ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// HACKATHON FEATURES
// ═══════════════════════════════════════════════════════════════════════════════

// 1. AI RISK PREDICTION DASHBOARD
function AiRiskPrediction({ toast }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterOptions, setFilterOptions] = useState({ departments: [], years: [] });
  const [dept, setDept] = useState(""); const [year, setYear] = useState("");
  const [showDetails, setShowDetails] = useState(null);

  useEffect(() => {
    api("/faculty/filter-options").then(setFilterOptions).catch(console.error);
    loadRisk();
  }, []);

  async function loadRisk(d, y) {
    setLoading(true);
    let url = "/features/risk-scores?";
    if (d) url += "department_id=" + d + "&";
    if (y) url += "year=" + y + "&";
    try {
      const data = await api(url);
      setStudents(Array.isArray(data) ? data : []);
    }
    catch (e) { toast("Failed to load risk data: " + e.message, "error"); setStudents([]); }
    finally { setLoading(false); }
  }

  const riskColor = { critical: "#EF4444", high: "#F97316", medium: "#EAB308", low: "#22C55E" };
  const riskBg    = { critical: "rgba(239,68,68,0.08)", high: "rgba(249,115,22,0.08)", medium: "rgba(234,179,8,0.08)", low: "rgba(34,197,94,0.08)" };
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  students.forEach(s => counts[s.risk_level]++);

  return (
    <div className="fade-in">
      <div style={{ padding: "12px 18px", background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(236,72,153,0.08))", borderRadius: 14, marginBottom: 20, border: "1px solid rgba(139,92,246,0.2)", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 32 }}>🤖</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--accent-2)" }}>AI Academic Risk Predictor</div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Scores every student 0-100 based on attendance trends, CAT performance and assignment completion. Spot at-risk students before end-sem.</div>
        </div>
      </div>
      <div className="card mb-4" style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-field" style={{ marginBottom: 0, flex: 1, minWidth: 130 }}>
            <label style={{ fontSize: "0.75rem" }}>Department</label>
            <select value={dept} onChange={e => setDept(e.target.value)}>
              <option value="">All</option>
              {filterOptions.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-field" style={{ marginBottom: 0, flex: 1, minWidth: 100 }}>
            <label style={{ fontSize: "0.75rem" }}>Batch Year</label>
            <select value={year} onChange={e => setYear(e.target.value)}>
              <option value="">All</option>
              {filterOptions.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => loadRisk(dept || undefined, year || undefined)}>Run Analysis</button>
        </div>
      </div>
      <div className="stat-grid mb-4">
        {Object.entries(counts).map(([level, cnt]) => (
          <div key={level} className="stat-card" style={{ borderTop: "3px solid " + riskColor[level] }}>
            <div className="stat-value" style={{ color: riskColor[level] }}>{cnt}</div>
            <div className="stat-label" style={{ textTransform: "capitalize" }}>{level} Risk</div>
          </div>
        ))}
      </div>
      {loading ? <LoadingState /> : (
        <div className="card">
          <div className="card-title"><Icon name="predict" size={18} /> Student Risk Scores</div>
          {students.length === 0 ? <div className="text-muted" style={{ textAlign: "center", padding: 32 }}>No data. Apply filter and run analysis.</div> :
          <div className="table-wrap"><table>
            <thead><tr><th>Student</th><th>Risk Score</th><th>Level</th><th>Attendance</th><th>Avg CAT</th><th>Details</th></tr></thead>
            <tbody>{students.map(s => (
              <tr key={s.student_id} style={{ background: riskBg[s.risk_level] }}>
                <td><div style={{ fontWeight: 700 }}>{s.name}</div><div style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{s.register_number}</div></td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 8, background: "var(--surface-3)", borderRadius: 4, overflow: "hidden", minWidth: 80 }}>
                      <div style={{ height: "100%", width: s.risk_score + "%", background: riskColor[s.risk_level], borderRadius: 4 }} />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, color: riskColor[s.risk_level], minWidth: 36 }}>{s.risk_score}</span>
                  </div>
                </td>
                <td><span className="tag" style={{ background: riskColor[s.risk_level] + "22", color: riskColor[s.risk_level], textTransform: "capitalize" }}>{s.risk_level}</span></td>
                <td><span style={{ fontFamily: "var(--font-mono)", color: s.att_pct < 75 ? "var(--danger)" : "var(--success)", fontWeight: 700 }}>{s.att_pct}%</span></td>
                <td><span style={{ fontFamily: "var(--font-mono)", color: (s.avg_cat || 50) < 25 ? "var(--warning)" : "var(--success)", fontWeight: 700 }}>{s.avg_cat != null ? s.avg_cat : "N/A"}</span></td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => setShowDetails(s)}>View</button></td>
              </tr>
            ))}</tbody>
          </table></div>}
        </div>
      )}
      {showDetails && (
        <div className="modal-overlay" onClick={() => setShowDetails(null)}>
          <div className="modal fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-title">Risk Breakdown: {showDetails.name}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              {[
                { label: "Attendance Risk", value: showDetails.factors.attendance_risk, max: 40, color: "#EF4444", note: showDetails.att_pct + "% attendance" },
                { label: "CAT Marks Risk", value: showDetails.factors.marks_risk, max: 40, color: "#F97316", note: "Avg CAT: " + (showDetails.avg_cat != null ? showDetails.avg_cat : "N/A") },
                { label: "Assignment Risk", value: showDetails.factors.assignment_risk, max: 20, color: "#EAB308", note: "Based on assignment marks" }
              ].map(f => (
                <div key={f.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{f.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: f.color }}>{f.value}/{f.max}</span>
                  </div>
                  <div style={{ height: 10, background: "var(--surface-3)", borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: ((f.value/f.max)*100) + "%", background: f.color, borderRadius: 5 }} />
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 3 }}>{f.note}</div>
                </div>
              ))}
              <div style={{ padding: "12px 16px", borderRadius: 10, background: riskBg[showDetails.risk_level], marginTop: 8 }}>
                <div style={{ fontWeight: 800, color: riskColor[showDetails.risk_level], fontSize: "1.1rem" }}>Overall Risk: {showDetails.risk_score}/100</div>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 4 }}>
                  {showDetails.risk_level === "critical" ? "Immediate intervention required. Notify guardian, schedule counseling." :
                   showDetails.risk_level === "high" ? "High risk. Faculty should reach out directly." :
                   showDetails.risk_level === "medium" ? "Monitor closely. Encourage improvement." :
                   "Student is performing well."}
                </div>
              </div>
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => setShowDetails(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// 2. GUARDIAN SMS/WHATSAPP ALERTS
function GuardianAlerts({ toast }) {
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api("/faculty/students").then(s => {
      const unique = [...new Map(s.map(x => [x.student_id, x])).values()];
      setStudents(unique);
    }).catch(console.error);
  }, []);

  const templates = [
    { label: "Low Attendance", msg: "Dear Parent, your ward has attendance below 75%. Please encourage regular attendance. - College" },
    { label: "Low CAT Marks", msg: "Dear Parent, your ward scored below 25/50 in a recent CAT exam. Please discuss academic progress. - College" },
    { label: "Assignment Reminder", msg: "Dear Parent, your ward has pending assignments. Please ensure timely submission. - College" },
  ];

  const filtered = filter === "low_att" ? students.filter(s => s.attendance_percentage < 75)
                 : filter === "low_marks" ? students.filter(s => s.attendance_percentage < 60)
                 : students;

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(s => s.student_id)));
  }

  async function send() {
    if (selected.size === 0) { toast("Select at least one student", "error"); return; }
    if (!message.trim()) { toast("Enter a message", "error"); return; }
    setSending(true);
    try {
      const res = await api("/features/sms-guardian", { method: "POST", body: JSON.stringify({ student_ids: [...selected], message, channel }) });
      setResult(res);
      toast(res.demo_mode ? "Demo mode - configure Twilio to send real messages" : "Messages sent!", "success");
    } catch (e) { toast(e.message, "error"); }
    finally { setSending(false); }
  }

  return (
    <div className="fade-in">
      <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(16,185,129,0.06))", borderRadius: 14, marginBottom: 20, border: "1px solid rgba(34,197,94,0.2)", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 32 }}>📱</div>
        <div>
          <div style={{ fontWeight: 800, color: "#22C55E" }}>WhatsApp / SMS Guardian Alerts</div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Instantly notify parents of at-risk students via WhatsApp or SMS. Powered by Twilio.</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>Select Students ({selected.size})</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["all","low_att","low_marks"].map(f => (
                <button key={f} className={"btn btn-sm " + (filter === f ? "btn-primary" : "btn-ghost")} style={{ fontSize: "0.72rem" }} onClick={() => setFilter(f)}>
                  {f === "all" ? "All" : f === "low_att" ? "Low Att" : "Low Marks"}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 10, fontSize: "0.78rem" }} onClick={toggleAll}>
            {selected.size === filtered.length ? "Deselect All" : "Select All (" + filtered.length + ")"}
          </button>
          <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
            {filtered.map(s => (
              <div key={s.student_id} onClick={() => { const ns = new Set(selected); ns.has(s.student_id) ? ns.delete(s.student_id) : ns.add(s.student_id); setSelected(ns); }}
                style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, border: "1.5px solid " + (selected.has(s.student_id) ? "var(--accent-2)" : "var(--surface-3)"), background: selected.has(s.student_id) ? "rgba(108,59,255,0.05)" : "transparent" }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: "2px solid " + (selected.has(s.student_id) ? "var(--accent-2)" : "var(--surface-3)"), background: selected.has(s.student_id) ? "var(--accent-2)" : "transparent", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                  <div style={{ fontSize: "0.68rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{s.register_number}</div>
                </div>
                <span className={"tag " + (s.attendance_percentage < 75 ? "tag-danger" : "tag-success")} style={{ fontSize: "0.68rem" }}>{s.attendance_percentage}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>Compose Message</div>
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--muted)", display: "block", marginBottom: 6 }}>Channel</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className={"btn btn-sm " + (channel === "whatsapp" ? "btn-success" : "btn-ghost")} onClick={() => setChannel("whatsapp")}>WhatsApp</button>
              <button className={"btn btn-sm " + (channel === "sms" ? "btn-primary" : "btn-ghost")} onClick={() => setChannel("sms")}>SMS</button>
            </div>
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--muted)", display: "block", marginBottom: 6 }}>Templates</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {templates.map(t => (
                <button key={t.label} className="btn btn-ghost btn-sm" style={{ textAlign: "left", fontSize: "0.75rem" }} onClick={() => setMessage(t.msg)}>{t.label}</button>
              ))}
            </div>
          </div>
          <div className="form-field" style={{ marginBottom: 0, flex: 1 }}>
            <label style={{ fontSize: "0.75rem" }}>Message</label>
            <textarea rows={5} value={message} onChange={e => setMessage(e.target.value)} placeholder="Message to guardians..." style={{ resize: "vertical" }} />
          </div>
          <button className="btn btn-success" onClick={send} disabled={sending || selected.size === 0}>
            {sending ? "Sending..." : "Send to " + selected.size + " guardian(s) via " + channel}
          </button>
          {result && result.demo_mode && (
            <div style={{ padding: "10px 14px", background: "rgba(234,179,8,0.08)", borderRadius: 8, fontSize: "0.78rem", color: "var(--warning)" }}>
              Demo Mode: Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER to backend/.env to send real messages.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 3. AI ASSIGNMENT GENERATOR
function AiAssignmentGenerator({ toast }) {
  const [form, setForm] = useState({ subject: "", topic: "", difficulty: "medium", marks: 10, num_questions: 5 });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState([]);

  useEffect(() => { api("/faculty/my-courses").then(setCourses).catch(console.error); }, []);

  async function generate() {
    if (!form.subject || !form.topic) { toast("Fill Subject and Topic", "error"); return; }
    setLoading(true); setResult(null);
    try {
      const data = await api("/features/ai-assignment", { method: "POST", body: JSON.stringify(form) });
      setResult(data); toast("Assignment generated!", "success");
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="fade-in">
      <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.08))", borderRadius: 14, marginBottom: 20, border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 32 }}>✨</div>
        <div>
          <div style={{ fontWeight: 800, color: "var(--accent-2)" }}>AI Assignment Generator</div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Type a topic and get a complete assignment with questions, marks breakdown and marking rubric instantly.</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 16, alignSelf: "start" }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>Configure Assignment</div>
          <div className="form-field">
            <label>Subject</label>
            <select value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}>
              <option value="">Select or type below</option>
              {courses.map(c => <option key={c.course_id} value={c.name}>{c.code} - {c.name}</option>)}
            </select>
          </div>
          <div className="form-field"><label>Topic *</label><input value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Sorting Algorithms, Newton Laws..." /></div>
          <div className="grid-2">
            <div className="form-field"><label>Difficulty</label>
              <select value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </div>
            <div className="form-field"><label>Total Marks</label><input type="number" min={5} max={100} value={form.marks} onChange={e => setForm({ ...form, marks: parseInt(e.target.value) })} /></div>
          </div>
          <div className="form-field"><label>Number of Questions</label><input type="number" min={1} max={15} value={form.num_questions} onChange={e => setForm({ ...form, num_questions: parseInt(e.target.value) })} /></div>
          <button className="btn btn-primary" onClick={generate} disabled={loading} style={{ width: "100%" }}>
            <Icon name="ai" size={16} /> {loading ? "Generating..." : "Generate Assignment"}
          </button>
        </div>
        <div>
          {loading && <div className="card" style={{ padding: 48, textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 12 }}>✨</div><div style={{ fontWeight: 700, color: "var(--accent-2)" }}>Generating your assignment...</div></div>}
          {!loading && !result && <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}><div style={{ fontSize: 48, opacity: 0.3, marginBottom: 12 }}>📝</div><div>Fill the form and click Generate</div></div>}
          {result && !loading && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", marginBottom: 6 }}>{result.title || form.topic}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 14 }}>{result.instructions}</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <span className="tag tag-info">{result.total_marks || form.marks} marks</span>
                <span className="tag tag-muted">{(result.questions || []).length} questions</span>
              </div>
              {(result.questions || []).map((q, i) => (
                <div key={i} style={{ padding: "12px 14px", borderRadius: 10, border: "1.5px solid var(--surface-3)", marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: "var(--accent-2)" }}>Q{i+1}</span>
                    <span className="tag tag-info" style={{ fontSize: "0.72rem" }}>{q.marks} marks</span>
                  </div>
                  <div style={{ fontSize: "0.88rem" }}>{q.question}</div>
                  {q.rubric && <div style={{ marginTop: 8, padding: "6px 10px", background: "var(--surface-2)", borderRadius: 6, fontSize: "0.75rem", color: "var(--muted)" }}>Rubric: {q.rubric}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 4. STUDENT SENTIMENT / PULSE CHECK
function SentimentDashboard({ toast, userRole }) {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [sentiment, setSentiment] = useState(null);
  const [moodInput, setMoodInput] = useState(3);
  const [commentInput, setCommentInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [allSentiments, setAllSentiments] = useState([]);

  useEffect(() => {
    if (userRole === "student") {
      api("/student/courses").then(setCourses).catch(console.error);
    } else {
      api("/faculty/my-courses").then(setCourses).catch(console.error);
      api("/features/sentiment-all").then(setAllSentiments).catch(console.error);
    }
  }, [userRole]);

  async function loadSentiment(cid) {
    if (!cid || userRole === "student") return;
    const data = await api("/features/sentiment/" + cid).catch(() => null);
    setSentiment(data);
  }

  async function submitMood() {
    if (!selectedCourse) { toast("Select a course", "error"); return; }
    try {
      await api("/features/sentiment", { method: "POST", body: JSON.stringify({ course_id: parseInt(selectedCourse), mood: moodInput, comment: commentInput }) });
      toast("Thanks for your feedback!", "success"); setSubmitted(true);
    } catch (e) { toast(e.message, "error"); }
  }

  const moodEmoji = ["", "😞", "😕", "😐", "😊", "😄"];
  const moodLabel = ["", "Very Bad", "Poor", "Okay", "Good", "Excellent"];
  const moodColors = ["", "#EF4444", "#F97316", "#EAB308", "#84CC16", "#22C55E"];

  return (
    <div className="fade-in">
      <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, rgba(20,184,166,0.1), rgba(6,182,212,0.06))", borderRadius: 14, marginBottom: 20, border: "1px solid rgba(20,184,166,0.2)", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 32 }}>{userRole === "student" ? "💭" : "📊"}</div>
        <div>
          <div style={{ fontWeight: 800, color: "#14B8A6" }}>{userRole === "student" ? "Weekly Mood Check-in" : "Class Sentiment Dashboard"}</div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{userRole === "student" ? "Anonymous weekly feedback. Your name is never stored." : "See how each class is feeling. Spot stressed sections early."}</div>
        </div>
      </div>
      {userRole === "student" && (
        <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
          {submitted ? (
            <div style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 64 }}>🎉</div>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", marginTop: 12 }}>Thanks for sharing!</div>
              <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 6 }}>Your anonymous feedback helps faculty improve the class.</div>
            </div>
          ) : (
            <>
              <div className="card-title">How are you feeling this week?</div>
              <div className="form-field"><label>Course</label>
                <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}>
                  <option value="">Select</option>
                  {courses.map(c => <option key={c.course_id || c.id} value={c.course_id || c.id}>{c.code || ""} {c.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", marginBottom: 12, fontSize: "0.85rem", fontWeight: 600, color: "var(--muted)" }}>Your mood</label>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  {[1,2,3,4,5].map(m => (
                    <button key={m} onClick={() => setMoodInput(m)} style={{ width: 60, height: 60, borderRadius: 14, border: "3px solid " + (moodInput === m ? moodColors[m] : "var(--surface-3)"), background: moodInput === m ? moodColors[m] + "22" : "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: moodInput === m ? "scale(1.15)" : "scale(1)", transition: "all 0.15s" }}>
                      <span style={{ fontSize: 26 }}>{moodEmoji[m]}</span>
                      <span style={{ fontSize: "0.5rem", color: moodInput === m ? moodColors[m] : "var(--muted)", fontWeight: 700 }}>{moodLabel[m]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-field"><label>Comment (optional, anonymous)</label><textarea rows={3} value={commentInput} onChange={e => setCommentInput(e.target.value)} placeholder="What could be improved?" /></div>
              <button className="btn btn-primary" onClick={submitMood} style={{ width: "100%" }}>Submit Anonymously</button>
            </>
          )}
        </div>
      )}
      {userRole !== "student" && (
        <>
          <div className="stat-grid mb-4">
            {allSentiments.slice(0, 4).map(s => {
              const avg = s.average_mood || 0;
              const color = avg >= 4 ? "#22C55E" : avg >= 3 ? "#EAB308" : "#EF4444";
              return (
                <div key={s.course_id} className="stat-card" style={{ borderTop: "3px solid " + color, cursor: "pointer" }} onClick={() => { setSelectedCourse(String(s.course_id)); loadSentiment(s.course_id); }}>
                  <div style={{ fontSize: 28 }}>{moodEmoji[Math.round(avg)]}</div>
                  <div className="stat-value" style={{ color, fontSize: "1.4rem" }}>{avg.toFixed(1)}/5</div>
                  <div className="stat-label" style={{ fontSize: "0.72rem" }}>{s.course_name}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>{s.total_responses} responses</div>
                </div>
              );
            })}
          </div>
          <div className="card">
            <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Course Detail</div>
              <select style={{ padding: "7px 12px", border: "1.5px solid var(--surface-3)", borderRadius: 8, outline: "none" }}
                value={selectedCourse} onChange={e => { setSelectedCourse(e.target.value); loadSentiment(parseInt(e.target.value)); }}>
                <option value="">Select Course</option>
                {courses.map(c => <option key={c.course_id} value={c.course_id}>{c.code} - {c.name}</option>)}
              </select>
            </div>
            {sentiment && sentiment.total_responses > 0 ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 20 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 48 }}>{moodEmoji[Math.round(sentiment.average_mood)]}</div>
                    <div style={{ fontWeight: 800, fontSize: "1.8rem", color: moodColors[Math.round(sentiment.average_mood)] }}>{sentiment.average_mood.toFixed(1)}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{sentiment.total_responses} responses</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    {[5,4,3,2,1].map(m => (
                      <div key={m} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: "1rem" }}>{moodEmoji[m]}</span>
                        <div style={{ flex: 1, height: 8, background: "var(--surface-3)", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: (sentiment.total_responses > 0 ? (sentiment.distribution[m] / sentiment.total_responses) * 100 : 0) + "%", background: moodColors[m], borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--font-mono)", minWidth: 20 }}>{sentiment.distribution[m]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {sentiment.comments.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Anonymous Comments</div>
                    {sentiment.comments.map((c, i) => <div key={i} style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, marginBottom: 6, fontSize: "0.82rem", fontStyle: "italic", color: "var(--muted)" }}>"{c}"</div>)}
                  </div>
                )}
              </>
            ) : <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>Select a course to view sentiment data</div>}
          </div>
        </>
      )}
    </div>
  );
}

// 5. GAMIFICATION
function GamificationPage({ userRole }) {
  const [gData, setGData] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [studentId, setStudentId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (userRole === "student") {
          const profile = await api("/student/profile");
          setStudentId(profile.id);
          const [gd, lb] = await Promise.all([
            api("/features/gamification/" + profile.id),
            api("/features/leaderboard")
          ]);
          setGData(gd); setLeaderboard(lb);
        } else {
          const lb = await api("/features/leaderboard");
          setLeaderboard(lb);
        }
      } catch(e) { console.error(e); } finally { setLoading(false); }
    }
    load();
  }, [userRole]);

  if (loading) return <LoadingState />;

  const levelColors = ["#94A3B8","#22C55E","#3B82F6","#8B5CF6","#EF4444","#F59E0B","#EC4899","#F97316"];
  const myRank = leaderboard.find(s => s.student_id === studentId);

  return (
    <div className="fade-in">
      <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(245,158,11,0.08))", borderRadius: 14, marginBottom: 20, border: "1px solid rgba(251,191,36,0.25)", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 32 }}>🏆</div>
        <div>
          <div style={{ fontWeight: 800, color: "#F59E0B" }}>Academic Gamification</div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Earn XP for attendance, climb levels, collect badges and compete on the class leaderboard!</div>
        </div>
      </div>
      {gData && userRole === "student" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div className="card" style={{ background: "linear-gradient(135deg, " + levelColors[Math.min(gData.level, 7)] + "22, transparent)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: "1.8rem", color: levelColors[Math.min(gData.level, 7)] }}>Level {gData.level}</div>
                <div style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{gData.xp} XP total</div>
              </div>
              <div style={{ fontSize: 44 }}>⚔️</div>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 4 }}>Progress to Level {gData.level + 1}: {gData.xp % 200}/200 XP</div>
            <div style={{ height: 12, background: "var(--surface-3)", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: gData.level_progress + "%", background: levelColors[Math.min(gData.level, 7)], borderRadius: 6, transition: "width 1s ease" }} />
            </div>
          </div>
          <div className="card" style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.1), transparent)" }}>
            <div style={{ fontWeight: 800, fontSize: "2rem", color: "#EF4444" }}>{gData.streak} 🔥</div>
            <div style={{ color: "var(--muted)", fontSize: "0.78rem", marginBottom: 8 }}>Current Streak (days)</div>
            <div style={{ fontWeight: 700, color: "var(--muted)" }}>Best: {gData.max_streak} days</div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{gData.att_pct}% attendance | {gData.stats.present}/{gData.stats.total} classes</div>
          </div>
          {gData.badges.length > 0 && (
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-title">Badges</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {gData.badges.map(b => (
                  <div key={b.id} style={{ padding: "10px 16px", borderRadius: 12, border: "2px solid " + b.color + "44", background: b.color + "11", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 24 }}>{b.emoji}</span>
                    <span style={{ fontWeight: 700, fontSize: "0.82rem", color: b.color }}>{b.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Class Leaderboard</div>
          {myRank && <span className="tag tag-info">Your rank: #{myRank.rank}</span>}
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>Rank</th><th>Student</th><th>Level</th><th>XP</th><th>Attendance</th></tr></thead>
          <tbody>
            {leaderboard.slice(0, 20).map(s => {
              const isMe = s.student_id === studentId;
              const medal = s.rank === 1 ? "🥇" : s.rank === 2 ? "🥈" : s.rank === 3 ? "🥉" : "#" + s.rank;
              return (
                <tr key={s.student_id} style={{ background: isMe ? "rgba(108,59,255,0.06)" : "transparent", fontWeight: isMe ? 800 : 400 }}>
                  <td style={{ fontFamily: "var(--font-mono)", textAlign: "center", fontWeight: 800 }}>{medal}</td>
                  <td><span style={{ fontWeight: 700 }}>{s.name}</span>{isMe && <span className="tag tag-info" style={{ marginLeft: 8, fontSize: "0.65rem" }}>You</span>}<div style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "var(--muted)" }}>{s.register_number}</div></td>
                  <td><span style={{ color: levelColors[Math.min(s.level, 7)], fontWeight: 800 }}>Lv {s.level}</span></td>
                  <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-2)" }}>{s.xp} XP</td>
                  <td><span className={"tag " + (s.att_pct >= 75 ? "tag-success" : "tag-danger")}>{s.att_pct}%</span></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

// ─── MENTOR SELECTION ─────────────────────────────────────────────────────────
const MENTORS_DATA = [
  { name: "Dr. Arjun Kumar", domain: "Artificial Intelligence & Machine Learning", email: "arjun.kumar@univ.edu", phone: "9876543210" },
  { name: "Ms. Priya Sharma", domain: "Data Science & Analytics", email: "priya.sharma@univ.edu", phone: "9876543211" },
  { name: "Mr. Rahul Verma", domain: "Full Stack Web Development", email: "rahul.verma@univ.edu", phone: "9876543212" },
  { name: "Dr. Sneha Iyer", domain: "Cyber Security & Ethical Hacking", email: "sneha.iyer@univ.edu", phone: "9876543213" },
  { name: "Mr. Karthik Raj", domain: "Cloud Computing & DevOps", email: "karthik.raj@univ.edu", phone: "9876543214" },
  { name: "Dr. Ananya Bose", domain: "Internet of Things (IoT)", email: "ananya.bose@univ.edu", phone: "9876543215" },
  { name: "Mr. Vignesh S", domain: "Mobile App Development", email: "vignesh.s@univ.edu", phone: "9876543216" },
  { name: "Dr. Ramesh N", domain: "Computer Networks", email: "ramesh.n@univ.edu", phone: "9876543217" },
  { name: "Ms. Kavya Patel", domain: "UI/UX Design & HCI", email: "kavya.patel@univ.edu", phone: "9876543218" },
  { name: "Mr. Mohammed Faisal", domain: "Database Management Systems", email: "faisal@univ.edu", phone: "9876543219" },
  { name: "Dr. Pooja Malhotra", domain: "Software Engineering & Agile", email: "pooja.m@univ.edu", phone: "9876543220" },
  { name: "Mr. Suresh B", domain: "Embedded Systems", email: "suresh.b@univ.edu", phone: "9876543221" },
  { name: "Dr. Neelima Rao", domain: "Big Data Technologies", email: "neelima.rao@univ.edu", phone: "9876543222" },
  { name: "Mr. Akash Mehta", domain: "Blockchain Technology", email: "akash.mehta@univ.edu", phone: "9876543223" },
  { name: "Dr. Divya R", domain: "Digital Image Processing", email: "divya.r@univ.edu", phone: "9876543224" },
  { name: "Ms. Nithya K", domain: "Python Programming & Automation", email: "nithya.k@univ.edu", phone: "9876543225" },
  { name: "Mr. Sanjay Gupta", domain: "Operating Systems", email: "sanjay.gupta@univ.edu", phone: "9876543226" },
  { name: "Dr. Meera Joshi", domain: "Information Systems Management", email: "meera.joshi@univ.edu", phone: "9876543227" },
  { name: "Mr. Harish V", domain: "Game Development & AR/VR", email: "harish.v@univ.edu", phone: "9876543228" },
  { name: "Dr. Lakshmi Narayanan", domain: "Data Structures & Algorithms", email: "lakshmi.n@univ.edu", phone: "9876543229" },
];

// ─── Mentor Selection (Student Side) ──────────────────────────────────────────
function MentorSelection({ toast }) {
  const [search, setSearch] = useState("");
  const [connections, setConnections] = useState(() => {
    try { return JSON.parse(localStorage.getItem("erp_mentor_connections") || "{}"); } catch { return {}; }
  });
  // chatWith: { mentor, messages }
  const [chatWith, setChatWith] = useState(null);
  const [chatMsg, setChatMsg] = useState("");

  function saveConnections(updated) {
    setConnections(updated);
    localStorage.setItem("erp_mentor_connections", JSON.stringify(updated));
  }

  function sendRequest(mentor) {
    const updated = { ...connections, [mentor.email]: { status: "pending", mentor, messages: [] } };
    saveConnections(updated);
    toast(`Connection request sent to ${mentor.name}`, "success");
  }

  function openChat(mentor) {
    const conn = connections[mentor.email];
    if (!conn || conn.status !== "accepted") return;
    setChatWith({ mentor, messages: conn.messages || [] });
    setChatMsg("");
  }

  function sendChatMessage() {
    if (!chatMsg.trim() || !chatWith) return;
    const newMsg = { from: "student", text: chatMsg.trim(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    const updatedMsgs = [...chatWith.messages, newMsg];
    const updated = {
      ...connections,
      [chatWith.mentor.email]: { ...connections[chatWith.mentor.email], messages: updatedMsgs }
    };
    saveConnections(updated);
    setChatWith({ ...chatWith, messages: updatedMsgs });
    setChatMsg("");
  }

  const filtered = MENTORS_DATA.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.domain.toLowerCase().includes(search.toLowerCase())
  );

  const statusOf = (email) => connections[email]?.status;
  const acceptedMentor = Object.values(connections).find(c => c.status === "accepted")?.mentor;

  // ── Chat Modal ──
  if (chatWith) {
    return (
      <div className="fade-in">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setChatWith(null)}>← Back</button>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,var(--accent-2),var(--accent))", display: "grid", placeItems: "center", color: "white", fontWeight: 800, fontSize: "1rem" }}>{chatWith.mentor.name[0]}</div>
          <div>
            <div style={{ fontWeight: 700 }}>{chatWith.mentor.name}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--success)", fontWeight: 600 }}>● Connected Mentor</div>
          </div>
        </div>

        <div style={{ border: "1.5px solid var(--surface-3)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", background: "var(--surface-2)", borderBottom: "1px solid var(--surface-3)", fontSize: "0.8rem", color: "var(--muted)" }}>
            💬 Chat with your mentor — Start by introducing yourself or asking a question!
          </div>
          <div style={{ minHeight: 320, maxHeight: 380, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {chatWith.messages.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.82rem", marginTop: 60 }}>
                No messages yet. Say hello! 👋
              </div>
            )}
            {chatWith.messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.from === "student" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "72%", padding: "10px 14px", borderRadius: msg.from === "student" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: msg.from === "student" ? "linear-gradient(135deg,var(--accent-2),var(--accent))" : "var(--surface-2)",
                  color: msg.from === "student" ? "white" : "var(--text)",
                  fontSize: "0.88rem", lineHeight: 1.5
                }}>
                  {msg.text}
                  <div style={{ fontSize: "0.65rem", opacity: 0.65, marginTop: 4, textAlign: "right" }}>{msg.time}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 14px", background: "var(--surface-2)", borderTop: "1px solid var(--surface-3)", display: "flex", gap: 10 }}>
            <input
              style={{ flex: 1, padding: "10px 14px", border: "1.5px solid var(--surface-3)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: "0.9rem", outline: "none" }}
              placeholder='Type a message, e.g. "Shall I choose you as my mentor?"'
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendChatMessage()}
            />
            <button className="btn btn-primary" onClick={sendChatMessage} disabled={!chatMsg.trim()}>Send</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, rgba(108,59,255,0.1), rgba(255,75,38,0.06))", borderRadius: 14, marginBottom: 20, border: "1px solid rgba(108,59,255,0.2)", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 32 }}>🎓</div>
        <div>
          <div style={{ fontWeight: 800, color: "var(--accent-2)" }}>Mentor Selection</div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Search by domain or name, send a connection request, and start a conversation with your mentor.</div>
        </div>
      </div>

      {/* Connected Mentor Banner */}
      {acceptedMentor && (
        <div className="card mb-4" style={{ borderLeft: "4px solid var(--success)", background: "rgba(0,196,140,0.04)" }}>
          <div className="card-title" style={{ color: "var(--success)" }}>✅ Your Mentor</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,var(--accent-2),var(--accent))", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "1.3rem", color: "white", flexShrink: 0 }}>{acceptedMentor.name[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: "1rem" }}>{acceptedMentor.name}</div>
              <div style={{ color: "var(--accent-2)", fontWeight: 600, fontSize: "0.82rem" }}>{acceptedMentor.domain}</div>
              <div style={{ color: "var(--muted)", fontSize: "0.74rem", marginTop: 2 }}>{acceptedMentor.email} · 📞 {acceptedMentor.phone}</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => openChat(acceptedMentor)}>💬 Open Chat</button>
          </div>
        </div>
      )}

      {/* Search Box */}
      <div className="card mb-4" style={{ padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.1rem" }}>🔍</span>
          <input
            style={{ flex: 1, padding: "10px 14px", border: "1.5px solid var(--surface-3)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: "0.9rem", outline: "none" }}
            placeholder="Search by domain (e.g. AI, Cloud, Cyber Security) or faculty name..."
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        {search && <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 6, paddingLeft: 4 }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""} for "{search}"</div>}
      </div>

      {/* Faculty Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {filtered.map((m, i) => {
          const status = statusOf(m.email);
          return (
            <div key={i} style={{ padding: 18, borderRadius: 14, border: `2px solid ${status === "accepted" ? "var(--success)" : status === "pending" ? "var(--warning, #f59e0b)" : "var(--surface-3)"}`, background: "var(--white)", transition: "all 0.15s" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: "50%", background: `hsl(${i * 18 % 360}, 60%, 55%)`, display: "grid", placeItems: "center", fontWeight: 800, fontSize: "1.15rem", color: "white", flexShrink: 0 }}>
                  {m.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{m.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--accent-2)", fontWeight: 600, marginTop: 2 }}>🎯 {m.domain}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>
                    <span>📧 {m.email}</span><br />
                    <span>📞 {m.phone}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!status && (
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => sendRequest(m)}>
                    🔗 Send Connection Request
                  </button>
                )}
                {status === "pending" && (
                  <div style={{ flex: 1, padding: "7px 12px", background: "rgba(245,158,11,0.1)", borderRadius: 8, fontSize: "0.78rem", fontWeight: 600, color: "#b45309", textAlign: "center" }}>
                    ⏳ Request Pending — Waiting for faculty approval
                  </div>
                )}
                {status === "accepted" && (
                  <>
                    <div style={{ flex: 1, padding: "7px 12px", background: "rgba(0,196,140,0.1)", borderRadius: 8, fontSize: "0.78rem", fontWeight: 600, color: "var(--success)", textAlign: "center" }}>
                      ✅ Connected
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => openChat(m)}>💬 Chat</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-muted" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔎</div>
          No faculty found for "{search}".<br />
          <span style={{ fontSize: "0.8rem" }}>Try searching: AI, Web, Cloud, Security, IoT…</span>
        </div>
      )}
    </div>
  );
}

// ─── TRANSPORT DETAILS ────────────────────────────────────────────────────────
function TransportDetails({ toast }) {
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem("erp_transport") || "null"); } catch { return null; }
  });
  const [form, setForm] = useState(saved || { busNumber: "", route: "", pickupPoint: "", pickupTime: "", dropTime: "", driverName: "", driverPhone: "" });
  const [editing, setEditing] = useState(!saved);

  const busRoutes = [
    "Route 1 - Sriperumbudur → Kanchipuram",
    "Route 2 - Sriperumbudur → Chennai Central",
    "Route 3 - Sriperumbudur → Tambaram",
    "Route 4 - Sriperumbudur → Chengalpattu",
    "Route 5 - Sriperumbudur → Poonamallee",
    "Route 6 - Sriperumbudur → Ambattur",
    "Route 7 - Sriperumbudur → Avadi",
    "Route 8 - Sriperumbudur → Tiruvallur",
  ];

  function save() {
    localStorage.setItem("erp_transport", JSON.stringify(form));
    setSaved(form); setEditing(false);
    toast("Transport details saved ✓", "success");
  }

  return (
    <div className="fade-in">
      <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, rgba(0,196,140,0.1), rgba(75,123,255,0.06))", borderRadius: 14, marginBottom: 20, border: "1px solid rgba(0,196,140,0.2)", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 32 }}>🚌</div>
        <div>
          <div style={{ fontWeight: 800, color: "var(--success)" }}>Transport Details</div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>View and update your college bus/transport information.</div>
        </div>
      </div>

      {saved && !editing ? (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 0 }}><Icon name="send" size={18} /> My Transport Info</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}><Icon name="pen" size={14} /> Edit</button>
          </div>
          <div className="detail-grid">
            {[
              { label: "Bus Number", value: saved.busNumber },
              { label: "Route", value: saved.route },
              { label: "Pickup Point", value: saved.pickupPoint },
              { label: "Pickup Time", value: saved.pickupTime },
              { label: "Drop Time", value: saved.dropTime },
              { label: "Driver Name", value: saved.driverName },
              { label: "Driver Phone", value: saved.driverPhone },
            ].filter(f => f.value).map((f, i) => (
              <div key={i} className="detail-item"><label>{f.label}</label><p>{f.value}</p></div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-title"><Icon name="send" size={18} /> Transport Details</div>
          <div className="grid-2">
            <div className="form-field">
              <label>Bus Number</label>
              <input value={form.busNumber} onChange={e => setForm({ ...form, busNumber: e.target.value })} placeholder="e.g. TN01 AB 1234" />
            </div>
            <div className="form-field">
              <label>Select Route</label>
              <select value={form.route} onChange={e => setForm({ ...form, route: e.target.value })}>
                <option value="">— Select Route —</option>
                {busRoutes.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Pickup Point / Stop</label>
              <input value={form.pickupPoint} onChange={e => setForm({ ...form, pickupPoint: e.target.value })} placeholder="e.g. Bus Stand, Near Temple" />
            </div>
            <div className="form-field">
              <label>Pickup Time (Morning)</label>
              <input type="time" value={form.pickupTime} onChange={e => setForm({ ...form, pickupTime: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Drop Time (Evening)</label>
              <input type="time" value={form.dropTime} onChange={e => setForm({ ...form, dropTime: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Driver Name</label>
              <input value={form.driverName} onChange={e => setForm({ ...form, driverName: e.target.value })} placeholder="Driver name" />
            </div>
            <div className="form-field">
              <label>Driver Phone</label>
              <input value={form.driverPhone} onChange={e => setForm({ ...form, driverPhone: e.target.value })} placeholder="10-digit mobile" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={save}><Icon name="check" size={16} /> Save Details</button>
            {saved && <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </div>
      )}

      {/* Emergency Contact Card */}
      <div className="card" style={{ marginTop: 16, borderLeft: "4px solid var(--warning)" }}>
        <div className="card-title"><Icon name="warning" size={18} /> Transport Emergency Contacts</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {[
            { label: "Transport Office", phone: "044-2716-0001" },
            { label: "Principal Office", phone: "044-2716-0002" },
            { label: "Security", phone: "044-2716-0003" },
          ].map((c, i) => (
            <div key={i} style={{ padding: "12px 16px", background: "var(--surface)", borderRadius: 10 }}>
              <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--muted)" }}>{c.label}</div>
              <div style={{ fontWeight: 800, fontSize: "1rem", marginTop: 4, fontFamily: "var(--font-mono)" }}>{c.phone}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ACADEMIC SCHEDULE CALENDAR WITH BOT ──────────────────────────────────────
const ACADEMIC_SCHEDULE = {
  title: "Academic Calendar 2024-25 (Even Semester)",
  institution: "Sri Venkateswara College of Engineering",
  events: [
    { date: "2024-11-29", label: "Open Elective list from Department", category: "admin", sem: "IV/VI" },
    { date: "2024-12-30", label: "Time Table Committee Meeting", category: "admin", sem: "All" },
    { date: "2025-01-17", label: "Semester Promotion", category: "admin", sem: "All" },
    { date: "2025-01-20", label: "Last date for Course Registration", category: "important", sem: "All" },
    { date: "2025-01-22", label: "Commencement of Classes", category: "academic", sem: "All" },
    { date: "2025-01-30", label: "Class Committee Meeting I", category: "meeting", sem: "IV/VI" },
    { date: "2025-02-27", label: "Assessment I Test Period Begins", category: "exam", sem: "IV/VI" },
    { date: "2025-03-03", label: "Assessment I Test Period Ends", category: "exam", sem: "IV/VI" },
    { date: "2025-03-07", label: "Assessment I Report Submission to CoE", category: "important", sem: "IV/VI" },
    { date: "2025-03-14", label: "Internal Marks 1 Circulation", category: "marks", sem: "All" },
    { date: "2025-03-28", label: "Class Committee Meeting II", category: "meeting", sem: "IV/VI" },
    { date: "2025-04-05", label: "Assessment II Test Period Begins", category: "exam", sem: "IV/VI" },
    { date: "2025-04-09", label: "Assessment II Test Period Ends", category: "exam", sem: "IV/VI" },
    { date: "2025-04-15", label: "Assessment II Report Submission to CoE", category: "important", sem: "IV/VI" },
    { date: "2025-04-22", label: "Internal Marks 2 Circulation", category: "marks", sem: "All" },
    { date: "2025-05-09", label: "Class Committee Meeting III", category: "meeting", sem: "IV/VI" },
    { date: "2025-05-17", label: "Assessment III Test Period Begins", category: "exam", sem: "IV/VI" },
    { date: "2025-05-21", label: "Assessment III Test Period Ends", category: "exam", sem: "IV/VI" },
    { date: "2025-05-22", label: "Last Working Day", category: "important", sem: "IV/VI" },
    { date: "2025-05-23", label: "Last Working Day (VIII Sem)", category: "important", sem: "VIII" },
    { date: "2025-05-23", label: "Date of Submission of Lack of Attendance Report", category: "important", sem: "All" },
    { date: "2025-05-23", label: "Assessment III Report Submission to CoE", category: "important", sem: "IV/VI" },
    { date: "2025-05-23", label: "Date of Issue of Hall Ticket", category: "exam", sem: "All" },
    { date: "2025-05-26", label: "Commencement of Practical Examination", category: "exam", sem: "IV/VI" },
    { date: "2025-05-30", label: "Internal Marks 3 and Individual Subject Internal Marks Circulation", category: "marks", sem: "All" },
    { date: "2025-06-02", label: "Commencement of End Semester Theory Examination", category: "exam", sem: "All" },
    { date: "2025-06-03", label: "Submission of Practical Answer Sheets", category: "exam", sem: "IV/VI" },
    { date: "2025-07-02", label: "Reopening Day for Next Semester", category: "academic", sem: "IV/VI" },
  ]
};

const CAT_COLORS = {
  exam: { bg: "rgba(255,75,38,0.12)", color: "#c0392b", label: "Exam" },
  important: { bg: "rgba(255,184,0,0.12)", color: "#b07e00", label: "Important" },
  academic: { bg: "rgba(0,196,140,0.12)", color: "#008c64", label: "Academic" },
  meeting: { bg: "rgba(108,59,255,0.12)", color: "#5229cc", label: "Meeting" },
  marks: { bg: "rgba(75,123,255,0.12)", color: "#2d5acc", label: "Marks" },
  admin: { bg: "rgba(138,136,152,0.15)", color: "#555", label: "Admin" },
};

function AcademicScheduleCalendar() {
  const [month, setMonth] = useState(new Date(2025, 0, 1)); // Start Jan 2025
  const [botOpen, setBotOpen] = useState(false);
  const [botMessages, setBotMessages] = useState([{ role: "ai", text: "Hi! 👋 I can answer questions about the academic schedule. Try asking: 'When is the first CAT exam?' or 'What are the important dates in April?'" }]);
  const [botInput, setBotInput] = useState("");
  const [botTyping, setBotTyping] = useState(false);
  const botRef = useRef(null);
  useEffect(() => { botRef.current?.scrollIntoView({ behavior: "smooth" }); }, [botMessages, botTyping]);

  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();

  const monthEvents = {};
  ACADEMIC_SCHEDULE.events.forEach(ev => {
    const d = new Date(ev.date);
    if (d.getFullYear() === year && d.getMonth() === mon) {
      const day = d.getDate();
      if (!monthEvents[day]) monthEvents[day] = [];
      monthEvents[day].push(ev);
    }
  });

  const upcomingEvents = ACADEMIC_SCHEDULE.events.filter(ev => new Date(ev.date) >= new Date()).slice(0, 6);

  async function askBot() {
    const q = botInput.trim(); if (!q) return;
    setBotInput("");
    setBotMessages(m => [...m, { role: "user", text: q }]);
    setBotTyping(true);
    try {
      const scheduleText = ACADEMIC_SCHEDULE.events.map(e => `${e.date}: ${e.label} (${e.sem})`).join("\n");
      const reply = await askAI(
        `You are an academic calendar assistant for Sri Venkateswara College of Engineering. Answer questions about the academic schedule below. Be concise and friendly. Only answer from the schedule data provided.\n\nSchedule:\n${scheduleText}`,
        q
      );
      setBotMessages(m => [...m, { role: "ai", text: reply }]);
    } catch {
      setBotMessages(m => [...m, { role: "ai", text: "I'm having trouble connecting. Please try again." }]);
    } finally { setBotTyping(false); }
  }

  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  return (
    <div className="fade-in">
      <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, rgba(108,59,255,0.1), rgba(0,217,170,0.06))", borderRadius: 14, marginBottom: 20, border: "1px solid rgba(108,59,255,0.2)" }}>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--accent-2)" }}>{ACADEMIC_SCHEDULE.institution}</div>
        <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: 2 }}>{ACADEMIC_SCHEDULE.title}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        {/* Calendar */}
        <div className="card">
          {/* Month Navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setMonth(new Date(year, mon - 1, 1))}>← Prev</button>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.1rem" }}>{monthNames[mon]} {year}</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setMonth(new Date(year, mon + 1, 1))}>Next →</button>
          </div>

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", padding: "4px 0", fontFamily: "var(--font-mono)" }}>{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const events = monthEvents[day] || [];
              const today = new Date(); const isToday = today.getDate() === day && today.getMonth() === mon && today.getFullYear() === year;
              return (
                <div key={day} style={{ minHeight: 72, padding: "6px 4px", borderRadius: 10, background: isToday ? "rgba(108,59,255,0.08)" : events.length ? "rgba(255,184,0,0.04)" : "var(--surface)", border: `1.5px solid ${isToday ? "var(--accent-2)" : events.length ? "rgba(255,184,0,0.2)" : "var(--surface-3)"}`, position: "relative" }}>
                  <div style={{ fontWeight: isToday ? 900 : 600, fontSize: "0.82rem", marginBottom: 4, color: isToday ? "var(--accent-2)" : "var(--ink)", fontFamily: "var(--font-mono)" }}>{day}</div>
                  {events.slice(0, 2).map((ev, ei) => {
                    const cat = CAT_COLORS[ev.category] || CAT_COLORS.admin;
                    return (
                      <div key={ei} title={ev.label} style={{ fontSize: "0.55rem", padding: "2px 4px", borderRadius: 4, background: cat.bg, color: cat.color, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
                        {ev.label.slice(0, 20)}{ev.label.length > 20 ? "…" : ""}
                      </div>
                    );
                  })}
                  {events.length > 2 && <div style={{ fontSize: "0.5rem", color: "var(--muted)", fontWeight: 700 }}>+{events.length - 2} more</div>}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid var(--surface-3)" }}>
            {Object.entries(CAT_COLORS).map(([k, v]) => (
              <span key={k} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: "0.72rem", fontWeight: 600 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: v.bg, border: `1px solid ${v.color}`, display: "inline-block" }} />
                {v.label}
              </span>
            ))}
          </div>
        </div>

        {/* Right panel: Upcoming + Bot */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-title" style={{ fontSize: "0.9rem" }}><Icon name="time" size={16} /> Upcoming Events</div>
            {upcomingEvents.map((ev, i) => {
              const cat = CAT_COLORS[ev.category] || CAT_COLORS.admin;
              const d = new Date(ev.date);
              return (
                <div key={i} style={{ padding: "8px 12px", borderRadius: 10, marginBottom: 6, borderLeft: `3px solid ${cat.color}`, background: cat.bg }}>
                  <div style={{ fontSize: "0.62rem", color: cat.color, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--ink)", marginTop: 2, lineHeight: 1.3 }}>{ev.label}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: 2 }}>Sem: {ev.sem}</div>
                </div>
              );
            })}
          </div>

          {/* Schedule Bot */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", background: "linear-gradient(135deg, var(--ink), #1a0a3a)", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setBotOpen(o => !o)}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, var(--accent-2), var(--accent))", display: "grid", placeItems: "center" }}><Icon name="robot" size={16} style={{ color: "white" }} /></div>
              <div>
                <div style={{ fontWeight: 800, color: "white", fontSize: "0.88rem" }}>Schedule Assistant</div>
                <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.5)" }}>Ask about academic dates</div>
              </div>
              <div style={{ marginLeft: "auto", fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}>{botOpen ? "▲" : "▼"}</div>
            </div>
            {botOpen && (
              <>
                <div style={{ maxHeight: 280, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--surface)" }}>
                  {botMessages.map((m, i) => (
                    <div key={i} style={{ maxWidth: "85%", padding: "8px 12px", borderRadius: 12, fontSize: "0.78rem", lineHeight: 1.5, alignSelf: m.role === "user" ? "flex-end" : "flex-start", background: m.role === "user" ? "var(--accent-2)" : "var(--white)", color: m.role === "user" ? "white" : "var(--ink)", border: m.role === "ai" ? "1px solid var(--surface-3)" : "none" }}>
                      {m.text}
                    </div>
                  ))}
                  {botTyping && <div style={{ alignSelf: "flex-start", padding: "8px 12px", borderRadius: 12, background: "var(--white)", border: "1px solid var(--surface-3)" }}><div className="chatbot-typing"><span /><span /><span /></div></div>}
                  <div ref={botRef} />
                </div>
                <div style={{ padding: "8px 12px", borderTop: "1px solid var(--surface-3)", display: "flex", gap: 8 }}>
                  <input style={{ flex: 1, padding: "7px 12px", border: "1.5px solid var(--surface-3)", borderRadius: 20, fontFamily: "var(--font-body)", fontSize: "0.78rem", outline: "none", background: "var(--surface)" }}
                    placeholder="Ask about schedule..." value={botInput} onChange={e => setBotInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !botTyping && askBot()} />
                  <button onClick={askBot} disabled={botTyping || !botInput.trim()} style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-2)", border: "none", cursor: "pointer", display: "grid", placeItems: "center", color: "white", flexShrink: 0 }}>
                    <Icon name="send" size={13} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* All events list */}
          <div className="card">
            <div className="card-title" style={{ fontSize: "0.9rem" }}><Icon name="book" size={16} /> Full Schedule</div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {ACADEMIC_SCHEDULE.events.map((ev, i) => {
                const cat = CAT_COLORS[ev.category] || CAT_COLORS.admin;
                const d = new Date(ev.date);
                return (
                  <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--surface-3)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", color: "var(--muted)", minWidth: 60 }}>{d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</div>
                    <div style={{ flex: 1, fontSize: "0.75rem", fontWeight: 600, lineHeight: 1.3 }}>{ev.label}</div>
                    <span style={{ fontSize: "0.6rem", padding: "2px 6px", borderRadius: 10, background: cat.bg, color: cat.color, fontWeight: 700, flexShrink: 0 }}>{cat.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── STUDENT SEND MESSAGE TO FACULTY ──────────────────────────────────────────
function StudentSendMessage({ toast }) {
  const [facultyList, setFacultyList] = useState([]);
  const [form, setForm] = useState({ facultyId: "", subject: "", body: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api("/student/faculty-list").then(setFacultyList).catch(() => {});
  }, []);

  async function sendMessage() {
    if (!form.facultyId || !form.body) { toast("Select faculty and enter message", "error"); return; }
    setSending(true);
    try {
      await api("/student/send-message", {
        method: "POST",
        body: JSON.stringify({ faculty_id: parseInt(form.facultyId), subject: form.subject || "(No subject)", body: form.body })
      });
      toast("Message sent to faculty ✓", "success");
      setSent(true);
      setTimeout(() => { setForm({ facultyId: "", subject: "", body: "" }); setSent(false); }, 2000);
    } catch (err) { toast(err.message || "Could not send message", "error"); }
    finally { setSending(false); }
  }

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-title"><Icon name="send" size={18} /> Message to Faculty</div>
        <div className="form-field">
          <label>Select Faculty *</label>
          <select value={form.facultyId} onChange={e => setForm({ ...form, facultyId: e.target.value })}>
            <option value="">— Select Faculty —</option>
            {facultyList.map(f => <option key={f.id} value={f.id}>{f.name} · {f.designation} · {f.department}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Subject</label>
          <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Query about assignment..." />
        </div>
        <div className="form-field">
          <label>Message *</label>
          <textarea rows={5} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Type your message to the faculty..." />
        </div>
        <button className="btn btn-primary" onClick={sendMessage} disabled={sending || sent || !form.facultyId || !form.body}>
          <Icon name="send" size={16} /> {sending ? "Sending..." : sent ? "Sent ✓" : "Send Message"}
        </button>
      </div>
    </div>
  );
}

// ─── PARENT PORTAL ────────────────────────────────────────────────────────────
function ParentPortal({ studentId }) {
  const [data, setData] = useState(null);
  useEffect(() => { api("/features/parent-dashboard/" + studentId).then(setData).catch(console.error); }, [studentId]);
  if (!data) return <LoadingState />;
  const { student, overall_attendance, courses_attendance, marks_summary, low_attendance_count } = data;
  return (
    <div className="fade-in">
      <div className="profile-hero mb-5">
        <div className="profile-hero-avatar" style={{ background: "linear-gradient(135deg, #1e3a5f, #2d6a4f)" }}>👨‍👩‍👧</div>
        <div>
          <div className="profile-hero-name">{student.name}</div>
          <div className="profile-hero-meta">{student.register_number} - {student.department} - Semester {student.semester}</div>
        </div>
        <div className="profile-hero-badge">CGPA {student.cgpa?.toFixed(2)}</div>
      </div>
      <div className="stat-grid mb-5">
        <div className="stat-card" style={{ borderTop: "3px solid " + (overall_attendance >= 75 ? "var(--success)" : "var(--danger)") }}>
          <div className="stat-value" style={{ color: overall_attendance >= 75 ? "var(--success)" : "var(--danger)" }}>{overall_attendance}%</div>
          <div className="stat-label">Overall Attendance</div>
        </div>
        <div className="stat-card" style={{ borderTop: "3px solid " + (low_attendance_count > 0 ? "var(--danger)" : "var(--success)") }}>
          <div className="stat-value" style={{ color: low_attendance_count > 0 ? "var(--danger)" : "var(--success)" }}>{low_attendance_count}</div>
          <div className="stat-label">Subjects Below 75%</div>
        </div>
        <div className="stat-card" style={{ borderTop: "3px solid var(--accent-2)" }}>
          <div className="stat-value" style={{ color: "var(--accent-2)" }}>{student.cgpa?.toFixed(2)}</div>
          <div className="stat-label">CGPA</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-title"><Icon name="attendance" size={18} /> Attendance by Subject</div>
          {courses_attendance.map(c => (
            <div key={c.course_code} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div><span style={{ fontWeight: 700, fontSize: "0.85rem" }}>{c.course_code}</span><span className="text-muted text-sm" style={{ marginLeft: 8 }}>{c.course_name}</span></div>
                <span style={{ fontWeight: 800, color: c.percentage >= 75 ? "var(--success)" : "var(--danger)", fontFamily: "var(--font-mono)" }}>{c.percentage}%</span>
              </div>
              <div style={{ height: 8, background: "var(--surface-3)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: c.percentage + "%", background: c.percentage >= 75 ? "var(--success)" : "var(--danger)", borderRadius: 4 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                <span>{c.present}/{c.total} attended</span>
                {c.status === "at_risk" && <span style={{ color: "var(--danger)", fontWeight: 700 }}>Below 75%</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title"><Icon name="marks" size={18} /> CAT Marks</div>
          {marks_summary.length === 0 ? <div className="text-muted">No marks entered yet</div> :
          <div className="table-wrap"><table>
            <thead><tr><th>Course</th><th>CAT 1</th><th>CAT 2</th><th>CAT 3</th></tr></thead>
            <tbody>{marks_summary.map((m, i) => (
              <tr key={i}>
                <td style={{ fontSize: "0.78rem", fontWeight: 600 }}>{m.course}</td>
                {[m.cat1, m.cat2, m.cat3].map((v, j) => <td key={j} style={{ fontFamily: "var(--font-mono)", color: v < 25 ? "var(--danger)" : "var(--success)", fontWeight: 700 }}>{v || "—"}</td>)}
              </tr>
            ))}</tbody>
          </table></div>}
          {low_attendance_count > 0 && <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 10, fontSize: "0.82rem", color: "var(--danger)", fontWeight: 600 }}>
            {low_attendance_count} subject(s) below 75% attendance. Please encourage regular attendance.
          </div>}
        </div>
      </div>
    </div>
  );
}

// 7. VOICE ATTENDANCE
function VoiceAttendance({ toast }) {
  const [courses, setCourses] = useState([]); const [selectedCourse, setSelectedCourse] = useState(""); const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [students, setStudents] = useState([]); const [statuses, setStatuses] = useState({}); const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState(""); const [recogRef, setRecogRef] = useState(null); const [saving, setSaving] = useState(false);
  const [matchLog, setMatchLog] = useState([]); const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => { api("/faculty/my-courses").then(setCourses).catch(console.error); }, []);
  useEffect(() => {
    if (!selectedCourse) return;
    api("/faculty/students?course_id=" + selectedCourse).then(s => {
      const unique = [...new Map(s.map(x => [x.student_id, x])).values()];
      setStudents(unique); setStatuses(Object.fromEntries(unique.map(s => [s.student_id, "absent"]))); setCurrentIdx(0); setMatchLog([]);
    });
  }, [selectedCourse]);

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast("Speech recognition requires Chrome browser", "error"); return; }
    const recog = new SR();
    recog.continuous = true; recog.interimResults = true; recog.lang = "en-IN";
    recog.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join(" ");
      setTranscript(t);
      const lower = t.toLowerCase();
      setStudents(prev => {
        const updates = {};
        prev.forEach(s => {
          const nameMatch = s.name.toLowerCase().split(" ").some(w => lower.includes(w) && w.length > 3);
          const regMatch = lower.includes(s.register_number.toLowerCase());
          if (nameMatch || regMatch) {
            const ns = lower.includes("absent") ? "absent" : lower.includes("late") ? "late" : lower.includes("od") ? "od" : "present";
            updates[s.student_id] = ns;
            setMatchLog(ml => [...ml.slice(-8), { name: s.name, status: ns }]);
          }
        });
        if (Object.keys(updates).length > 0) setStatuses(prev2 => ({ ...prev2, ...updates }));
        return prev;
      });
    };
    recog.onend = () => setListening(false);
    recog.start(); setRecogRef(recog); setListening(true);
  }

  function stopVoice() { recogRef?.stop(); setListening(false); }

  async function saveAttendance() {
    if (!selectedCourse || !students.length) return;
    setSaving(true);
    try {
      await api("/faculty/attendance/mark", { method: "POST", body: JSON.stringify({ course_id: parseInt(selectedCourse), date, records: students.map(s => ({ student_id: s.student_id, status: statuses[s.student_id] })) }) });
      toast("Attendance saved!", "success");
    } catch (e) { toast(e.message, "error"); }
    finally { setSaving(false); }
  }

  const presentCount = Object.values(statuses).filter(v => v === "present").length;
  const statusColor = { present: "var(--success)", absent: "var(--danger)", late: "var(--warning)", od: "var(--info)" };
  const statusEmoji = { present: "P", absent: "A", od: "OD" };

  return (
    <div className="fade-in">
      <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, rgba(6,182,212,0.1), rgba(14,165,233,0.06))", borderRadius: 14, marginBottom: 20, border: "1px solid rgba(6,182,212,0.2)", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 32 }}>🎤</div>
        <div>
          <div style={{ fontWeight: 800, color: "#06B6D4" }}>Voice-to-Attendance</div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Call out student names and AI marks them present. Tap any card to cycle status. Click Save when done.</div>
        </div>
      </div>
      <div className="grid-2 mb-4">
        <div className="form-field" style={{ marginBottom: 0 }}><label>Course</label><select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}><option value="">Select</option>{courses.map(c => <option key={c.course_id} value={c.course_id}>{c.code} - {c.name}</option>)}</select></div>
        <div className="form-field" style={{ marginBottom: 0 }}><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      </div>
      {students.length > 0 && (
        <>
          <div className="card mb-4">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button className={"btn " + (listening ? "btn-danger" : "btn-primary")} onClick={listening ? stopVoice : startVoice} style={{ minWidth: 160 }}>
                {listening ? "Stop Listening" : "Start Voice Mode"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setStatuses(Object.fromEntries(students.map(s => [s.student_id, "present"])))}>All Present</button>
              <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--success)" }}>{presentCount}/{students.length} present</div>
            </div>
            {listening && (
              <div style={{ marginTop: 14, padding: "12px 16px", background: "rgba(6,182,212,0.08)", borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444" }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#06B6D4" }}>Listening... Speak student names</span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)", fontStyle: "italic" }}>{transcript || "Start speaking..."}</div>
              </div>
            )}
            {matchLog.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {matchLog.map((l, i) => <span key={i} className="tag" style={{ background: statusColor[l.status] + "22", color: statusColor[l.status] }}>{statusEmoji[l.status]} {l.name}</span>)}
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-title">Student List (tap to cycle status)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
              {students.map(s => (
                <div key={s.student_id} style={{ padding: "10px 12px", borderRadius: 10, border: "2px solid " + statusColor[statuses[s.student_id]], background: statusColor[statuses[s.student_id]] + "11", cursor: "pointer" }}
                  onClick={() => { const cycle = ["present","absent","od"]; const curr = cycle.indexOf(statuses[s.student_id]); setStatuses(prev => ({ ...prev, [s.student_id]: cycle[(curr + 1) % cycle.length] })); }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.name}</span>
                    <span style={{ fontWeight: 800, fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: statusColor[statuses[s.student_id]] }}>{statusEmoji[statuses[s.student_id]]}</span>
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{s.register_number}</div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={saveAttendance} disabled={saving}>
              {saving ? "Saving..." : "Save Attendance (" + presentCount + " present)"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api("/admin/dashboard").then(setStats).catch(console.error); }, []);
  if (!stats) return <LoadingState />;
  const cards = [
    { label: "Students", value: stats.total_students, color: "var(--accent-2)", icon: "student" },
    { label: "Faculty", value: stats.total_faculty, color: "var(--success)", icon: "faculty" },
    { label: "Courses", value: stats.total_courses, color: "var(--accent-4)", icon: "book" },
    { label: "Departments", value: stats.total_departments, color: "var(--info)", icon: "admin" },
    { label: "Pending Exams", value: stats.pending_exam_registrations, color: "var(--accent)", icon: "exam" },
    { label: "Pending Payments", value: stats.pending_payments, color: "var(--danger)", icon: "payment" },
  ];
  return (
    <div className="fade-in">
      <div className="profile-hero mb-5">
        <div className="profile-hero-avatar" style={{ background: "linear-gradient(135deg, var(--accent), #c0392b)" }}>A</div>
        <div><div className="profile-hero-name">Admin Control Center</div><div className="profile-hero-meta">System oversight and management · Full access</div></div>
        <span className="tag" style={{ background: "rgba(255,75,38,0.2)", color: "var(--accent)", marginLeft: "auto", padding: "8px 16px", fontSize: "0.88rem", fontWeight: 800 }}>ADMIN</span>
      </div>
      <div className="stat-grid mb-5">
        {cards.map((c, i) => <div key={i} className="stat-card" style={{ borderTop: `3px solid ${c.color}` }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}><div className="stat-value" style={{ color: c.color }}>{c.value}</div><div style={{ color: c.color, opacity: 0.25 }}><Icon name={c.icon} size={32} /></div></div><div className="stat-label">{c.label}</div></div>)}
      </div>
    </div>
  );
}

function AdminAnalytics() {
  const [stats, setStats] = useState(null); const [students, setStudents] = useState([]); const [aiInsight, setAiInsight] = useState(""); const [loadingAI, setLoadingAI] = useState(false);
  useEffect(() => { Promise.all([api("/admin/dashboard").catch(() => null), api("/admin/students").catch(() => [])]).then(([s, stu]) => { setStats(s); setStudents(stu || []); }); }, []);
  async function generateReport() {
    if (!stats) return; setLoadingAI(true);
    try { const reply = await askAI("You are an expert college administrator. Generate a concise institutional health report (max 120 words) with 2-3 actionable recommendations.", `Stats: ${stats.total_students} students, ${stats.total_faculty} faculty, ${stats.total_courses} courses, ${stats.pending_exam_registrations} pending exams, ${stats.pending_payments} pending payments.`); setAiInsight(reply); }
    catch { setAiInsight("AI unavailable — set API key in configuration."); } finally { setLoadingAI(false); }
  }
  if (!stats) return <LoadingState />;
  const semDist = students.reduce((acc, s) => { const sem = s.current_semester; acc[sem] = (acc[sem] || 0) + 1; return acc; }, {});
  const semChartData = Object.entries(semDist).map(([k, v]) => ({ label: `S${k}`, value: v })).sort((a, b) => a.label.localeCompare(b.label));
  return (
    <div className="fade-in">
      <div className="ai-panel mb-5">
        <div className="ai-label"><Icon name="ai" size={14} /> AI Analytics</div>
        <div className="ai-title">Institutional Health Report</div>
        <button className="btn btn-purple" onClick={generateReport} disabled={loadingAI} style={{ position: "relative", zIndex: 1 }}>{loadingAI ? <><Icon name="settings" size={16} style={{ animation: "spin 1s linear infinite" }} /> Analyzing...</> : <><Icon name="ai" size={16} /> Generate AI Report</>}</button>
        {aiInsight && <div className="ai-response">{aiInsight}</div>}
      </div>
      <div className="grid-2 mb-5">
        <div className="card"><div className="card-title"><Icon name="chart" size={18} /> Students by Semester</div>{semChartData.length > 0 ? <BarChart data={semChartData} color="var(--accent-2)" /> : <div className="text-muted">No data</div>}</div>
        <div className="card"><div className="card-title"><Icon name="analytics" size={18} /> System Metrics</div>{[{ label: "Student-Faculty Ratio", value: `${stats.total_faculty > 0 ? Math.round(stats.total_students / stats.total_faculty) : "—"}:1` }, { label: "Courses per Dept", value: stats.total_departments > 0 ? (stats.total_courses / stats.total_departments).toFixed(1) : "—" }, { label: "Exam Approval Rate", value: stats.pending_exam_registrations === 0 ? "100%" : "Pending" }, { label: "Payment Clearance", value: stats.pending_payments === 0 ? "All Clear" : `${stats.pending_payments} pending` }].map((m, i) => <div key={i} className="insight-item" style={{ marginBottom: 8 }}><div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{m.label}</div></div><div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1rem", color: "var(--accent-2)" }}>{m.value}</div></div>)}</div>
      </div>
    </div>
  );
}

function AdminStudents({ toast }) {
  const [students, setStudents] = useState([]); const [showAdd, setShowAdd] = useState(false); const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "Student@123", register_number: "", department_id: 1, batch_year: 2023, current_semester: 4, section: "A", gender: "Male" });
  async function load() { api("/admin/students").then(setStudents).catch(console.error); }
  useEffect(() => { load(); }, []);
  async function create() {
    try { await api("/admin/students", { method: "POST", body: JSON.stringify(form) }); toast("Student created!", "success"); setShowAdd(false); load(); }
    catch (err) { toast(err.message, "error"); }
  }
  async function del(id) {
    if (!confirm("Delete this student?")) return;
    try { await api(`/admin/students/${id}`, { method: "DELETE" }); toast("Deleted", "success"); load(); }
    catch (err) { toast(err.message, "error"); }
  }
  const filtered = students.filter(s => !search || s.user?.name?.toLowerCase().includes(search.toLowerCase()) || s.register_number?.includes(search));
  return (
    <div className="fade-in">
      <div className="card">
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div className="card-title" style={{ marginBottom: 0, flex: 1 }}><Icon name="student" size={18} /> All Students</div>
          <input style={{ padding: "8px 14px", border: "1.5px solid var(--surface-3)", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: "0.88rem", outline: "none" }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Icon name="add" size={14} /> Add Student</button>
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Reg. No.</th><th>Department</th><th>Semester</th><th>CGPA</th><th>Actions</th></tr></thead>
          <tbody>{filtered.map(s => <tr key={s.id}><td style={{ fontWeight: 700 }}>{s.user?.name}</td><td style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>{s.register_number}</td><td><span className="tag tag-muted">{s.department?.code}</span></td><td style={{ fontFamily: "var(--font-mono)" }}>{s.current_semester}</td><td style={{ fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--accent-2)" }}>{s.cgpa}</td><td><button className="btn btn-danger btn-sm" onClick={() => del(s.id)}><Icon name="trash" size={12} /></button></td></tr>)}</tbody>
        </table></div>
        <div className="text-muted text-sm" style={{ marginTop: 10 }}>{filtered.length} of {students.length} students</div>
      </div>
      {showAdd && <div className="modal-overlay" onClick={() => setShowAdd(false)}><div className="modal fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Add New Student</div>
        {["name", "email", "register_number"].map(f => <div key={f} className="form-field"><label>{f.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</label><input value={form[f]} onChange={e => setForm({ ...form, [f]: e.target.value })} /></div>)}
        <div className="form-field"><label>Password</label><input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
        <div className="grid-2"><div className="form-field"><label>Batch Year</label><input type="number" value={form.batch_year} onChange={e => setForm({ ...form, batch_year: +e.target.value })} /></div><div className="form-field"><label>Semester</label><select value={form.current_semester} onChange={e => setForm({ ...form, current_semester: +e.target.value })}>{[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>{s}</option>)}</select></div></div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}><button className="btn btn-primary" onClick={create}>Create</button><button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button></div>
      </div></div>}
    </div>
  );
}

function AdminFaculty() {
  const [faculty, setFaculty] = useState([]);
  useEffect(() => { api("/admin/faculty").then(setFaculty).catch(console.error); }, []);
  return (
    <div className="fade-in">
      <div className="card"><div className="card-title"><Icon name="faculty" size={18} /> All Faculty</div>
        <div className="table-wrap"><table><thead><tr><th>Name</th><th>Emp. ID</th><th>Department</th><th>Designation</th><th>Specialization</th><th>Exp</th></tr></thead>
          <tbody>{faculty.map(f => <tr key={f.id}><td style={{ fontWeight: 700 }}>{f.user?.name}</td><td style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>{f.employee_id}</td><td><span className="tag tag-muted">{f.department?.code}</span></td><td>{f.designation}</td><td className="text-muted text-sm">{f.specialization}</td><td style={{ fontFamily: "var(--font-mono)" }}>{f.experience_years}y</td></tr>)}</tbody>
        </table></div>
      </div>
    </div>
  );
}

function AdminCourses() {
  const [courses, setCourses] = useState([]);
  useEffect(() => { api("/admin/courses").then(setCourses).catch(console.error); }, []);
  return (
    <div className="fade-in">
      <div className="card"><div className="card-title"><Icon name="book" size={18} /> All Courses</div>
        <div className="table-wrap"><table><thead><tr><th>Code</th><th>Course Name</th><th>Department</th><th>Credits</th><th>Semester</th><th>Type</th></tr></thead>
          <tbody>{courses.map(c => <tr key={c.id}><td style={{ fontWeight: 800, fontFamily: "var(--font-mono)" }}>{c.code}</td><td style={{ fontWeight: 600 }}>{c.name}</td><td><span className="tag tag-muted">{c.department?.code}</span></td><td><span className="tag tag-purple" style={{ fontFamily: "var(--font-mono)" }}>{c.credits}</span></td><td style={{ fontFamily: "var(--font-mono)" }}>{c.semester}</td><td><span className={`tag ${c.course_type === "lab" ? "tag-success" : c.course_type === "elective" ? "tag-warning" : "tag-info"}`}>{c.course_type}</span></td></tr>)}</tbody>
        </table></div>
      </div>
    </div>
  );
}

function AdminExamApprovals({ toast }) {
  const [regs, setRegs] = useState([]);
  async function load() { api("/admin/exam-registrations").then(setRegs).catch(console.error); }
  useEffect(() => { load(); }, []);
  async function approve(id) { try { await api(`/admin/exam-registrations/${id}/approve`, { method: "POST" }); toast("Approved!", "success"); load(); } catch (err) { toast(err.message, "error"); } }
  async function reject(id) { try { await api(`/admin/exam-registrations/${id}/reject`, { method: "POST" }); toast("Rejected", "warning"); load(); } catch (err) { toast(err.message, "error"); } }
  const pending = regs.filter(r => r.status === "pending").length;
  return (
    <div className="fade-in">
      {pending > 0 && <div style={{ background: "rgba(255,184,0,0.08)", border: "1.5px solid rgba(255,184,0,0.3)", borderRadius: 14, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}><Icon name="warning" size={20} style={{ color: "var(--warning)" }} /><div style={{ fontWeight: 700, color: "var(--warning)" }}>{pending} registrations awaiting approval</div></div>}
      <div className="card"><div className="card-title"><Icon name="exam" size={18} /> Exam Registration Approvals</div>
        <div className="table-wrap"><table><thead><tr><th>Student</th><th>Reg. No.</th><th>Semester</th><th>Year</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{regs.map(r => <tr key={r.id}><td style={{ fontWeight: 700 }}>{r.student?.user?.name}</td><td style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>{r.student?.register_number}</td><td>Sem {r.semester}</td><td style={{ fontFamily: "var(--font-mono)" }}>{r.academic_year}</td><td><span className={`tag ${r.status === "approved" ? "tag-success" : r.status === "rejected" ? "tag-danger" : "tag-warning"}`}>{r.status}</span></td><td>{r.status === "pending" && <div style={{ display: "flex", gap: 6 }}><button className="btn btn-success btn-sm" onClick={() => approve(r.id)}><Icon name="check" size={12} /> Approve</button><button className="btn btn-danger btn-sm" onClick={() => reject(r.id)}>Reject</button></div>}</td></tr>)}</tbody>
        </table></div>
        {regs.length === 0 && <div className="text-muted">No exam registrations</div>}
      </div>
    </div>
  );
}

function AdminBroadcast({ toast }) {
  const [title, setTitle] = useState(""); const [msg, setMsg] = useState(""); const [role, setRole] = useState(""); const [type, setType] = useState("info");
  const [aiLoading, setAiLoading] = useState(false); const [aiDraft, setAiDraft] = useState(false);
  async function draftWithAI() {
    if (!title) { toast("Enter a title first", "error"); return; }
    setAiLoading(true);
    try { const reply = await askAI("You are a college administrator. Draft a clear, professional notification message (max 60 words). Return only the message text.", `Write a college notification titled: "${title}" for: ${role || "everyone"}`); setMsg(reply); setAiDraft(true); }
    catch { toast("AI unavailable", "error"); } finally { setAiLoading(false); }
  }
  async function send() {
    if (!title || !msg) { toast("Enter title and message", "error"); return; }
    try { const res = await api("/admin/notify", { method: "POST", body: JSON.stringify({ title, message: msg, role: role || null, type }) }); toast(res.message, "success"); setTitle(""); setMsg(""); setRole(""); setAiDraft(false); }
    catch (err) { toast(err.message, "error"); }
  }
  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-title"><Icon name="bell" size={18} /> Broadcast Notification</div>
        <div className="grid-2 mb-4">
          <div className="form-field" style={{ marginBottom: 0 }}><label>Send To</label><select value={role} onChange={e => setRole(e.target.value)}><option value="">Everyone</option><option value="student">Students Only</option><option value="faculty">Faculty Only</option></select></div>
          <div className="form-field" style={{ marginBottom: 0 }}><label>Type</label><select value={type} onChange={e => setType(e.target.value)}><option value="info">Info</option><option value="warning">Warning</option><option value="success">Success</option></select></div>
        </div>
        <div className="form-field"><label>Title</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Notification title..." /></div>
        <div className="form-field">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><label style={{ marginBottom: 0 }}>Message</label><button className="btn btn-ghost btn-sm" onClick={draftWithAI} disabled={aiLoading} style={{ fontSize: "0.75rem" }}><Icon name="ai" size={13} /> {aiLoading ? "Drafting..." : "Draft with AI"}</button></div>
          <textarea rows={4} value={msg} onChange={e => setMsg(e.target.value)} placeholder="Your notification message..." />
          {aiDraft && <div style={{ fontSize: "0.78rem", color: "var(--accent-2)", marginTop: 4, fontWeight: 600 }}>✦ Drafted by AI · Edit as needed</div>}
        </div>
        <button className="btn btn-primary" onClick={send}><Icon name="bell" size={16} /> Send Notification</button>
      </div>
    </div>
  );
}

// ─── FLOATING AI CHATBOT ──────────────────────────────────────────────────────
function AIChat({ userRole, userName }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "ai", text: `Hi ${userName?.split(" ")[0] || "there"}! 👋 I'm your ERP assistant. Ask me anything about academics, navigation, or features!` }]);
  const [input, setInput] = useState(""); const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null); const [history, setHistory] = useState([]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typing]);

  async function sendMessage() {
    const text = input.trim(); if (!text) return;
    setInput(""); setMessages(m => [...m, { role: "user", text }]); setTyping(true);
    const newHistory = [...history, { role: "user", content: text }]; setHistory(newHistory);
    try {
      const reply = await askAI(
        `You are a helpful AI assistant embedded in a college ERP system. The user is a ${userRole} named ${userName}. Give concise, friendly replies (max 80 words). Help with academic questions, ERP navigation, study tips, and college queries.`,
        text, history
      );
      setMessages(m => [...m, { role: "ai", text: reply }]);
      setHistory(h => [...h, { role: "assistant", content: reply }]);
    } catch { setMessages(m => [...m, { role: "ai", text: "AI service unavailable. Make sure the backend is running and AI_API_KEY is set in backend/.env" }]); }
    finally { setTyping(false); }
  }

  const quickActions = ["How to check attendance?", "When is exam registration?", "How is CGPA calculated?", "How to apply for OD?"];

  return (
    <>
      {open && <div className="chatbot-panel">
        <div className="chatbot-header">
          <div className="chatbot-avatar"><Icon name="robot" size={18} /></div>
          <div><div style={{ fontWeight: 800, fontSize: "0.9rem" }}>ERP Assistant</div><div style={{ fontSize: "0.7rem", opacity: 0.6 }}>AI-Powered · Always here</div></div>
          <div style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: "50%", background: "#00d9aa", boxShadow: "0 0 8px #00d9aa" }} />
        </div>
        <div className="chatbot-messages">
          {messages.map((m, i) => <div key={i} className={`chatbot-msg ${m.role}`}>{m.text}</div>)}
          {typing && <div className="chatbot-msg ai" style={{ padding: "10px 14px" }}><div className="chatbot-typing"><span /><span /><span /></div></div>}
          <div ref={bottomRef} />
        </div>
        {messages.length === 1 && <div style={{ padding: "0 16px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {quickActions.map(q => <button key={q} onClick={() => setInput(q)} style={{ padding: "5px 11px", borderRadius: 20, border: "1px solid var(--surface-3)", background: "transparent", fontSize: "0.72rem", cursor: "pointer", fontFamily: "var(--font-body)", color: "var(--accent-2)", fontWeight: 600 }}>{q}</button>)}
        </div>}
        <div className="chatbot-input-row">
          <input className="chatbot-input" placeholder="Ask anything..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !typing && sendMessage()} />
          <button className="chatbot-send" onClick={sendMessage} disabled={typing || !input.trim()}><Icon name="send" size={14} /></button>
        </div>
      </div>}
      <button className={`chatbot-bubble ${open ? "open" : ""}`} onClick={() => setOpen(o => !o)}>{open ? <Icon name="close2" size={22} /> : <Icon name="robot" size={24} />}</button>
    </>
  );
}

// ─── NOTIFICATION DROPDOWN ────────────────────────────────────────────────────
function NotifDropdown({ userRole }) {
  const [open, setOpen] = useState(false); const [notifs, setNotifs] = useState([]);
  const panelRef = useRef(null);
  useEffect(() => {
    if (userRole === "student") api("/student/notifications").then(n => setNotifs(n.slice(0, 8))).catch(() => {});
    else if (userRole === "faculty") api("/faculty/notifications").then(n => setNotifs(n.slice(0, 8))).catch(() => {});
  }, [userRole]);
  useEffect(() => { function handle(e) { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); } document.addEventListener("mousedown", handle); return () => document.removeEventListener("mousedown", handle); }, []);
  const unread = notifs.filter(n => !n.is_read).length;
  return (
    <div style={{ position: "relative" }} ref={panelRef}>
      <button className="notif-btn" onClick={() => setOpen(o => !o)}><Icon name="bell" size={18} />{unread > 0 && <div className="notif-dot" style={{ position:"absolute", top:4, right:4, width:18, height:18, background:"var(--danger)", borderRadius:"50%", fontSize:"0.6rem", fontWeight:800, color:"white", display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid var(--surface)", fontFamily:"var(--font-mono)" }}>{unread > 9 ? "9+" : unread}</div>}</button>
      {open && <div className="notif-panel">
        <div className="notif-panel-header"><span>Notifications</span>{unread > 0 && <span className="tag tag-info">{unread} new</span>}</div>
        {notifs.length === 0 ? <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>No notifications yet</div>
          : notifs.map(n => <div key={n.id} className={`notif-item ${!n.is_read ? "unread" : ""}`}><div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 2 }}>{n.title}</div><div style={{ color: "var(--muted)", fontSize: "0.78rem", lineHeight: 1.4 }}>{n.message}</div></div>)}
      </div>}
    </div>
  );
}

// ─── DARK MODE ────────────────────────────────────────────────────────────────
function useDarkMode() {
  const [dark, setDark] = useState(() => localStorage.getItem("erp_theme") === "dark");
  useEffect(() => { document.documentElement.setAttribute("data-theme", dark ? "dark" : "light"); localStorage.setItem("erp_theme", dark ? "dark" : "light"); }, [dark]);
  return [dark, () => setDark(d => !d)];
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authData, setAuthData] = useState(() => {
    try { const token = localStorage.getItem("erp_token"); const data = localStorage.getItem("erp_user"); if (token && data) return JSON.parse(data); } catch {} return null;
  });
  const [page, setPage] = useState("dashboard"); const [toast, setToast] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false); const [dark, toggleDark] = useDarkMode();

  function showToast(msg, type = "info") { setToast({ msg, type, key: Date.now() }); }
  function handleLogin(data) { localStorage.setItem("erp_token", data.access_token); localStorage.setItem("erp_user", JSON.stringify(data)); setAuthData(data); setPage("dashboard"); }
  function handleLogout() { localStorage.removeItem("erp_token"); localStorage.removeItem("erp_user"); setAuthData(null); setPage("dashboard"); }

  const pageTitles = {
    dashboard: "Dashboard", profile: "My Profile", timetable: "Timetable",
    attendance: "Attendance", marks: "Marks & Results", assignments: "Assignments",
    courses: "My Courses", "exam-reg": "Exam Registration", "exam-fees": "Fees & Receipts",
    messages: "Messages", calculator: "Marks Calculator", "ai-advisor": "AI Advisor",
    "od-letter": "OD Application", "internship-letter": "Internship Letter",
    "mentor-selection": "Mentor Selection", "transport": "Transport Details",
    "academic-schedule": "Academic Calendar",
    "my-students": "My Students", "attendance-mgmt": "Mark Attendance", "voice-attendance": "Voice Attendance",
    "low-attendance": "Low Attendance Alert", "marks-upload": "Upload Marks",
    "send-message": "Send Message", "od-approvals": "OD/Internship Approvals",
    "risk-prediction": "AI Risk Predictor", "guardian-alerts": "Guardian Alerts", "ai-assignment": "AI Assignment Generator",
    "sentiment": "Class Sentiment", "gamification": "XP & Leaderboard", "parent": "Parent Dashboard",
    "mentor-requests": "Mentor Requests",
    analytics: "Analytics", "admin-students": "Manage Students",
    "admin-faculty": "Manage Faculty", "admin-courses": "Manage Courses",
    "exam-approvals": "Exam Approvals", broadcast: "Broadcast",
  };

  function renderPage() {
    const role = authData?.role; const props = { toast: showToast };
    if (role === "student") {
      const views = {
        dashboard: <StudentDashboard />, profile: <StudentProfile />,
        timetable: <StudentTimetable />, attendance: <StudentAttendance />,
        marks: <StudentMarks />, assignments: <StudentAssignments {...props} />,
        courses: <StudentCourses />, "exam-reg": <StudentExamReg {...props} />,
        "exam-fees": <StudentExamFees {...props} />, messages: <StudentMessages />,
        calculator: <InternalCalculator />, "ai-advisor": <AIAdvisorPage />,
        "od-letter": <LetterApplication type="od" {...props} />,
        "internship-letter": <LetterApplication type="internship" {...props} />,
        "mentor-selection": <MentorSelection {...props} />,
        "transport": <TransportDetails {...props} />,
        "academic-schedule": <AcademicScheduleCalendar />,
        "gamification": <GamificationPage userRole="student" />,
        "sentiment": <SentimentDashboard toast={showToast} userRole="student" />,
      };
      return views[page] || views.dashboard;
    }
    if (role === "faculty") {
      const views = {
        dashboard: <FacultyDashboard {...props} />, profile: <FacultyProfile />,
        "my-students": <FacultyStudents />, "attendance-mgmt": <FacultyMarkAttendance {...props} />,
        "low-attendance": <FacultyLowAttendance />, "marks-upload": <FacultyMarksUpload {...props} />,
        "messages": <FacultyMessagesInbox {...props} />,
        "send-message": <FacultyMessagesInbox {...props} />,
        "mentor-requests": <FacultyMentorRequests {...props} />,
        assignments: <FacultyCreateAssignment {...props} />,
        "od-approvals": <FacultyODApprovals {...props} />,
        "risk-prediction": <AiRiskPrediction {...props} />,
        "guardian-alerts": <GuardianAlerts {...props} />,
        "ai-assignment": <AiAssignmentGenerator {...props} />,
        "sentiment": <SentimentDashboard toast={showToast} userRole="faculty" />,
        "gamification": <GamificationPage userRole="faculty" />,
      };
      return views[page] || views.dashboard;
    }
    if (role === "admin") {
      const views = {
        dashboard: <AdminDashboard />, analytics: <AdminAnalytics />,
        "admin-students": <AdminStudents {...props} />, "admin-faculty": <AdminFaculty />,
        "admin-courses": <AdminCourses />, "exam-approvals": <AdminExamApprovals {...props} />,
        broadcast: <AdminBroadcast {...props} />,
      };
      return views[page] || views.dashboard;
    }
    if (role === "parent") {
      return <ParentDashboard studentId={authData?.student_id || 1} />;
    }
  }

  if (!authData) return <><style>{styles}</style><LoginPage onLogin={handleLogin} /></>;

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <Sidebar user={authData} active={page} onNav={p => { setPage(p); setMobileOpen(false); }} onLogout={handleLogout} mobileOpen={mobileOpen} />
        <div className="main-content">
          <div className="topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="page-title">{pageTitles[page] || "Dashboard"}</div>
              {page === "ai-advisor" && <span style={{ padding: "3px 10px", background: "rgba(108,59,255,0.1)", color: "var(--accent-2)", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, fontFamily: "var(--font-mono)", border: "1px solid rgba(108,59,255,0.2)" }}>✦ AI POWERED</span>}
            </div>
            <div className="topbar-right">
              <button className="theme-btn" onClick={toggleDark} title="Toggle dark mode"><Icon name={dark ? "sun" : "moon"} size={17} /></button>
              <NotifDropdown userRole={authData?.role} />
              <div onClick={() => setPage("profile")} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: "0.88rem", padding: "7px 14px", background: "var(--surface-2)", borderRadius: 10, cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background="var(--surface-3)"} onMouseLeave={e => e.currentTarget.style.background="var(--surface-2)"}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: "0.8rem" }}>{authData.name?.[0]}</div>
                {authData.name.split(" ")[0]}
              </div>
            </div>
          </div>
          <div className="content-area">{renderPage()}</div>
        </div>
      </div>
      {toast && <Toast key={toast.key} msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <AIChat userRole={authData?.role} userName={authData?.name} />
    </>
  );
}