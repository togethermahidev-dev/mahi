/**
 * Streaks API
 *
 * Streak increments only when a user successfully posts a photo/video
 * via the native camera. Call `recordUpload` immediately after a post
 * is confirmed. Rest days (days not in fitness_routine) are exempt —
 * the streak continues without posting on those days.
 */

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types';

type StreakLog = Database['public']['Tables']['streak_logs']['Row'];

/**
 * Typed shape of the `record_upload_streak` RPC result.
 * The generated type is `Json`; this narrows it to the actual contract so
 * callers get typed streak fields. Keep in sync with the DB function.
 */
export interface StreakResult {
  streak_current: number;
  streak_highest: number;
  streak_lowest: number | null;
}

/**
 * Record a camera upload for streak tracking.
 * Call this once per successful post — the DB function is idempotent
 * for same-day calls.
 *
 * @param userId   The authenticated user's UUID
 * @param date     ISO date string 'YYYY-MM-DD' (defaults to today server-side)
 */
export async function recordUpload(
  userId: string,
  date?: string
): Promise<{ data: StreakResult | null; error: Error | null }> {
  const args: { p_user_id: string; p_upload_date?: string } = {
    p_user_id: userId,
  };
  if (date) args.p_upload_date = date;

  const { data, error } = await supabase.rpc('record_upload_streak', args);

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as StreakResult, error: null };
}

/**
 * Fetch the full streak log history for a user (most recent first).
 * Useful for displaying a streak timeline or stats screen.
 */
export async function getStreakLogs(
  userId: string
): Promise<{ data: StreakLog[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('streak_logs')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });

  if (error) return { data: null, error: new Error(error.message) };
  return { data, error: null };
}

/**
 * Fetch only the currently active streak log for a user.
 * Returns null data (no error) if no active streak exists yet.
 */
export async function getActiveStreak(
  userId: string
): Promise<{ data: StreakLog | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('streak_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) return { data: null, error: new Error(error.message) };
  return { data, error: null };
}
