'use client';

// One staff action, in steps so it can't happen by accident:
//   1. A button with the action's name.
//   2. What happens and who sees it, the days (suspensions) and a required note. "Continue".
//   3. A confirm step that names the action and the person, repeats the note, and has a
//      "Yes, …" button. Only that button sends anything.
// Then a success or failure message in words. Taking a report needs no note, so it skips step 2.

import { useActionState, useState } from 'react';
import { staffAction, type ActionState } from '@/app/actions';
import type { StaffAction } from '@/lib/guard';
import { ACTION_INFO } from '@/lib/present';
import { NOTE_MAX } from '@/lib/rpc';
import { dangerButtonClass, inputClass, primaryButtonClass, secondaryButtonClass } from './styles';

type Props = {
  action: StaffAction;
  targetId: string;
  reportId?: string;
  /** Who or what it's done to, e.g. "@sam" or "this post". */
  subject: string;
};

export function ActionButton({ action, targetId, reportId, subject }: Props) {
  const info = ACTION_INFO[action];
  const serious = info.group === 'serious';
  const noteNeeded = action !== 'review_report';
  const [step, setStep] = useState<'closed' | 'note' | 'confirm'>('closed');
  const [note, setNote] = useState('');
  const [days, setDays] = useState('7');
  const [state, formAction, pending] = useActionState<ActionState, FormData>(staffAction, null);
  const name = `${info.label} ${subject}`.trim();
  const goClass = serious ? dangerButtonClass : primaryButtonClass;
  const daysOk = action !== 'suspend_user' || /^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= 365;

  if (state?.ok) {
    return (
      <p role="status" className="rounded-r8 border-w1 border-success-deep bg-white p-s12 text-f14 text-success-deep">
        <span className="font-semi-bold">{`Done: ${name}.`}</span> {state.message.replace(/^Done\.\s*/, '')}
      </p>
    );
  }

  if (step === 'closed') {
    return (
      <button
        type="button"
        className={`${secondaryButtonClass} w-full justify-between text-left sm:w-auto`}
        onClick={() => setStep(noteNeeded ? 'note' : 'confirm')}
        aria-expanded={false}
      >
        <span>{name}</span>
        <span aria-hidden="true" className="text-grey888">
          ›
        </span>
      </button>
    );
  }

  const cancel = () => {
    setStep('closed');
    setNote('');
  };

  return (
    <div
      role="region"
      aria-label={name}
      className={`flex w-full flex-col gap-s12 rounded-r12 border-w1 bg-white p-s16 ${serious ? 'border-danger-deep' : 'border-ink-deep'}`}
    >
      <p className="text-f16 font-bold">{name}</p>
      <p className="text-f14">{info.explain}</p>
      <p className="text-f13 text-grey888">
        <span className="font-semi-bold">Who sees it: </span>
        {info.seenBy}
      </p>

      {step === 'note' && (
        <>
          {action === 'suspend_user' && (
            <label className="flex flex-col gap-s4 text-f14 font-semi-bold">
              How many days (1 to 365)
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className={inputClass}
              />
            </label>
          )}
          <label className="flex flex-col gap-s4 text-f14 font-semi-bold">
            {info.noteSeenByPerson ? 'Reason — the person sees this' : 'Note for the audit log — only staff see this'}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={NOTE_MAX}
              rows={3}
              required
              autoFocus
              className={inputClass}
            />
            <span className="text-f12 font-regular text-grey888">{`${note.length} of ${NOTE_MAX} characters. Needed.`}</span>
          </label>
          <div className="flex flex-col-reverse gap-s8 sm:flex-row">
            <button type="button" className={secondaryButtonClass} onClick={cancel}>
              Cancel
            </button>
            <button type="button" className={primaryButtonClass} disabled={!note.trim() || !daysOk} onClick={() => setStep('confirm')}>
              Continue
            </button>
          </div>
          {(!note.trim() || !daysOk) && (
            <p className="text-f13 text-grey888">{!daysOk ? 'Choose 1 to 365 days.' : 'Write a note to continue.'}</p>
          )}
        </>
      )}

      {step === 'confirm' && (
        <form action={formAction} className="flex flex-col gap-s12">
          <input type="hidden" name="action" value={action} />
          <input type="hidden" name="targetId" value={targetId} />
          {reportId && <input type="hidden" name="reportId" value={reportId} />}
          {action === 'suspend_user' && <input type="hidden" name="days" value={days} />}
          <input type="hidden" name="reason" value={note} />
          <div className="rounded-r8 bg-surface-light p-s12 text-f14">
            <p className="font-semi-bold">
              {`You're about to: ${name}${action === 'suspend_user' ? ` for ${days} day${days === '1' ? '' : 's'}` : ''}.`}
            </p>
            {note && <p className="mt-s4 whitespace-pre-wrap break-words">{`Note: ${note}`}</p>}
            {serious && <p className="mt-s4 font-semi-bold text-danger-deep">This happens straight away.</p>}
          </div>
          {state && !state.ok && (
            <p role="alert" className="text-f14 font-semi-bold text-danger-deep">
              {`It didn't work: ${state.message}`}
            </p>
          )}
          <div className="flex flex-col-reverse gap-s8 sm:flex-row">
            <button type="button" className={secondaryButtonClass} onClick={() => setStep(noteNeeded ? 'note' : 'closed')} disabled={pending}>
              Go back
            </button>
            <button type="submit" disabled={pending} className={goClass}>
              {pending ? 'Working…' : `Yes, ${name.charAt(0).toLowerCase()}${name.slice(1)}`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
