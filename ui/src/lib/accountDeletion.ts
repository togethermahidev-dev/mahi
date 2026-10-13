/**
 * Deleting your account (owner, 2026-10-13; switch `account-delete-reasons`): the reasons a person
 * can pick, their own words with "Something else", the list they tick and the word they type.
 * Pure, so it runs under the node-only tests. The server has the last word on the reason
 * (`set_account_deletion_reason`; migration 20261013100000_account_deletion_reasons) and keeps
 * nothing that says who left.
 */
import { ACCOUNT_DELETION } from '@/constants/tokens';
import { cleanBio, draftBio } from '@/lib/profileAbout';

/**
 * The quick picks, in the order shown. The codes and words are the server's own
 * (`account_deletion_reason_label`): change them together.
 */
export const DELETION_REASONS = [
  { code: 'not_using', label: 'I don’t use it enough' },
  { code: 'friends_not_here', label: 'My friends aren’t on Mahi' },
  { code: 'too_much_pressure', label: 'Tags feel like too much pressure' },
  { code: 'not_working', label: 'Something isn’t working properly' },
  { code: 'privacy', label: 'I’m worried about my privacy' },
  { code: 'new_account', label: 'I’m starting again with a new account' },
  { code: 'other', label: 'Something else' },
  { code: 'rather_not_say', label: 'I’d rather not say' },
] as const;

/** A reason a person can pick. */
export type DeletionReason = (typeof DELETION_REASONS)[number]['code'];

/** What is counted for a deletion: a picked reason, or none (the one-step pop-up). */
export type DeletionReasonCounted = DeletionReason | 'not_given';

/** What goes to the server with the deletion. `note`: their own words, with "Something else". */
export interface DeletionAnswer {
  reason: DeletionReason;
  note: string | null;
}

/** The most characters of their own words. */
export const DELETION_NOTE_MAX = ACCOUNT_DELETION.noteMax;

/** What the person ticks, one by one, before the account can go. */
export const DELETION_CHECKLIST = [
  'Your profile and username',
  'Your posts, photos and videos',
  'Your chats and messages',
  'Your Mahi points',
  'Your friends, followers and tags',
] as const;

/** The word typed to confirm. */
export const DELETE_WORD = 'delete';

/** The words on the sheet. */
export const DELETE_ACCOUNT_COPY = {
  title: 'Delete account',
  whyTitle: 'Why are you leaving?',
  whyHelp: 'Pick the one that fits best. It helps us make Mahi better.',
  notePlaceholder: 'Tell us more, if you like',
  noteHelp: 'Please don’t include names or personal details.',
  next: 'Continue',
  confirmTitle: 'This deletes, for good:',
  alsoGoes: 'Your likes, comments, invites and notifications go too. It can’t be undone.',
  kept: 'We keep only your reason for leaving, with nothing that says who you are.',
  typeLabel: 'Type delete to confirm',
  confirm: 'Delete account',
  busy: 'Deleting your account…',
} as const;

/** Their words while typing: one line, like a bio. */
export function draftDeletionNote(text: string): string {
  return draftBio(text);
}

/** The counter under the field: "12/180", and whether that is too many. An emoji counts once. */
export function deletionNoteCounter(draft: string): { text: string; over: boolean } {
  const length = Array.from(cleanBio(draft)).length;
  return { text: `${length}/${DELETION_NOTE_MAX}`, over: length > DELETION_NOTE_MAX };
}

/**
 * What to send: the reason, and their words as the server would keep them (the same tidy-up as a
 * bio), only with "Something else". Nothing written = no words.
 */
export function deletionAnswer(reason: DeletionReason, draft: string): DeletionAnswer {
  const note = reason === 'other' ? cleanBio(draft) : '';
  return { reason, note: note === '' ? null : note };
}

/** Step 1 goes on once a reason is picked; the words are optional but must fit. */
export function canContinueDeletion(reason: DeletionReason | null, draft: string): boolean {
  if (reason === null) return false;
  return reason !== 'other' || !deletionNoteCounter(draft).over;
}

/** Step 2: every line ticked, and the word typed (capitals and spaces around it don't matter). */
export function canDeleteAccount(ticked: readonly boolean[], typed: string): boolean {
  return (
    ticked.length === DELETION_CHECKLIST.length &&
    ticked.every(Boolean) &&
    typed.trim().toLowerCase() === DELETE_WORD
  );
}
