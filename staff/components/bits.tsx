// Small display pieces shared by the portal pages (server-safe, no state).

import Link from 'next/link';
import { STATUSES, label } from '@/lib/labels';
import type { Standing } from '@/lib/present';
import type { Person } from '@/lib/types';
import { chipClass, linkClass } from './styles';

type Tone = 'plain' | 'danger' | 'warn' | 'good' | 'info';

export function Badge({ children, tone = 'plain' }: { children: React.ReactNode; tone?: Tone }) {
  const colours = {
    plain: 'bg-surface-light2 text-ink-deep',
    danger: 'bg-danger-deep text-white',
    warn: 'bg-amber-deep text-white',
    good: 'bg-success-deep text-white',
    info: 'bg-accent-text text-white',
  }[tone];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-pill px-s8 py-s2 text-f12 font-semi-bold ${colours}`}>
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  if (status === 'open') return 'danger';
  if (status === 'reviewing') return 'warn';
  if (status === 'actioned') return 'good';
  return 'plain';
}

/** A report's status in words, coloured too (the words carry it, not the colour). */
export function StatusPill({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{label(STATUSES, status)}</Badge>;
}

export function StandingBadge({ standing }: { standing: Standing }) {
  const tone: Tone = { ok: 'good', warned: 'warn', suspended: 'danger', banned: 'danger', blocked: 'danger' }[standing.kind] as Tone;
  return <Badge tone={tone}>{standing.label}</Badge>;
}

export function PersonLink({ person }: { person: Person | null }) {
  if (!person) return <span className="text-grey888">Automatic check</span>;
  return (
    <Link href={`/users/${person.id}`} className={linkClass}>
      @{person.username ?? 'unknown'}
      {person.is_banned ? ' (blocked)' : ''}
    </Link>
  );
}

export function PageTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="mb-s16">
      <h1 className="text-f24 font-bold">{title}</h1>
      {intro && <p className="mt-s4 text-f14 text-grey888">{intro}</p>}
    </div>
  );
}

export function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="mt-s24">
      <h2 className="text-f17 font-bold">{title}</h2>
      {hint && <p className="mt-s2 text-f13 text-grey888">{hint}</p>}
      <div className="mt-s8">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-r12 bg-surface-light p-s16 text-f14 text-grey888">{children}</p>;
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-r12 border-w1 border-danger-deep bg-white p-s16 text-f14 text-danger-deep">
      {message}
    </p>
  );
}

/** A filter chip: a link that sets one search parameter. The chosen one is filled and ticked. */
export function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={chipClass(on)} aria-current={on ? 'true' : undefined}>
      {on && <span aria-hidden="true">✓</span>}
      {children}
    </Link>
  );
}

export function ChipRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={title} className="flex flex-col gap-s6">
      <span className="text-f13 font-semi-bold text-grey888">{title}</span>
      <div className="flex flex-wrap gap-s8">{children}</div>
    </div>
  );
}
