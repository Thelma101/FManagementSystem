# Fellowship Management System

Living Faith Church **Communications Portal** — a web app for recording souls met on the harvest field, following them up by SMS/WhatsApp, tracking service attendance and producing reports.

## Features

- **Auth** — email/password + 6-digit verification code
- **Roles** — Super Admin, Admin, Authorized user (see below)
- **Contacts**
  - International phone validation (all country codes via libphonenumber)
  - Duplicate detection — warns if the number was saved before (including archived contacts) and links to the existing record
  - Where and when the person was met
  - Spiritual status: born again (date + place of salvation), baptised (date), Cell Fellowship (WSF) membership
  - Service commitment: will they attend, and which services (Sunday, Midweek, WSF, Spiritual Emphasis, Special Events)
  - Tags and notes
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
| **Admin** | Contacts, attendance, messaging, schedules, reports, delete records | Authorized users only |
| **Authorized user** | Add contacts, send messages, record attendance, view reports | Nobody |

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

## Demo logins

| Role | Email | Password | Code |
|------|-------|----------|------|
| Super Admin | `admin@fellowship.church` | `admin123` | `847291` |
| Admin | `coadmin@fellowship.church` | `coadmin123` | `193847` |

## Stack

- React 19 + Vite 8 + TypeScript, Tailwind CSS v4
- `libphonenumber-js` (phone validation), `write-excel-file`, `jspdf` + `jspdf-autotable`, `docx` (report exports, loaded on demand)
- Serverless function in `api/` for the WhatsApp check (Vercel-style); the same handler runs inside the Vite dev/preview server
- **Current storage:** browser `localStorage` — data lives on each device only. See *Going live* below.

## Going live

The portal is a web application: people use it in a browser (phone or laptop) at a web address, so no physical servers are needed. For real church use with several team members sharing the same data:

1. **Hosting (frontend + API):** Vercel or Netlify — deploy straight from this GitHub repo; free tier is enough to start.
2. **Database + logins:** Supabase or Firebase — so every user sees the same contacts, attendance and reports, with real password security and backups.
3. **Messaging:** an SMS provider (Termii, Africa's Talking, Twilio) and WhatsApp via the Meta WhatsApp Cloud API or a partner (BSP).
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
    contacts/             # Contacts list + add/edit form (duplicates, welcome message)
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
