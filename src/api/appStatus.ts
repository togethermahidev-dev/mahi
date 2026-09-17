import { supabase } from '@/lib/supabase';

/** Oldest app version the server still accepts (app_config.min_app_version). */
export async function getMinAppVersion(): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.from('app_config').select('min_app_version').single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data.min_app_version, error: null };
}
