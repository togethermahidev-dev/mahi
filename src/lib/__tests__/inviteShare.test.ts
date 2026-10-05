import { slotShareMessage } from '../tagSlots';
import {
  inviteList,
  inviteListSummary,
  inviteRow,
  inviteShareMessage,
  markInvite,
} from '../inviteShare';

const invite = (n: number, claimed = false) => ({
  token: `t${n}`,
  code: `CODE${n}`,
  url: `https://togethermahi.com/i/t${n}`,
  claimed,
});

describe('inviteList', () => {
  it('starts every link as not sent', () => {
    expect(inviteList([invite(1), invite(2)]).map((i) => i.status)).toEqual(['not-sent', 'not-sent']);
  });

  it('counts an already-claimed link as sent (a retried post hands back the same links)', () => {
    expect(inviteList([invite(1, true)])[0].status).toBe('sent');
  });
});

describe('markInvite', () => {
  it('marks a link sent only when the share sheet actually sent it', () => {
    const list = inviteList([invite(1), invite(2)]);
    expect(markInvite(list, 't2', true).map((i) => i.status)).toEqual(['not-sent', 'sent']);
    expect(markInvite(list, 't2', false)).toEqual(list);
  });

  it('keeps a sent link sent when it is shared again and then cancelled', () => {
    const sent = markInvite(inviteList([invite(1)]), 't1', true);
    expect(markInvite(sent, 't1', false)[0].status).toBe('sent');
  });
});

describe('inviteRow', () => {
  it('numbers each link and says what tapping does', () => {
    const [first] = inviteList([invite(1)]);
    expect(inviteRow(first, 0)).toEqual({
      title: 'Invite 1',
      status: 'Not sent yet',
      button: 'Send',
      a11y: 'Send invite 1',
    });
    expect(inviteRow({ ...first, status: 'sent' }, 0)).toEqual({
      title: 'Invite 1',
      status: 'Sent',
      button: 'Send again',
      a11y: 'Send invite 1 again',
    });
  });
});

describe('inviteListSummary', () => {
  it('counts what is left to send', () => {
    const list = markInvite(inviteList([invite(1), invite(2), invite(3)]), 't1', true);
    expect(inviteListSummary(list)).toEqual({
      headline: 'Send your 3 invites',
      count: '1 of 3 sent',
      unsent: 2,
      allSent: false,
    });
  });

  it('says so when every link is out', () => {
    const list = markInvite(inviteList([invite(1)]), 't1', true);
    expect(inviteListSummary(list)).toEqual({
      headline: 'Send your invite',
      count: '1 of 1 sent',
      unsent: 0,
      allSent: true,
    });
  });
});

describe('inviteShareMessage', () => {
  // The invite page isn't live, so a link opens nothing yet: the code is how a new person gets
  // linked to you (review, 2026-10-05: the code was missing, so no invite could be claimed).
  it('carries the link and the code, the same words as the tag screen', () => {
    const message = inviteShareMessage('https://togethermahi.com/i/t1', 'ABC234');
    expect(message).toContain('https://togethermahi.com/i/t1');
    expect(message).toContain('ABC234');
    expect(message).toBe(slotShareMessage('https://togethermahi.com/i/t1', 'ABC234'));
  });
});
