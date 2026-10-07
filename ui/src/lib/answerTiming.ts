/**
 * The on-time line under a poster's name (owner, 2026-10-07: BeReal's "late", made positive):
 * "Answered @sam in 2h", "Answered @sam with 20 min to spare" in the last hour, and "First Mahi"
 * for a first ever post that answered no one. Read from the server's `answered` / `first_post`
 * (20261007250000_answer_timing); before that is live, the older `response` still names the mate
 * and the time taken.
 *
 * Pure and import-free so it runs under the node-only jest harness.
 */

export type AnswerTiming = {
  tagger_username: string;
  seconds_taken: number;
  /** null when unknown (an older server). */
  seconds_to_spare: number | null;
};

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/** "under a minute", "20 min", "2h" (rounded down). */
function took(seconds: number): string {
  if (seconds < MINUTE) return 'under a minute';
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)} min`;
  return `${Math.floor(seconds / HOUR)}h`;
}

export function answerTimingLine(post: {
  answered?: AnswerTiming | null;
  first_post?: boolean;
  response?: { tagger_username: string; seconds: number } | null;
}): string | null {
  const a: AnswerTiming | null =
    post.answered ??
    (post.answered === undefined && post.response
      ? {
          tagger_username: post.response.tagger_username,
          seconds_taken: post.response.seconds,
          seconds_to_spare: null,
        }
      : null);
  if (a) {
    const who = `Answered @${a.tagger_username}`;
    const spare = a.seconds_to_spare;
    if (spare !== null && spare > 0 && spare < HOUR) {
      return spare < MINUTE
        ? `${who} with seconds to spare`
        : `${who} with ${Math.floor(spare / MINUTE)} min to spare`;
    }
    return `${who} in ${took(Math.max(0, a.seconds_taken))}`;
  }
  return post.first_post ? 'First Mahi' : null;
}
