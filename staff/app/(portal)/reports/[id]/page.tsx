import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/staff';
import { canDo } from '@/lib/guard';
import { usernames } from '@/lib/names';
import { REASONS, SCAN_DECISIONS, SOURCES, STATUSES, TARGET_TYPES, formatDateTime, label } from '@/lib/labels';
import type { ReportDetail } from '@/lib/types';
import { Badge, Empty, ErrorNote, PersonLink, Section, statusTone } from '@/components/bits';
import { ActionButton } from '@/components/ActionButton';
import { UserActions } from '@/components/UserActions';
import { AuditList } from '@/components/AuditList';
import { SanctionList } from '@/components/SanctionList';
import { cardClass } from '@/components/styles';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

function Scores({ scores }: { scores: Record<string, number> | null }) {
  if (!scores) return null;
  const top = Object.entries(scores)
    .filter(([, n]) => n >= 0.01)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (!top.length) return null;
  return (
    <ul className="mt-s4 text-f13 text-grey888">
      {top.map(([k, n]) => (
        <li key={k}>{`${k.replace(/[_/-]/g, ' ')}: ${Math.round(n * 100)}%`}</li>
      ))}
    </ul>
  );
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, role } = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { data, error } = await db.rpc('staff_get_report', { p_report_id: id });
  if (error) return <ErrorNote message={`Couldn't load this report: ${error.message}`} />;
  const r = data as ReportDetail;
  const snap = r.snapshot ?? {};
  const target = r.target;
  const closed = r.status === 'actioned' || r.status === 'dismissed';

  // Post photos: the paths as they are now, or as they were when reported. Private 10-minute links.
  const media = [
    { path: str(target?.image_path) ?? str(snap.image_path), type: str(target?.rear_media_type) ?? str(snap.rear_media_type), name: 'Back camera' },
    { path: str(target?.pov_image_path) ?? str(snap.pov_image_path), type: str(target?.front_media_type) ?? str(snap.front_media_type), name: 'Front camera' },
  ].filter((m): m is { path: string; type: string | null; name: string } => !!m.path);
  const links = new Map<string, string>();
  if (r.target_type === 'post' && media.length) {
    const { data: signed } = await db.storage.from('posts').createSignedUrls(media.map((m) => m.path), 600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
  }

  const owner = r.owner;
  const names = await usernames(db, [...r.actions.map((a) => a.staff_id), owner?.id]);
  const hidden = !!target?.hidden_at;
  const removed = !!target?.removed_at;

  return (
    <>
      <Link href="/reports" className="text-f14 text-accent-text underline">
        Back to reports
      </Link>
      <div className="mt-s12 flex flex-wrap items-center gap-s8">
        <h1 className="text-f24 font-bold">{label(REASONS, r.reason)}</h1>
        <Badge tone={statusTone(r.status)}>{label(STATUSES, r.status)}</Badge>
        <Badge>{label(TARGET_TYPES, r.target_type)}</Badge>
      </div>
      <p className="mt-s4 text-f14 text-grey888">
        {`${label(SOURCES, r.source)} reported this on ${formatDateTime(r.created_at)}`}
        {r.reporter && (
          <>
            {' · '}
            <PersonLink person={r.reporter} />
          </>
        )}
      </p>
      {r.details && <p className={`${cardClass} mt-s12 text-f14`}>{`Their note: ${r.details}`}</p>}
      {r.resolution_note && (
        <p className="mt-s8 text-f14">{`Closed ${formatDateTime(r.reviewed_at)} with the note: ${r.resolution_note}`}</p>
      )}

      <Section title="What was reported">
        <div className={`${cardClass} flex flex-col gap-s8`}>
          <p className="text-f14">
            By <PersonLink person={owner} />
            {owner?.display_name ? ` (${owner.display_name})` : ''}
          </p>
          {!target && <Badge tone="danger">Deleted since — this is the copy kept when it was reported</Badge>}
          {hidden && <Badge tone="warn">{`Hidden: ${str(target?.hidden_reason) ?? ''}`}</Badge>}
          {removed && <Badge tone="warn">{`Removed: ${str(target?.removed_reason) ?? ''}`}</Badge>}
          {str(snap.content) && <p className="whitespace-pre-wrap text-f16">{str(snap.content)}</p>}
          {str(snap.caption) && <p className="whitespace-pre-wrap text-f16">{str(snap.caption)}</p>}
          {r.target_type === 'user' && (
            <p className="text-f16">{`@${str(snap.username) ?? '?'} · ${str(snap.display_name) ?? ''}`}</p>
          )}
          {target && str(target.content) && str(target.content) !== str(snap.content) && (
            <p className="text-f14 text-grey888">{`Now says: ${str(target.content)}`}</p>
          )}
          {target && str(target.caption) !== str(snap.caption) && r.target_type === 'post' && (
            <p className="text-f14 text-grey888">{`Caption now: ${str(target.caption) ?? '(none)'}`}</p>
          )}
          {media.length > 0 && (
            <div className="flex flex-wrap gap-s8">
              {media.map((m) => {
                const url = links.get(m.path);
                if (!url) return <Empty key={m.path}>{`${m.name}: no longer available`}</Empty>;
                return m.type === 'video' ? (
                  <a key={m.path} href={url} target="_blank" rel="noreferrer" className="text-f14 text-accent-text underline">
                    {`${m.name}: open video`}
                  </a>
                ) : (
                  <a key={m.path} href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a private 10-minute link, not optimisable */}
                    <img src={url} alt={m.name} className="w-z200 rounded-r8" />
                  </a>
                );
              })}
            </div>
          )}
          {str(snap.created_at) && <p className="text-f13 text-grey888">{`Posted ${formatDateTime(str(snap.created_at))}`}</p>}
        </div>
      </Section>

      {(r.ai_labels?.length || r.scans.length > 0) && (
        <Section title="Automatic check">
          <div className={`${cardClass} flex flex-col gap-s8`}>
            {r.ai_labels?.length ? <p className="text-f14">{`Found: ${r.ai_labels.join(', ').replace(/[_/-]/g, ' ')}`}</p> : null}
            <Scores scores={r.ai_scores} />
            {r.scans.map((s) => (
              <p key={s.id} className="text-f13 text-grey888">
                {`${formatDateTime(s.created_at)}: ${s.status === 'done' ? label(SCAN_DECISIONS, s.decision) : s.status}${s.error ? ` (${s.error})` : ''}`}
              </p>
            ))}
          </div>
        </Section>
      )}

      <Section title="Actions">
        <div className="flex flex-col items-start gap-s8">
          {r.status === 'open' && (
            <ActionButton action="review_report" label="Take this report" targetId={r.id} noteOptional explain="Marks it as being looked at, so others know." />
          )}
          {!closed && (
            <ActionButton action="dismiss_report" label="Dismiss" targetId={r.id} explain="Nothing wrong. Closes this report only; nothing changes for anyone." />
          )}
          {r.target_type === 'post' && target && !hidden && (
            <ActionButton action="hide_post" label="Hide post" targetId={r.target_id} reportId={r.id} destructive explain="Nobody but staff sees the post. It's kept, so it can be shown again. Closes every open report on it." />
          )}
          {r.target_type === 'post' && target && hidden && (
            <ActionButton action="unhide_post" label="Show post again" targetId={r.target_id} explain="The post goes back in the feed and on the profile." />
          )}
          {r.target_type === 'comment' && target && !removed && (
            <ActionButton action="remove_comment" label="Remove comment" targetId={r.target_id} reportId={r.id} destructive explain="Nobody but staff sees the comment. It's kept, so it can be restored. Closes every open report on it." />
          )}
          {r.target_type === 'comment' && target && removed && (
            <ActionButton action="restore_comment" label="Restore comment" targetId={r.target_id} explain="The comment shows again under the post." />
          )}
          {owner && <UserActions userId={owner.id} username={owner.username} banned={!!owner.is_banned} reportId={r.id} admin={canDo(role, 'ban_user')} />}
        </div>
      </Section>

      <Section title={`@${owner?.username ?? '?'}: warnings, suspensions and bans`}>
        <SanctionList sanctions={r.sanctions} />
      </Section>

      <Section title="Other reports on this or by the same person">
        {r.other_reports.length === 0 ? (
          <Empty>None.</Empty>
        ) : (
          <ul className="flex flex-col gap-s4 text-f14">
            {r.other_reports.map((o) => (
              <li key={o.id}>
                <Link href={`/reports/${o.id}`} className="text-accent-text underline">
                  {`${formatDateTime(o.created_at)} · ${label(TARGET_TYPES, o.target_type)} · ${label(REASONS, o.reason)} · ${label(STATUSES, o.status)}`}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="What staff have done">
        <AuditList rows={r.actions} names={names} />
      </Section>
    </>
  );
}
