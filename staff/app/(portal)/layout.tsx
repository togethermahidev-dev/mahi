import Link from 'next/link';
import { requireStaff } from '@/lib/staff';
import { Badge } from '@/components/bits';
import { SideNav, TabBar } from '@/components/Nav';
import { secondaryButtonClass } from '@/components/styles';
import { Wordmark } from '@/components/Wordmark';

// Every page inside (portal) is staff-only: requireStaff runs on the server before anything renders.
// Header on top; a sidebar from tablet width up; a bottom tab bar on phones.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requireStaff();
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-20 focus:bg-white focus:p-s12">
        Skip to the page
      </a>
      <header className="pin-top sticky z-10 border-b-w1 border-off-white bg-white">
        <div className="flex items-center gap-s12 px-s16 py-s8">
          <Link href="/" className="flex min-h-z44 items-center gap-s8" aria-label="Mahi staff, overview">
            <Wordmark size="small" />
            <span className="hidden text-f14 font-semi-bold text-grey888 sm:inline">Staff</span>
          </Link>
          <div className="ml-auto flex shrinkable items-center gap-s8">
            <span className="hidden shrinkable truncate text-f13 text-grey888 sm:inline" title={user.email ?? undefined}>
              {user.email}
            </span>
            <Badge tone={role === 'admin' ? 'info' : 'plain'}>{role === 'admin' ? 'Admin' : 'Moderator'}</Badge>
            <form action="/signout" method="post">
              <button type="submit" className={secondaryButtonClass}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="md:flex">
        <aside className="hidden w-z200 shrink-0 border-r-w1 border-off-white bg-white p-s12 md:block">
          <SideNav />
          <p className="mt-s16 break-all px-s12 text-f12 text-grey888">{user.email}</p>
        </aside>
        <main id="main" className="shrinkable flex-1 px-s16 pt-s24 pb-z96 md:px-s32 md:pb-s48">
          <div className="mx-auto max-w-z800">{children}</div>
        </main>
      </div>
      <TabBar />
    </div>
  );
}
