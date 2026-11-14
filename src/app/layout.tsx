import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getActor } from "@/lib/session";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "SFG Transfer Tracker",
  description: "Tracks semi-finished goods moving between plants, from send to confirmed receipt.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  const plant = actor ? await prisma.plant.findUnique({ where: { code: actor.plantCode } }) : null;
  const incoming = actor
    ? await prisma.transfer.count({ where: { toPlantCode: actor.plantCode, status: "IN_TRANSIT" } })
    : 0;

  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              SFG Transfer Tracker
              <small>Inter-plant movement of semi-finished goods</small>
            </Link>
            <nav className="nav">
              <Link href="/">Dashboard</Link>
              <Link href="/transfers/new">Send parts</Link>
              <Link href="/incoming">
                Receive parts{incoming > 0 && <span className="count">{incoming}</span>}
              </Link>
              <Link href="/transfers">All transfers</Link>
              <Link href="/job-orders">Job orders</Link>
              <Link href="/audit">Audit trail</Link>
              <Link href="/integration">SAP sync</Link>
            </nav>
            <div className="whoami">
              {actor ? (
                <>
                  Acting as <strong>{actor.name}</strong> · <strong>{plant?.name ?? actor.plantCode}</strong>
                  <Link href="/whoami">Switch</Link>
                </>
              ) : (
                <Link href="/whoami">Choose who you are →</Link>
              )}
            </div>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
