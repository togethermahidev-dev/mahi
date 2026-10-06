// The actions a page offers, in two boxes: "Safe" (nobody is punished, can be undone) and
// "Serious" (changes what people see or limits an account). Admin-only actions are left out for
// moderators; the server action checks the role again, and so does the database.

import type { StaffAction, StaffRole } from '@/lib/guard';
import { groupActions } from '@/lib/present';
import { ActionButton } from './ActionButton';
import { Empty } from './bits';

export type OfferedAction = { action: StaffAction; targetId: string; subject: string };

/** Warn, suspend, and ban or lift a ban: what can be done to a person. */
export function personOffers(person: { id: string; username: string | null; is_banned?: boolean }): OfferedAction[] {
  const subject = `@${person.username ?? 'this person'}`;
  return [
    { action: 'warn_user', targetId: person.id, subject },
    { action: 'suspend_user', targetId: person.id, subject },
    person.is_banned
      ? { action: 'unban_user', targetId: person.id, subject: `for ${subject}` }
      : { action: 'ban_user', targetId: person.id, subject },
  ];
}

export function ActionGroups({ offers, role, reportId }: { offers: OfferedAction[]; role: StaffRole; reportId?: string }) {
  const { safe, serious } = groupActions(
    offers.map((o) => o.action),
    role,
  );
  const byAction = new Map(offers.map((o) => [o.action, o]));
  if (!safe.length && !serious.length) return <Empty>Nothing to do here.</Empty>;

  const box = (title: string, hint: string, actions: StaffAction[], tone: string) =>
    actions.length > 0 && (
      <section aria-label={title} className={`flex flex-col gap-s8 rounded-r12 border-w1 bg-white p-s16 ${tone}`}>
        <h3 className="text-f16 font-bold">{title}</h3>
        <p className="text-f13 text-grey888">{hint}</p>
        {actions.map((a) => {
          const o = byAction.get(a)!;
          return (
            <ActionButton
              key={a}
              action={a}
              targetId={o.targetId}
              subject={o.subject}
              reportId={o.targetId === reportId ? undefined : reportId}
            />
          );
        })}
      </section>
    );

  return (
    <div className="grid gap-s12 md:grid-cols-2">
      {box('Safe', 'Nobody is punished, and it can be undone.', safe, 'border-off-white')}
      {box('Serious', 'Changes what people see or limits an account. Each one asks you to confirm.', serious, 'border-danger-deep')}
    </div>
  );
}
