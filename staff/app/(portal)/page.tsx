import Link from 'next/link';
import { requireStaff } from '@/lib/staff';
import { auditContext } from '@/lib/names';
import { REASONS, label } from '@/lib/labels';
import { countBy, startOfTodayLondon } from '@/lib/present';
import type { AuditRow, ReportItem } from '@/lib/types';
import { AuditList } from '@/components/AuditList';
import { Empty, ErrorNote, PageTitle, Section } from '@/components/bits';
import { cardClass, linkClass } from '@/components/styles';

// The most the queue call returns in one go (docs/moderation.md). Counts at this size show "200+".
const MAX = 200;

function Tile({ href, value, capped, title, hint, urgent }: { href: string; value: number; capped?: boolean; title: string; hint: string; urgent?: boolean }) {
  return (
    <Link href={href} className={`${cardClass} flex min-h-z96 flex-col gap-s4 ${urgent && value > 0 ? 'border-danger-deep' : ''}`}>
      <span className="text-f14 font-semi-bold text-grey888">{title}</span>
      <span className={`text-f32 font-bold ${urgent && value > 0 ? 'text-danger-deep' : ''}`}>{`${value}${capped ? '+' : ''}`}</span>
      <span className="text-f13 text-grey888">{hint}</span>
    </Link>
  );
}

// The home page: how much is waiting, what came in today, why, and what staff did lately.
// All from the existing staff reads: the queue call, the audit log and profiles.is_banned.
export default async function Overview() {
  const { db } = await requireStaff();
  const queue = (status: string | null) =>
    db.rpc('staff_get_queue', { p_status: status, p_target_type: null, p_limit: MAX, p_before: null });

  const [open, reviewing, latest, actions, blocked] = await Promise.all([
    queue('open'),
    queue('reviewing'),
    queue(null),
    db.from('moderation_actions').select('*').order('created_at', { ascending: false }).limit(6),
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('is_banned', true),
  ]);
  const failed = [open, reviewing, latest, actions, blocked].find((r) => r.error)?.error;

  const openItems = (open.data ?? []) as ReportItem[];
  const reviewingItems = (reviewing.data ?? []) as ReportItem[];
  const today = Date.parse(startOfTodayLondon());
  const latestItems = (latest.data ?? []) as ReportItem[];
  const todayCount = latestItems.filter((r) => Date.parse(r.created_at) >= today).length;
  const byReason = countBy(openItems, (r) => r.reason);
  const rows = (actions.data ?? []) as AuditRow[];
  const { names, owners } = await auditContext(db, rows);

  return (
    <>
      <PageTitle title="Overview" intro="What's waiting, and what staff did lately. Tap a box to see the list." />
      {failed && <ErrorNote message={`Some numbers couldn't load: ${failed.message}`} />}

      <div className="grid grid-cols-2 gap-s12 md:grid-cols-4">
        <Tile href="/reports?status=open" value={openItems.length} capped={openItems.length === MAX} title="New reports" hint="Nobody has looked yet" urgent />
        <Tile href="/reports?status=reviewing" value={reviewingItems.length} capped={reviewingItems.length === MAX} title="Being looked at" hint="Taken by staff" />
        <Tile href="/reports?status=all&when=today" value={todayCount} capped={todayCount === MAX} title="Reported today" hint="Since midnight, UK time" />
        <Tile href="/users#blocked" value={blocked.count ?? 0} title="Suspended or banned" hint="Right now" />
      </div>

      <Section title="New reports by reason">
        {byReason.length === 0 ? (
          <Empty>No new reports. All clear.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-off-white rounded-r12 border-w1 border-off-white bg-white">
            {byReason.map(([code, n]) => (
              <li key={code}>
                <Link href={`/reports?status=open&reason=${code}`} className="flex min-h-z44 items-center justify-between gap-s12 px-s16 py-s8 text-f14">
                  <span>{label(REASONS, code)}</span>
                  <span className="font-bold">{n}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent actions">
        <AuditList rows={rows} names={names} owners={owners} />
        <Link href="/audit" className={`${linkClass} mt-s8 inline-flex min-h-z44 items-center text-f14`}>
          The whole audit log
        </Link>
      </Section>
    </>
  );
}
