# SFG Inter-Plant Transfer Tracker

Tracks semi-finished goods (SFGs) from the Headers and Sheet Metal departments as they move between three plants:
**send → in transit → counted & confirmed at the receiving plant**, with a tamper-proof audit trail, a link to the job
order (parent build) and a queue of SAP stock postings.

- **Design note (1 page):** [NOTE.md](NOTE.md)
- **Full project guide & decision log:** [PROJECT_GUIDE.md](PROJECT_GUIDE.md)

## 2-minute demo

1. Open the app → **Choose who you are** → e.g. *Suresh Nair, Plant 2*.
2. **Send parts** → job order `JO-26-0101` → destination fills in as Plant 3 → enter `SM-2003 = 4` → *Send*.
   You get transfer `TRF-00000X` and a printable slip.
3. **Switch** user → *Ahmed Khan, Plant 3* → **Receive parts** (badge shows the count) → *Count & confirm* →
   enter `3` → reason auto-suggests *Short* → tick "I physically counted" → *Confirm receipt*.
4. The transfer page now shows sent vs counted, the discrepancy, and the **audit trail** (who / plant / time + snapshot).
5. **Job orders → JO-26-0101** shows SM-2003 still 1 short — what the job order system would see.
6. **SAP sync** → *Run SAP sync now* → postings 303/305 get (mock) SAP document numbers, also added to the trail.
7. **Audit trail → Download CSV** for an Excel-checkable record.

Seeded demo data already includes a clean receipt, an open discrepancy, an overdue transfer, a fresh in-transit one
and a cancelled one.

## Run locally

```bash
npm install
cp .env.example .env        # fill DATABASE_URL and DIRECT_URL from Neon
npx prisma migrate deploy   # create tables + audit trigger
npm run db:seed             # master data + demo transfers (wipes transactional data)
npm run dev                 # http://localhost:3000
```

## Verify

```bash
npm run verify:db     # proves DB rejects editing/deleting audit events and invalid data
npm run build && npx next start -p 3100   # in one terminal
npm run test:e2e      # in another: full send -> receive -> resolve -> SAP sync over HTTP, plus 11 rule violations
```

## Deploy (Vercel + Neon)

1. Push the repo to GitHub, import it in Vercel.
2. Add environment variables `DATABASE_URL` and `DIRECT_URL` (Production + Preview).
3. Deploy. The build runs `prisma migrate deploy` automatically.

## API (how other systems talk to it)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/transfers` | Log a send |
| POST | `/api/transfers/:id/receive` | Confirm receipt with counted quantities |
| POST | `/api/transfers/:id/cancel` | Sender cancels before receipt |
| POST | `/api/transfers/:id/resolve` | Close a discrepancy with a note |
| GET | `/api/transfers`, `/api/transfers/:id` | Query transfers / full record incl. trail and SAP postings |
| GET | `/api/job-orders`, `/api/job-orders/:no` | Job orders + SFG progress per build (for the job order system) |
| POST | `/api/integration/sync` | Deliver queued SAP postings (would be a cron job in production) |
| GET | `/api/export/audit` | Full audit trail as CSV |
