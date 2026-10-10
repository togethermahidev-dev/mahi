/**
 * Follower and following counts and the bio on a profile (owner, 2026-10-10; switch
 * `profile-bio-and-counts`): the wording, the bio's tidy-up and length, and what a tap on a count
 * does. Pure, so it runs under the node-only tests. The server has the last word on all of it
 * (`set_bio`, `get_profile_about`, `get_follow_data`; migration 20261010110000_profile_bio).
 */
import { PROFILE_ABOUT } from '@/constants/tokens';

/** The most characters a bio holds. */
export const BIO_MAX = PROFILE_ABOUT.bioMax;

// The three steps of set_bio, character for character. Change them together.
/** Control characters, zero-width and blank fillers, direction marks and overrides. */
const INVISIBLE =
  /[\u0000-\u0008\u000E-\u001F\u007F-\u0084\u0086-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u2800\u3164\uFEFF\uFFA0]/g;
/** Every kind of space and line break, in any run. */
const SPACES = /[\u0009-\u000D \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g;
/** What emoji and some scripts are joined with: kept inside words, nothing on their own. */
const JOINERS = /[ \u200C\u200D\uFE00-\uFE0F]/g;
/** A line break of any kind, while typing. */
const LINE_BREAKS = /\r\n|[\n\r\u0085\u2028\u2029]/g;

/**
 * A bio as the server would save it: invisible characters out, line breaks and runs of spaces as
 * one space, the ends trimmed. '' means no bio.
 */
export function cleanBio(text: string | null | undefined): string {
  const tidy = (text ?? '').replace(INVISIBLE, '').replace(SPACES, ' ').trim();
  return tidy.replace(JOINERS, '') === '' ? '' : tidy;
}

/** How long the saved bio would be. An emoji counts once, as it does on the server. */
export function bioLength(text: string | null | undefined): number {
  return Array.from(cleanBio(text)).length;
}

/** The counter under the field: "12/150", and whether that is too many. */
export function bioCounter(draft: string): { text: string; over: boolean } {
  const length = bioLength(draft);
  return { text: `${length}/${BIO_MAX}`, over: length > BIO_MAX };
}

/** Save is for a bio that fits and differs from the saved one (clearing it counts). */
export function canSaveBio(draft: string, saved: string | null | undefined): boolean {
  return bioLength(draft) <= BIO_MAX && cleanBio(draft) !== cleanBio(saved);
}

/** The field while typing: a bio is one paragraph, so a line break becomes a space at once. */
export function draftBio(text: string): string {
  return text.replace(LINE_BREAKS, ' ');
}

/** What to say when a bio couldn't be saved (the old one is back on the profile). */
export function bioErrorText(message: string): string {
  return message.includes('bio is too long')
    ? `Your bio can be ${BIO_MAX} characters at most.`
    : 'Couldn’t save your bio. Try again.';
}

/**
 * The bio line on a profile. `supported` is false until the server has answered the bio read,
 * and stays false on a server without bios (before the migration): then nothing shows at all.
 * Yours: the bio, or a quiet "Add a bio". Someone else's: the bio, or no line.
 */
export function bioLine({
  supported,
  bio,
  isSelf,
}: {
  supported: boolean;
  bio: string | null | undefined;
  isSelf: boolean;
}): 'none' | 'add' | 'show' {
  if (!supported) return 'none';
  if (bio) return 'show';
  return isSelf ? 'add' : 'none';
}

export type CountKind = 'followers' | 'following';

/** From here a count is shortened ("12.3k"), so the line stays one line. */
const THOUSANDS_FROM = 10_000;
const MILLION = 1_000_000;

/** One decimal, cut (never rounded up), with ".0" dropped: 12.3, 10, 999.9. */
function short(value: number): string {
  return String(Math.floor(value * 10) / 10);
}

/** A count as it is drawn: 999 · 9,999 · 12.3k · 2.5m. */
export function formatCount(count: number): string {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (n >= MILLION) return `${short(n / MILLION)}m`;
  if (n >= THOUSANDS_FROM) return `${short(n / 1000)}k`;
  return withCommas(n);
}

function withCommas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+$)/g, ',');
}

/**
 * One count on the profile's line: the number, its word ("1 follower", "12 followers",
 * "3 following") and what a screen reader says (the whole number). `null`: the server hasn't
 * answered yet, so a dash, never a made-up zero.
 */
export function countWords(
  count: number | null | undefined,
  kind: CountKind
): { number: string; word: string; label: string } {
  if (count === null || count === undefined) {
    return {
      number: '–',
      word: kind,
      label: kind === 'followers' ? 'Followers loading' : 'Following loading',
    };
  }
  const word = kind === 'followers' && count === 1 ? 'follower' : kind;
  return {
    number: formatCount(count),
    word,
    label: `${withCommas(Math.max(0, Math.floor(count)))} ${word}`,
  };
}

/**
 * What a tap on a count does. Your own always opens the list. Someone else's opens only when the
 * server said their lists are open to you (`lists_open` from get_profile_about, which is
 * can_see_follow_lists); not known, or a server that can't say, is plain text.
 */
export function countTap(isSelf: boolean, listsOpen: boolean | null | undefined): 'open' | 'none' {
  return isSelf || listsOpen === true ? 'open' : 'none';
}
