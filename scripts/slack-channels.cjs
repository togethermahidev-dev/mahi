#!/usr/bin/env node
// One private Slack channel per Mahi feature, each with a pinned summary that is the live scope of
// work. The list is scripts/slack-channels.json; this script only applies it.
//
//   node scripts/slack-channels.cjs            show the plan, change nothing
//   node scripts/slack-channels.cjs --apply    create missing channels, update purposes and pinned summaries
//
// Token: SLACK_BOT_TOKEN, or the git-ignored .slack-token file at the repo root. The bot needs
// channels:manage, channels:read, groups:write, groups:read, chat:write, pins:write and pins:read.
// People to invite into every channel: SLACK_INVITE=U0123,U0456 (Slack member IDs).
// Re-running is safe: an existing channel keeps its history; only its purpose and the pinned
// summary are brought up to date.
const fs = require('fs');
const path = require('path');

const API = 'https://slack.com/api/';

async function slack(method, token, body) {
  const res = await fetch(API + method, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.error}`);
  return json;
}

/** The pinned message: the purpose as a bold heading, then the summary. */
function pinnedText(channel) {
  return `*${channel.purpose}*\n${channel.summary}`;
}

/** What to do for each channel, given the channels the bot can already see (name → {id, purpose}). */
function plan(channels, existing) {
  return channels.map((c) => {
    const found = existing.get(c.name);
    return found ? { ...c, action: 'update', id: found.id } : { ...c, action: 'create' };
  });
}

async function listExisting(token) {
  const map = new Map();
  let cursor;
  do {
    const page = await slack('conversations.list', token, {
      types: 'public_channel,private_channel',
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const ch of page.channels) map.set(ch.name, { id: ch.id, purpose: ch.purpose?.value ?? '' });
    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return map;
}

async function pinnedByBot(token, channel, botUserId) {
  const pins = await slack('pins.list', token, { channel });
  return pins.items.find((i) => i.type === 'message' && i.message?.user === botUserId)?.message;
}

async function apply(token, items, invite) {
  const me = await slack('auth.test', token);
  for (const c of items) {
    let id = c.id;
    if (c.action === 'create') {
      id = (await slack('conversations.create', token, { name: c.name, is_private: true })).channel.id;
    }
    await slack('conversations.setPurpose', token, { channel: id, purpose: c.purpose });
    const text = pinnedText(c);
    const pinned = await pinnedByBot(token, id, me.user_id);
    if (pinned) {
      if (pinned.text !== text) await slack('chat.update', token, { channel: id, ts: pinned.ts, text });
    } else {
      const posted = await slack('chat.postMessage', token, { channel: id, text });
      await slack('pins.add', token, { channel: id, timestamp: posted.ts });
    }
    if (invite.length) {
      try {
        await slack('conversations.invite', token, { channel: id, users: invite.join(',') });
      } catch (e) {
        if (!/already_in_channel|cant_invite_self/.test(e.message)) throw e;
      }
    }
    console.log(`${c.action === 'create' ? 'created' : 'updated'}  #${c.name}`);
  }
}

function readToken() {
  if (process.env.SLACK_BOT_TOKEN) return process.env.SLACK_BOT_TOKEN.trim();
  const file = path.join(__dirname, '..', '.slack-token');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  return null;
}

async function main() {
  const applyIt = process.argv.includes('--apply');
  const channels = require('./slack-channels.json');
  const token = readToken();
  const invite = (process.env.SLACK_INVITE ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const existing = token ? await listExisting(token) : new Map();
  const items = plan(channels, existing);
  for (const c of items) console.log(`${c.action.padEnd(6)}  #${c.name}  —  ${c.purpose}`);
  console.log(`\n${items.filter((c) => c.action === 'create').length} to create, ${items.filter((c) => c.action === 'update').length} to update` +
    (token ? '' : '  (no token: assumed none exist yet)') +
    (invite.length ? `; inviting ${invite.join(', ')}` : '; inviting nobody (set SLACK_INVITE)'));

  if (!applyIt) {
    console.log('\nNothing changed. Run again with --apply to do it.');
    return;
  }
  if (!token) throw new Error('No token: set SLACK_BOT_TOKEN or create .slack-token');
  await apply(token, items, invite);
}

module.exports = { plan, pinnedText };

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
