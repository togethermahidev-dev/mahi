/**
 * Streaks API
 *
 * The streak is updated by the server inside `createPost` (one call): each post that answers
 * a tag adds 1, missing a tag resets it to 0, and the best streak stays.
 */

/** The `streak` part of the `create_post` result. Keep in sync with the DB function. */
export interface StreakResult {
  streak_current: number;
  streak_highest: number;
}
