# Fellowship Management System

Living Faith Church **Communications Portal** — a React app for soul-winning contacts, SMS/WhatsApp outreach, and automated event reminders.

## Features

- **Auth** — email/password + 6-digit MFA
- **Contacts** — E.164 phone formatting, WhatsApp status checks, tags, archive
- **Messaging** — templates, broadcast, delivery history
- **Schedule** — daily / weekly / monthly reminders with lead times
- **Users** — admin access control for authorized team members



## Stack

- React 19 + Vite 8 + TypeScript
- Tailwind CSS v4
- Local persistence via `localStorage` / `sessionStorage` (mock API in `src/lib/mockApi.ts`)

## Develop

```bash
pnpm install
pnpm dev
```

```bash
pnpm build
pnpm preview
```

## Project layout

```
src/
  App.tsx                 # Shell, auth gate, mobile nav
  components/
    auth/                 # Login + MFA
    contacts/             # Contact CRM
    messaging/            # Compose & history
    schedule/             # Event automation
    users/                # Access control
    dashboard/            # Home overview
    layout/               # Sidebar
  lib/
    store.ts              # Seed data + persistence
    mockApi.ts            # Auth, messaging, WhatsApp APIs
  types/                  # Shared TypeScript types
```
