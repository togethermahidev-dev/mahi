# Core workflow

Owner, 2026-10-09. This is the product's source of truth; RULES.md summarises it.

## The workflow (owner's words)

1. Welcome screen: "MAHI · The fitness accountability app" → Create an account / Log in. Collected: nothing.
2. Create account, step 1: invite link or code (optional), email, password. Collected: email, password, invite code.
3. Verify: the 6-digit code from the email. Collected: code.
4. Getting started: first name, last name, date of birth, contact number. Collected: all four, required.
5. Your profile: username, display name (optional), fitness goals → Create account. Collected: username, display name, goals. Account exists from here, and an invite code is claimed.
6. If the user joined from a tag link, their 48 hours start now after finishing setting up account, and their camera opens with the countdown after onboarding/ prompt.
7. Intro animation: the Mahi reveal. Collected: nothing.
8. Welcome cards: 1. Show up & tag mates · 2. Get tagged · 3. Pass it on. Collected: nothing.
9. Choose private or public account: "You can change this later in Settings." Collected: account privacy setting.
10. Turn on notifications:
    1. Show this screen: Don't miss your tag 🔔 / Turn on notifications so you know when a mate tags you. / [Turn on] / [Not now]
    2. "Turn on" → show the iOS popup.
    3. "Not now" → skip for now, and show this banner at the top of the feed: 🔕 You won't know when you're tagged and could miss the deadline. [Turn on]
    4. Banner "Turn on" → open the iPhone Settings page for Mahi.

    Collected: push permission. (Switch off by default → skipped today.)
11. Camera: "Post your first Mahi. Only your friends see your posts (private) or anyone can see your Mahi (public)." Collected: nothing.

    Note: wording changed by owner answer to "Only people you approve see your posts".
12. Two taps: your view, then your selfie (make sure the selfie doesn't invert like it does now) → preview with caption and optional location. Keep all the nudges and "Got it" notifications. Collected: 2 photos, caption, location.
13. First post and tag:
    1. They take the photo and tap Post.
    2. Show this screen: Hold up ✋ / Tag a friend to post your first Mahi. They'll get a link to show up as well.
    3. "Tag mates" → open the tag screen, with friends already on Mahi at the top.
    4. The first post tags 1 person. If that person is on Mahi, it's a normal tag. If not, they're invited by link.
    5. If they have no friends on Mahi, prompt them to find 1 friend in their contacts and invite by WhatsApp, Messages, Snap, or IG.
    6. Once they've picked their mate → the Mahi goes live, tags and invites are sent, and the feed unlocks.
    7. On the post, users can tap a tagged person's username or icon to go to their profile. If that person isn't on the app and was invited externally, show a grey circle with their initials and an "Invited ⏳" label.
    8. When the invited mate joins, the grey circle turns into their real profile picture, and the label changes to their username.
14. "Your first Mahi point" screen: "Your feed is now open! If you get tagged, you have 48 hours to reply with a Mahi of you exercising to get another point. Miss the 48 hours and your points go back to 0."
15. When someone joins from a link: notification "Joe joined Mahi from your tag 🎉". Their 48 hours start from when they download and sign up, not from when the link was sent.
16. Camera locked: "Waiting for your next tag," with the roadmap behind it and the feed underneath: "Scroll up to access feed."
17. Feed: open for 24 hours after a post for everyone. It locks only if you get tagged within those 24 hours. When a user is tagged: "You've been tagged. Post your Mahi to access your feed" → the user posts and tags friends internally or externally via link. After the 24 hours, the feed locks the next time you get tagged (e.g. 72 hours later).
18. A tag arrives: push "@joe tagged you. Post any workout by Thu 10:40pm." (Push not live yet.) → camera unlocks with the countdown.
19. Multiple tags: if several people tag you, one post answers all of them. The countdown shows the earliest deadline.
20. Answer: two taps → "Tag 3 friends" screen (friends / search anyone on Mahi / share a link via contacts, WhatsApp, Messages, Snap, IG) → Post = +1 Mahi point. Those 3 get 48 hours. When they respond with a post and tag 3 people, they get +1 Mahi point.
21. The post shows who you're replying to: "Replying to @joe, @sam."
22. If the people you tagged don't respond, nothing happens to you. You still keep your point for posting.
23. Points rules: Deleting a post removes the point you earned from it. Logging out or deleting the app doesn't reset points or deadlines. Deadlines still run, though, so a missed 48 hours still resets you to 0.
24. The rest: Profile, Messages, Notifications, Settings. "Invite a mate" link from Profile at any time.

## Owner answers (2026-10-09)

- The tag screen's Post button is the confirmation. There is no separate pop-up.
- "Invited ⏳" initials show to everyone who can see the post. The full name and phone number are
  never shown.
- Someone who joined from a tag link also tags 1 person on their first post.
- The private wording is "Only people you approve see your posts". The camera line in step 11
  uses it: "Post your first Mahi. Only people you approve see your posts." (private) or "Anyone
  can see your Mahi." (public).

## Where each step lives

"New" means it arrives in migration `20261009100000_first_post_tag_and_post_points`. "Already live"
means the server does it today. App files are in `ui/src/` unless they say `App.tsx`.

| Step | Server rule | App file(s) | Switch |
| --- | --- | --- | --- |
| 1 Welcome | None | `screens/WelcomeScreen.tsx` | None |
| 2 Create account | `send-otp`, `check-email`, `get_invite_preview` (already live) | `components/CreateAccountSheet.tsx` | None |
| 3 Verify | `verify-otp` (already live) | `components/CreateAccountSheet.tsx`, `components/OtpCodeInput.tsx` | None |
| 4 Getting started | Profile insert, sign-up columns only (already live) | `components/CreateAccountSheet.tsx` | None |
| 5 Your profile | `complete-signup`, `claim_invite` (already live) | `components/CreateAccountSheet.tsx` | None |
| 6 Joined from a tag link | `claim_invite` → `start_tag`: the 48 hours start at sign-up (already live) | `App.tsx`, `lib/openTagsBanner.ts` | None |
| 7 Intro animation | None | `screens/InAppAnimationScreen.tsx`, `App.tsx` (order) | None |
| 8 Welcome cards | None | `lib/welcomeCards.ts`, `components/WelcomeCards.tsx` | None |
| 9 Private or public | `set_account_controls` (already live) | `components/PrivacyChoiceStep.tsx` | `private-accounts` |
| 10 Notifications | None | `components/PushPrimer.tsx`, `lib/pushPrimer.ts`, `components/PushNudge.tsx`, `screens/FeedScreen.tsx` (banner) | `push-core` (off) |
| 11 Camera | `reactive_posting_open` (already live) | `lib/openTagsBanner.ts`, `screens/CameraScreen.tsx` | None |
| 12 Two taps | None | `screens/CameraScreen.tsx` (front camera mirror), `components/CapturePipGuide.tsx`, `components/CoachMark.tsx` | None |
| 13 First post and tag | `create_post` first post tags `first_post_tags` = 1 (new); `feed_item` `pending_invites` initials (new); `search_tag_people`, `invite_to_tag`, `make_invite_link`, `record_invite_sent`, `match_contacts` (already live) | `screens/CameraScreen.tsx`, `components/TagSlotsSheet.tsx`, `lib/tagRules.ts`, `lib/contactMatch.ts`, `components/PostCard.tsx`, `components/FeedRow.tsx`, `components/PostViewer.tsx` | `app_config.first_post_tags` (0 = old rule); `contacts-finder` |
| 14 First point | `create_post` first post earns 1 point (already live, `20261007180000_first_post_point`) | `lib/mahiPoints.ts`, `components/PointCelebration.tsx` | None |
| 15 Joined from your tag | `push_on_notification` tag-link wording (new); 48 hours from sign-up (already live) | `lib/notificationText.ts` | `push-core` for the push |
| 16 Camera locked | `reactive_posting_open` (already live) | `screens/CameraScreen.tsx` (`WaitingNotice`), `screens/CameraFeedPage.tsx` | None |
| 17 Feed | `viewer_unlocked_until` feed lock (already live) | `lib/feedLock.ts`, `components/FeedLockBanner.tsx` | None |
| 18 A tag arrives | `push_on_notification` tag push (already live) | `screens/CameraScreen.tsx`, `lib/openTagsBanner.ts` | `push-core` (off) |
| 19 Multiple tags | `create_post` answers every open tag (already live) | `lib/openTagsBanner.ts`, `lib/countdown.ts` | None |
| 20 Answer | `create_post` answers tag 3, `tag_count` (already live); `search_tag_people`, `invite_to_tag`, `make_invite_link` (already live) | `screens/CameraScreen.tsx`, `components/TagSlotsSheet.tsx`, `lib/tagRules.ts` | None (`tag-slots` leaves the code) |
| 21 Replying to | `feed_item` `answered_taggers` (new) | `components/PostCard.tsx` | None |
| 22 Mates don't answer | `mark_missed_tags` touches only the person who missed (already live) | None | None |
| 23 Points rules | `delete_post` takes back the point, `posts.earned_point` (new); `break_missed_streaks` (already live) | `components/PostCard.tsx`, `api/posts.ts`, `lib/mahiPoints.ts` | None |
| 24 The rest | `make_invite_link` (already live) | `screens/ProfileScreen.tsx`, `lib/inviteAMate.ts` | None |
