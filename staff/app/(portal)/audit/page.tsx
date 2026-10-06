import Link from 'next/link';
import { requireStaff } from '@/lib/staff';
import { AUDIT_ACTIONS } from '@/lib/labels';
import { usernames } from '@/lib/names';
import type { AuditRow } from '@/lib/types';
import { AuditList } from '@/components/AuditList';
import { ErrorNote } from '@/components/bits';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '@/components/styles';

const PAGE = 100;

// Everything staff (and the automatic check) did, newest first. Read straight from
// moderation_actions, which only staff can read.
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; before?: string }> }) {
  const { db } = await requireStaff();
  const params = await searchParams;
  const action = params.action && params.action in AUDIT_ACTIONS ? params.action : '';

  let query = db.from('moderation_actions').select('*').order('created_at', { ascending: false }).limit(PAGE);
  if (action) query = query.eq('action', action);
  if (params.before) query = query.lt('created_at', params.before);
  const { data, error } = await query;
  const rows = (data ?? []) as AuditRow[];
  const names = await usernames(db, rows.flatMap((r) => [r.staff_id, r.target_type === 'user' ? r.target_id : null]));
  const last = rows.at(-1);

  return (
    <>
      <h1 className="text-f24 font-bold">Audit log</h1>
      <form className="mt-s16 flex flex-wrap items-end gap-s12" method="get">
        <label className="flex flex-col gap-s4 text-f13 font-semi-bold">
          Action
          <select name="action" defaultValue={action} className={inputClass}>
            <option value="">Everything</option>
            {Object.entries(AUDIT_ACTIONS).map(([code, text]) => (
              <option key={code} value={code}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={primaryButtonClass}>
          Show
        </button>
      </form>
      <div className="mt-s16">
        {error ? <ErrorNote message={`Couldn't load the log: ${error.message}`} /> : <AuditList rows={rows} names={names} />}
      </div>
      {rows.length === PAGE && last && (
        <Link
          href={`/audit?${new URLSearchParams({ ...(action && { action }), before: last.created_at })}`}
          className={`${secondaryButtonClass} mt-s16`}
        >
          Older
        </Link>
      )}
    </>
  );
}
