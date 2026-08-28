# Product Requirements Document: InterviewHub AI

| | |
|---|---|
| **Product** | InterviewHub AI |
| **Document Type** | Product Requirements Document (PRD) |
| **Version** | 1.0 (Draft) |
| **Status** | Draft — for review |
| **Date** | August 7, 2026 |
| **Owner** | Product Team |

---

## 1. Executive Summary

InterviewHub AI is a unified, AI-powered technical interview platform that consolidates video interviews, live collaborative coding, resume intelligence, scheduling, and hiring analytics into a single application. It replaces the fragmented stack of Google Meet/Zoom, HackerRank/CoderPad, resume ATS tools, Google Docs, Excel, and calendar apps that technical hiring teams currently stitch together.

The product's core differentiator is the combination of **real-time collaborative coding** and **HD video interviewing** in one interface, layered with **AI-driven resume scoring** and **recruiter analytics** — reducing tool-switching, standardizing evaluation, and improving both interviewer and candidate experience.

---

## 2. Problem Statement

Technical interviews today are fragmented across an average of five or more disconnected tools:

- Video conferencing (Google Meet / Zoom)
- Coding assessment platforms (HackerRank / CoderPad)
- Resume/ATS tools and email threads
- Google Docs for notes
- Excel sheets for tracking
- Separate calendar tools for scheduling

**Consequences of this fragmentation:**

| Pain Point | Impact |
|---|---|
| Time wasted switching between apps | Lower interviewer throughput, longer time-to-hire |
| Poor interview management | Interviews are harder to plan, track, and audit |
| Reduced interviewer productivity | Manual note-taking and context-switching during live interviews |
| Inconsistent evaluation records | No standardized scoring or searchable history across candidates |
| Poor candidate experience | Candidates juggle multiple links, logins, and tools |

**Opportunity:** A single platform that owns the entire technical-hiring workflow — from resume upload to hiring decision — can materially reduce this overhead while improving evaluation consistency.

---

## 3. Goals and Objectives

### 3.1 Business Goals
- Consolidate 5+ point solutions into one platform to reduce recruiting-tool spend and vendor sprawl for customers.
- Reduce average time-to-hire for technical roles.
- Improve interview evaluation consistency and auditability.

### 3.2 Product Goals
- Deliver stable, low-latency video interviews with integrated live coding in one browser tab.
- Provide instant, structured resume/ATS feedback to both candidates and recruiters.
- Give recruiters a single dashboard for scheduling, tracking, reviewing, and comparing candidates.
- Ship a secure, role-based platform suitable for enterprise hiring teams.

### 3.3 Non-Goals (for v1)
- Full HRIS / payroll / onboarding functionality.
- Non-technical (e.g., behavioral-only or sales) interview workflows — v1 is scoped to technical/coding interviews.
- Native mobile apps (tracked under Future Scope).

---

## 4. Target Users & Personas

| Persona | Description | Key Needs |
|---|---|---|
| **Recruiter / Hiring Coordinator** | Schedules interviews, manages candidate pipeline, reviews recordings | Fast scheduling, centralized candidate tracking, analytics/reporting |
| **Technical Interviewer** | Conducts live coding interviews | Reliable video + shared code editor, ability to run/test code live, easy scoring |
| **Hiring Manager** | Makes final hiring decisions | Access to recordings, ATS scores, interviewer feedback, comparison views |
| **Candidate** | Applies, uploads resume, attends interview | Simple single-link join flow, resume feedback, transparent process, interview history |

---

## 5. Scope

### 5.1 In Scope — MVP
- HD video interviewing (calling, screen share, chat, recording)
- Live collaborative code editor with multi-language support and syntax highlighting
- Instant code compilation/execution and debugging during interviews
- Resume ATS scoring engine (score, missing keywords, skills match, grammar/strength suggestions)
- Smart scheduling (book, reschedule, manage interviews; calendar integration)
- Candidate tracking (full profile and interview history in one place)
- Dual dashboards: Candidate Dashboard and Recruiter Dashboard
- Live analytics (completion rate, hiring trends, performance insight)
- Security: role-based access control (RBAC), encryption, anti-cheat measures

### 5.2 Out of Scope — v1
- AI mock interviews (Future Scope)
- Voice emotion analysis (Future Scope)
- Automated interview question generation (Future Scope)
- Native mobile application (Future Scope)
- Multi-language (i18n) UI support (Future Scope)
- Coding contest / hackathon mode (Future Scope)

---

## 6. Functional Requirements

### 6.1 HD Video & Chat
| ID | Requirement |
|---|---|
| FR-1.1 | System shall support HD video and audio calling between interviewer(s) and candidate. |
| FR-1.2 | System shall support screen sharing during an active interview session. |
| FR-1.3 | System shall provide in-call text chat visible to session participants. |
| FR-1.4 | System shall record full interview sessions (video, audio, and coding activity) and store them for later playback. |
| FR-1.5 | System shall maintain a stable real-time connection with automatic reconnect on network drops. |

### 6.2 Collaborative Code Editor
| ID | Requirement |
|---|---|
| FR-2.1 | System shall provide a shared code editor (Monaco Editor) supporting simultaneous multi-user editing with live cursors. |
| FR-2.2 | Editor shall support syntax highlighting for multiple programming languages. |
| FR-2.3 | System shall allow code execution against a sandboxed compiler service and display output in a shared panel visible to all participants. |
| FR-2.4 | System shall persist code editor state as part of the interview record. |

### 6.3 Instant Compiler / Code Execution
| ID | Requirement |
|---|---|
| FR-3.1 | System shall execute submitted code via a sandboxed compiler service (e.g., Judge0 + Docker) supporting multiple languages. |
| FR-3.2 | System shall return execution results (stdout, stderr, runtime errors) within an acceptable latency threshold (see NFRs). |
| FR-3.3 | System shall isolate code execution per session to prevent cross-session interference or security breaches. |

### 6.4 Resume ATS Analysis
| ID | Requirement |
|---|---|
| FR-4.1 | System shall accept resume uploads (PDF/DOCX) from candidates. |
| FR-4.2 | System shall generate an ATS score for each uploaded resume. |
| FR-4.3 | System shall identify missing keywords relative to a target job description. |
| FR-4.4 | System shall compute a skills-match summary against the job requirements. |
| FR-4.5 | System shall generate grammar and resume-strength suggestions. |
| FR-4.6 | ATS analysis shall be visible to both the candidate (self-view) and the recruiter (evaluation view). |

### 6.5 Smart Scheduling
| ID | Requirement |
|---|---|
| FR-5.1 | Recruiters shall be able to create, edit, reschedule, and cancel interview slots. |
| FR-5.2 | System shall send automated notifications/reminders to candidates and interviewers. |
| FR-5.3 | System shall support calendar integration (e.g., Google Calendar) for availability and invites. |

### 6.6 Candidate Tracking & Dashboards
| ID | Requirement |
|---|---|
| FR-6.1 | Candidate Dashboard shall allow candidates to view/join scheduled interviews, practice coding, and view their ATS reports and interview history. |
| FR-6.2 | Recruiter Dashboard shall allow recruiters to schedule interviews, manage candidates, compare/shortlist candidates, and review recordings. |
| FR-6.3 | System shall maintain a full candidate profile combining resume data, ATS scores, interview recordings, and interviewer feedback. |

### 6.7 Analytics
| ID | Requirement |
|---|---|
| FR-7.1 | System shall report completion rates for scheduled interviews. |
| FR-7.2 | System shall surface hiring trend and performance insight dashboards for recruiters/hiring managers. |

### 6.8 Security
| ID | Requirement |
|---|---|
| FR-8.1 | System shall implement role-based access control (Candidate, Interviewer, Recruiter, Admin roles at minimum). |
| FR-8.2 | System shall encrypt data at rest and in transit. |
| FR-8.3 | System shall implement anti-cheat measures during live coding interviews (e.g., tab-switch detection, paste-tracking, or similar signals — to be defined). |
| FR-8.4 | System shall authenticate users via a managed identity provider with JWT-based session management. |

---

## 7. End-to-End User Workflow

1. **Login** — Candidate authenticates into the platform.
2. **Upload Resume** — Candidate uploads resume for analysis.
3. **ATS Analysis** — System generates ATS score, keyword gaps, and suggestions.
4. **Schedule Interview** — Candidate/recruiter books an interview slot.
5. **Join Video Call** — Candidate and interviewer join the HD video session.
6. **Collaborative Coding** — Both parties interact in the live shared code editor.
7. **Run & Test Code** — Code is executed via the compiler service; output shared live.
8. **Recording Saved** — Full session (video + code activity) is saved to the candidate's profile.
9. **Recruiter Review** — Recruiter/hiring manager reviews recording, ATS score, and interviewer notes.
10. **Hiring Decision** — Final decision recorded and candidate status updated.

---

## 8. System Architecture

**Frontend:** Next.js, React, Tailwind CSS, ShadCN UI
**Backend API:** Node.js, Express.js
**Authentication:** Clerk / Auth.js, JWT
**Primary Data Store:** PostgreSQL
**Session & Cache Layer:** Redis
**Realtime Engine:** WebSocket server (Socket.io)
**Compiler Service:** Judge0 API + Docker sandbox
**Resume ATS Service:** Gemini / OpenAI API-based parsing engine
**Cloud Storage:** AWS S3, Cloudinary
**Deployment:** Vercel (frontend), Railway (backend/services)

### 8.1 Architecture Notes
- The compiler service must run in an isolated, sandboxed Docker environment per execution request to prevent malicious code from affecting shared infrastructure.
- The WebSocket layer (Socket.io) is the backbone for both video-session signaling coordination and live code-editor sync — these should be considered separate channels/rooms per interview session to avoid cross-talk.
- Resume ATS scoring depends on a third-party LLM API (Gemini/OpenAI); the PRD should define fallback behavior if that service is unavailable or rate-limited.

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Video call join time < 3 seconds under normal network conditions; code execution round-trip < 5 seconds for standard test cases. |
| **Scalability** | System shall support concurrent interview sessions scaling horizontally (target concurrency to be defined with engineering based on customer sizing). |
| **Availability** | Target uptime of 99.9% for core interview-session functionality (video + code editor). |
| **Security & Compliance** | Data encryption in transit (TLS) and at rest; RBAC; audit logs for recruiter/admin actions; compliance posture (e.g., SOC 2, GDPR) to be scoped separately. |
| **Data Retention** | Interview recordings and resumes retained per configurable data-retention policy; candidates should be able to request deletion (privacy compliance). |
| **Accessibility** | Core UI (dashboards, join flow) should meet WCAG 2.1 AA where feasible. |
| **Browser Support** | Latest two versions of Chrome, Edge, Firefox, Safari. |

---

## 10. Competitive Positioning

| Capability | InterviewHub AI | Meet / Zoom | HackerRank | CoderPad | LeetCode |
|---|---|---|---|---|---|
| Video Interviews | ✅ | ✅ | ❌ | ❌ | ❌ |
| Collaborative Code Editor | ✅ | ❌ | ✅ | ✅ | ❌ |
| Instant Code Execution | ✅ | ❌ | ✅ | ✅ | ✅ |
| Resume ATS Scoring | ✅ | ❌ | ❌ | ❌ | ❌ |
| Recruiter Analytics | ✅ | ❌ | Partial | ❌ | ❌ |

**Key message:** InterviewHub AI is the only platform in this set unifying video, live coding, and resume intelligence with recruiter-facing analytics — competitors each solve one slice of the workflow.

---

## 11. Success Metrics (KPIs)

- **Time-to-hire**: Reduction in median days from resume upload to hiring decision.
- **Interviewer efficiency**: Number of interviews conducted per interviewer per week without tool-switching overhead.
- **Platform adoption**: % of interviews conducted end-to-end within InterviewHub AI vs. external tools.
- **ATS engagement**: % of candidates who view/act on ATS feedback.
- **Session reliability**: % of interview sessions completed without a disruptive technical failure (video drop, compiler failure).
- **Recruiter satisfaction (CSAT/NPS)**: Measured post-hiring-cycle survey.

---

## 12. Release Plan (Proposed Phasing)

| Phase | Scope | Notes |
|---|---|---|
| **Phase 1 — MVP** | Auth, video interviews, collaborative code editor, instant compiler, basic scheduling, candidate/recruiter dashboards | Core workflow end-to-end |
| **Phase 2 — Intelligence** | Resume ATS scoring, analytics dashboards, RBAC hardening, recording storage/playback | Adds AI-driven insight layer |
| **Phase 3 — Scale & Security** | Anti-cheat measures, audit logging, compliance hardening, performance/scale testing | Enterprise readiness |
| **Phase 4 — Future Scope** | AI mock interviews, voice emotion analysis, auto question generation, mobile app, i18n, coding contest mode | Roadmap beyond v1 |

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Real-time video + code sync at scale causes latency/instability | High — core UX depends on this | Load-test WebSocket infrastructure early; consider dedicated media server (e.g., SFU) rather than pure P2P at scale |
| Third-party LLM dependency (resume ATS) has downtime or cost overrun | Medium | Define fallback/graceful degradation; monitor API costs per resume analysis |
| Code sandbox security vulnerabilities (malicious code execution) | High | Strict Docker sandboxing, resource limits, no network access from execution containers |
| Anti-cheat mechanisms create false positives / candidate distrust | Medium | Make anti-cheat signals advisory, not automatically disqualifying; disclose monitoring to candidates |
| Data privacy concerns with recordings and resumes | High | Configurable retention policy, encryption, clear consent flows, deletion requests |

---

## 14. Future Scope (Post-v1 Roadmap)

- **AI Mock Interviews** — candidate-facing self-practice mode with AI interviewer.
- **Voice Emotion Analysis** — sentiment/confidence signals during interviews.
- **Auto Question Generation** — AI-generated coding/technical questions tailored to role.
- **Mobile Application** — native iOS/Android apps for recruiters and candidates.
- **Multi-language Support** — localized UI for global hiring teams.
- **Coding Contest Mode** — hackathon/assessment-at-scale mode for bulk candidate screening.

---

## 15. Open Questions & Assumptions

- What is the target initial customer segment — SMB tech companies, staffing agencies, or enterprise hiring teams? (Affects pricing, compliance scope, and concurrency requirements.)
- What specific anti-cheat signals are acceptable/required, and how are they disclosed to candidates for legal/ethical compliance?
- What compliance certifications (SOC 2, GDPR, etc.) are required for target customers, and on what timeline?
- What are the expected concurrency numbers (simultaneous interviews) to size infrastructure appropriately?
- Will InterviewHub AI integrate with external ATS/HRIS systems (e.g., Greenhouse, Lever) in v1, or is it a standalone system?

---

*This PRD is based on the InterviewHub AI product overview deck and is intended as a working draft for stakeholder review. Sections marked with open questions should be resolved with engineering, design, and business stakeholders before finalizing scope for Phase 1.*