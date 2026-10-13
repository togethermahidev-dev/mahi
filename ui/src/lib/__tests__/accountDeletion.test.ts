import fs from 'fs';
import path from 'path';
import {
  canContinueDeletion,
  canDeleteAccount,
  DELETE_ACCOUNT_COPY,
  DELETE_WORD,
  DELETION_CHECKLIST,
  DELETION_NOTE_MAX,
  DELETION_REASONS,
  deletionAnswer,
  deletionNoteCounter,
  draftDeletionNote,
} from '../accountDeletion';

describe('the reasons a person can pick', () => {
  it('end with "Something else" and a way not to say', () => {
    const codes = DELETION_REASONS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.slice(-2)).toEqual(['other', 'rather_not_say']);
  });

  it('never offer the server’s own "not_given"', () => {
    expect(DELETION_REASONS.map((r) => r.code as string)).not.toContain('not_given');
  });

  // The server refuses a reason it doesn't know and words the Slack message itself, so the two
  // lists must match. If a later migration replaces account_deletion_reason_label, read that one.
  it('are the server’s reasons, word for word', () => {
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        '../../../../supabase/migrations/20261013100000_account_deletion_reasons.sql'
      ),
      'utf8'
    );
    // Only the reasons' own function: from its name to the end of its body.
    const start = sql.indexOf('create function public.account_deletion_reason_label');
    const body = sql.slice(start, sql.indexOf('$$;', start));
    const server = new Map<string, string>();
    for (const m of body.matchAll(/when '([a-z_]+)' then '([^']+)'/g)) server.set(m[1], m[2]);
    expect(server.get('not_given')).toBe('No reason given');
    server.delete('not_given');
    expect(Object.fromEntries(server)).toEqual(
      Object.fromEntries(DELETION_REASONS.map((r) => [r.code, r.label]))
    );
  });
});

describe('their own words (with "Something else")', () => {
  it('hold 180 characters, like the server', () => {
    expect(DELETION_NOTE_MAX).toBe(180);
  });

  it('count an emoji once and say when there are too many', () => {
    expect(deletionNoteCounter('')).toEqual({ text: '0/180', over: false });
    expect(deletionNoteCounter('💪'.repeat(180))).toEqual({ text: '180/180', over: false });
    expect(deletionNoteCounter('a'.repeat(181))).toEqual({ text: '181/180', over: true });
  });

  it('stay on one line while typing', () => {
    expect(draftDeletionNote('too\nmany\r\ntags')).toBe('too many tags');
  });

  it('are sent tidied, and only with "Something else"', () => {
    expect(deletionAnswer('other', '  It   got\n boring  ')).toEqual({
      reason: 'other',
      note: 'It got boring',
    });
    expect(deletionAnswer('privacy', 'typed before changing my mind')).toEqual({
      reason: 'privacy',
      note: null,
    });
  });

  it('are optional: "Something else" with nothing written sends no words', () => {
    expect(deletionAnswer('other', '  \n ')).toEqual({ reason: 'other', note: null });
  });
});

describe('step 1: why', () => {
  it('needs a reason picked before Continue', () => {
    expect(canContinueDeletion(null, '')).toBe(false);
    expect(canContinueDeletion('not_using', '')).toBe(true);
    expect(canContinueDeletion('rather_not_say', '')).toBe(true);
  });

  it('"Something else" continues with or without words, but not with too many', () => {
    expect(canContinueDeletion('other', '')).toBe(true);
    expect(canContinueDeletion('other', 'a'.repeat(180))).toBe(true);
    expect(canContinueDeletion('other', 'a'.repeat(181))).toBe(false);
  });

  it('too many words typed under another reason don’t block: they aren’t sent', () => {
    expect(canContinueDeletion('privacy', 'a'.repeat(181))).toBe(true);
  });
});

describe('step 2: tick what goes, then type the word', () => {
  const all = DELETION_CHECKLIST.map(() => true);

  it('lists what is deleted, in plain words', () => {
    const list = DELETION_CHECKLIST.join(' ');
    for (const word of [
      'profile',
      'username',
      'posts',
      'photos',
      'messages',
      'points',
      'friends',
    ]) {
      expect(list).toContain(word);
    }
  });

  it('says it can’t be undone, and what little is kept', () => {
    expect(DELETE_ACCOUNT_COPY.alsoGoes).toMatch(/can.t be undone/);
    expect(DELETE_ACCOUNT_COPY.kept).toMatch(/nothing that says who you are/);
  });

  it('needs every line ticked', () => {
    expect(canDeleteAccount(all, DELETE_WORD)).toBe(true);
    for (let i = 0; i < all.length; i++) {
      expect(
        canDeleteAccount(
          all.map((t, j) => (j === i ? false : t)),
          DELETE_WORD
        )
      ).toBe(false);
    }
    expect(canDeleteAccount([], DELETE_WORD)).toBe(false);
    expect(canDeleteAccount(all.slice(1), DELETE_WORD)).toBe(false);
  });

  it('needs the word typed: capitals and spaces around it are fine, anything else is not', () => {
    expect(DELETE_WORD).toBe('delete');
    expect(canDeleteAccount(all, ' Delete ')).toBe(true);
    expect(canDeleteAccount(all, 'DELETE')).toBe(true);
    expect(canDeleteAccount(all, '')).toBe(false);
    expect(canDeleteAccount(all, 'delet')).toBe(false);
    expect(canDeleteAccount(all, 'delete it')).toBe(false);
  });

  it('names the action on the button, in sentence case', () => {
    expect(DELETE_ACCOUNT_COPY.confirm).toBe('Delete account');
    expect(DELETE_ACCOUNT_COPY.typeLabel).toBe('Type delete to confirm');
  });
});
