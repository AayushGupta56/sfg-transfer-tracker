import { getActor } from "@/lib/session";
import { getPlantMap } from "@/lib/plants";
import { WhoAmIForm } from "@/components/WhoAmIForm";

export default async function WhoAmIPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ plants }, actor, { next }] = await Promise.all([getPlantMap(), getActor(), searchParams]);
  return (
    <div style={{ maxWidth: 560 }}>
      <div className="page-head">
        <div>
          <h1>Who is using this screen?</h1>
          <p className="subtitle">
            Every send and receipt is signed with your name and plant, so the trail shows exactly who did what.
          </p>
        </div>
      </div>
      <div className="card">
        <WhoAmIForm plants={plants} current={actor} next={next} />
      </div>
      <p className="small muted">
        Prototype note: there is no password. In production this would come from the company login (SSO), with the plant
        taken from the user&apos;s role.
      </p>
    </div>
  );
}
