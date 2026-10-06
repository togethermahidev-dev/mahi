import { SANCTION_KINDS, formatDateTime, label } from '@/lib/labels';
import { isActive, type Sanction } from '@/lib/types';
import { Badge, Empty } from './bits';

export function SanctionList({ sanctions }: { sanctions: Sanction[] }) {
  if (!sanctions.length) return <Empty>None. A clean record.</Empty>;
  return (
    <ul className="flex flex-col gap-s8">
      {sanctions.map((s) => (
        <li key={s.id} className="flex flex-col gap-s2 text-f14">
          <div className="flex flex-wrap items-center gap-s8">
            <Badge tone={s.kind === 'warning' ? 'warn' : 'danger'}>{label(SANCTION_KINDS, s.kind)}</Badge>
            {isActive(s) && <Badge tone="danger">Running now</Badge>}
            <span className="text-f13 text-grey888">
              {formatDateTime(s.created_at)}
              {s.ends_at ? ` · until ${formatDateTime(s.ends_at)}` : ''}
              {s.lifted_at ? ` · lifted ${formatDateTime(s.lifted_at)}` : ''}
              {s.kind === 'warning' ? (s.seen_at ? ' · seen' : ' · not seen yet') : ''}
            </span>
          </div>
          <p>{s.reason}</p>
        </li>
      ))}
    </ul>
  );
}
