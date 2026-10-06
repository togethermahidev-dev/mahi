import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/staff';
import { canDo } from '@/lib/guard';
import { REASONS, STATUSES, TARGET_TYPES, formatDateTime, label } from '@/lib/labels';
import { usernames } from '@/lib/names';
import { isActive, type AuditRow, type Person, type Sanction } from '@/lib/types';
import { AuditList } from '@/components/AuditList';
import { Badge, Empty, ErrorNote, Section } from '@/components/bits';
import { SanctionList } from '@/components/SanctionList';
import { UserActions } from '@/components/UserActions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One person's standing: their warnings, suspensions and bans, reports about them, what staff did.
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
    db
      .from('moderation_actions')
      .select('*')
      .eq('target_type', 'user')
      .eq('target_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (profile.error) return <ErrorNote message={`Couldn't load this person: ${profile.error.message}`} />;
  if (!profile.data) notFound();

  const p = profile.data as Person & { created_at: string };
  const list = (sanctions.data ?? []) as Sanction[];
  const running = list.filter((s) => isActive(s));
  const auditRows = (actions.data ?? []) as AuditRow[];
  const names = await usernames(db, [...auditRows.map((a) => a.staff_id), id]);

  return (
    <>
      <Link href="/users" className="text-f14 text-accent-text underline">
        Back to people
      </Link>
      <div className="mt-s12 flex flex-wrap items-center gap-s8">
        <h1 className="text-f24 font-bold">{`@${p.username ?? '?'}`}</h1>
        {running.some((s) => s.kind === 'ban') ? (
          <Badge tone="danger">Banned</Badge>
        ) : running.length ? (
          <Badge tone="danger">Suspended</Badge>
        ) : p.is_banned ? (
          <Badge tone="danger">Blocked</Badge>
        ) : (
          <Badge tone="good">In good standing</Badge>
        )}
      </div>
      <p className="mt-s4 text-f14 text-grey888">{`${p.display_name ?? ''} · joined ${formatDateTime(p.created_at)}`}</p>

      <Section title="Actions">
        <div className="flex flex-col items-start gap-s8">
          <UserActions userId={p.id} username={p.username} banned={!!p.is_banned} admin={canDo(role, 'ban_user')} />
        </div>
      </Section>

      <Section title="Warnings, suspensions and bans">
        {sanctions.error ? <ErrorNote message={sanctions.error.message} /> : <SanctionList sanctions={list} />}
      </Section>

      <Section title="Reports about them">
        {reports.error && <ErrorNote message={reports.error.message} />}
        {!reports.error && !reports.data?.length && <Empty>None.</Empty>}
        <ul className="flex flex-col gap-s4 text-f14">
          {(reports.data ?? []).map((r) => (
            <li key={r.id}>
              <Link href={`/reports/${r.id}`} className="text-accent-text underline">
                {`${formatDateTime(r.created_at)} · ${label(TARGET_TYPES, r.target_type)} · ${label(REASONS, r.reason)} · ${label(STATUSES, r.status)}`}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="What staff have done">
        {actions.error ? <ErrorNote message={actions.error.message} /> : <AuditList rows={auditRows} names={names} />}
      </Section>
    </>
  );
}
