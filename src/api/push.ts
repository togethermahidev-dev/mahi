import { supabase } from '@/lib/supabase';
import { getPushToken, pushPlatform } from '@/lib/push';

/** Link this device's push token to the signed-in user. No-op without permission. */
export async function registerPushToken(): Promise<{ error: Error | null }> {
  const token = await getPushToken();
  if (!token) return { error: null };
  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: pushPlatform(),
  });
  return { error: error ? new Error(error.message) : null };
}

/** Stop pushes to this device for the signed-in user. Call before signing out. */
export async function unregisterPushToken(): Promise<{ error: Error | null }> {
  const token = await getPushToken();
  if (!token) return { error: null };
  const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
  return { error: error ? new Error(error.message) : null };
}
