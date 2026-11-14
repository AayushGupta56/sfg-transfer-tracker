import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/session";
import { getPlantMap } from "@/lib/plants";
import { ageOf, fmtDateTime } from "@/lib/format";
import { ReceiveForm } from "@/components/ReceiveForm";

export default async function ReceivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect(`/whoami?next=/transfers/${id}/receive`);

  const t = await prisma.transfer.findUnique({
    where: { id: Number(id) || 0 },
    include: { lines: { include: { material: true }, orderBy: { id: "asc" } } },
  });
  if (!t) notFound();
  const { name } = await getPlantMap();

  const blocked =
    t.status !== "IN_TRANSIT"
      ? `This transfer is already closed (${t.status.replaceAll("_", " ").toLowerCase()}).`
      : actor.plantCode !== t.toPlantCode
        ? `This transfer is addressed to ${name(t.toPlantCode)}. You are acting for ${name(actor.plantCode)}, so you cannot confirm it.`
        : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            Count &amp; confirm receipt — <span className="mono">{t.transferNo}</span>
          </h1>
          <p className="subtitle">
            From <strong>{name(t.fromPlantCode)}</strong> · sent by {t.sentBy} on {fmtDateTime(t.sentAt)} ({ageOf(t.sentAt)}{" "}
            ago) · job order {t.jobOrderNo}
            {t.vehicleRef && <> · {t.vehicleRef}</>}
          </p>
        </div>
      </div>

      {blocked ? (
        <div className="card">
          <div className="alert warn">{blocked}</div>
          <Link href={`/transfers/${t.id}`}>← Back to transfer</Link>
        </div>
      ) : (
        <ReceiveForm
          transferId={t.id}
          actorName={actor.name}
          lines={t.lines.map((l) => ({
            materialNumber: l.materialNumber,
            description: l.material.description,
            unit: l.material.unit,
            qtySent: l.qtySent,
          }))}
        />
      )}
    </>
  );
}
