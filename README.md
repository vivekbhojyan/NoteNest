# ABES Academic Hub

Interactive frontend starter for the ABES student academic-resource portal.

## Run locally

```powershell
$env:npm_config_cache = "$PWD\..\work\npm-cache"
npm.cmd install
npm.cmd run dev
```

## What is included

- College-email-only OTP interface (`@abes.ac.in` validation)
- Course/year/branch → subject → five-unit navigation
- Syllabus, sessional papers, previous-year papers, and notes areas
- Notes gate: a student must submit a PDF scoring at least 3/5 before notes are unlocked
- Notes sorted by rating, upload controls, AI study-notes action
- Administrator content hierarchy, official-syllabus upload, and quality policy controls

## Production services to connect

The interface is deliberately in demo mode. A secure production build needs:

1. **Microsoft Entra ID / Microsoft Graph** or another college-approved sender for OTP delivery. Never put client secrets in the browser.
2. **Backend and database** (e.g. Next.js API routes + PostgreSQL) to store users, OTP hashes/expiry, resources, ratings and permissions.
3. **Private PDF storage** (Azure Blob Storage, AWS S3, etc.) with signed download URLs and malware scanning.
4. **AI evaluation service**: render PDFs to page images, evaluate OCR readability/handwriting/clarity and syllabus-topic coverage, persist an auditable per-criterion score. Only unlock notes after the backend records a final score `>= 3.0`.
5. **Role based access** for department admins, server-side authorization on every upload/delete/download endpoint, rate limiting for OTP, and audit logs.

## Backend added: Nodemailer + MongoDB

The project now includes `server/index.ts` with the following endpoints:

- `POST /api/auth/request-otp` — validates `@abes.ac.in`, issues a ten-minute OTP and mails it via Nodemailer.
- `POST /api/auth/verify-otp` — permits five attempts, deletes the OTP after success, creates a MongoDB user, and returns an eight-hour JWT.
- `POST /api/ai/evaluate-note` — calculates a 1–5 result against syllabus topics; notes at `>= 3` pass. It expects an OpenAI-compatible AI endpoint, or supports `DEMO_AI=true` during interface testing.

Copy `.env.example` to `.env`, enter the actual SMTP and MongoDB settings, then run the API in a second terminal:

```powershell
npm.cmd run server
```

Never commit `.env` or place API keys in browser-side `VITE_*` variables.

## Suggested scoring rubric

| Criterion | Weight |
| --- | ---: |
| Readability/OCR confidence | 25% |
| Handwriting/visual legibility | 20% |
| Explanation clarity/structure | 25% |
| Syllabus topic coverage | 30% |

Final rating is the weighted score on a 1–5 scale. Keep the model explanation and rubric subscores for admin appeals.
