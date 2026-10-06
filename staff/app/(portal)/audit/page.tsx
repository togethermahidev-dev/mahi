import Link from 'next/link';
import { requireStaff } from '@/lib/staff';
import { AUDIT_ACTIONS } from '@/lib/labels';
import { auditContext } from '@/lib/names';
import type { AuditRow } from '@/lib/types';
import { AuditList } from '@/components/AuditList';
import { Chip, ChipRow, ErrorNote, PageTitle } from '@/components/bits';
import { secondaryButtonClass } from '@/components/styles';

const PAGE = 100;
const WHO: Record<string, string> = { '': 'Everyone', staff: 'Staff', auto: 'Automatic check' };

// Everything staff (and the automatic check) did, newest first, as sentences. Read straight from
// moderation_actions, which only staff can read.
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; who?: string; before?: string }> }) {
  const { db } = await requireStaff();
  const params = await searchParams;
  const action = params.action && params.action in AUDIT_ACTIONS ? params.action : '';
  const who = params.who && params.who in WHO ? params.who : '';

  let query = db.from('moderation_actions').select('*').order('created_at', { ascending: false }).limit(PAGE);
  if (action) query = query.eq('action', action);
  if (who === 'staff') query = query.not('staff_id', 'is', null);
  if (who === 'auto') query = query.is('staff_id', null);
  if (params.before) query = query.lt('created_at', params.before);
  const { data, error } = await query;
  const rows = (data ?? []) as AuditRow[];
  const { names, owners } = await auditContext(db, rows);
  const last = rows.at(-1);

  const href = (change: { action?: string; who?: string; before?: string }) => {
    const merged = { action, who, ...change };
    return `/audit?${new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][])}`;
  };

  return (
    <>
      <PageTitle title="Audit log" intro="Everything staff and the automatic check did, newest first." />
      <div className="flex flex-col gap-s12">
        <ChipRow title="Who">
          {Object.entries(WHO).map(([code, text]) => (
            <Chip key={code || 'all'} href={href({ who: code })} on={who === code}>
              {text}
            </Chip>
          ))}
        </ChipRow>
        <details open={!!action}>
          <summary className="flex min-h-z44 cursor-pointer items-center text-f13 font-semi-bold text-grey888">
            {action ? `Action: ${AUDIT_ACTIONS[action]}` : 'Action: anything (tap to choose)'}
          </summary>
          <div className="mt-s6 flex flex-wrap gap-s8">
            <Chip href={href({ action: '' })} on={!action}>
              Anything
            </Chip>
            {Object.entries(AUDIT_ACTIONS).map(([code, text]) => (
              <Chip key={code} href={href({ action: code })} on={action === code}>
                {text}
              </Chip>
            ))}
          </div>
        </details>
      </div>
      <div className="mt-s16">
        {error ? (
          <ErrorNote message={`Couldn't load the log. Try again in a moment. (${error.message})`} />
        ) : (
          <AuditList rows={rows} names={names} owners={owners} />
        )}
      </div>
      {rows.length === PAGE && last && (
        <Link href={href({ before: last.created_at })} className={`${secondaryButtonClass} mt-s16`}>
          Older
        </Link>
      )}
    </>
  );
}
