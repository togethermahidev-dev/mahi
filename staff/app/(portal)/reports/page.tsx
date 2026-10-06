import Link from 'next/link';
import { requireStaff } from '@/lib/staff';
import { REASONS, SOURCES, STATUSES, TARGET_TYPES, formatDateTime, label } from '@/lib/labels';
import { matchesSearch, startOfTodayLondon, timeAgo } from '@/lib/present';
import type { Person, ReportItem } from '@/lib/types';
import { Badge, Chip, ChipRow, Empty, ErrorNote, PageTitle, StatusPill } from '@/components/bits';
import { cardClass, inputClass, primaryButtonClass, secondaryButtonClass } from '@/components/styles';

const PAGE = 50;
const MAX = 200;
type Search = { status?: string; type?: string; reason?: string; q?: string; when?: string; before?: string };

function preview(item: ReportItem): string {
  const s = item.snapshot ?? {};
  const text = (s.content ?? s.caption ?? (s.username ? `@${s.username}` : '')) as string;
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

function who(person: Person | null): string {
  return person ? `@${person.username ?? 'unknown'}` : SOURCES.ai.toLowerCase();
}

function Pills({ item }: { item: ReportItem }) {
  return (
    <>
      <StatusPill status={item.status} />
      <Badge>{label(TARGET_TYPES, item.target_type)}</Badge>
      {item.source === 'ai' && <Badge tone="info">{SOURCES.ai}</Badge>}
      {item.open_reports_on_target > 1 && <Badge tone="danger">{`${item.open_reports_on_target} open reports`}</Badge>}
    </>
  );
}

// The report list: chips to filter, a search, newest first. Cards on phones, a table on wide screens.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { db } = await requireStaff();
  const params = await searchParams;
  const status = params.status && (params.status in STATUSES || params.status === 'all') ? params.status : 'open';
  const type = params.type && params.type in TARGET_TYPES && params.type !== 'report' ? params.type : '';
  const reason = params.reason && params.reason in REASONS ? params.reason : '';
  const q = (params.q ?? '').trim().slice(0, 50);
  const today = params.when === 'today';

  // The queue call filters by status and type. Reason, search and "today" are applied to what it
  // returns, so with any of those the page asks for the most it can (200) and may show fewer.
  const narrowed = !!(reason || q || today);
  const limit = narrowed ? MAX : PAGE;
  const { data, error } = await db.rpc('staff_get_queue', {
    p_status: status === 'all' ? null : status,
    p_target_type: type || null,
    p_limit: limit,
    p_before: params.before ?? null,
  });
  const all = (data ?? []) as ReportItem[];
  const since = Date.parse(startOfTodayLondon());
  const items = all.filter(
    (r) => (!reason || r.reason === reason) && matchesSearch(r, q) && (!today || Date.parse(r.created_at) >= since),
  );
  const last = all.at(-1);
  const hasMore = all.length === limit && !today;

  const current = { status, type, reason, q, when: today ? 'today' : '' };
  const href = (change: Partial<typeof current> & { before?: string }) => {
    const merged = { ...current, ...change };
    const sp = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    return `/reports?${sp}`;
  };

  return (
    <>
      <PageTitle title="Reports" intro="Newest first. Tap a report to see it and act on it." />

      <form method="get" role="search" className="flex gap-s8">
        {Object.entries(current)
          .filter(([k, v]) => v && k !== 'q')
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <label className="sr-only" htmlFor="q">
          Search reports
        </label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Search names or words" className={inputClass} />
        <button type="submit" className={primaryButtonClass}>
          Search
        </button>
      </form>

      <div className="mt-s16 flex flex-col gap-s12">
        <ChipRow title="Status">
          {[...Object.keys(STATUSES), 'all'].map((code) => (
            <Chip key={code} href={href({ status: code })} on={status === code}>
              {code === 'all' ? 'All' : STATUSES[code]}
            </Chip>
          ))}
          <Chip href={href({ when: today ? '' : 'today' })} on={today}>
            Today only
          </Chip>
        </ChipRow>
        <ChipRow title="What was reported">
          {['', 'post', 'comment', 'message', 'user'].map((code) => (
            <Chip key={code || 'any'} href={href({ type: code })} on={type === code}>
              {code ? TARGET_TYPES[code] : 'Anything'}
            </Chip>
          ))}
        </ChipRow>
        <details open={!!reason}>
          <summary className="flex min-h-z44 cursor-pointer items-center text-f13 font-semi-bold text-grey888">
            {reason ? `Reason: ${REASONS[reason]}` : 'Reason: any (tap to choose)'}
          </summary>
          <div className="mt-s6 flex flex-wrap gap-s8">
            <Chip href={href({ reason: '' })} on={!reason}>
              Any reason
            </Chip>
            {Object.entries(REASONS).map(([code, text]) => (
              <Chip key={code} href={href({ reason: code })} on={reason === code}>
                {text}
              </Chip>
            ))}
          </div>
        </details>
      </div>

      <div className="mt-s16">
        {error && <ErrorNote message={`Couldn't load reports. Try again in a moment. (${error.message})`} />}
        {!error && items.length === 0 && (
          <Empty>{status === 'open' && !narrowed && !type ? 'No new reports. All clear.' : 'No reports match these filters.'}</Empty>
        )}

        {items.length > 0 && (
          <>
            <ul className="flex flex-col gap-s8 md:hidden">
              {items.map((item) => (
                <li key={item.id}>
                  <Link href={`/reports/${item.id}`} className={`${cardClass} flex flex-col gap-s6`}>
                    <div className="flex flex-wrap items-center gap-s6">
                      <Pills item={item} />
                    </div>
                    <p className="text-f16 font-semi-bold">{label(REASONS, item.reason)}</p>
                    {preview(item) && <p className="break-words text-f14">{preview(item)}</p>}
                    <p className="text-f13 text-grey888">{`About ${who(item.owner)} · by ${who(item.reporter)} · ${timeAgo(item.created_at)}`}</p>
                  </Link>
                </li>
              ))}
            </ul>

            <table className="hidden w-full border-collapse overflow-hidden rounded-r12 bg-white text-left text-f14 md:table">
              <thead className="bg-surface-light text-f13 text-grey888">
                <tr>
                  <th scope="col" className="p-s12 font-semi-bold">Status</th>
                  <th scope="col" className="p-s12 font-semi-bold">Reason and what was said</th>
                  <th scope="col" className="p-s12 font-semi-bold">About</th>
                  <th scope="col" className="p-s12 font-semi-bold">When</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t-w1 border-off-white align-top">
                    <td className="p-s12">
                      <div className="flex flex-col items-start gap-s4">
                        <Pills item={item} />
                      </div>
                    </td>
                    <td className="p-s12">
                      <Link href={`/reports/${item.id}`} className="font-semi-bold text-accent-text underline">
                        {label(REASONS, item.reason)}
                      </Link>
                      {preview(item) && <p className="mt-s2 break-words text-grey888">{preview(item)}</p>}
                    </td>
                    <td className="p-s12">
                      {who(item.owner)}
                      <p className="text-f13 text-grey888">{`by ${who(item.reporter)}`}</p>
                    </td>
                    <td className="whitespace-nowrap p-s12" title={formatDateTime(item.created_at)}>
                      {timeAgo(item.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {hasMore && last && (
        <Link href={href({ before: last.created_at })} className={`${secondaryButtonClass} mt-s16`}>
          Older reports
        </Link>
      )}
    </>
  );
}
