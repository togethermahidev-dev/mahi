/**
 * Find friends in your contacts (server: 20261007270000_contact_match). Only SHA-256 hashes of numbers and
 * emails are sent; what comes back is the accounts found, never a number or an email.
 */
import { supabase } from '@/lib/supabase';
import type { MatchedAccount } from '@/lib/contactMatch';

/** The Mahi accounts these hashes belong to (at most 2000 a call, 10 calls an hour). */
export async function matchContacts(
  hashes: string[]
): Promise<{ data: MatchedAccount[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('match_contacts', { p_hashes: hashes });
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: (data ?? []) as unknown as MatchedAccount[], error: null };
}
