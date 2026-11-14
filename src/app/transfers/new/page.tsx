import { redirect } from "next/navigation";
import { getActor } from "@/lib/session";
import { getPlantMap } from "@/lib/plants";
import { jobOrders, getJobOrderProgress } from "@/lib/jobOrders";
import { SendForm } from "@/components/SendForm";

export default async function NewTransferPage({ searchParams }: { searchParams: Promise<{ jo?: string }> }) {
  const actor = await getActor();
  if (!actor) redirect("/whoami?next=/transfers/new");
  const { jo } = await searchParams;

  const { plants, name } = await getPlantMap();
  const released = (await jobOrders.list()).filter((j) => j.status === "RELEASED");
  const withProgress = await Promise.all(
    released.map(async (j) => ({ ...j, progress: (await getJobOrderProgress(j)).components })),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Send parts to another plant</h1>
          <p className="subtitle">
            Log the SFGs leaving <strong>{name(actor.plantCode)}</strong>. The receiving plant will see this immediately and
            must count and confirm what arrives.
          </p>
        </div>
      </div>
      <SendForm actor={actor} plants={plants} jobOrders={withProgress} initialJo={jo} />
    </>
  );
}
