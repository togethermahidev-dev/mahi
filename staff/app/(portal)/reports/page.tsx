import Link from 'next/link';
import { requireStaff } from '@/lib/staff';
import { REASONS, SOURCES, STATUSES, TARGET_TYPES, formatDateTime, label } from '@/lib/labels';
import type { Person, ReportItem } from '@/lib/types';
import { Badge, Empty, ErrorNote, statusTone } from '@/components/bits';
import { cardClass, inputClass, primaryButtonClass, secondaryButtonClass } from '@/components/styles';

const PAGE = 50;
type Search = { status?: string; type?: string; reason?: string; before?: string };

function preview(item: ReportItem): string {
  const s = item.snapshot ?? {};
  const text = (s.content ?? s.caption ?? s.username ?? '') as string;
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

// Plain text: the whole card is already a link.
function who(person: Person | null): string {
  return person ? `@${person.username ?? 'unknown'}` : SOURCES.ai.toLowerCase();
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { db } = await requireStaff();
  const params = await searchParams;
  const status = params.status ?? 'open';
  const type = params.type && params.type in TARGET_TYPES ? params.type : '';
  const reason = params.reason && params.reason in REASONS ? params.reason : '';

  // The queue call filters by status and type; reason is filtered on the page it returns,
  // so a page with a reason filter can hold fewer than 50.
  const { data, error } = await db.rpc('staff_get_queue', {
    p_status: status === 'all' ? null : status,
    p_target_type: type || null,
    p_limit: reason ? 200 : PAGE,
    p_before: params.before ?? null,
  });
  const all = (data ?? []) as ReportItem[];
  const items = reason ? all.filter((r) => r.reason === reason) : all;
  const last = all.at(-1);
  const hasMore = all.length === (reason ? 200 : PAGE);
  const nextQuery = new URLSearchParams({ status, ...(type && { type }), ...(reason && { reason }), ...(last && { before: last.created_at }) });

  return (
    <>
      <h1 className="text-f24 font-bold">Reports</h1>
      <form className="mt-s16 flex flex-wrap items-end gap-s12" method="get">
        <label className="flex flex-col gap-s4 text-f13 font-semi-bold">
          Status
          <select name="status" defaultValue={status} className={inputClass}>
            {Object.entries(STATUSES).map(([code, text]) => (
              <option key={code} value={code}>
                {text}
              </option>
            ))}
            <option value="all">All</option>
          </select>
        </label>
        <label className="flex flex-col gap-s4 text-f13 font-semi-bold">
          What was reported
          <select name="type" defaultValue={type} className={inputClass}>
            <option value="">Anything</option>
            {['user', 'post', 'comment', 'message'].map((code) => (
              <option key={code} value={code}>
                {TARGET_TYPES[code]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-s4 text-f13 font-semi-bold">
          Reason
          <select name="reason" defaultValue={reason} className={inputClass}>
            <option value="">Any reason</option>
            {Object.entries(REASONS).map(([code, text]) => (
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

      <div className="mt-s16 flex flex-col gap-s8">
        {error && <ErrorNote message={`Couldn't load reports: ${error.message}`} />}
        {!error && items.length === 0 && <Empty>No reports here.</Empty>}
        {items.map((item) => (
          <Link key={item.id} href={`/reports/${item.id}`} className={`${cardClass} flex flex-col gap-s6`}>
            <div className="flex flex-wrap items-center gap-s8">
              <Badge tone={statusTone(item.status)}>{label(STATUSES, item.status)}</Badge>
              <Badge>{label(TARGET_TYPES, item.target_type)}</Badge>
              <span className="text-f14 font-semi-bold">{label(REASONS, item.reason)}</span>
              {item.source === 'ai' && <Badge tone="warn">{SOURCES.ai}</Badge>}
              {item.open_reports_on_target > 1 && <Badge tone="danger">{`${item.open_reports_on_target} open reports`}</Badge>}
              <span className="ml-auto text-f13 text-grey888">{formatDateTime(item.created_at)}</span>
            </div>
            {preview(item) && <p className="text-f14">{preview(item)}</p>}
            <p className="text-f13 text-grey888">
              About {who(item.owner)} · reported by {who(item.reporter)}
            </p>
          </Link>
        ))}
      </div>
      {hasMore && last && (
        <Link href={`/reports?${nextQuery}`} className={`${secondaryButtonClass} mt-s16`}>
          Older reports
        </Link>
      )}
    </>
  );
}
