import Link from 'next/link';
import { formatDateTime } from '@/lib/labels';
import { auditSentence, timeAgo } from '@/lib/present';
import type { AuditRow } from '@/lib/types';
import { Empty } from './bits';
import { linkClass } from './styles';

/**
 * Audit rows as sentences: "@joe hid a post by @sam", then the note and when.
 * `names` maps staff and person ids to usernames; `owners` maps a row id to whose post it was.
 */
export function AuditList({
  rows,
  names = new Map(),
  owners = new Map(),
}: {
  rows: AuditRow[];
  names?: Map<string, string>;
  owners?: Map<string, string>;
}) {
  if (!rows.length) return <Empty>Nothing yet.</Empty>;
  return (
    <ul className="flex flex-col divide-y divide-off-white rounded-r12 border-w1 border-off-white bg-white">
      {rows.map((a) => (
        <li key={a.id} className="flex flex-col gap-s4 p-s12 text-f14">
          <p className="font-semi-bold">{auditSentence(a, { names, owner: owners.get(a.id) })}</p>
          {a.reason && <p className="whitespace-pre-wrap break-words">{a.reason}</p>}
          <p className="flex flex-wrap gap-x-s8 text-f13 text-grey888">
            <time dateTime={a.created_at} title={formatDateTime(a.created_at)}>
              {timeAgo(a.created_at)}
            </time>
            {a.target_type === 'user' && (
              <Link href={`/users/${a.target_id}`} className={`${linkClass} inline-flex min-h-z44 items-center`}>
                Their page
              </Link>
            )}
            {a.report_id && (
              <Link href={`/reports/${a.report_id}`} className={`${linkClass} inline-flex min-h-z44 items-center`}>
                The report
              </Link>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}
