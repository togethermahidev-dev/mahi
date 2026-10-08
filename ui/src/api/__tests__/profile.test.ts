/**
 * The profile read asks for the Controls columns (20261008170000_private_accounts). A server
 * without them yet answers "column does not exist" (42703): the read tries again without them,
 * so profiles never stop loading if the update reaches phones before the database change.
 */
const selects: string[] = [];
let answers: { data: unknown; error: unknown }[] = [];
const query = {
  select: (cols: string) => {
    selects.push(cols);
    return query;
  },
  eq: () => query,
  single: async () => answers.shift(),
};
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => query } }));

import { getProfile } from '@/api/profile';

beforeEach(() => {
  selects.length = 0;
});

it('reads the Controls columns with the profile', async () => {
  answers = [{ data: { id: 'u1', is_private: true }, error: null }];
  const { data } = await getProfile('u1');
  expect(selects[0]).toContain('is_private, posts_visibility, tag_permission, privacy_chosen_at');
  expect(data).toEqual({ id: 'u1', is_private: true });
});

it('a server without the columns yet: reads the profile without them', async () => {
  answers = [
    { data: null, error: { code: '42703', message: 'column profiles.is_private does not exist' } },
    { data: { id: 'u1' }, error: null },
  ];
  const { data, error } = await getProfile('u1');
  expect(error).toBeNull();
  expect(data).toEqual({ id: 'u1' });
  expect(selects[1]).not.toContain('is_private');
});

it('any other error is returned as it is', async () => {
  answers = [{ data: null, error: { code: 'PGRST116', message: 'no rows' } }];
  const { data, error } = await getProfile('u1');
  expect(data).toBeNull();
  expect(error?.message).toBe('no rows');
  expect(selects).toHaveLength(1);
});
