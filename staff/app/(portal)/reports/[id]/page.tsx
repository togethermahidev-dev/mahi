import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/staff';
import { auditContext } from '@/lib/names';
import { REASONS, SCAN_DECISIONS, SOURCES, TARGET_TYPES, formatDateTime, label } from '@/lib/labels';
import { standingOf, timeAgo } from '@/lib/present';
import type { ReportDetail } from '@/lib/types';
import { Badge, Empty, ErrorNote, PersonLink, Section, StandingBadge, StatusPill } from '@/components/bits';
import { ActionGroups, personOffers, type OfferedAction } from '@/components/ActionGroups';
import { AuditList } from '@/components/AuditList';
import { SanctionList } from '@/components/SanctionList';
import { cardClass, linkClass } from '@/components/styles';

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
    <ul className="flex flex-col gap-s2 text-f13">
      {top.map(([k, n]) => (
        <li key={k} className="flex justify-between gap-s12">
          <span>{k.replace(/[_/-]/g, ' ')}</span>
          <span className="font-semi-bold">{`${Math.round(n * 100)}%`}</span>
        </li>
      ))}
    </ul>
  );
}

// One report: what was reported first, then who reported it and why, the person's history, the
// automatic check, and the actions in "Safe" and "Serious" boxes.
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, role } = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { data, error } = await db.rpc('staff_get_report', { p_report_id: id });
  if (error || !data) {
    return (
      <>
        <Link href="/reports" className={`${linkClass} inline-flex min-h-z44 items-center text-f14`}>
          Back to reports
        </Link>
        <ErrorNote message={`Couldn't load this report. It may not exist, or try again in a moment.${error ? ` (${error.message})` : ''}`} />
      </>
    );
  }
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
  const { names, owners } = await auditContext(db, r.actions);
  const hidden = !!target?.hidden_at;
  const removed = !!target?.removed_at;
  const thing = label(TARGET_TYPES, r.target_type).toLowerCase();

  const offers: OfferedAction[] = [];
  if (r.status === 'open') offers.push({ action: 'review_report', targetId: r.id, subject: '' });
  if (!closed) offers.push({ action: 'dismiss_report', targetId: r.id, subject: '' });
  if (target && r.target_type === 'post') offers.push({ action: hidden ? 'unhide_post' : 'hide_post', targetId: r.target_id, subject: '' });
  if (target && r.target_type === 'comment') offers.push({ action: removed ? 'restore_comment' : 'remove_comment', targetId: r.target_id, subject: '' });
  if (target && r.target_type === 'message') offers.push({ action: removed ? 'restore_message' : 'remove_message', targetId: r.target_id, subject: '' });
  if (owner) offers.push(...personOffers(owner));

  return (
    <>
      <Link href="/reports" className={`${linkClass} inline-flex min-h-z44 items-center text-f14`}>
        Back to reports
      </Link>
      <div className="mt-s8 flex flex-wrap items-center gap-s8">
        <h1 className="text-f24 font-bold">{`${label(TARGET_TYPES, r.target_type)} reported for ${label(REASONS, r.reason).toLowerCase()}`}</h1>
      </div>
      <div className="mt-s8 flex flex-wrap items-center gap-s6">
        <StatusPill status={r.status} />
        {r.source === 'ai' && <Badge tone="info">{SOURCES.ai}</Badge>}
        {r.open_reports_on_target > 1 && <Badge tone="danger">{`${r.open_reports_on_target} open reports on this`}</Badge>}
      </div>

      <Section title={`The ${thing}, as reported`}>
        <div className={`${cardClass} flex flex-col gap-s8`}>
          <p className="text-f14">
            {r.target_type === 'user' ? 'The person: ' : 'By '}
            <PersonLink person={owner} />
            {owner?.display_name ? ` (${owner.display_name})` : ''}
          </p>
          {!target && <Badge tone="danger">Deleted since. This is the copy kept when it was reported.</Badge>}
          {hidden && <Badge tone="warn">{`Hidden now: ${str(target?.hidden_reason) ?? ''}`}</Badge>}
          {removed && <Badge tone="warn">{`Removed now: ${str(target?.removed_reason) ?? ''}`}</Badge>}
          {str(snap.content) && <p className="whitespace-pre-wrap break-words text-f17">{str(snap.content)}</p>}
          {str(snap.caption) && <p className="whitespace-pre-wrap break-words text-f17">{str(snap.caption)}</p>}
          {r.target_type === 'user' && <p className="text-f17">{`@${str(snap.username) ?? '?'}${str(snap.display_name) ? ` · ${str(snap.display_name)}` : ''}`}</p>}
          {r.target_type === 'post' && !str(snap.caption) && media.length === 0 && <Empty>No caption or photo was kept.</Empty>}
          {target && str(target.content) && str(target.content) !== str(snap.content) && (
            <p className="text-f14 text-grey888">{`Now says: ${str(target.content)}`}</p>
          )}
          {target && r.target_type === 'post' && str(target.caption) !== str(snap.caption) && (
            <p className="text-f14 text-grey888">{`Caption now: ${str(target.caption) ?? '(none)'}`}</p>
          )}
          {media.length > 0 && (
            <div className="grid grid-cols-2 gap-s8 sm:flex sm:flex-wrap">
              {media.map((m) => {
                const url = links.get(m.path);
                if (!url) return <Empty key={m.path}>{`${m.name}: no longer available`}</Empty>;
                return m.type === 'video' ? (
                  <a key={m.path} href={url} target="_blank" rel="noreferrer" className={`${linkClass} inline-flex min-h-z44 items-center text-f14`}>
                    {`${m.name}: open video`}
                  </a>
                ) : (
                  <a key={m.path} href={url} target="_blank" rel="noreferrer" aria-label={`${m.name} photo, opens full size`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a private 10-minute link, not optimisable */}
                    <img src={url} alt={m.name} className="w-full rounded-r8 sm:w-z200" />
                  </a>
                );
              })}
            </div>
          )}
          {str(snap.created_at) && <p className="text-f13 text-grey888">{`Posted ${formatDateTime(str(snap.created_at))}`}</p>}
        </div>
      </Section>

      <Section title="Who reported it and why">
        <div className={`${cardClass} flex flex-col gap-s6 text-f14`}>
          <p>
            {r.reporter ? <PersonLink person={r.reporter} /> : <span className="font-semi-bold">{SOURCES.ai}</span>}
            {` · ${label(REASONS, r.reason)} · `}
            <time dateTime={r.created_at} title={formatDateTime(r.created_at)}>
              {timeAgo(r.created_at)}
            </time>
          </p>
          {r.details ? <p className="whitespace-pre-wrap break-words">{`Their note: ${r.details}`}</p> : <p className="text-grey888">No note added.</p>}
          {r.resolution_note && <p>{`Closed ${formatDateTime(r.reviewed_at)} with the note: ${r.resolution_note}`}</p>}
        </div>
      </Section>

      {owner && (
        <Section title={`@${owner.username ?? '?'}'s history`}>
          <div className={`${cardClass} flex flex-col gap-s12`}>
            <div className="flex flex-wrap items-center gap-s8">
              <StandingBadge standing={standingOf(r.sanctions, !!owner.is_banned)} />
              <Link href={`/users/${owner.id}`} className={`${linkClass} inline-flex min-h-z44 items-center text-f14`}>
                Their page
              </Link>
            </div>
            <SanctionList sanctions={r.sanctions} />
          </div>
        </Section>
      )}

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

      <Section title="What to do" hint="Every action needs a note and asks you to confirm. It's written to the audit log.">
        <ActionGroups offers={offers} role={role} reportId={r.id} />
      </Section>

      <Section title="Other reports on this or about the same person">
        {r.other_reports.length === 0 ? (
          <Empty>None.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-off-white rounded-r12 border-w1 border-off-white bg-white">
            {r.other_reports.map((o) => (
              <li key={o.id}>
                <Link href={`/reports/${o.id}`} className="flex min-h-z44 flex-wrap items-center gap-s8 px-s12 py-s8 text-f14">
                  <StatusPill status={o.status} />
                  <span className="font-semi-bold">{`${label(TARGET_TYPES, o.target_type)} · ${label(REASONS, o.reason)}`}</span>
                  <span className="text-grey888">{timeAgo(o.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="What staff have done">
        <AuditList rows={r.actions} names={names} owners={owners} />
      </Section>
    </>
  );
}
