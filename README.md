# Fellowship Management System

Living Faith Church **Communications Portal** — a web app for recording souls met on the harvest field, following them up by SMS/WhatsApp, tracking service attendance and producing reports.

## Features

- **Auth** — email/password + 6-digit verification code
- **Roles** — Super Admin, Admin, Authorized user (see below)
- **Contacts**
  - International phone validation (all country codes via libphonenumber)
  - Duplicate detection — warns if the number was saved before (including archived contacts) and links to the existing record
  - Where and when the person was met
  - Spiritual status: born again (date + place of salvation), baptised (date + place), Cell Fellowship (WSF) membership
  - Service commitment: will they attend, and which services (Sunday, Midweek, WSF, Spiritual Emphasis, Special Events)
  - Tags and notes
  - **Custom fields** — Admins add extra questions from Contacts → Fields: Yes/No (optionally asking the date and place when Yes, e.g. Bible school), text, date, or pick-from-a-list. They appear on the contact form, as filters and badges, in imports and in the contacts register report. Hiding a field keeps the answers already saved.
  - **Bulk import** — Contacts → Import takes an Excel (.xlsx) or CSV file (up to 5,000 rows). Columns are matched automatically and can be changed; every row is checked before saving (invalid phones and numbers already saved are skipped). A template with all fields can be downloaded from the import window.
  - WhatsApp number verification (third-party provider, see below)
- **Welcome messages** — sent automatically when a contact is added; pick a saved template or write a custom message each time. Placeholders: `{name}`, `{location}`, `{date}`, `{service}`
- **Attendance** — weekly register of who attended which service type, including special events (Liberation Mandate Anniversary, AYAC, Shiloh, or any other)
- **Reports** — weekly attendance, attendance by contact, weekly summary and the full contacts register, downloadable as **Excel, PDF or Word**
- **Messaging** — templates, broadcast, delivery history
- **Schedule** — daily / weekly / monthly reminders with lead times

## Roles

| Role | Can do | Can add / remove |
|------|--------|------------------|
| **Super Admin** | Everything | Super Admins, Admins, Authorized users |
| **Admin** | Contacts, attendance, messaging, schedules, reports, delete records, contact fields | Authorized users only |
| **Authorized user** | Add and import contacts, send messages, record attendance, view reports | Nobody |

Nobody can change or revoke their own account. Keep at least two Super Admins so the portal can't be locked out.

## WhatsApp number verification

WhatsApp does not offer a public "is this number on WhatsApp?" lookup, so the portal calls a third-party provider through a small server endpoint (`/api/whatsapp/check`). The API key stays on the server and is never sent to the browser.

Supported providers:

- [WA Lookup](https://walookup.com/api-docs) — `WA_CHECK_PROVIDER=walookup`
- [2Chat](https://developers.2chat.co/docs/API/WhatsApp/Web/check-number) — `WA_CHECK_PROVIDER=2chat` (also needs `WA_CHECK_SENDER`, your connected WhatsApp number)

Setup: copy `.env.example` to `.env.local` (local) or add the same variables in your hosting dashboard, then restart.

```bash
WA_CHECK_PROVIDER=walookup
WA_CHECK_API_KEY=your-key
```

Without a provider the portal runs in **demo mode**: checks are simulated (even last digit → on WhatsApp) and labelled "demo" in the contacts list. The Users page shows whether a provider is connected.

## SMS sending (eBulkSMS)

Real SMS goes out through [eBulkSMS](https://www.ebulksms.com/pages/json-api) via the server endpoint `/api/sms/send`, so the API key never reaches the browser. Set `EBULKSMS_USERNAME`, `EBULKSMS_API_KEY`, `EBULKSMS_SENDER` (max 11 characters) and `EBULKSMS_DND` (see `.env.example`). The route only accepts signed-in portal members, so it also needs the Supabase server variables; in demo mode SMS stays simulated.

- Messages that eBulkSMS accepts are logged as **sent**; simulated ones as **delivered**.
- Every message box shows a live SMS counter. A plain-text SMS page holds 160 characters; one special character (such as `—` or curly quotes) drops that to 70. **Fix characters** swaps them for plain ones, and the server does the same before sending.
- eBulkSMS charges 4 units per SMS page. Messaging shows the units left. A broadcast stops at the first account error (such as running out of credit).
- WhatsApp sending is still simulated until a WhatsApp provider is connected.

## Database & sign-in (Supabase)

When the Supabase variables are set (see `.env.example`), the portal stores everything in Supabase and uses Supabase Auth for sign-in. Without them it runs in **demo mode** using browser storage and the demo logins below.

- **Schema:** `supabase/migrations/0001_init.sql` — tables, row-level security (only portal members can read or write; only Admins can delete contacts, logs and schedules). Apply with `npm run db:migrate`.
- **First Super Admin:** `npm run create-superadmin -- you@example.com "Your Name"` prints a temporary password.
- **Adding people:** from the Users page. New users get a temporary password and must choose their own at first sign-in. Accounts are created by `api/admin/users` on the server with the secret key, which never reaches the browser.
- **Forgot password:** sends a reset email. In Supabase → Authentication → URL Configuration, set the Site URL to the live address and add `http://localhost:8443` to the redirect URLs.
- **Recommended:** Supabase → Authentication → Sign In / Providers → turn off "Allow new users to sign up" (only admins should create accounts).

## Demo logins (demo mode only)

| Role | Email | Password | Code |
|------|-------|----------|------|
| Super Admin | `admin@fellowship.church` | `admin123` | `847291` |
| Admin | `coadmin@fellowship.church` | `coadmin123` | `193847` |

## Stack

- React 19 + Vite 8 + TypeScript, Tailwind CSS v4
- `libphonenumber-js` (phone validation), `write-excel-file`, `jspdf` + `jspdf-autotable`, `docx` (report exports, loaded on demand)
- Supabase (Postgres + Auth) via `@supabase/supabase-js`; demo mode falls back to browser `localStorage`
- Serverless functions in `api/` (WhatsApp check, user management, SMS sending), Vercel-style; the same handlers run inside the Vite dev/preview server

## Going live

The portal is a web application: people use it in a browser (phone or laptop) at a web address, so no physical servers are needed. For real church use with several team members sharing the same data:

1. **Hosting (frontend + API):** Vercel or Netlify — deploy straight from this GitHub repo; free tier is enough to start.
2. **Database + logins:** Supabase (connected — see above) so every user sees the same contacts, attendance and reports.
3. **Messaging:** SMS through eBulkSMS (connected — see above); WhatsApp via the Meta WhatsApp Cloud API or a partner (BSP).
4. **WhatsApp number check:** WA Lookup or 2Chat key set as an environment variable.
5. **Scheduled reminders:** a server-side cron job (Vercel Cron / Supabase scheduled functions) so reminders go out even when nobody has the portal open.

## Develop

```bash
npm install
npm run dev      # http://localhost:8443
npm run build
npm run preview
```

## Project layout

```
api/whatsapp/check.ts     # Serverless WhatsApp check endpoint
server/whatsappCheck.ts   # Provider integrations (WA Lookup, 2Chat)
src/
  App.tsx                 # Shell, auth gate, mobile nav
  components/
    auth/                 # Login + verification code
    contacts/             # Contacts list, add/edit form (duplicates, welcome message), custom fields, import
    attendance/           # Weekly service attendance register
    reports/              # Reports + Excel/PDF/Word export
    messaging/            # Compose & history
    schedule/             # Event automation
    users/                # Roles & access control
    dashboard/            # Home overview
    layout/               # Sidebar + navigation
  lib/
    store.ts              # Seed data + persistence
    permissions.ts        # Role rules
    services.ts           # Service types, special events, week helpers
    whatsapp.ts           # WhatsApp check client (provider or demo)
    welcome.ts            # Welcome message templates
    exporters.ts          # Excel / PDF / Word generation
    phone.ts              # International phone validation
    mockApi.ts            # Auth + message sending (simulated)
  types/                  # Shared TypeScript types
```
