import Link from 'next/link';
import { AUDIT_ACTIONS, TARGET_TYPES, formatDateTime, label } from '@/lib/labels';
import type { AuditRow } from '@/lib/types';
import { Empty } from './bits';

/** Audit rows. `names` maps staff and person ids to usernames where the page has looked them up. */
export function AuditList({ rows, names }: { rows: AuditRow[]; names?: Map<string, string> }) {
  if (!rows.length) return <Empty>Nothing yet.</Empty>;
  const name = (id: string | null) => (id ? (names?.get(id) ? `@${names.get(id)}` : 'Staff') : 'Automatic check');
  return (
    <ul className="flex flex-col gap-s8">
      {rows.map((a) => {
        const endsAt = typeof a.metadata?.ends_at === 'string' ? a.metadata.ends_at : null;
        const target =
          a.target_type === 'user' ? (
            <Link href={`/users/${a.target_id}`} className="text-accent-text underline">
              {names?.get(a.target_id) ? `@${names.get(a.target_id)}` : 'this person'}
            </Link>
          ) : (
            label(TARGET_TYPES, a.target_type).toLowerCase()
          );
        return (
          <li key={a.id} className="flex flex-col gap-s2 text-f14">
            <p>
              <span className="font-semi-bold">{label(AUDIT_ACTIONS, a.action)}</span> {target}
              {endsAt ? ` until ${formatDateTime(endsAt)}` : ''}
              {a.report_id && (
                <>
                  {' · '}
                  <Link href={`/reports/${a.report_id}`} className="text-accent-text underline">
                    report
                  </Link>
                </>
              )}
            </p>
            <p className="text-f13 text-grey888">{`${name(a.staff_id)} · ${formatDateTime(a.created_at)}`}</p>
            {a.reason && <p>{a.reason}</p>}
          </li>
        );
      })}
    </ul>
  );
}
