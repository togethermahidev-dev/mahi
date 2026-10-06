'use client';

// One staff action: a button that opens a confirm step with a required note (and days for a
// suspension). Nothing happens until "Confirm" is pressed. Destructive actions are red and say so.

import { useActionState, useState } from 'react';
import { staffAction, type ActionState } from '@/app/actions';
import type { StaffAction } from '@/lib/guard';
import { NOTE_MAX } from '@/lib/rpc';
import { dangerButtonClass, inputClass, secondaryButtonClass } from './styles';

type Props = {
  action: StaffAction;
  label: string;
  targetId: string;
  reportId?: string;
  /** Red, with a warning line in the confirm step. */
  destructive?: boolean;
  /** What happens, in one plain sentence, shown before confirming. */
  explain: string;
  /** Taking a report needs no note. */
  noteOptional?: boolean;
  /** The note is shown to the person (warnings, suspensions, bans). */
  noteSeenByPerson?: boolean;
};

export function ActionButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(staffAction, null);
  const buttonClass = props.destructive ? dangerButtonClass : secondaryButtonClass;

  if (state?.ok) {
    return <p className="text-f14 text-success-deep">{`${props.label}: ${state.message}`}</p>;
  }

  if (!open) {
    return (
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        {props.label}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex w-full flex-col gap-s8 rounded-r12 border-w1 border-off-white bg-surface-light p-s12"
    >
      <p className="text-f14 font-semi-bold">{props.label}</p>
      <p className="text-f14">{props.explain}</p>
      {props.destructive && <p className="text-f13 font-semi-bold text-danger-deep">This affects the person straight away.</p>}
      <input type="hidden" name="action" value={props.action} />
      <input type="hidden" name="targetId" value={props.targetId} />
      {props.reportId && <input type="hidden" name="reportId" value={props.reportId} />}
      {props.action === 'suspend_user' && (
        <label className="flex flex-col gap-s4 text-f14 font-semi-bold">
          Days
          <input name="days" type="number" min={1} max={365} required defaultValue={7} className={inputClass} />
        </label>
      )}
      {!props.noteOptional && (
        <label className="flex flex-col gap-s4 text-f14 font-semi-bold">
          {props.noteSeenByPerson ? 'Reason (the person sees this)' : 'Note for the audit log'}
          <textarea name="reason" required maxLength={NOTE_MAX} rows={3} className={inputClass} />
        </label>
      )}
      {state && !state.ok && (
        <p role="alert" className="text-f14 text-danger-deep">
          {state.message}
        </p>
      )}
      <div className="flex gap-s8">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? 'Working…' : `Confirm: ${props.label.toLowerCase()}`}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
