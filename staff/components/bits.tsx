// Small display pieces shared by the portal pages (server-safe, no state).

import Link from 'next/link';
import type { Person } from '@/lib/types';

export function Badge({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'danger' | 'warn' | 'good' }) {
  const colours = {
    plain: 'bg-surface-light text-ink-deep',
    danger: 'bg-danger-deep text-white',
    warn: 'bg-amber text-white',
    good: 'bg-success-deep text-white',
  }[tone];
  return <span className={`inline-flex rounded-pill px-s8 py-s2 text-f12 font-semi-bold ${colours}`}>{children}</span>;
}

export function PersonLink({ person }: { person: Person | null }) {
  if (!person) return <span className="text-grey888">Automatic check</span>;
  return (
    <Link href={`/users/${person.id}`} className="font-semi-bold text-accent-text underline">
      @{person.username ?? 'unknown'}
      {person.is_banned ? ' (blocked)' : ''}
    </Link>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-s24">
      <h2 className="mb-s8 text-f17 font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-f14 text-grey888">{children}</p>;
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-r8 bg-surface-light p-s12 text-f14 text-danger-deep">
      {message}
    </p>
  );
}

export function statusTone(status: string): 'plain' | 'danger' | 'warn' | 'good' {
  if (status === 'open') return 'danger';
  if (status === 'reviewing') return 'warn';
  if (status === 'actioned') return 'good';
  return 'plain';
}
