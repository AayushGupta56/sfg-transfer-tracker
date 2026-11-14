import Link from "next/link";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/session";
import { getPlantMap } from "@/lib/plants";
import { overdueCutoff } from "@/lib/format";
import { OVERDUE_HOURS } from "@/lib/constants";
import { TransferTable } from "@/components/TransferTable";

const include = { lines: true } as const;

export default async function Dashboard() {
  const actor = await getActor();
  const { name } = await getPlantMap();
  const since24h = new Date(Date.now() - 24 * 3600_000);

  const [inTransit, overdue, openDisc, received24h] = await Promise.all([
    prisma.transfer.count({ where: { status: "IN_TRANSIT" } }),
    prisma.transfer.count({ where: { status: "IN_TRANSIT", sentAt: { lt: overdueCutoff() } } }),
    prisma.transfer.count({ where: { status: "RECEIVED_WITH_DISCREPANCY", resolvedAt: null } }),
    prisma.transfer.count({ where: { receivedAt: { gte: since24h } } }),
  ]);

  const mine = actor?.plantCode;
  const [incoming, outgoing, disputes] = mine
    ? await Promise.all([
        prisma.transfer.findMany({ where: { toPlantCode: mine, status: "IN_TRANSIT" }, include, orderBy: { sentAt: "asc" } }),
        prisma.transfer.findMany({ where: { fromPlantCode: mine, status: "IN_TRANSIT" }, include, orderBy: { sentAt: "asc" } }),
        prisma.transfer.findMany({
          where: {
            status: "RECEIVED_WITH_DISCREPANCY",
            resolvedAt: null,
            OR: [{ fromPlantCode: mine }, { toPlantCode: mine }],
          },
          include,
          orderBy: { receivedAt: "asc" },
        }),
      ])
    : [[], [], []];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="subtitle">
            Every semi-finished good is tracked from the moment a plant sends it until the receiving plant counts it and
            confirms receipt.
          </p>
        </div>
        <div className="actions">
          <Link href="/transfers/new" className="btn">
            + Send parts
          </Link>
          <Link href="/incoming" className="btn secondary">
            Receive parts
          </Link>
        </div>
      </div>

      <div className="kpis">
        <Link href="/transfers?status=IN_TRANSIT" className="kpi blue">
          <div className="n">{inTransit}</div>
          <div className="l">In transit</div>
          <div className="h">Sent, not yet confirmed by receiver</div>
        </Link>
        <Link href="/transfers?status=IN_TRANSIT&overdue=1" className="kpi red">
          <div className="n">{overdue}</div>
          <div className="l">Overdue</div>
          <div className="h">In transit more than {OVERDUE_HOURS}h — chase these</div>
        </Link>
        <Link href="/transfers?status=RECEIVED_WITH_DISCREPANCY&open=1" className="kpi amber">
          <div className="n">{openDisc}</div>
          <div className="l">Open discrepancies</div>
          <div className="h">Counted qty ≠ sent qty, not yet closed</div>
        </Link>
        <Link href="/transfers?status=RECEIVED" className="kpi green">
          <div className="n">{received24h}</div>
          <div className="l">Received (24h)</div>
          <div className="h">Receipts confirmed in the last day</div>
        </Link>
      </div>

      {!actor ? (
        <div className="card">
          <h2>Start here</h2>
          <p>Choose your name and plant to see what is waiting for your plant and to send or receive parts.</p>
          <Link href="/whoami" className="btn">
            Choose who you are
          </Link>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-head">
              <h2>Waiting for {name(mine!)} to receive ({incoming.length})</h2>
              <span className="small muted">Oldest first. Count the parts, then confirm.</span>
            </div>
            <TransferTable
              rows={incoming}
              plantName={name}
              action="receive"
              empty={`Nothing is on its way to ${name(mine!)} right now.`}
            />
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Sent by {name(mine!)}, not yet confirmed ({outgoing.length})</h2>
              <span className="small muted">Still your responsibility until the other plant confirms.</span>
            </div>
            <TransferTable rows={outgoing} plantName={name} empty="Everything you sent has been confirmed." />
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Open discrepancies involving {name(mine!)} ({disputes.length})</h2>
              <span className="small muted">Open each one to see the counts and close it with a note.</span>
            </div>
            <TransferTable rows={disputes} plantName={name} empty="No open discrepancies." />
          </div>
        </>
      )}

      <div className="card">
        <h2>How a transfer works</h2>
        <div className="steps">
          <div className="step">
            <b>1 · Send</b>Sending plant logs the parts and quantities against a job order. A transfer number is created
            and a slip printed.
          </div>
          <div className="step">
            <b>2 · In transit</b>The receiving plant sees it in its &quot;Receive parts&quot; list. After {OVERDUE_HOURS}h it is flagged
            overdue.
          </div>
          <div className="step">
            <b>3 · Count &amp; confirm</b>Receiver counts what physically arrived. Any difference needs a reason and becomes a
            discrepancy.
          </div>
          <div className="step">
            <b>4 · Trail</b>Every step is stamped with who, where and when in a history that cannot be edited — and queued for
            SAP.
          </div>
        </div>
      </div>
    </>
  );
}
