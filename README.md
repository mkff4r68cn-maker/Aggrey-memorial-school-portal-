# Aggrey Memorial A.M.E. Zion SHS — School App & Secure Student Portal

A formal, mobile-first Progressive Web App (PWA) for school information with a server-backed student login starter. The front end uses the school-inspired mauve/yellow theme, an app navigation drawer, installation support, and offline caching of the static app shell.

> **Authorization note:** This is a project starter using school name and school-inspired branding. It is not evidence of official approval or affiliation. Before public launch, school management should authorize the app, replace the sample crest with the verified school crest, confirm all contacts and content, and approve its privacy and records policies.

## Included features

- Responsive school information app with Home, About, Academics, Admissions, News & Events, Campus Life, Alumni, Contact, and Student Portal pages
- Installable PWA manifest, icons, service worker and offline shell caching
- Student ID/password login backed by PostgreSQL accounts
- Session authentication with HTTP-only cookies, SameSite=Strict, HTTPS secure cookies in production
- Password hashing using bcryptjs (cost 12) and forced temporary-password change
- CSRF token checks on state-changing endpoints and login throttling
- Student-only timetable and published-results endpoints scoped to the signed-in student
- Public published announcements and admin-protected announcement/student provisioning endpoints
- CLI tools for securely creating administrator and student accounts

## Requirements

- Node.js 20 or later
- PostgreSQL 14 or later (managed PostgreSQL is recommended)
- HTTPS hosting for production (a Node web service, not static-only hosting)

## Run locally

1. Copy `.env.example` to `.env` and edit the values. Generate a secret with `openssl rand -base64 48`.
2. Install dependencies: `npm install`
3. Run the schema: `npm run migrate`
4. Create the first administrator from a secure terminal: `npm run create-admin -- SCHOOLADMIN` (password is entered at a prompt)
5. Start: `npm start`
6. Open `http://localhost:3000` and visit the Student Portal page.

## Create a student account

Use a secure admin terminal. The temporary password is entered interactively and is not placed in the command itself:

```sh
npm run create-student -- AM-2026-001 "Student Full Name" Form-1 General-Science House-A
```

The student ID is their username. The student must change their temporary password on first sign-in. Give credentials to students privately through an approved channel; never post credentials in a class group or shared spreadsheet.

## Admin API

Admin account management and announcement publishing are API-only in this starter. There is no browser-based admin dashboard yet. Admin endpoints require an administrator session and CSRF token.

- `POST /api/admin/students` — provision student account/profile
- `POST /api/admin/announcements` — publish an announcement
- `GET /api/announcements` — read published notices
- `GET /api/health` — basic server/database health check

## Production deployment checklist

1. Provision a managed PostgreSQL database with backups enabled.
2. Deploy this project as a Node web service (build/install command: `npm install`; start command: `npm start`). Static hosting alone will not run the login backend.
3. Set deployment environment variables: `NODE_ENV=production`, `PORT` (provider-managed if applicable), `DATABASE_URL`, `DATABASE_SSL=true` if the database requires TLS, `SESSION_SECRET` (secure random 32+ chars), and `TRUST_PROXY=1` only if the provider uses one trusted proxy hop.
4. Run `npm run migrate` once from a secure deployment shell or approved migration workflow.
5. Create an administrator account in the secure deployment shell.
6. Test login, first-password-change flow, logout, session expiry, student record isolation, and announcements before adding real student data.
7. Confirm HTTPS is enabled and the PWA install flow works on Android and iPhone.
8. Have school management approve data access, privacy notices, retention, backup, and admin responsibilities under applicable Ghanaian privacy law before using real student information.

## API routes

- `GET /api/csrf` — CSRF token
- `POST /api/auth/login` — student/admin authentication (portal UI accepts student role only)
- `GET /api/auth/me` — current session/profile
- `POST /api/auth/change-password` — change password
- `POST /api/auth/logout` — end session
- `GET /api/student/timetable` — signed-in student's timetable
- `GET /api/student/results` — published results for signed-in student only
- `GET /api/announcements` — published announcements
- `POST /api/admin/students` — administrator-only account provisioning
- `POST /api/admin/announcements` — administrator-only announcement publishing
- `GET /api/health` — health check

## Security limitations / next phase

This is a secure starter, not a completed production student information system or a substitute for a professional security review. It does not include an admin web dashboard, password-reset email flow, MFA, detailed audit logs, timetable/results administration UI, bulk import, or full operational incident/backup procedures. Do not add real student records until the school authorizes deployment and has reviewed the privacy, access, and operational controls.
