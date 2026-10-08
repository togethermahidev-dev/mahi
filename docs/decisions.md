# Decisions — Tag Loop

What was chosen for the tag loop, what else was on the table, and where the plan uses it.
Source of the questions: the PRD "Mahi PRD — Tag 3 Friends". Build plan: [tag-loop-plan.md](./tag-loop-plan.md).

To change a decision: edit its row here and in the PRD, then update every plan section listed in
"Used in". Numeric values (hours, caps, quiet hours) live in the `app_config` table, so changing them
needs a migration, not an app release.

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Streak rule | Replaced by Mahi points (#47): each post that answers a tag earns 1 point; miss a tag's 48 hours and the points go back to 0; the best stays on show. No daily streak, rest days, training days, weekly calendar or streak calendar | Weekly streak (weeks in a row with ≥1 post) plus total visits · total visits only · daily streak with no rest days | Decided | 2026-10-01 | Phase 5 (replaced by the tag streak), `create_post`, `20261001120000_reactive_posting.sql` |
| 2 | Who can be tagged | Mutual follows, plus invites; since #120 also anyone who takes tags from everyone, and anyone else by a tag request unless they take tags only from friends | Anyone you follow, plus invites · anyone on Mahi, plus invites | Decided; widened by #120 | 2026-09-17 | Phase 2 `get_taggable_friends`, `create_post` |
| 3 | Who is in the feed | People you follow, within their workouts setting (#120: friends-only workouts leave one-way followers' feeds) | Mutual follows only · everyone, as today | Decided | 2026-09-17 | Phase 4 `can_view_post`, `get_feed` |
| 4 | How long a post unlocks the feed | 24 hours (`app_config.unlock_window`) | Until midnight · 48 hours | Decided | 2026-09-17 | Phase 4 `viewer_unlocked_until` |
| 5 | Who sees a missed tag | Tagger and tagged only | All their friends · nobody | Decided | 2026-09-17 | Phase 2 `mark_missed_tags`, notifications |
| 6 | Does the tagger earn a point | No — only the person who answers (#48) | Yes (2026-09-17) | Decided | 2026-10-02 | `20261002170000_mahi_points.sql` |
| 7 | Daily points cap | No cap (#48); `app_config.daily_point_cap` dropped | 3 a day (2026-09-17) · 1 per day | Decided | 2026-10-02 | `20261002170000_mahi_points.sql` |
| 8 | Fewer than 3 people to tag | Invite links fill the gap; fewer tags allowed until invite links ship | Allow fewer tags permanently | Decided | 2026-09-17 | Phase 2 `create_post` step 3, Phase 7 |
| 9 | New user's feed | Locked until their first post | Open for the first 24 hours | Decided | 2026-09-17 | Phase 4 `viewer_unlocked_until` (null = locked) |
| 10 | Existing users' streaks | Current streak restarts at 0; best streak kept | Carry the number over | Decided | 2026-10-01 | `20261001120000_reactive_posting.sql` |
| 11 | Quiet hours | 22:00–07:00 in each user's time zone (`app_config.quiet_start/quiet_end`) | None · each user picks | Decided | 2026-09-17 | Phase 1 `enqueue_push` |
| 12 | Success targets | Not chosen | Starter targets: 70% of posts answer a tag · 50% of tags answered in 48 h · 30% of invites join · 60% of users post weekly | Parked — decide before the Phase 8 beta | — | Phase 8 |
| 13 | Where database changes are built | Directly on production (`pzepodsppqtvptzmwxzs`, free plan, no preview branches) | A second free Supabase project as a test copy | Decided | 2026-09-17 | Phase 0 safeguards, every "apply" step |

## Native-feel update (2026-09-30 → 2026-10-01)

The founder's answers during the native-feel work (OTA 10.14 onwards). Flags are in
[feature-flags.md](./feature-flags.md); build them exactly as written.

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 14 | Comment sheet | Native full-height page sheet | The old 60% bottom sheet | Decided | 2026-10-01 | `FeedScreen` comments |
| 15 | Denying a message request | Asks "are you sure?" first | Deny at once | Decided | 2026-10-01 | `MessageRequestsScreen`, `ConversationScreen` |
| 16 | Apple SF Symbols icons | Wait for the next native build (needs `expo-symbols`) | Ship in an OTA | Decided | 2026-10-01 | Next native build |
| 17 | Swipe navigation | Rebuilt on gesture-handler + reanimated now; keep debugging rather than revert | Keep `PanResponder` | Decided | 2026-10-01 | `HorizontalNavigator`, `ui/src/lib/swipeRules.ts` (the up/down navigator went with #60) |
| 18 | Profile layout | "Suggested for you" folds away, closed by default; grid shows ≥9 squares (≥6 fallback) | Suggestions always open | Decided | 2026-10-01 | `ProfileScreen` |
| 19 | Welcome cards | 3 cards, once per account per device, existing users too; native paging carousel in a Modal | No onboarding | Decided | 2026-10-01 | `WelcomeCards`, flag `onboarding-welcome-cards` |
| 20 | Locked feed | Names the friend who tagged you; open feed shows hours left | Plain locked cards | Decided | 2026-10-01 | `FeedLockBanner`, flag `feed-lock-explainer` |
| 21 | Camera capture | Keep the second tap; the small window says what's second ("Selfie next"), then shows photo 1 while the screen switches | Auto timer for photo 2 | Decided | 2026-10-01 | `CapturePipGuide`, flag `camera-pip-guide` |
| 22 | Nav rail | Keep 4 icons; floating pill outline; morphing selector; hold-and-drag switches screens live | — | Decided | 2026-10-01 | `NavRail`, flag `nav-rail-morph` |
| 23 | First post with no friends | A clear "Invite 3 friends" step on the tag sheet | Lower the tag minimum | Decided | 2026-10-01 | `InviteStep`, `InviteShareSheet`, flag `tags-invite-step` |
| 24 | Sign-up fields | Date of birth and phone number stay required | Make them optional | Decided | 2026-10-01 | `CreateAccountSheet` |
| 25 | Account basics | Password reset by emailed code; in-app Delete account (App Store requirement) | — | Decided | 2026-10-01 | flags `auth-password-reset`, `account-delete` |
| 26 | Label style | Every ALL-CAPS label to sentence case; MAHI wordmark excepted | Keep caps | Decided | 2026-10-01 | All screens, pop-ups and menus; `ui/src/constants/tokens.ts`; enforced by `sentenceCase.test.ts` (2026-10-05) |
| 27 | Does a skipped rest day protect the streak | No rest days at all: the streak counts answered tags, not days (#1) | — | Decided | 2026-10-01 | `record_upload_streak` rest-day rule retired, Phase 5 |

## Reactive posting (2026-10-01)

Testing showed that posting a workout every day felt like self-promotion, while answering a friend's
tag worked. **Reactive posting**: you post only when a friend has tagged you and the tag is still
open (48 hours) — your very first post is the one exception. Architecture:
[architecture.md](./architecture.md#reactive-posting).

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 28 | When you can post | Reactive posting: only to answer an open tag, plus your first post; no daily limit — one post per tag answered | One post a day | Decided | 2026-10-01 | `create_post` → `reactive_posting_open`, `ui/src/lib/reactivePosting.ts` |
| 29 | Feed lock | Every post opens the feed for 24 hours. Tagged within them → it locks when they end; not tagged → it stays open until you're tagged, then locks. Miss a tag → locked until a friend tags you again | Open until tagged (2026-09-28 rule) | Decided | 2026-10-01 | `get_feed`, `ui/src/lib/feedLock.ts`, `FeedLockBanner` |
| 30 | Missing a tag | Mahi points back to 0 (#47); the person who missed gets a `streak_lost` notice ("You missed @x's tag. Your points are back to 0.") from the tagger | Silent reset | Decided | 2026-10-02 (wording) | `mark_missed_tags`, `NotificationsScreen` |
| 31 | Seeing the welcome cards again | Settings → Help reopens the three cards | Shown once only | Decided | 2026-10-02 | `SettingsPanel`, `WelcomeCardsModal`, flag `onboarding-welcome-cards` |
| 32 | Settings rows with nothing behind them | Removed (Edit profile, Update bio & link, Safety & privacy, Privacy & data); a row comes back when it's built | Keep as placeholders | Decided | 2026-10-02 | `SettingsPanel` |

## Video posts (2026-10-02)

The owner answered the open question "should posts ever include video?" — yes. Built behind the
default-off flag `video-posts`; architecture: [architecture.md](./architecture.md#video-posts).

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 33 | Video in posts | Each of the two shots (your view = back, selfie = front) can be a photo or a video, whichever the user wants | Photos only · one video per post | Decided | 2026-10-02 | `posts.rear_media_type` / `front_media_type`, `create_post`, `CameraScreen` |
| 34 | How to record | Both: a Photo / Video switch by the shutter, and press and hold the shutter to record (a tap is a photo, as today). Letting go, or 15 seconds, stops | Switch only · hold only | Decided | 2026-10-02 | `ui/src/lib/videoPosts.ts` (`shutterIntent`), `CameraScreen` |
| 35 | Longest video | 15 seconds per video | 10 s · 30 s | Decided | 2026-10-02 | `MAX_VIDEO_SECONDS`, `recordAsync({ maxDuration })` |
| 36 | Playback | Videos start muted, loop while on screen and pause off screen — in the feed, the small window and the post viewer — with a mute / unmute button | Autoplay with sound · tap to play | Decided | 2026-10-02 | `PostVideo`, `SoundButton`, `FeedScreen`, `PostViewer`, `DraggablePip` |
| 37 | Rollout | Everything behind one flag, `video-posts`, OFF for everyone. Off = today's photo-only app, and the microphone is never asked for; on = the microphone is asked for only when someone first records | On for testers first | Decided | 2026-10-02 | `ui/src/lib/featureFlags.ts` (`DEFAULT_OFF_FLAGS`), `useVideoPosts` |
| 38 | Microphone permission | Keep it in the app; the text becomes "Mahi uses the microphone to record sound in your workout videos." (needs the next native build anyway) | Remove it (the 2026-10-01 plan while posts were photo-only) | Decided | 2026-10-02 | `app.config.js` |

A video post answers tags exactly like a photo post: reactive posting, Mahi points, tags, invites and
the feed lock are unchanged (a locked viewer gets no video links).

## Profile pages and viewers (2026-10-02)

Owner's rule for this round: replace the old with the new, never keep both side by side. None of
these needs a new native module, so they ship as plain updates without a flag.

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 39 | Profile scrolling | The whole profile scrolls as one page: the header scrolls away and the grid fills the screen (own and other people's) | Fixed header, grid scrolls below it | Decided | 2026-10-02 | `ProfileMediaMap`, `ProfileScreen`, `UserProfileScreen` |
| 40 | Opening a post from a profile | Full screen from the tapped post; up/down browses all of that profile's posts, one per screen as in the feed; a swipe left or right closes (like Instagram / TikTok) | One post at a time | Decided | 2026-10-02 | `PostViewer`, `PostCard`, `ui/src/lib/viewer.ts` |
| 41 | Profile pictures | Tap any profile's picture: a circle in the middle of a dark screen (2026-10-05, founder: a big square was too invasive), pinch to zoom; tap the dark space, drag it away, or × to close. Your own keeps its "+" to change it | Fixed-size enlarge, tap to close | Decided | 2026-10-02 | `AvatarViewer`, `AvatarPicker` |

## Feed polish and comment likes (2026-10-02)

Same rule: replace the old with the new. Items 42–45 change existing screens, so they ship without a
flag; comment likes (46) is a new feature behind `comment-likes`.

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 42 | Like and comment buttons | Higher up the right-hand side, where TikTok and Reels put them, on a full-width dark shade (the old shade stopped short of the buttons) | Low on the right | Decided | 2026-10-02 | `PostCard`, `POST_CARD` tokens |
| 43 | Glass bar side | The left edge. "On every screen" was replaced by #51: the rail is on the Camera only (Feed, Profile and Messages have the dock along the bottom); it hides over profiles and search opened there | Stay on the right | Decided | 2026-10-02 | `NavRail`, `useRailRoom`, `useCoverRail` |
| 44 | Hold to view | Press and hold a post (feed and post viewer): a light tap, then the name, caption, tags, points and buttons fade away until the finger lifts. The small photo stays and stays draggable | — | Decided | 2026-10-02 | `PostCard`, `chromeStore`, `useChromeFade` |
| 45 | Feed icon | Replaced by #51: the glass bar is not on the Feed, so its Feed icon's bounce is gone | — | Decided | 2026-10-02 | — |
| 46 | Comment likes | A heart and count on every comment; tap the count for who liked it (names, pictures, tap for their profile), included now | Hearts only, list later | Decided | 2026-10-02 | `CommentSheet`, `CommentLikersSheet`, migration `20261002130000_comment_likes`, flag `comment-likes` |
| 51 | Where the glass bar shows | The Camera keeps the rail on its left edge. Feed, Profile and Messages get the same glass bar lying along the bottom, centred (the dock), so every page has a tap to every other (owner, 2026-10-06: "yes" to visible buttons). Both use the swipe order (Camera, Feed, Profile, Messages); both hide under pop-ups, full-screen views and an open chat; the dock fades while a post is held. The last post, profile row and inbox row keep room above the dock. Only on builds without the phone's own tab bar | On the Camera only, other pages reached by swiping (2026-10-02) · on every screen on the left edge (#43) | Decided (re-decided 2026-10-06) | 2026-10-06 | `railShows` / `dockShows` in `ui/src/lib/railSelector.ts`, `NavRail` (`dock`), `HorizontalNavigator` |

## Mahi points (2026-10-02)

The founder, word for word: "You post. Tag 3 people. They have a 48 hour deadline to post as well. If
they meet the deadline = 1 Mahi point. This builds up over time. If you get tagged and don't meet the
48hr deadline, you lose your points and start again. It would then say e.g. Best = 48 points. This is
not streaks. Streaks are a daily thing." Architecture: [architecture.md](./architecture.md#reactive-posting).

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 47 | What people count | Mahi points: +1 for each post that answers at least one open tag (not per tag); a missed tag's 48 hours puts them back to 0; Best is never lowered and always shown. The counter the app called the streak, renamed everywhere people see it | Keep calling it a streak | Decided | 2026-10-02 | `create_post`, `break_missed_streaks`, `ui/src/lib/mahiPoints.ts`, profiles, posts, camera, tag list, search, notices, welcome card, waitlist site |
| 48 | The old points | Retired: no point for the tagger, no 3-a-day cap, no never-resetting total (`point_events`, `award_point`, `daily_point_cap`, `stats.points_daily` dropped) | Keep both numbers | Decided | 2026-10-02 | `20261002170000_mahi_points.sql` |
| 49 | Daily streak | None for now | A daily streak beside the points | Decided | 2026-10-02 | — |
| 50 | Points switch | Points always show; the `mahi-points` flag is removed (deleted from PostHog 2026-10-02, after OTA 10.26) | Keep the switch | Decided | 2026-10-02 | `ui/src/lib/featureFlags.ts` |

## Push notifications (2026-10-02)

The founder, with a BeReal screenshot as the model: a full-screen page that makes sure people allow
notifications, and pushes such as "You've just been tagged by __. 47:59 hours left to post your
Mahi!" — "so people feel the timer going down in the back of their mind… notifs for the tag, you've
been tagged, how long left on the feed, all that stuff." Architecture:
[architecture.md](./architecture.md#push-notifications); switching it on:
[go-live-runbook.md](./go-live-runbook.md#switching-push-notifications-on).

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 52 | Asking for notifications | A full-screen page, once per device, after the welcome cards and the phone's camera question: "When do you post on Mahi?", one line of why, a card "Please turn on notifications" ending "Never between 10pm and 7am." (#11), and one button, **Continue**, which always brings up the phone's own question. No "Not now" (owner, 2026-10-06, following Apple's guidance: one button, no way to cancel; a 2025 rejection of a "Not Now" pre-prompt). The phone's "Don't Allow" is the way out; the camera's line (#53) catches people who say no. Same timing. Replaces the pop-up | Allow / Not now (2026-10-02) · a plain pop-up (2026-09-17) | Decided (re-decided 2026-10-06) | 2026-10-06 | `PushPrimer`, `ui/src/lib/pushPrimer.ts`, flag `push-core` |
| 53 | After "Don't allow" | While they hold an open tag, one dismissible line under the camera's open-tags pill: "Turn on notifications so you never miss a tag". It opens Mahi in the phone's Settings; if the phone was never asked, it asks (Settings has no notifications row until then). Dismissed until the next tag | Show the full page again · nothing | Decided | 2026-10-02 | `PushNudge`, `pushNudge()` |
| 54 | The tag push | "@sam tagged you. Post any workout by Thu 10:40pm." The deadline is a day and time worked out when the push is sent (so a push held for quiet hours never carries a stale "48 hours") | "You've just been tagged by @sam. 48 hours left…" (2026-10-02 wording) | Built — on `updates`, waiting for the owner to apply `20261006120000_push_deadline_wording` | 2026-10-06 | `push_on_notification` |
| 55 | The reminders | 24 hours before: "Answer @sam's tag by 10:40pm tomorrow." 2 hours before: "Last call: answer @sam's tag by 10:40pm tonight." A deadline that falls in quiet hours gets its last call 15 minutes before quiet hours start | "24 hours left to post your Mahi! @sam is waiting." | Built — waiting for the owner to apply | 2026-10-06 | `queue_tag_pushes`, `20261006120000_push_deadline_wording` |
| 56 | Feed pushes | Two, each with its own server switch, both on: "Your feed locks in 1 hour. Post your answer to @sam to keep it open." one hour before the 24 hours end (the hour is a setting), and "Your feed is locked. Post your answer to @sam to open it." when it locks. Only for someone whose feed is open and who holds an open tag made since their last post — so the feed really will lock. A tag that locks the feed at once gets no second push. Posting takes them back | No feed pushes · one push only | Built — kept as is (2026-10-06); the founder may still change the two texts | 2026-10-06 | `schedule_feed_lock_pushes`, `app_config.feed_lock_warning_push` / `feed_lock_warning_lead` / `feed_locked_push` |
| 57 | The other pushes | Sentence case, times in words: "@sam answered your tag in 3 hours", "@sam missed your tag. A quick message could get them back to it." (a next step for the tagger), "You missed @sam's tag. Your points are back to 0.", likes, comments, follows, invites and messages as before | "@sam missed your tag" alone | Built — waiting for the owner to apply `20261006120000_push_deadline_wording` | 2026-10-06 | `push_on_notification`, `ui/src/lib/notificationText.ts` |
| 58 | A push that is late | Closed, not sent, once it is more than an hour overdue (a setting): what it says about time would be untrue. Also means switching push on never sends the old queue. Quiet hours are not "late": those pushes wait for 07:00, except a feed warning, which is dropped | Send whenever | Built | 2026-10-02 | `claim_push_batch`, `app_config.push_stale_after` |
| 59 | A live countdown on the lock screen | Researched, not built. Needs a native build (it could join build 11) and its own sending path to Apple; an iPhone only keeps one alive for 8 hours, so it would cover the last hours of a tag, not all 48 | — | Parked — the founder to say if it is wanted | — | — |

## Navigation: swipe pages and the tab bar (2026-10-05)

The founder's answers after trying the phone's own tab bar on build 12 (OTA 12.01 had brought the
old swipe pages back under it).

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 60 | Swipe pages | One row, left to right, in the tab bar's order: Camera ⇄ Feed ⇄ Profile ⇄ Messages. From the Feed, swipe right → Camera, swipe left → Profile; from Profile, swipe right → Feed, swipe left → Messages. Sideways only: no up/down page swiping (Camera ↕ Feed and the Camera's pull-down for search are gone) | Profile ← Camera/Feed → Messages with Camera ↕ Feed (until OTA 12.01) · Camera, Feed, Profile with Messages off the row (OTA 12.02, same day: swiping stopped at Profile) · Messages, Camera, Feed, Profile | Decided | 2026-10-05 | `HorizontalNavigator`, `SWIPE_PAGES` in `ui/src/lib/nativeTabs.ts` |
| 61 | Messages | The last swipe page, after Profile; also its tab, the glass rail and the header button. Its back button goes to Profile | Off the row, opening over the pages (OTA 12.02) | Decided | 2026-10-05 | `HorizontalNavigator`, `MessagesScreen` |
| 62 | Tab bar order | The swipe order, Messages last: Camera, Feed, Profile, Messages | Camera, Feed, Messages, Profile (2026-10-03) | Decided | 2026-10-05 | `NATIVE_TABS` |
| 63 | Tab bar and swipes together | The phone's own tab bar (build 12+) with the swipe pages above it: tap a tab and the pages move, swipe and the tab follows. The bar hides only under the post preview | Tab bar only, no swipes (2026-10-03) | Decided | 2026-10-05 | `TabsNavigator` |
| 64 | A way into search | A magnifier on your Profile screen, top right beside the light/dark toggle (founder, 2026-10-05: people couldn't reach search once the feed had posts). Also: the magnifier in Messages, and "Find friends" on an empty feed. The Camera's pull-down went with up/down swiping | A search button in the header | Decided | 2026-10-05 | `ProfileScreen` (`onSearch`), `HorizontalNavigator`, `GlobalSearchOverlay` |

### Navigation and capture clarity re-decision (2026-10-06)

These rows replace the presentation choices in #60–#62 where they conflict. Posting, tagging,
points and feed-lock rules are unchanged.

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 95 | Primary navigation order | Messages, Feed, Camera, Profile from left to right (owner, 2026-10-07: Profile and Messages swapped), for the native tab bar, swipe strip, glass rail and screen-reader page actions. Camera stays the landing page. Messages' back button returns to Camera | Profile, Feed, Camera, Messages (2026-10-06) · Camera, Feed, Profile, Messages (#60–#62) | Decided by owner | 2026-10-07 | `NATIVE_TABS`, `INITIAL_TAB`, `HorizontalNavigator`, `TabsNavigator`, `NavRail` |
| 96 | Feed and Camera clarity | The Feed owns the full area under its overlaid header (no second automatic iOS inset); every running clock reads "Feed will lock in"; Camera says which of the two photos is next, shows a named tag-loading state, hides capture controls when posting is unavailable, and explains camera permission in one card. Shared tokens only; no rule changes | Implicit two-photo sequence; spinner in the shutter; capture controls visible behind a blocking card | Decided by owner | 2026-10-06 | `FeedScreen`, `FeedLockBanner`, `feedLock.ts`, `CameraScreen`, `captureGuide.ts` |
| 97 | Message requests (PingMee-v2 flow) | Opening a chat makes nothing; the first message from a non-friend is a request, friends go straight to the inbox; the receiver accepts, declines quietly or blocks; the sender waits. All through server functions that check blocks, bans and removed messages | A chat row made on open · anyone can message anyone | Built, live (`20261006190000_message_requests`, OTA 12.12) | 2026-10-06 | `start_conversation`, `accept_message_request`, `decline_message_request`, `conversationStore` |
| 98 | Editing and unsending messages | Edit your own message for 15 minutes; unsend any time (gone for both, its words not kept) | No edit · edit any time | Built, live (OTA 12.12) | 2026-10-06 | `edit_message`, `unsend_message` |
| 99 | Post captions edit for 1 hour; owners may delete | The owner can change the caption for one hour and may delete the post later. Deleting never restores the free first post because `profiles.has_posted_before` is permanent. Edited captions are checked again by moderation | Permanent posts | Built, live (`20261006180000_post_caption_edits`, `20261006200000_maximus_answers`, OTA 12.16) | 2026-10-06 | `update_post_caption`, `delete_post`, `postPolicy.ts`, `PostCard` |
| 100 | Crew strip | Removed (owner, 2026-10-07): it floated over the top of the feed, on other people's posts, and added nothing the lock card and tags don't already say | Up to three friends you're tied to, for everyone (OTA 12.12) | Removed | 2026-10-07 | — |
| 101 | No "Mahi" in screen titles | The small "Mahi" label above each screen title is gone | Keep the label | Built (OTA 12.12) | 2026-10-06 | screen headers |
| 102 | Invites and tag requests create mutual follows | Accepting an in-app tag request or claiming an invite link automatically makes both people follow each other; declining creates no follows. Say this before the request/link is accepted or joined and confirm it afterward in the request, notification and slot/link states | Make it optional · leave the consequence implicit | Built, DB live (`20261007105647_explicit_mutual_follow_wording`), OTA 12.21; superseded by #121 (tag requests) and #122 (general invites from private accounts) once `20261008170000` is live | 2026-10-07 | `TagSlotsSheet`, `InviteShareSheet`, `NotificationsScreen`, `notificationText.ts`, `inviteLink.ts`, `welcomeCards.ts`, `push_on_notification` |
| 103 | What the feed shows | The people you follow, newest first; of your own posts only your latest, in its place by time. Older posts stay on your Profile | Every one of your posts mixed into the feed | Decided by owner | 2026-10-07 | `latestOwnPostOnly` (`ui/src/lib/feedPosts.ts`), `useFeed` |
| 104 | Two first-post paths | Tagged by a mate: "You were tagged by @sam. You have 47:59:59 to post your Mahi and get your first point." Came alone: "Post your first Mahi to get your first point and tag 3 mates." (Maximus) | One message for everyone | Built (OTA 12.28); superseded by #117 where they conflict | 2026-10-07 | `openTagsBanner.ts`, `joined_via` on `signup_completed` |
| 105 | First post earns a point | Every first post earns 1 Mahi point, free or answering a tag; never 2 | First post earns nothing | Built, DB live (`20261007180000_first_post_point`), OTA 12.28 | 2026-10-07 | `create_post` |
| 106 | Ticking clocks | Every tag countdown ticks in hours, minutes and seconds (47:59:59) | "41 hours left" | Built (OTA 12.28) | 2026-10-07 | `openTagsBanner.ts`, `feedLock.ts` |
| 107 | Points feel earned | A post that earns a point shows a full-screen +1 with the total and what it means | A toast | Built (OTA 12.28) | 2026-10-07 | `PointCelebration`, `pointCelebration` |
| 108 | No switch for onboarding | The guided first-post work replaces what was there, without a PostHog switch | Behind a switch | Decided by owner | 2026-10-07 | — |
| 109 | First answer needs no tags | A first post that answers a mate's tag can go with 0 tags; tagging 3 mates is encouraged | 3 tags required | Superseded by #117 | 2026-10-07 | `create_post` |
| 110 | Invites any time | Someone who has posted can send invite links without a post, from the waiting card ("Invite a mate") | Only while posting | Decided, building | 2026-10-07 | `make_invite_link` |
| 111 | Invite links open the app | togethermahi.com/i/… opens Mahi when installed (Universal Links), with a fallback page | Code only | Decided, building (needs a web deploy) | 2026-10-07 | `web/` |
| 112 | Tagging back | An answer can tag back the mate it answers; only your own open tag on someone blocks tagging them again (Maximus, option A) | No tag-back · first post tags the inviter · both | Built, DB live (`20261007240000_tag_back`), OTA 12.33 | 2026-10-07 | `taggable_friends`, `tagRules.ts` |
| 113 | Widget may keep the soonest tag | The home-screen widget keeps the soonest open tag and its deadline on the phone (it can't ask the server); never shows an expired one, clears on sign-out, corrected each time Mahi opens. The one exception to "no expiring data on the phone" | Widget shows points only | Decided by owner | 2026-10-07 | `liveTagWidgets.tsx`, `useLiveTag.ts` |
| 114 | Live Activity and widget without a switch | On for everyone on build 13+ (the build decides) | Behind `live-tag` | Decided by owner; superseded 2026-10-08: held back behind default-off `live-activity` | 2026-10-07 | `useLiveTag.ts` |
| 115 | Pull down on the camera | When you can't post, the camera is the front layer: a down arrow sits centred around its upper third, and pulling it down uncovers the accountability card built behind it. It settles open so the actions can be used; pull up or tap the up arrow to close. Reduce Motion crossfades the layers. Replaces the vertical-gesture part of #60–64 for this one case | Fixed card on top · sideways only | Decided by owner; clarified 2026-10-08 | 2026-10-07 | `CameraScreen`, `CameraPull` |
| 116 | Point moment | The +1 springs up then flies into the points counter, which rolls up; a small card says who kept you going. Replaces the full-screen pop-up | Full-screen pop-up | Decided by owner | 2026-10-07 | `PointCelebration` |
| 117 | Show-up accountability model | Mahi is not a social-media feed. Everyone starts with one first workout post that needs no incoming or outgoing tag. After that, a post exists only as the answer to a live tag; the answer is the post. Later answers ask “Who are you holding accountable?” and require 3 friends, so accountability passes on. Profiles, follows and conversation support that loop. This supersedes #86 and #104 where their wording conflicts | First post must tag 3 · social posting with tags attached | Decided by owner | 2026-10-08 | `RULES.md`, `reactivePostingGate`, `postTagsRequired`, `create_post`, welcome and camera copy |
| 118 | Tagger's photo on the lock screen | The Live Activity and widget show the tagger's profile photo next to "@sam is waiting on you" | Username only | Decided by owner | 2026-10-07 | `liveTagWidgets.tsx` |

## Public and private accounts, Controls (2026-10-08)

The owner's answers (three rounds, 2026-10-08; plan `.claude/plan-private-accounts.md`, local). Server:
`20261008170000_private_accounts` (not pushed yet). App: behind the `private-accounts` switch, default off.

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 119 | Public and private accounts | Instagram's way. Public: anyone signed in sees your profile and workouts (no padlocks for non-followers) and can follow you. Private: a follow is a request you confirm or delete (they're told only if you confirm); only approved followers see your workouts; name, photo, username and counts still show. Going private keeps followers; going public accepts every waiting request. New people choose on onboarding (nothing forced); existing accounts stay public and never see that screen. Existing and new accounts start with workouts for followers only until they choose (owner, D1, 2026-10-08: the push opens nobody up); picking Public with everyone opens them. The feed lock still applies on top | Friends-only workouts for everyone · new accounts private by default | Decided by owner; server built (`20261008170000`), not pushed | 2026-10-08 | `profiles.is_private`, `follow_requests`, `set_following`, `respond_follow_request`, `set_account_controls`, `can_view_post` |
| 120 | Controls | Settings → Controls: Account (Public / Private, with a description), Who can see your workouts (Everyone / Followers / Friends; Everyone not allowed while private), Who can tag you (Everyone / Everyone, I approve first / Friends only), Followers (remove, with confirm), Follow requests. All enforced on the server; existing accounts keep today's behaviour (workouts to followers, approve first) | Account switch only | Decided by owner; live 2026-10-08 (`20261008170000`) | 2026-10-08 | `posts_visibility`, `tag_permission`, `can_view_post`, `get_user_posts` (`restricted`), `create_post`, `invite_to_tag`, `search_tag_people` / `match_contacts` (`tag_mode`) |
| 121 | Accepting a tag request | Accepting starts the tag but no longer makes both people follow each other. A native popup then offers "Follow back" and, if their follow request is waiting, "Accept their follow" (both optional). Replaces #102 for tag requests | Auto mutual follow (#102) | Decided by owner; live 2026-10-08 (`20261008170000`) | 2026-10-08 | `respond_tag_invite` (`you_follow_them`, `they_follow_you`, `their_follow_request`), `push_on_notification` |
| 122 | Invite links and private accounts | A tag invite on a post makes you follow each other straight away (as #102). A general invite ("invite a mate") from a private account: the inviter follows you, and your follow is a request they approve. Said clearly where it happens | Every invite = mutual follow · every invite to a private account = request | Decided by owner; live 2026-10-08 (`20261008170000`) | 2026-10-08 | `claim_invite` (`follow_status`), `get_invite_preview` (`follow_request`), `notifications.follow_request` |
| 123 | Removing a follower | Anyone can remove a follower; they aren't told. Removing a Friend also ends the open tags between you, after a confirm sheet that says so | Private accounts only · tags stay | Decided by owner; live 2026-10-08 (`20261008170000`) | 2026-10-08 | `remove_follower` |
| 124 | Follower and following lists | A private (or followers/friends-only) account's lists are closed to people its workouts setting keeps out; counts still show. A follow row shows to someone outside it only when both people's lists are open to them, so a public account's list never reveals who follows a private account (stricter than Instagram, where a public account's following list shows private accounts) | Show a row when either side's list is open (Instagram) | Decided by the owner, 2026-10-08 | 2026-10-08 | `follows_select`, `can_see_follow_lists`, `get_friends` |
| 125 | Tagged people see the post they're tagged in | Someone tagged on a post (its tag bubble, or a started tag on it) can always open THAT post, its photo, comments and likes, and like and comment, even when the poster is private or followers/friends-only and they don't follow. Per post: the poster's other posts stay closed. A block or ban still wins, and the feed lock still padlocks it as it does every post | Only followers see it | Decided by the owner; live 2026-10-08 (`20261008170000`) | 2026-10-08 | `can_view_post_for`, `tag_shows_post`, `can_view_post_id`, `can_view_post_object`, `posts_select`, `get_user_posts` |
| 126 | The tagger sees the answer | The person who tagged you can always open the post that answers their tag (`tag_challenges.answered_post_id`), its photo, comments and likes, and like and comment, even when you're private or followers/friends-only. Per post: your other posts stay closed. A block or ban still wins, and the feed lock still padlocks it | Only your followers see it | Decided by the owner; live 2026-10-08 (`20261008170000`) | 2026-10-08 | `tag_shows_post`, `can_view_post_for` |
| 127 | Google and Apple sign-in | Both buttons stay in the app behind their switches (`auth-google-signin`, `auth-apple-signin`), both off in PostHog until the owner sets them up | Remove the Google pill | Decided by owner | 2026-10-08 | `featureFlags.ts`, PostHog |
| 128 | Camera pill wording | "+ Hold friends accountable" (matches "Who are you holding accountable?") | "+ Challenge friends" | Decided by owner | 2026-10-08 | `CameraScreen` |
| 129 | Missed-tag text | "Tag them in your next post to get them going again." in the push and in the app | "A quick message could get them back to it." | Decided by owner; push live 2026-10-08 | 2026-10-08 | `push_on_notification`, `notificationText.ts` |
| 130 | Dormant identity checks and payments | Keep the Didit and RevenueCat code switched off for later | Delete it | Decided by owner | 2026-10-08 | `useIdentityVerification`, `usePurchases` |
| 131 | Sign-up privacy choice | Every new person picks Public or Private before going on; nothing is pre-picked; tags default to "Everyone, I approve first"; you can change it any time in Settings → Controls | Pre-pick Public · skip button | Decided by owner | 2026-10-08 | `PrivacyChoiceStep`, `set_account_controls` |
| 132 | Clearing the old push queue | The stale-push clean-up runs right before push notifications go live (build 13 step 7), not earlier, so nothing queued in between is sent at go-live | Push it with the private-accounts change | Decided by Claude on the owner's standing rule | 2026-10-08 | branch `push-queue-clear` |
| 133 | "Joined from your invite" wording | The notice keeps "…and wants to follow you." after the request is answered; it records the moment it was sent | Rewrite the row when the request is answered | Decided by Claude on the owner's standing rule | 2026-10-08 | `notifications.follow_request` |
| 134 | Other people's lists | On someone else's follower, following or friends list you see only people whose lists are open to you (people you follow, or who chose workouts for everyone); your own lists always show everyone. Follows from #120 + #124 | Show everyone on every list | Decided by Claude on the owner's standing rule | 2026-10-08 | `follows_select`, `can_see_follow_lists` |
| 135 | Small review fixes | Suggestions skip banned people and count mutual friends only from lists you may see; the requests list re-reads at most every 1.5 s | Leave as reviewed | Decided by Claude on the owner's standing rule | 2026-10-08 | `get_suggested_follows`, `followRequestStore` |
| 136 | Invite code guessing limit | 20 wrong codes an hour per account or address, 1000 shared when no address comes through (so one guesser can't lock everyone out); link tokens never limited; `claim_invite` answers nothing for an unknown code so the miss counts | No limit · 20 for everyone signed out | Decided by Claude on the owner's standing rule; live 2026-10-08 | 2026-10-08 | `invite_code_limit`, `get_invite_preview`, `claim_invite` |
| 137 | Like and follow notices | One like notice and one follow notice per person per day (likes on two of your posts by the same person in a day give one notice) | A notice per like / per follow | Decided by Claude on the owner's standing rule; live 2026-10-08 | 2026-10-08 | `notify_on_like`, `notify_on_follow` |
| 138 | Reporting a post you can't see | Refused with the same answer as an unknown post (so it never confirms the post exists); that includes posts behind your own feed lock | Allow reports on anything with an id | Decided by Claude on the owner's standing rule; live 2026-10-08 | 2026-10-08 | `file_report` |
| 139 | Deleting the app signs you out | A fresh install wipes a session the iPhone keychain kept from a deleted app | Stay signed in after a reinstall | Decided by Claude on the owner's standing rule | 2026-10-08 | `sessionStorage.ts` |
| 140 | Post photos kept on the phone | Each post photo or video is saved on the phone by its file name and downloaded once; it is only shown when the server has just given a link for it, its copy goes when the post is deleted, and signing out removes them all. Profile photos are brought down to 1080 px before upload. Why: every app open re-downloaded every photo (25 GB sent for 36 MB stored, over Supabase's free 5 GB) | Download on every open | Decided by owner (2026-10-08: "yes"); second exception to "no withdrawable data on the phone" after #113 | 2026-10-08 | `savedMedia.ts`, `AvatarPicker.tsx` |
| 141 | Line under your name on your profile | "Only you are accountable for showing up." | "Your workout story, in one place." | Owner asked for accountability wording (2026-10-08); exact words decided by Claude on the owner's standing rule | 2026-10-08 | `ProfileScreen.tsx` |
| 142 | Settings sheet layout and light / dark icon | Cards stack under their titles with a fixed 24 pt gap (they no longer spread to fill the sheet); the light / dark switch is a line sun or moon like the other icons (Apple's `sun.max` / `moon` where SF Symbols are on) | Cards spread down the sheet · blue cloud and gold sun | Owner asked (2026-10-08); exact look decided by Claude on the owner's standing rule | 2026-10-08 | `SettingsPanel.tsx`, `ThemeToggle.tsx`, `ScreenIcons.tsx` |
| 143 | Camera tab icon | On iPhone the Camera tab is Mahi blue when not selected (outline) and larger and filled when selected; ready-made images of Apple's camera symbol in the accent colour (`scripts/tab-icons.swift`), since Apple's bar tints every unselected tab alike. Android unchanged (not built yet) | Same grey as the other tabs | Owner asked (2026-10-08); sizes decided by Claude on the owner's standing rule | 2026-10-08 | `TabsNavigator.tsx`, `ui/assets/tabs/` |
| 144 | Camera pulled down | The camera becomes a portrait (3:4) card filling the bottom half, centred, with the page background around it; the roadmap and card move up under the arrow to fill the top half; their words and buttons follow light / dark so they can be read; the arrow turns Mahi blue and bounces when opened; no "Your Mahi roadmap" title; after a first post the roadmap drops "Show up once" and shows a spinner until it knows | Wide strip camera at the bottom · white words on a white page · first-workout step for everyone | Owner asked (2026-10-08); sizes decided by Claude on the owner's standing rule | 2026-10-08 | `CameraPull.tsx`, `CameraScreen.tsx`, `workoutRoadmap.ts` |

The owner's design-system rules (2026-10-05), enforced by tests so they can't drift back.

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 74 | Font | Inter on every word: screens, the phone's tab bar titles, toasts, the splash version line and the code email. No italic (italic text reads as regular). Only characters Inter can draw: × to close, no emoji in the camera pills ("+ Tag people", "+ Add location") | The phone's own font in places · keep italic | Decided | 2026-10-05 | `ui/src/constants/fonts.ts`, `TAB_TITLE_APPEARANCE`, `fonts.test.ts` |
| 75 | Shared design values | Every see-through amount, line width, blur, animation time, spring, swipe distance, wait and layout share comes from the shared tokens, as colours and sizes already did; one muted and one border colour for light/dark; the brand colour named once in the app config; the code email and the website take the same values from generated files | Values typed per screen | Decided | 2026-10-05 | `ui/src/constants/tokens.ts`, `themeColors`, `designTokens.test.ts`, `emailTokens.ts`, `web/app/tokens.css` |

## Design pass decided by Claude on the owner's behalf (2026-10-05)

Owner, 2026-10-05: "make decisions for me based on all of the research, without changing the main business logic". Each row is a wording or layout choice only; rules, points, tags and timings are unchanged. Findings and sources: the local `docs/design-gaps.md`.

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 76 | Readable text | One secondary grey at 65% of the text colour; dark words on cyan buttons; deeper cyan/red/amber for words on light backgrounds; no text under 11 pt (Apple's and Google's accessibility guidance) | Keep the lighter greys and white on cyan | Decided by Claude on the owner's behalf | 2026-10-05 | `themeColors`, `designTokens.test.ts` |
| 77 | Locked feed way out | One button per lock card: Camera when you can post, "Find friends" when you need a tag; "It opens when a friend tags you and you post your answer. More friends means more tags."; locked posts say "Opens when…" | Two accent buttons · no button | Decided by Claude on the owner's behalf | 2026-10-05 | `feedLock.ts`, `FeedLockBanner`, `FeedScreen` |
| 78 | Answer speed on posts | Posts read "Answered @x" with no hours (speed ranked people and shamed busy ones) | "Answered @x in 46h" | Decided by Claude on the owner's behalf | 2026-10-05 | `PostCard` |
| 79 | Welcome cards | Card 1: first post needs no tag, any workout counts, a miss sends points to 0 but best stays; card 2 ends "Follow each other and you can tag each other"; card 3's lock line corrected; cards scroll at large text. Same 3 cards, same order | Unchanged cards (#19) | Decided by Claude on the owner's behalf | 2026-10-05 | `welcomeCards.ts`, `WelcomeCards` |
| 80 | Errors and loading | A failed load says "Couldn't load …" with Try again, never an empty state; first loads show a spinner | "No posts yet" on failure | Decided by Claude on the owner's behalf | 2026-10-05 | `FeedScreen`, `ErrorBoundary` |
| 81 | Points while loading | A muted dash ("Mahi points loading" to VoiceOver) until the real number is known, never a 0 that changes | Show 0 first | Decided by Claude on the owner's behalf | 2026-10-05 | `mahiPoints.ts`, `CameraScreen` |
| 82 | After every post | A toast: "Posted. Your feed is open for 24 hours." or "Answered @sam. +1 Mahi point. You have 5." (first point, new best and several tags have their own lines) | A vibration only | Decided by Claude on the owner's behalf | 2026-10-05 | `postedToast` in `mahiPoints.ts` |
| 83 | Camera words | "First post · no tag needed" for someone who has never posted; "You're all caught up" when nothing needs answering; caption "What did you do? Any workout counts."; plain camera-access words with "Open settings" only when the phone won't ask again | "No tags to answer" · "0 Points" | Decided by Claude on the owner's behalf | 2026-10-05 | `openTagsBanner.ts`, `CameraScreen` |
| 84 | Video hold | Hold the shutter half a second (was 0.3 s) to start a video; a first-time hint "Tap for a photo · hold for a video"; failures that weren't the person's fault say "Couldn't save that video. Try again." | 0.3 s · "hold a little longer" for every failure | Decided by Claude on the owner's behalf | 2026-10-05 | `videoPosts.ts`, `captureGuide.ts` (video posts switch still off) |
| 85 | Notifications | Rows open what they say (your post for likes and comments, the answer for an answered tag, the camera for an open tag, else the profile); "Needs your answer" first; tag request line "Accept and you're friends. You'll have 48 hours to answer their tag." | Rows only close the list | Decided by Claude on the owner's behalf | 2026-10-05 | `notificationText.ts`, `HorizontalNavigator`, `NotificationsScreen` |
| 86 | One wording per idea | tag; answer; friends you can tag; tag request (in app); link (people not on Mahi); "Ended" for invites; "All 3 tags used"; never "slot", "free friends", "challenge" or "mates" on screen; times written out ("3 minutes ago", "1 day 2 hours") | Mixed words per screen | Decided by Claude on the owner's behalf | 2026-10-05 | `tagSlots.ts`, `tagRules.ts`, `relativeTime.ts`, `countdown.ts` |
| 87 | Toasts | Stay 4–10 s by length (8 s+ with a button, 10 s with a screen reader), up to 3 lines, one optional button, above the tab bar and above open sheets on build 11+; "Couldn't X. Try again." pattern | 2.5 s, 2 lines, hidden under sheets | Decided by Claude on the owner's behalf | 2026-10-05 | `toast.ts`, `ToastHost`, `toastStore` |
| 88 | Profiles and friends | Points show a dash until loaded and explain themselves on tap; other people's profiles show Best only, search hides 0 points; locked posts are padlock squares; unfollow asks first; "Follow each other and you can tag each other" under Follow; failures say so and a failed block stays on the profile | Current points on everyone's profile · one-tap unfollow | Decided by Claude on the owner's behalf (Q5) | 2026-10-05 | `ProfileScreen`, `UserProfileScreen`, `ProfileMediaMap`, `GlobalSearchOverlay`, `FollowListModal` |
| 89 | Comments and sign-in | Comment box "Cheer @sam on…", typed words kept on a failed send, no keyboard on open, Send off when empty; sign-in errors in plain words (never raw server text); password rule shown up front; profile photo hint and square crop | Raw server errors · blank comment box | Decided by Claude on the owner's behalf | 2026-10-05 | `CommentSheet`, `account.ts`, `password.ts`, `AvatarPicker` |
| 90 | Follow-through | Empty own grid opens the camera; your own row in search opens your profile; comment notifications open the post with comments up; notifications and messages say "Couldn't load …" with Try again; failed likes, comments and shares say what didn't happen; caught-up camera offers "See your feed"; Post button says "Tag 3 friends to post"; "12 Mahi points" everywhere; camera toasts sit above the shutter | Dead ends and silent failures | Decided by Claude on the owner's behalf | 2026-10-05 | `HorizontalNavigator`, `PostViewer`, stores, `mahiPoints.ts`, `tagSlots.ts` |
| 91 | Native pieces | The phone's own alerts, menus, keyboards, date picker and share sheet follow Mahi's light/dark toggle; Settings is a page sheet. Appearance is an icon inline with its title; Notifications opens phone settings; Blocked users, Log out and Delete account sit under Security and privacy; Help sits under Support | The phone's own light/dark · slide-in drawer | Decided, updated in OTA 12.16 | 2026-10-06 | `themeStore`, `SettingsPanel`, `tapArea.ts`, `refreshTint` |
| 92 | Round 5: navigation, welcome, profiles | Screen-reader "Go to …" actions between pages (no tab bar builds); welcome shows "@sam invited you to Mahi" and keeps Log in reachable at the largest text; last card button "Get started"; profile after a miss "Back to 0. Your best of 12 stays. Your next answer starts you again.", climbing back "Back at it: your best is 12."; points note adds "If you're ill or injured, rest comes first."; photos show a spinner, then "Couldn't load this photo" with Try again; failed grid squares are plain (stock photo removed); empty feed "Follow people to see their workouts here."; hints name what happens, not gestures | — | Decided by Claude on the owner's behalf | 2026-10-06 | `pageActions.ts`, `pointsHint.ts`, `welcomeCards.ts`, `toast.ts` |
| 93 | Round 5: camera, tags, offline | Offline camera "Couldn't reach Mahi" with Try again; a post on a dropped connection keeps its photos and retries as the same post ("Couldn't post. Your photos are still here. Try again."); "One workout answers all 3 tags."; newcomer "Your first post. Any workout counts, even 10 minutes."; post toast adds "Welcome back.", "That's N answers without a miss." at 5/10/25/50/100, nearing-best lines and who a first post tagged; "Need an idea?" sheet with nine workouts and a safety line (no switch: a hint, not a feature); tag list without friends' points, "First tag for them"; a failed invite claim is kept with Try again; links vs tag requests wording; caught-up camera offers Find friends | — | Decided by Claude on the owner's behalf | 2026-10-06 | `CameraScreen`, `mahiPoints.ts`, `openTagsBanner.ts`, `workoutIdeas.ts`, `inviteStore`, `tagSlots.ts` |
| 94 | Moderation | Anyone can report a person, post, comment or message (one report each, 11 reasons). Only staff see reports; moderators review, dismiss, hide posts, remove comments, warn and suspend; only admins ban and unban. Every action needs a reason and is logged. Hidden content is kept (undoable) but shown to nobody but staff. An automatic check (OpenAI's free moderation model) flags new posts and comments; it hides nothing by itself unless `ai_auto_hide` is switched on (starts off). Staff are added by migration only | Reports by email · hide on report | Built — on `updates`, waiting for the owner to apply | 2026-10-06 | `20261006100000_moderation`, `moderate-content`, [moderation.md](./moderation.md) |

## Answered questions (asked 2026-10-05 in Slack #questions-and-answers; live in OTA 12.16)

Maximus answered Q1–Q10. The server changes are live and the client changes shipped in OTA 12.16.

| # | Question | Choices | Status | Asked | Used in |
| --- | --- | --- | --- | --- | --- |
| 65 | Q1 · After "Not now" (or taking an in-app invite back), how soon can you invite that person again? | **1 day** | Decided | 2026-10-06 | `enforce_tag_invite_cooldown` |
| 66 | Q2 · A daily limit on in-app invites per person? | **No limit** (the concurrent open-invite safety cap remains) | Decided | 2026-10-06 | `invite_to_tag` |
| 67 | Q3 · Unfollowing free friends to fill slots with invites | **Remove friends-first: each tag may be a current friend or someone not on Mahi yet, so unfollowing gives no advantage** | Decided | 2026-10-06 | `create_post`, tag sheet |
| 68 | Q4 · Blocking the person who tagged you cancels the tag: should it count as a missed tag (points back to 0)? | **No: blocking cancels it without a miss** | Decided | 2026-10-06 | `cancel_tags_on_block` |
| 69 | Q5 · Deleting posts: allowed at all? If yes, deleting never gives back the free first post (a permanent "has posted before" mark) | **Allowed, with the permanent mark** | Decided | 2026-10-06 | `delete_post`, `reactive_posting_open` |
| 70 | Q6 · When does a link invite's 48 hours start? | **When the new person installs/joins after the post; when the friend posts if they joined first** | Decided | 2026-10-06 | `claim_invite`, `start_tag`, `claimedText` |
| 71 | Q7 · The share message | **Short link message, no signup code or sales-style copy** | Decided | 2026-10-06 | `slotShareMessage`, `inviteShareMessage` |
| 72 | Q8 · A friend who joined or accepted, then unfollows you before you post: does their slot still count? | **Yes** | Decided | 2026-10-06 | `start_tag`, `create_post` |
| 64 | Q9 · A search button (same as #64 above) | Answered: a magnifier on the Profile screen, not in the header | Decided | 2026-10-05 | `ProfileScreen` |
| 73 | Q10 · Pinch to zoom for everyone | Yes, for everyone, with no switch ("no posthog flag needed it can just go out in the update") · not yet | Decided | 2026-10-05 | `PostCard` (OTA 12.05) |

Sign-up still accepts a code or pasted link, but shared messages are deliberately short and do not
include the code. A refused post keeps its photos. A slot cannot tag back the person whose tag the
post answers; a second link from the same person says "already linked".

## Fixed by the PRD (not open questions)

| Rule | Value |
| --- | --- |
| Tags per post | 3 |
| Tag deadline | 48 hours (`app_config.tag_window`) |
| Late-upload grace | 10 minutes (`app_config.answer_grace`) |
| Invite link lifetime | 7 days (`app_config.invite_ttl`) |
| Posts per day | No limit since 2026-10-01: one post per tag answered, as often as you're tagged (the old one-a-day index was dropped by `20261001120000_reactive_posting.sql`) |
