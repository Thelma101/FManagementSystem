# Fellowship Management System

Living Faith Church **Communications Portal** — a React app for soul-winning contacts, SMS/WhatsApp outreach, and automated event reminders.

## Features

- **Auth** — email/password + 6-digit MFA
- **Contacts** — international phone validation (all country codes via libphonenumber), WhatsApp status checks, tags, archive
- **Messaging** — templates, broadcast, delivery history
- **Schedule** — daily / weekly / monthly reminders with lead times
- **Users** — admin access control for authorized team members

## Phone & WhatsApp notes

**Phone validation** uses [libphonenumber-js](https://gitlab.com/catamphetamine/libphonenumber-js) (Google’s libphonenumber rules): country dial codes, national length, and E.164 formatting.

**WhatsApp “Check” is mocked in this demo** (even last digit → active). Production should call a real existence API, for example:

- [2Chat](https://developers.2chat.co/docs/API/WhatsApp/Web/check-number) — check if a number is on WhatsApp
- [WA Lookup](https://walookup.com/api-docs) — registration check (`service_type: ws`)
- [WAWP](https://api.wawp.net/en/docs/v2/contacts/check-exists) / Sendexa / ZelNum — similar number-exists lookups

Official Meta WhatsApp Cloud API is for *messaging*, not a public “is this number on WhatsApp?” lookup — partners usually wrap that.

After saving a contact: open **Edit → Check WhatsApp** (or use **Verify N** for unverified contacts).

## Demo login

| Field | Value |
|-------|-------|
| Email | `admin@fellowship.church` |
| Password | `admin123` |
| MFA | `847291` |

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
    phone.ts              # International phone validation
  types/                  # Shared TypeScript types
```
