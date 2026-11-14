# SFG Inter-Plant Transfer Tracker — Design Note

**Prototype:** _[hosted link]_ · **Repo:** _[GitHub link]_ · Stack: Next.js (TypeScript) · Postgres (Neon) · Prisma · Vercel

## The problem in one line
When a plant says "we never got it", there must be a record that answers who sent what, when, how many — and who counted what on arrival.

## Assumptions
- Three plants (codes 1100 / 1200 / 1300, SAP-style). SFGs come from the Headers and Sheet Metal departments; the product (an AHU) is assembled at one plant per job order.
- Every transfer is raised against one **job order** and only for that job order's components (its BOM).
- Quantities are whole pieces (`EA`). One sender plant and one receiver plant per transfer; receipt is confirmed once.
- No real login: users pick name + plant (cookie). Every action is still stamped with that identity.
- "Overdue" = in transit > 24 h (plants are close enough for same-day delivery). Times shown in Dubai time.

## Key decisions and trade-offs
1. **Two independent sign-offs.** The sender logs quantities; the receiver enters its **own count** (fields start blank — no "accept all" button). Any difference needs a reason (short / excess / damaged / wrong part) and becomes a visible *discrepancy* that either plant closes with a written note. *Trade-off:* a little more effort at receiving, in exchange for disputes that are settled by data, not memory.
2. **Append-only audit trail enforced by the database.** Every action writes an event with who, which plant, when and a full snapshot. A Postgres trigger rejects UPDATE/DELETE on events, so not even the app can rewrite history. Business rules (different plants, qty > 0) are also DB constraints, not just UI checks.
3. **One transaction per action:** state change + audit event + SAP outbox row commit together or not at all. Receipt uses a conditional update, so two people confirming at the same moment cannot both win. An idempotency key stops double-clicks creating duplicate transfers.
4. **SAP-ready, not SAP-dependent (transactional outbox).** Send/receive/cancel map to SAP's two-step plant transfer — movement types **303 / 305 / 304** — with SAP field names (MATNR, WERKS, UMWRK, MENGE, MEINS). Postings are queued in an outbox and delivered by an adapter (mock today). If SAP is down, plants keep working; nothing is lost.
5. **Job order system behind an interface.** A dummy `job_orders.json` is read through `JobOrderProvider`; replacing it with the real API is one new class. In the other direction, `GET /api/job-orders/:no` tells the job order system, per SFG, how much is needed, on the way, received and outstanding — i.e. whether the build is ready.
6. **Simple, hosted stack.** One Next.js codebase (UI + REST API) on Vercel with managed Postgres. *Trade-off:* no offline mode and a minimal UI framework, chosen for delivery speed within 5 hours.

## What I'd build next
- Real authentication (SSO) with plant-based roles; supervisor approval for closing discrepancies.
- QR code on the slip → receiver scans on a phone/tablet; offline-tolerant mobile receiving view.
- Real SAP adapter (S/4HANA material-document API) run by a scheduled worker, with alerting on failures.
- Notifications (email/Teams) for new incoming transfers, overdue transfers and new discrepancies.
- Partial receipts across multiple deliveries, return/rework flows, batch or serial-number tracking.
- Reporting: loss rate by route, part and shift; average transit time; automated tests in CI.
