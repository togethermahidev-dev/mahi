import Link from 'next/link';
import { requireStaff } from '@/lib/staff';
import { secondaryButtonClass } from '@/components/styles';
import { Wordmark } from '@/components/Wordmark';

// Every page inside (portal) is staff-only: requireStaff runs on the server before anything renders.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requireStaff();
  return (
    <div className="min-h-dvh">
      <header className="border-b-w1 border-off-white bg-white">
        <div className="mx-auto flex max-w-z800 flex-wrap items-center gap-s16 px-s16 py-s12">
          <Link href="/reports" className="flex items-center gap-s12" aria-label="Mahi staff, reports">
            <Wordmark size="small" />
            <span className="text-f14 font-semi-bold text-grey888">Staff</span>
          </Link>
          <nav className="flex gap-s16 text-f14 font-semi-bold">
            <Link href="/reports">Reports</Link>
            <Link href="/users">People</Link>
            <Link href="/audit">Audit log</Link>
          </nav>
          <div className="ml-auto flex items-center gap-s12 text-f13 text-grey888">
            <span>
              {user.email} · {role === 'admin' ? 'Admin' : 'Moderator'}
            </span>
            <form action="/signout" method="post">
              <button type="submit" className={secondaryButtonClass}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-z800 px-s16 py-s24">{children}</main>
    </div>
  );
}
