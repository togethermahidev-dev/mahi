/**
 * The bio read and write (20261010110000_profile_bio; switch `profile-bio-and-counts`). The app
 * update can reach phones before the database change, so a server without get_profile_about is
 * not an error: it answers "no bio here" and the profile shows no bio line.
 */
import { getProfileAbout, setBio } from '@/api/profile';

// Jest lifts this mock above the import; the name starts with "mock" so it may be used inside it.
const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a) },
}));
const rpc = mockRpc;

beforeEach(() => {
  rpc.mockReset();
});

describe('getProfileAbout', () => {
  it('reads the bio and whether the lists are open', async () => {
    rpc.mockResolvedValue({ data: { bio: 'Up at 5', lists_open: true }, error: null });
    const { data, error } = await getProfileAbout('u1');
    expect(rpc).toHaveBeenCalledWith('get_profile_about', { p_user: 'u1' });
    expect(error).toBeNull();
    expect(data).toEqual({ bio: 'Up at 5', listsOpen: true });
  });

  it('no bio is null, and lists are closed unless the server says open', async () => {
    rpc.mockResolvedValue({ data: { bio: null, lists_open: false }, error: null });
    expect((await getProfileAbout('u1')).data).toEqual({ bio: null, listsOpen: false });
    rpc.mockResolvedValue({ data: { bio: '' }, error: null });
    expect((await getProfileAbout('u1')).data).toEqual({ bio: null, listsOpen: false });
  });

  it('a server without the function yet: no bio, and no error', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.get_profile_about(p_user) in the schema cache',
      },
    });
    expect(await getProfileAbout('u1')).toEqual({ data: null, error: null });
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function public.get_profile_about(uuid) does not exist' },
    });
    expect(await getProfileAbout('u1')).toEqual({ data: null, error: null });
  });

  it('an answer with no bio in it reads as "no bio here"', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getProfileAbout('u1')).toEqual({ data: null, error: null });
    rpc.mockResolvedValue({ data: { lists_open: true }, error: null });
    expect(await getProfileAbout('u1')).toEqual({ data: null, error: null });
  });

  it('any other error is returned as it is', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not signed in' } });
    const { data, error } = await getProfileAbout('u1');
    expect(data).toBeNull();
    expect(error?.message).toBe('not signed in');
  });
});

describe('setBio', () => {
  it('sends the words and returns what the server saved', async () => {
    rpc.mockResolvedValue({ data: { bio: 'Up at 5' }, error: null });
    const { data, error } = await setBio('  Up   at 5 ');
    expect(rpc).toHaveBeenCalledWith('set_bio', { p_bio: '  Up   at 5 ' });
    expect(error).toBeNull();
    expect(data).toEqual({ bio: 'Up at 5' });
  });

  it('a cleared bio comes back as none', async () => {
    rpc.mockResolvedValue({ data: { bio: null }, error: null });
    expect((await setBio('')).data).toEqual({ bio: null });
  });

  it('a refusal is returned with the server’s reason', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'bio is too long: 150 characters at most' },
    });
    const { data, error } = await setBio('x'.repeat(151));
    expect(data).toBeNull();
    expect(error?.message).toBe('bio is too long: 150 characters at most');
  });

  it('an answer with no bio in it is an error, never a silent success', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { data, error } = await setBio('Up at 5');
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });
});
