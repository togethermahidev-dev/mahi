/**
 * conversationStore — the parts that used to swap or duplicate messages.
 *
 * The old hook matched a server row to "the latest temp message from the same sender",
 * so two quick sends could swap their content. Every message now carries a client_id and
 * the store keys on it, so a row can only ever replace the message it belongs to.
 *
 * `@/api`, `@/lib/supabase`, `expo-crypto` and `react-native` are mocked: these are pure
 * logic tests in a plain node environment, with no native modules.
 */
jest.mock('@/api', () => ({
  getMessages: jest.fn(),
  sendMessage: jest.fn(),
  markConversationRead: jest.fn(async () => ({ error: null })),
  MESSAGE_PAGE: 30,
}));

let insertHandler: ((payload: { new: unknown }) => void) | null = null;
const fakeChannel = {
  on: (_event: string, _config: unknown, cb: (payload: { new: unknown }) => void) => {
    insertHandler = cb;
    return fakeChannel;
  },
  subscribe: (cb?: (status: string) => void) => {
    cb?.('SUBSCRIBED');
    return fakeChannel;
  },
};
jest.mock('@/lib/supabase', () => ({
  supabase: { channel: jest.fn(() => fakeChannel), removeChannel: jest.fn() },
}));

let nextId = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `cid-${++nextId}` }));

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

import { useConversationStore } from '@/store/conversationStore';
import { getMessages, sendMessage, type Message } from '@/api';

const CONVO = 'convo-1';
const ME = 'me';

function serverRow(id: string, clientId: string, content: string, at: string): Message {
  return {
    id,
    conversation_id: CONVO,
    sender_id: ME,
    content,
    client_id: clientId,
    created_at: at,
  };
}

/** A server timestamp the way a real one lands: just after the message was typed. */
function justAfter(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const thread = () => useConversationStore.getState().threads[CONVO];
const contents = () => thread().messages.map((m) => m.content);
const ids = () => thread().messages.map((m) => m.id);

beforeEach(() => {
  nextId = 0;
  insertHandler = null;
  useConversationStore.getState().reset();
  (getMessages as jest.Mock).mockResolvedValue({ data: [], error: null });
  (sendMessage as jest.Mock).mockReset();
});

describe('two quick sends', () => {
  it('keep their order and content however the replies come back', async () => {
    await useConversationStore.getState().open(CONVO);

    const first = deferred<{ data: Message | null; error: Error | null }>();
    const second = deferred<{ data: Message | null; error: Error | null }>();
    (sendMessage as jest.Mock)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const sendOne = useConversationStore.getState().send(CONVO, ME, 'one');
    const sendTwo = useConversationStore.getState().send(CONVO, ME, 'two');

    expect(contents()).toEqual(['one', 'two']);

    // The second reply lands first — the case that used to swap the two bubbles.
    second.resolve({ data: serverRow('s2', 'cid-2', 'two', justAfter(2)), error: null });
    await sendTwo;
    first.resolve({ data: serverRow('s1', 'cid-1', 'one', justAfter(1)), error: null });
    await sendOne;

    expect(contents()).toEqual(['one', 'two']);
    expect(ids()).toEqual(['s1', 's2']);
  });

  it('are each replaced by their own message when the live row arrives', async () => {
    await useConversationStore.getState().open(CONVO);

    const pending = deferred<{ data: Message | null; error: Error | null }>();
    (sendMessage as jest.Mock).mockReturnValue(pending.promise);
    useConversationStore.getState().send(CONVO, ME, 'one');
    useConversationStore.getState().send(CONVO, ME, 'two');

    // The live channel delivers the second message first.
    insertHandler?.({ new: serverRow('s2', 'cid-2', 'two', justAfter(2)) });

    expect(contents()).toEqual(['one', 'two']);
    expect(ids()).toEqual([expect.stringContaining('temp_cid-1'), 's2']);
  });
});

describe('a send that fails', () => {
  it('takes its message back off the screen and says so', async () => {
    await useConversationStore.getState().open(CONVO);
    (sendMessage as jest.Mock).mockResolvedValue({ data: null, error: new Error('offline') });

    const sent = await useConversationStore.getState().send(CONVO, ME, 'one');

    expect(sent).toBe(false);
    expect(contents()).toEqual([]);
  });
});

describe('paging', () => {
  it('puts the older page in front and stops asking once a short page comes back', async () => {
    const page = Array.from({ length: 30 }, (_, i) =>
      serverRow(
        `n${i}`,
        `cn${i}`,
        `new ${i}`,
        `2026-09-17T11:${String(i).padStart(2, '0')}:00.000Z`
      )
    );
    (getMessages as jest.Mock).mockResolvedValueOnce({ data: page, error: null });
    await useConversationStore.getState().open(CONVO);
    expect(thread().hasMore).toBe(true);

    (getMessages as jest.Mock).mockResolvedValueOnce({
      data: [serverRow('old', 'cold', 'older', '2026-09-17T09:00:00.000Z')],
      error: null,
    });
    await useConversationStore.getState().loadOlder(CONVO);

    expect(contents()[0]).toBe('older');
    expect(thread().messages).toHaveLength(31);
    expect(thread().hasMore).toBe(false);
  });
});
