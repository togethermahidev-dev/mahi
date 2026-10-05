import { supabase } from '@/lib/supabase';
import type { AppGate } from '@/lib/versionGate';

/**
 * The update gate for this platform (`get_app_gate`). Readable before sign-in. Gives up after
 * 3 seconds so a slow network never holds the app on the splash; the caller fails open.
 */
export async function getAppGate(
  platform: 'ios' | 'android'
): Promise<{ data: AppGate | null; error: Error | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  const { data, error } = await supabase
    .rpc('get_app_gate', { p_platform: platform })
    .abortSignal(controller.signal);
  clearTimeout(timer);
  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data ?? null) as AppGate | null, error: null };
}
