'use client';

// The portal's four places: a sidebar on wide screens, a tab bar along the bottom on phones.
// The current place is marked in words for screen readers (aria-current) and with a filled tab.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PLACES = [
  { href: '/', name: 'Overview' },
  { href: '/reports', name: 'Reports' },
  { href: '/users', name: 'People' },
  { href: '/audit', name: 'Audit log' },
];

function isHere(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-s4">
      {PLACES.map((p) => {
        const here = isHere(pathname, p.href);
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={here ? 'page' : undefined}
            className={`flex min-h-z44 items-center rounded-r8 px-s12 text-f15 font-semi-bold ${
              here ? 'bg-ink-deep text-white' : 'text-ink-deep'
            }`}
          >
            {p.name}
          </Link>
        );
      })}
    </nav>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="pin-bottom fixed z-10 border-t-w1 border-off-white bg-white pb-safe md:hidden">
      <ul className="grid grid-cols-4">
        {PLACES.map((p) => {
          const here = isHere(pathname, p.href);
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={here ? 'page' : undefined}
                className={`flex min-h-z56 flex-col items-center justify-center gap-s4 text-f12 font-semi-bold ${
                  here ? 'text-ink-deep' : 'text-grey888'
                }`}
              >
                <span aria-hidden="true" className={`h-s4 w-z24 rounded-pill ${here ? 'bg-accent' : 'bg-white'}`} />
                {p.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
