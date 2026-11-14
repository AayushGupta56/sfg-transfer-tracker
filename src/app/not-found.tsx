import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card">
      <h2>Not found</h2>
      <p>That transfer or job order does not exist. Check the number on the slip.</p>
      <Link href="/">← Back to dashboard</Link>
    </div>
  );
}
