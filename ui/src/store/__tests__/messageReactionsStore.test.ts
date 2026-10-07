/**
 * conversationStore — reactions. A pick shows at once, then the server's own summary replaces
 * the guess (or the guess is rolled back if the server refused). A reaction changing live, from
 * either phone, re-reads that one message's reactions. `message_reacted` is sent once, after the
 * server confirms.
 *
 * `@/api`, `@/lib/supabase`, `expo-crypto` and `react-native` are mocked: pure logic, no natives.
 */
const track = jest.fn();
jest.mock('@/lib/analytics', () => ({ track: (...a: unknown[]) => track(...a) }));
const reportError = jest.fn();
jest.mock('@/lib/sentry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
jest.mock('@/api', () => ({
  getMessages: jest.fn(),
  sendMessage: jest.fn(),
  editMessage: jest.fn(),
  unsendMessage: jest.fn(),
  startConversation: jest.fn(),
  reactToMessage: jest.fn(),
  getMessageReactions: jest.fn(),
  getInbox: jest.fn(async () => ({ data: [], error: null })),
  getRequests: jest.fn(async () => ({ data: [], error: null })),
  markConversationRead: jest.fn(async () => ({ error: null })),
  MESSAGE_PAGE: 30,
}));

type Handler = (payload: { new?: unknown; old?: unknown }) => void;
const handlers = new Map<string, Handler>();
const fakeChannel = {
  on: (_kind: string, config: { event: string; table: string; filter?: string }, cb: Handler) => {
    handlers.set(`${config.table}:${config.event}`, cb);
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
jest.mock('expo-crypto', () => ({ randomUUID: () => 'cid' }));
jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

import { useConversationStore } from '@/store/conversationStore';
import { getMessages, getMessageReactions, reactToMessage, type Message } from '@/api';
import type { ReactionSummary } from '@/lib/messageReactions';

const CONVO = 'convo-1';
const r = (emoji: string, count: number, mine = false): ReactionSummary => ({ emoji, count, mine });

function row(id: string, reactions?: ReactionSummary[]): Message {
  return {
    id,
    conversation_id: CONVO,
    sender_id: 'them',
    content: id,
    client_id: null,
    created_at: '2026-10-07T10:00:00Z',
    ...(reactions ? { reactions } : {}),
  };
}

const reactionsOf = (id: string) =>
  useConversationStore.getState().threads[CONVO].messages.find((m) => m.id === id)?.reactions;

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  jest.clearAllMocks();
  handlers.clear();
  useConversationStore.getState().reset();
  (getMessages as jest.Mock).mockResolvedValue({
    data: [row('m1', [r('👍', 1)]), row('m2')],
    error: null,
  });
  await useConversationStore.getState().open(CONVO);
});

describe('react', () => {
  it('shows my pick at once, then the server’s summary replaces it', async () => {
    let answer!: (v: { data: ReactionSummary[]; error: null }) => void;
    (reactToMessage as jest.Mock).mockReturnValue(new Promise((res) => (answer = res)));

    const done = useConversationStore.getState().react(CONVO, 'm1', '🔥');
    expect(reactionsOf('m1')).toEqual([r('👍', 1), r('🔥', 1, true)]);
    expect(track).not.toHaveBeenCalled();

    // The server knows someone else reacted meanwhile: its answer wins.
    answer({ data: [r('👍', 2), r('🔥', 1, true)], error: null });
    expect(await done).toBe(true);
    expect(reactionsOf('m1')).toEqual([r('👍', 2), r('🔥', 1, true)]);
    expect(reactToMessage).toHaveBeenCalledWith('m1', '🔥');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('message_reacted', { emoji: '🔥' });
  });

  it('the same emoji again takes mine off at once, and is not counted as a reaction', async () => {
    (reactToMessage as jest.Mock).mockResolvedValue({
      data: [r('👍', 1), r('🔥', 1, true)],
      error: null,
    });
    await useConversationStore.getState().react(CONVO, 'm1', '🔥');
    expect(reactionsOf('m1')).toEqual([r('👍', 1), r('🔥', 1, true)]);
    expect(track).toHaveBeenCalledTimes(1);

    (reactToMessage as jest.Mock).mockResolvedValue({ data: [r('👍', 1)], error: null });
    const done = useConversationStore.getState().react(CONVO, 'm1', '🔥');
    expect(reactionsOf('m1')).toEqual([r('👍', 1)]);
    expect(await done).toBe(true);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('a refused reaction goes back to what was there, and is reported', async () => {
    (reactToMessage as jest.Mock).mockResolvedValue({ data: null, error: new Error('closed') });
    const done = useConversationStore.getState().react(CONVO, 'm2', '❤️');
    expect(reactionsOf('m2')).toEqual([r('❤️', 1, true)]);
    expect(await done).toBe(false);
    expect(reactionsOf('m2')).toBeUndefined();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(track).not.toHaveBeenCalled();
  });

  it('a message that is not in the thread cannot be reacted to', async () => {
    expect(await useConversationStore.getState().react(CONVO, 'nope', '❤️')).toBe(false);
    expect(reactToMessage).not.toHaveBeenCalled();
  });
});

describe('live changes', () => {
  it('listens to this chat’s reactions', () => {
    expect([...handlers.keys()]).toEqual(
      expect.arrayContaining([
        'message_reactions:INSERT',
        'message_reactions:UPDATE',
        'message_reactions:DELETE',
      ])
    );
  });

  it('a reaction added live re-reads that message’s reactions', async () => {
    (getMessageReactions as jest.Mock).mockResolvedValue({ data: [r('👍', 2)], error: null });
    handlers.get('message_reactions:INSERT')!({
      new: { message_id: 'm1', user_id: 'them', emoji: '👍', conversation_id: CONVO },
    });
    await flush();
    expect(getMessageReactions).toHaveBeenCalledWith('m1');
    expect(reactionsOf('m1')).toEqual([r('👍', 2)]);
  });

  it('a reaction taken off live (only its key arrives) re-reads too; an unknown message is ignored', async () => {
    (getMessageReactions as jest.Mock).mockResolvedValue({ data: [], error: null });
    handlers.get('message_reactions:DELETE')!({ old: { message_id: 'm1', user_id: 'them' } });
    handlers.get('message_reactions:DELETE')!({ old: { message_id: 'elsewhere', user_id: 'x' } });
    await flush();
    expect(getMessageReactions).toHaveBeenCalledTimes(1);
    expect(getMessageReactions).toHaveBeenCalledWith('m1');
    expect(reactionsOf('m1')).toEqual([]);
  });

  it('a failed re-read keeps what was shown and is reported', async () => {
    (getMessageReactions as jest.Mock).mockResolvedValue({ data: null, error: new Error('down') });
    handlers.get('message_reactions:UPDATE')!({
      new: { message_id: 'm1', user_id: 'them', emoji: '❤️', conversation_id: CONVO },
    });
    await flush();
    expect(reactionsOf('m1')).toEqual([r('👍', 1)]);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
