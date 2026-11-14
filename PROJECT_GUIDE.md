# Project Guide — SFG Inter-Plant Transfer Tracker

This document explains **what was built, how it works, and why every decision was made**, so you can understand,
demo and defend the project. Read it top to bottom once; use the sections later as reference.

---

## 1. The problem, restated

Three plants build one product. Child parts (SFGs) made in the **Headers** and **Sheet Metal** departments travel
between plants. Today nothing is recorded, so when parts go missing:

- Plant A says "we sent 16", Plant B says "we got 14" — **no record to check**.
- Nobody knows what is **currently on the road**.
- Nobody can tell the **job order** (parent build) whether its parts have arrived.

The brief's minimum: *log a send* and *confirm receipt*, producing *a real, checkable trail*, connected (by design)
to a job order system and scalable to SAP.

**Our core idea:** a transfer is a document with **two independent signatures** — the sender's quantities and the
receiver's own count — and every step is written to a history that **cannot be edited**.

---

## 2. What the system does (feature list → requirement it answers)

| Feature | Screen | Brief requirement it answers |
|---|---|---|
| Log a send against a job order, with quantities, vehicle, remarks | **Send parts** | "Let someone log a send" |
| Transfer number + printable slip that travels with the parts | Transfer → **Print slip** | Physical ↔ digital link |
| Receiving plant's inbox, slip-number lookup | **Receive parts** | "Someone on the other end confirms receipt" |
| Receiver enters **own count** (blank fields), reason required if different | **Count & confirm** | Solves "we never received it" disputes |
| Discrepancy → visible to both plants → closed with a written note | Transfer page | Resolution of disputes |
| Immutable audit trail with who / plant / time / snapshot, CSV export | Transfer page, **Audit trail** | "Real, checkable trail" |
| Overdue flag (> 24 h in transit), KPIs | **Dashboard** | "Something goes missing" is noticed early |
| Job order progress: needed / on the way / received / outstanding | **Job orders** | "Show how the two would talk" + dummy JO file |
| SAP posting queue (303/305/304) with mock SAP adapter | **SAP sync** | "Scalable to eventually connect with SAP" |
| Persisted in Postgres, hosted | — | "Must actually run and persist data" |

---

## 3. Architecture

```
                     ┌─────────────────────────────── Next.js app (Vercel) ───────────────────────────────┐
  Browser (plants)   │  Pages (src/app/*)          REST API (src/app/api/*)       Business logic (src/lib)  │
  ───────────────►   │  Dashboard, Send, Receive ─► POST /api/transfers  ───────►  transfers.ts             │
                     │  Transfer, Job orders,       POST /:id/receive             (validate → change →     │
                     │  Audit, SAP sync             GET  /api/job-orders/:no        audit event → outbox)   │
                     └──────────────┬───────────────────────────────┬──────────────────────┬────────────────┘
                                    │ Prisma                        │                      │
                                    ▼                               ▼                      ▼
                     ┌────────────────────────┐      ┌──────────────────────────┐   ┌──────────────────────┐
                     │ Postgres (Neon)        │      │ JobOrderProvider          │   │ SapAdapter            │
                     │ Plant, Material,       │      │ today: data/job_orders.json│   │ today: Mock           │
                     │ Transfer, TransferLine,│      │ later: Job Order System API│   │ later: S/4HANA OData  │
                     │ TransferEvent (locked),│      └──────────────────────────┘   └──────────▲───────────┘
                     │ OutboxEvent            │──── processOutbox() reads queue ──────────────┘
                     └────────────────────────┘
```

**Folder map**

```
prisma/schema.prisma        data model (tables) — read this first
prisma/migrations/          SQL that created the tables + the audit-lock trigger + check constraints
prisma/seed.ts              master data + 5 realistic demo transfers
data/job_orders.json        DUMMY export of the job order system
src/lib/transfers.ts        ★ the business rules: send, receive, cancel, resolve
src/lib/jobOrders.ts        job order boundary + SFG progress calculation
src/lib/sap.ts              SAP boundary: payload format, mock adapter, outbox processor
src/lib/session.ts          "who am I" cookie
src/app/api/**              REST endpoints (thin: they call src/lib)
src/app/**/page.tsx         screens
src/components/             forms and tables used by screens
scripts/verify-integrity.ts proves the DB blocks tampering
scripts/e2e.sh              end-to-end HTTP test of the full flow
```

---

## 4. Data model

| Table | What it holds | Key fields |
|---|---|---|
| **Plant** | The 3 plants | `code` (1100/1200/1300 = SAP *WERKS*), name |
| **Material** | SFG part master | `number` (= SAP *MATNR*), department, unit (*MEINS*) |
| **Transfer** | One shipment (header) | `transferNo`, from/to plant, `jobOrderNo`, `status`, sent by/at, received by/at, cancel & resolution info, `idempotencyKey`, SAP doc numbers |
| **TransferLine** | Each part on a shipment | material, `qtySent`, `qtyReceived`, discrepancy reason + note |
| **TransferEvent** | **Audit trail** (append-only) | type, actor, acting plant, message, full JSON snapshot, time |
| **OutboxEvent** | SAP postings waiting to be sent | eventType, SAP-shaped payload, status, attempts, SAP doc no. |

**Status lifecycle**

```
            send                     receive (counts match)
  (none) ─────────► IN_TRANSIT ────────────────────────────► RECEIVED
                       │  │
                       │  └── receive (any difference / damage) ──► RECEIVED_WITH_DISCREPANCY ──(note)──► resolved
                       │
                       └── sender cancels (before receipt) ──► CANCELLED
```

There is no path back. Once received or cancelled, a transfer is final — corrections are new events or new transfers,
exactly like accounting.

---

## 5. Decision log (what, why, alternative rejected)

| # | Decision | Why | Alternative rejected & reason |
|---|---|---|---|
| D1 | **Next.js + TypeScript** | UI and API in one codebase; one-click Vercel deploy; SAP's CAP framework supports Node.js | Python/FastAPI: needs a separate UI; slower to ship in 5 h |
| D2 | **Postgres (Neon)** instead of SQLite/MySQL | Must persist on a hosted link; strict integrity; JSONB for snapshots; triggers; SAP BTP supports Postgres | SQLite is wiped on serverless redeploys; MySQL has weaker transactional DDL and no free host |
| D3 | **Prisma ORM** | Schema in one readable file, versioned migrations, type-safe queries, transactions | Raw SQL: more code and bug risk |
| D4 | **Two connection strings** (pooled + direct) | Serverless app needs the pooler; migrations need a direct connection | — |
| D5 | **Receiver types their own count; fields start blank** | The whole problem is "sent 16, got 14". Pre-filled "accept" buttons create false confirmations | One-click "Received" button: fast but proves nothing |
| D6 | **Reason required when count ≠ sent**, auto-suggested (Short/Excess) | Turns an argument into a categorised record | Free text only: can't report on it |
| D7 | **Discrepancy closed with a note**, by either involved plant | A dispute needs an end state with an explanation | Editing the quantities: destroys evidence |
| D8 | **Append-only audit trail, enforced by a DB trigger** | A trail you can edit is not a trail. Even an app bug or admin can't rewrite it | App-level "we just don't delete": unprovable |
| D9 | **Full snapshot** on each event | Shows exactly what the record looked like at that moment | Only diff/message: harder to audit |
| D10 | **Check constraints in DB** (plants differ, qty > 0, received ≥ 0) | Rules hold even if someone bypasses the UI/API | UI validation only |
| D11 | **One DB transaction per action** (state + event + outbox) | Trail and data can never disagree | Separate writes: partial failures |
| D12 | **Optimistic lock on receive/cancel** (`update … where status = IN_TRANSIT`) | Two people confirming simultaneously → only one succeeds | Last-write-wins: double receipts |
| D13 | **Idempotency key** per send form | Double-click / network retry can't create duplicates; standard for SAP-style integrations | — |
| D14 | **Transfer must belong to a RELEASED job order, and only its BOM components** | Ties every movement to a build; blocks typos and sending against closed jobs | Free choice of any part: dirty data |
| D15 | **Job order system behind `JobOrderProvider`** | Dummy file today, real API tomorrow — one class to swap | Hard-coding the file everywhere |
| D16 | **JO progress counts only parts confirmed at the assembly plant** | "Sent" ≠ "available to build"; only a confirmed count proves availability | Counting sends: overstates readiness |
| D17 | **SAP mapping: 303 (issue to transit) / 305 (receipt) / 304 (reversal)** | This is SAP's own two-step plant-to-plant transfer — our send/receive match it 1:1 | One-step 301: hides in-transit stock, which is exactly what we track |
| D18 | **Transactional outbox + adapter** for SAP | Plants keep working when SAP is down; retries; nothing lost; easy to swap mock → real | Calling SAP directly inside the request: fragile, slow |
| D19 | **SAP field names** (MATNR, WERKS, UMWRK, MENGE, MEINS, BWART, XBLNR) | Integration later is a mapping, not a redesign | — |
| D20 | **Name + plant picker (cookie) instead of login** | 5-hour scope; still every action is signed | Real auth: out of scope; listed as next step |
| D21 | **Printable slip** with transfer number | Shop floor works with paper; the number links the physical load to the record | QR code: next step |
| D22 | **Overdue = 24 h** | Plants are nearby; same-day delivery expected. One constant to change | — |
| D23 | **Times in Dubai time** in UI, UTC in DB/CSV | Users read local; systems exchange UTC | — |
| D24 | **Plain CSS, no UI library** | Fewer dependencies and build risks; fast | Tailwind/MUI: setup time |

---

## 6. How each screen solves the problem

- **Dashboard** — opens on *your plant's* to-do: what's coming to you, what you sent that isn't confirmed (still your
  responsibility), and open disputes. KPIs at top link to filtered lists. Overdue rows are red.
- **Send parts** — step-by-step: job order → destination (auto-filled with the assembly plant) → parts table that
  shows *needed / received / on the way / still to send* so the sender sends the right amount → summary sentence
  before submitting.
- **Receive parts** — type the slip number (accepts `TRF-000004`, `trf-4` or `4`). If it's addressed to another plant
  you're told **not to accept it**. Otherwise you go straight to the count screen.
- **Count & confirm** — blank count fields, live difference column, reason dropdown appears when needed, a preview
  ("this will be recorded as RECEIVED WITH DISCREPANCY") and a declaration checkbox signed with your name.
- **Transfer page** — status banner in plain English (e.g. "Overdue — in transit 1d 4h, waiting for Plant 3"),
  only the buttons *you* are allowed to press (and why not, if none), sent vs counted table, SAP postings, and the
  full timeline with snapshots.
- **Job orders** — per build: which SFGs are complete, arriving, or short → "ready to build" or not.
- **Audit trail** — every event, filterable, downloadable as CSV.
- **SAP sync** — the outbox queue with payloads; a button simulates the background job.

---

## 7. How the job order system and the tracker talk

```
Job Order System ──(1) job orders + BOM──► Tracker      (today: data/job_orders.json via FileJobOrderProvider)
Job Order System ◄──(2) SFG progress───── Tracker      GET /api/job-orders/JO-26-0101
```

(1) **Inbound:** the tracker reads job orders (number, product, quantity, assembly plant, components, status). It
never edits them. Sending is only allowed against RELEASED job orders and their components.

(2) **Outbound:** the job order system asks "for my build, how much of each SFG has physically arrived?" Response:

```json
{ "readyToBuild": false, "completeCount": 4,
  "components": [ { "materialNumber": "SM-2003", "required": 4, "received": 3, "inTransit": 0, "outstanding": 1 } ] }
```

Production option: push instead of poll — add a `JOB_ORDER_PROGRESS` event to the same outbox.

---

## 8. How SAP plugs in later

1. Every send/receive/cancel already writes an `OutboxEvent` with an SAP goods-movement payload:
   ```json
   { "BWART": "303", "BUDAT": "2026-11-14", "XBLNR": "TRF-000006",
     "ITEMS": [ { "MATNR": "SM-2003", "WERKS": "1200", "UMWRK": "1300", "MENGE": 4, "MEINS": "EA" } ] }
   ```
2. `processOutbox()` sends pending items through `SapAdapter`, stores the SAP material document number on the
   transfer and adds a "Posted to SAP" event to the trail. Failures are retried (up to 5).
3. To go live: write `ODataSapAdapter` calling S/4HANA `API_MATERIAL_DOCUMENT_SRV` (or BAPI_GOODSMVT_CREATE), run
   `processOutbox` on a schedule (Vercel Cron), and load Plant/Material master data from SAP instead of the seed.

---

## 9. Verification performed (all passing)

| Check | How | Result |
|---|---|---|
| Schema migrated to Neon | `prisma migrate status` | up to date |
| Audit trail cannot be edited/deleted | `npm run verify:db` | UPDATE & DELETE rejected by trigger |
| DB rejects same-plant & negative qty | `npm run verify:db` | rejected by check constraints |
| Type safety | `tsc --noEmit` | 0 errors |
| Production build | `npm run build` | 23 routes compiled |
| 6 invalid sends rejected (no login, same plant, CLOSED JO, part not in BOM, negative qty, unknown JO) | `scripts/e2e.sh` | all rejected with clear messages |
| Double submit → same transfer | e2e | same `TRF-000006` returned twice |
| Wrong plant can't receive; sender can't receive; outsider can't cancel | e2e | 403 with explanation |
| Count mismatch without reason / missing line | e2e | rejected |
| Receive twice / cancel after receipt / resolve twice | e2e | rejected (409) |
| Full flow send → short receipt → resolve → SAP sync | e2e | trail of 5 events, 303 + 305 posted |
| JO progress math | e2e | JO-26-0101 = 4/5 complete, SM-2003 1 outstanding |
| All pages render | e2e | 200; unknown transfer → 404 |
| Slip lookup: wrong plant warning, valid → receive screen | curl | correct |

---

## 10. Glossary

- **SFG** — semi-finished good: a child part used later in the final product.
- **Job order** — the work order for building the parent product; lists required components (BOM).
- **BOM** — bill of materials: parts and quantities per finished unit.
- **WERKS / MATNR / MEINS / MENGE / UMWRK / BWART** — SAP fields: plant / material / unit / quantity / partner plant / movement type.
- **303 / 305 / 304** — SAP movement types: remove from sending plant into transit / receive into receiving plant / reverse 303.
- **Outbox pattern** — write "message to send" in the same DB transaction as the business change; deliver later.
- **Idempotency key** — unique ID per request so repeating it has no extra effect.
- **Optimistic lock** — update only if the record is still in the expected state; otherwise tell the user to refresh.
- **Append-only** — rows can be added, never changed or removed.

---

## 11. Likely interview questions — short answers

- *Why not just a "Received" button?* — It would confirm receipt without proving quantity, the exact dispute we're solving.
- *What if two plants disagree?* — Both numbers are permanently recorded with names and times; the discrepancy stays
  open and visible until one of them closes it with an explanation.
- *What if SAP is down?* — Nothing changes for users; postings wait in the outbox and are retried.
- *How do you know the trail is genuine?* — The database rejects edits and deletes on audit events; each event stores a full snapshot.
- *How would this scale?* — Stateless app on serverless, Postgres with indexes on status/plant/job order; the outbox
  worker can run independently; master data can come from SAP.
- *Biggest gap?* — Authentication. Identity is self-declared in the prototype.

---

## 12. Commands cheat-sheet

```bash
npm run dev          # local dev server, http://localhost:3000
npm run db:seed      # reset demo data
npm run db:studio    # browse tables in the browser
npm run verify:db    # tamper-proof checks
npm run test:e2e     # full HTTP flow test (server on :3100)
```
