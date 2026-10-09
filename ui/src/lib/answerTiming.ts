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

type TimingInput = {
  answered?: AnswerTiming | null;
  first_post?: boolean;
  response?: { tagger_username: string; seconds: number } | null;
};

/** The oldest tag the post answered, from the new field or, on an older server, the old one. */
function answeredTag(post: TimingInput): AnswerTiming | null {
  return (
    post.answered ??
    (post.answered === undefined && post.response
      ? {
          tagger_username: post.response.tagger_username,
          seconds_taken: post.response.seconds,
          seconds_to_spare: null,
        }
      : null)
  );
}

/** "in 2h", "with 20 min to spare" in the last hour, "with seconds to spare". */
function timing(a: AnswerTiming): string {
  const spare = a.seconds_to_spare;
  if (spare !== null && spare > 0 && spare < HOUR) {
    return spare < MINUTE
      ? 'with seconds to spare'
      : `with ${Math.floor(spare / MINUTE)} min to spare`;
  }
  return `in ${took(Math.max(0, a.seconds_taken))}`;
}

export function answerTimingLine(post: TimingInput): string | null {
  const a = answeredTag(post);
  if (a) return `Answered @${a.tagger_username} ${timing(a)}`;
  return post.first_post ? 'First Mahi' : null;
}

/**
 * The timing after "Replying to @joe, @sam." (core workflow step 21), which already names the
 * people: "Answered in 2h.", "Answered with 20 min to spare."; null when nothing was answered.
 */
export function answerTimingTail(post: TimingInput): string | null {
  const a = answeredTag(post);
  return a ? `Answered ${timing(a)}.` : null;
}
