import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/staff';
import { REASONS, TARGET_TYPES, formatDateTime, label } from '@/lib/labels';
import { auditContext } from '@/lib/names';
import { standingOf, timeAgo } from '@/lib/present';
import type { AuditRow, Person, Sanction } from '@/lib/types';
import { ActionGroups, personOffers } from '@/components/ActionGroups';
import { AuditList } from '@/components/AuditList';
import { Empty, ErrorNote, Section, StandingBadge, StatusPill } from '@/components/bits';
import { SanctionList } from '@/components/SanctionList';
import { linkClass } from '@/components/styles';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One person's standing: actions first, then their warnings, suspensions and bans, reports about
// them, and what staff did.
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, role } = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [profile, sanctions, reports, actions] = await Promise.all([
    db.from('profiles').select('id, username, display_name, avatar_url, is_banned, created_at').eq('id', id).maybeSingle(),
    db.from('user_sanctions').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    db
      .from('user_reports')
      .select('id, target_type, reason, status, source, created_at')
      .eq('target_owner_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
    db.from('moderation_actions').select('*').eq('target_type', 'user').eq('target_id', id).order('created_at', { ascending: false }).limit(100),
  ]);
  if (profile.error) return <ErrorNote message={`Couldn't load this person. Try again in a moment. (${profile.error.message})`} />;
  if (!profile.data) notFound();

  const p = profile.data as Person & { created_at: string };
  const list = (sanctions.data ?? []) as Sanction[];
  const auditRows = (actions.data ?? []) as AuditRow[];
  const { names, owners } = await auditContext(db, auditRows);
  const reportRows = (reports.data ?? []) as { id: string; target_type: string; reason: string; status: string; created_at: string }[];

  return (
    <>
      <Link href="/users" className={`${linkClass} inline-flex min-h-z44 items-center text-f14`}>
        Back to people
      </Link>
      <div className="mt-s8 flex flex-wrap items-center gap-s8">
        <h1 className="break-all text-f24 font-bold">{`@${p.username ?? '?'}`}</h1>
        <StandingBadge standing={standingOf(list, !!p.is_banned)} />
      </div>
      <p className="mt-s4 text-f14 text-grey888">{`${p.display_name ? `${p.display_name} · ` : ''}joined ${formatDateTime(p.created_at)} · ${reportRows.length} report${reportRows.length === 1 ? '' : 's'} about them`}</p>

      <Section title="What to do" hint="Every action needs a reason and asks you to confirm. It's written to the audit log.">
        <ActionGroups offers={personOffers(p)} role={role} />
      </Section>

      <Section title="Warnings, suspensions and bans">
        {sanctions.error ? <ErrorNote message={sanctions.error.message} /> : <SanctionList sanctions={list} />}
      </Section>

      <Section title="Reports about them">
        {reports.error && <ErrorNote message={reports.error.message} />}
        {!reports.error && !reportRows.length && <Empty>None.</Empty>}
        {reportRows.length > 0 && (
          <ul className="flex flex-col divide-y divide-off-white rounded-r12 border-w1 border-off-white bg-white">
            {reportRows.map((r) => (
              <li key={r.id}>
                <Link href={`/reports/${r.id}`} className="flex min-h-z44 flex-wrap items-center gap-s8 px-s12 py-s8 text-f14">
                  <StatusPill status={r.status} />
                  <span className="font-semi-bold">{`${label(TARGET_TYPES, r.target_type)} · ${label(REASONS, r.reason)}`}</span>
                  <span className="text-grey888">{timeAgo(r.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="What staff have done">
        {actions.error ? <ErrorNote message={actions.error.message} /> : <AuditList rows={auditRows} names={names} owners={owners} />}
      </Section>
    </>
  );
}
