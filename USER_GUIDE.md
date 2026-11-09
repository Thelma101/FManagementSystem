# Living Faith (Lekki Zone) Communications

---

## What the portal is for

Record people met in the harvest field, send approved SMS or WhatsApp messages, mark who came to service, and follow them up.

**Harvest Field · Follow-up · Establishment**  
**Every Soul Matters. Every Step Counts.**

---

## How the system knows “your people”

On the Add contact form there is a field called **Assigned to** (Follow-up).

- When **you** open Add contact, that field is **already filled with your name**.
- You can change it to another worker before you save.
- When you save, the portal also stores that **you** created the record.

Later, Contacts only shows you people where:

- **Assigned to** is you, or  
- you were the one who added them.

Admins and Super Admins see everyone.

So “defaults to you” means: the form pre-selects you in **Assigned to** — you do not have to type your name every time.

---

## Sign in

1. Open the portal website.
2. Enter email and password → **Sign in**.
3. First time: change the temporary password you were given.
4. Forgot password: click **Forgot password?**, check your email (and spam), open the link, choose a new password.

Need an account? Ask an Admin.

---

## Everyday steps

### Add a contact
1. **Contacts** → **+ Add contact**
2. Name, phone (start with +234…), where you met them
3. Choose who does follow-up (defaults to you)
4. Save (you can also send a welcome message)

### Send a message
1. **Messaging**
2. Pick a template (fixed wording)
3. Choose people → **SMS** or **WhatsApp**
4. **Message History** shows the full text that was sent

### Mark attendance
1. **Attendance**
2. Pick the week
3. Tick who came

### Download reports (Admins)
1. **Reports**
2. Choose type and dates
3. Download if needed

---

## Roles (simple)

| Who | What they do |
|-----|----------------|
| **Authorized** | Their own contacts and follow-up list; send templates; attendance |
| **Admin** | Everyone’s records; reports; erase when someone asks; add Authorized users |
| **Super Admin** | Everything, including adding Admins |

Give access only to people who need it. Remove access when they leave.

---

## If someone asks to remove their details

Tell an Admin. There are two different buttons — use the right one:

| Button | When to use it | What happens |
|--------|----------------|--------------|
| **Erase** | The person said “remove my record” / “forget me” | Their name, phone, notes and message wording are blanked. Attendance numbers stay (without their name). This is the privacy request. |
| **Delete** | Duplicate, test, or wrong entry staff created by mistake | The whole contact row is removed. Do **not** use this for a privacy request. |

Rule of thumb: **they asked to be forgotten → Erase. Staff mistake → Delete.**

---

## Where the live system runs (production)

Going forward, the **whole live app** will run on **[Render](https://render.com)**. Simply because it can house all parts of the system - FE, BE, DB

| Piece | On Render? | What it is |
|-------|------------|------------|
| Website (what you open in the browser) | Yes | Static / web service |
| Server (sending SMS / WhatsApp, users) | Yes | Web service |
| Database (contacts, messages, logins data) | Yes | Render Postgres |
| SMS credit (production) | **No — BulkSMS Nigeria** | Buy credit and keys at [bulksmsnigeria.com](https://www.bulksmsnigeria.com) |

**Going forward, production SMS uses [BulkSMS Nigeria](https://www.bulksmsnigeria.com)** (flat rate per SMS, DND included). Credit is bought on their site, not inside Render.

### BulkSMS Nigeria (production SMS account)
1. Create / log in at [BulkSMS Nigeria](https://www.bulksmsnigeria.com).
2. Fund the wallet (SMS credit).
3. Copy API credentials from their dashboard.
4. Set sender name (up to 11 letters), e.g. `WCLekkiZone`.
5. Put those details in Render’s environment settings (tech person does this).

Pricing: see [bulksmsnigeria.com/pricing](https://www.bulksmsnigeria.com/pricing) (about ₦6.49 per SMS + VAT on top-up).

---

## Quick fixes

| Problem | Try this |
|---------|----------|
| Can’t sign in | Check password, or use Forgot password |
| Reset email link fails | Ask tech to set the live site URL in login settings |
| SMS not sending | Check BulkSMS Nigeria wallet credit and API key on Render |
| I don’t see a contact | Check if you added them or if Follow-up is assigned to you |

---

## Need help?

Ask a Super Admin, or the person who manages the web application.