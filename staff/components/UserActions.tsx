// Warn, suspend, and (admins only) ban or lift a ban. Used on a report and on a person's page.

import { ActionButton } from './ActionButton';

export function UserActions(props: { userId: string; username: string | null; banned: boolean; reportId?: string; admin: boolean }) {
  const name = `@${props.username ?? 'this person'}`;
  return (
    <>
      <ActionButton action="warn_user" label={`Warn ${name}`} targetId={props.userId} reportId={props.reportId} noteSeenByPerson explain="They see a warning in the app with your reason." />
      <ActionButton action="suspend_user" label={`Suspend ${name}`} targetId={props.userId} reportId={props.reportId} destructive noteSeenByPerson explain="For the days you choose they can't post, comment or get pushes, and nobody sees their posts. They're signed out on every phone. It ends by itself." />
      {props.admin && !props.banned && (
        <ActionButton action="ban_user" label={`Ban ${name}`} targetId={props.userId} reportId={props.reportId} destructive noteSeenByPerson explain="Until an admin lifts it, they can't post, comment or get pushes, and nobody sees their posts. They're signed out on every phone; signing in again shows them they're banned." />
      )}
      {props.admin && props.banned && (
        <ActionButton action="unban_user" label={`Lift ban and suspensions for ${name}`} targetId={props.userId} explain="Ends every ban and suspension on this person now." />
      )}
    </>
  );
}
