import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/session";
import { getPlantMap } from "@/lib/plants";
import { TransferTable } from "@/components/TransferTable";
import { formatTransferNo } from "@/lib/transfers";

export default async function IncomingPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await getActor();
  if (!actor) redirect("/whoami?next=/incoming");
  const { q } = await searchParams;
  const { name } = await getPlantMap();

  // Lookup by the number printed on the slip. Accepts "TRF-000004", "trf-4" or just "4".
  let lookupMsg: React.ReactNode = null;
  if (q?.trim()) {
    const digits = q.replace(/\D/g, "");
    const found = digits
      ? await prisma.transfer.findUnique({ where: { transferNo: formatTransferNo(Number(digits)) } })
      : null;
    if (!found) lookupMsg = <div className="alert error">No transfer found with number “{q}”. Check the slip.</div>;
    else if (found.toPlantCode !== actor.plantCode)
      lookupMsg = (
        <div className="alert warn">
          {found.transferNo} is addressed to <strong>{name(found.toPlantCode)}</strong>, not {name(actor.plantCode)}. Do not
          accept it — contact {name(found.fromPlantCode)}. <Link href={`/transfers/${found.id}`}>View transfer</Link>
        </div>
      );
    else if (found.status !== "IN_TRANSIT")
      lookupMsg = (
        <div className="alert info">
          {found.transferNo} was already handled ({found.status.replaceAll("_", " ").toLowerCase()}).{" "}
          <Link href={`/transfers/${found.id}`}>View its trail</Link>
        </div>
      );
    else redirect(`/transfers/${found.id}/receive`);
  }

  const [incoming, recent] = await Promise.all([
    prisma.transfer.findMany({
      where: { toPlantCode: actor.plantCode, status: "IN_TRANSIT" },
      include: { lines: true },
      orderBy: { sentAt: "asc" },
    }),
    prisma.transfer.findMany({
      where: { toPlantCode: actor.plantCode, status: { in: ["RECEIVED", "RECEIVED_WITH_DISCREPANCY"] } },
      include: { lines: true },
      orderBy: { receivedAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Receive parts at {name(actor.plantCode)}</h1>
          <p className="subtitle">Parts have arrived? Find the transfer, count what is physically there, and confirm.</p>
        </div>
      </div>

      <div className="card">
        <h2>Have a transfer slip? Enter its number</h2>
        <form className="filters" action="/incoming">
          <div style={{ flex: 1, maxWidth: 320 }}>
            <input type="search" name="q" defaultValue={q} placeholder="e.g. TRF-000004" autoFocus />
          </div>
          <button className="btn">Find &amp; receive</button>
        </form>
        <div style={{ marginTop: 12 }}>{lookupMsg}</div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>On the way to {name(actor.plantCode)} ({incoming.length})</h2>
          <span className="small muted">Oldest first · red rows are overdue</span>
        </div>
        <TransferTable
          rows={incoming}
          plantName={name}
          action="receive"
          empty={`Nothing is in transit to ${name(actor.plantCode)}. If parts arrived without a transfer in the system, ask the sender to log it before you accept them.`}
        />
      </div>

      <div className="card">
        <h2>Recently received here</h2>
        <TransferTable rows={recent} plantName={name} empty="No receipts yet." />
      </div>
    </>
  );
}
