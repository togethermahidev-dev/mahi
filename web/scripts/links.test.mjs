// Invite and post links on togethermahi.com: the Apple file that lets them open the app, the
// Netlify rules that serve it and the fallback pages, and the pages' plain logic.
// Run: pnpm --filter ./web test   (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  appInviteLink,
  appPostLink,
  inviteFromPath,
  inviteHeadline,
  inviteLine,
  invitePreviewRequest,
  pageOpenedEvent,
  postIdFromPath,
  storeFor,
  webInviteLink,
} from '../app/_lib/links.ts';

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const TOKEN = '0123456789abcdef0123456789abcdef';

test('the Apple file lets invite and post links open the app', () => {
  const aasa = JSON.parse(read('../public/.well-known/apple-app-site-association'));
  const team = JSON.parse(read('../../ui/eas.json')).submit.production.ios.appleTeamId;
  const bundle = /bundleIdentifier:\s*'([^']+)'/.exec(read('../../ui/app.config.js'))[1];
  const appID = `${team}.${bundle}`;

  assert.deepEqual(aasa.applinks.apps, []);
  assert.equal(aasa.applinks.details.length, 1);
  const [detail] = aasa.applinks.details;
  // iOS 13 and later read appIDs + components; older iOS reads appID + paths.
  assert.deepEqual(detail.appIDs, [appID]);
  assert.equal(detail.appID, appID);
  assert.deepEqual(
    detail.components.map((c) => c['/']),
    ['/i/*', '/p/*']
  );
  assert.deepEqual(detail.paths, ['/i/*', '/p/*']);
});

test('Netlify serves the Apple file as JSON and the link pages for every token', () => {
  const toml = read('../../netlify.toml');
  assert.match(
    toml,
    /\[\[headers\]\]\s*for = "\/\.well-known\/apple-app-site-association"\s*\[headers\.values\]\s*Content-Type = "application\/json"/
  );
  assert.match(
    toml,
    /\[\[redirects\]\]\s*from = "\/i\/\*"\s*to = "\/i\/index\.html"\s*status = 200/
  );
  assert.match(
    toml,
    /\[\[redirects\]\]\s*from = "\/p\/\*"\s*to = "\/p\/index\.html"\s*status = 200/
  );
});

test('an invite link gives its token or code, like the app reads it', () => {
  assert.equal(inviteFromPath(`/i/${TOKEN}`), TOKEN);
  assert.equal(inviteFromPath(`/i/${TOKEN.toUpperCase()}/`), TOKEN);
  assert.equal(inviteFromPath('/i/ab3-d4f/'), 'AB3D4F');
  assert.equal(inviteFromPath('/i/'), null);
  assert.equal(inviteFromPath('/i/not-a-token'), null);
  assert.equal(inviteFromPath('/p/abc'), null);
});

test('a post link gives its post id', () => {
  assert.equal(
    postIdFromPath('/p/6f1c2d3e-0000-4000-8000-000000000001/'),
    '6f1c2d3e-0000-4000-8000-000000000001'
  );
  assert.equal(postIdFromPath('/p/'), null);
  assert.equal(postIdFromPath('/i/abc'), null);
});

test('links back into the app and to share', () => {
  assert.equal(appInviteLink(TOKEN), `mahi://i/${TOKEN}`);
  assert.equal(webInviteLink(TOKEN), `https://togethermahi.com/i/${TOKEN}`);
  assert.equal(appPostLink('a b'), 'mahi://p/a%20b');
});

test('who sent the invite, or a mate when that cannot be read', () => {
  assert.equal(
    inviteHeadline({ username: 'sam', display_name: 'Sam', open: true }),
    '@sam invited you to Mahi'
  );
  assert.equal(inviteHeadline(null), 'A mate invited you to Mahi');
});

// Usability walkthrough 2026-10-07: a link with a tag behind it says so, and the 48 hours.
test('a tag link says who tagged you and what to do; a mate link says you will follow each other', () => {
  const tagged = { username: 'sam', display_name: 'Sam', open: true, tag: true };
  assert.equal(inviteHeadline(tagged), '@sam tagged you on Mahi');
  assert.equal(
    inviteLine(tagged),
    'Join and you’ll have 48 hours to post any workout back. You’ll follow each other and keep each other going.'
  );
  const mate = { username: 'sam', display_name: 'Sam', open: true, tag: false };
  assert.equal(inviteHeadline(mate), '@sam invited you to Mahi');
  assert.equal(inviteLine(mate), 'When you join, you’ll automatically follow each other.');
  // An older server sends no tag: as before.
  assert.equal(
    inviteHeadline({ username: 'sam', display_name: null, open: true }),
    '@sam invited you to Mahi'
  );
  assert.equal(inviteLine(null), 'When you join, you’ll automatically follow each other.');
  // A used or ended link: no 48 hours to promise.
  assert.equal(inviteHeadline({ ...tagged, open: false }), '@sam invited you to Mahi');
});

test('the invite preview is a signed-out read of get_invite_preview', () => {
  const { url, init } = invitePreviewRequest(TOKEN);
  assert.equal(url, 'https://pzepodsppqtvptzmwxzs.supabase.co/rest/v1/rpc/get_invite_preview');
  assert.equal(init.method, 'POST');
  assert.equal(JSON.parse(init.body).p_token, TOKEN);
  assert.match(init.headers.apikey, /^sb_publishable_/);
  assert.equal(init.headers.Authorization, undefined);
});

test('the store button follows the phone', () => {
  assert.equal(storeFor('Mozilla/5.0 (Linux; Android 14)').name, 'Google Play');
  assert.equal(
    storeFor('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)').name,
    'the App Store'
  );
  assert.equal(storeFor('').name, 'the App Store');
});

test('an opened link page is counted in PostHog without a person or the token', () => {
  const { url, init } = pageOpenedEvent(
    'invite',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)',
    'id-1'
  );
  assert.equal(url, 'https://eu.i.posthog.com/i/v0/e/');
  assert.equal(init.method, 'POST');
  const body = JSON.parse(init.body);
  assert.equal(body.api_key.startsWith('phc_'), true);
  assert.equal(body.event, 'invite_page_opened');
  assert.equal(body.distinct_id, 'id-1');
  assert.deepEqual(body.properties, { platform: 'ios', $process_person_profile: false });
  assert.equal(init.body.includes(TOKEN), false);
  assert.equal(
    JSON.parse(pageOpenedEvent('post', 'Android', 'x').init.body).event,
    'post_page_opened'
  );
});
