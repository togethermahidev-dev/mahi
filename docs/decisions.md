# Decisions — Tag Loop

What was chosen for the tag loop, what else was on the table, and where the plan uses it.
Source of the questions: the PRD "Mahi PRD — Tag 3 Friends". Build plan: [tag-loop-plan.md](./tag-loop-plan.md).

To change a decision: edit its row here and in the PRD, then update every plan section listed in
"Used in". Numeric values (hours, caps, quiet hours) live in the `app_config` table, so changing them
needs a migration, not an app release.

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Streak rule | Replaced by Mahi points (#47): each post that answers a tag earns 1 point; miss a tag's 48 hours and the points go back to 0; the best stays on show. No daily streak, rest days, training days, weekly calendar or streak calendar | Weekly streak (weeks in a row with ≥1 post) plus total visits · total visits only · daily streak with no rest days | Decided | 2026-10-01 | Phase 5 (replaced by the tag streak), `create_post`, `20261001120000_reactive_posting.sql` |
| 2 | Who can be tagged | Mutual follows, plus invites | Anyone you follow, plus invites · anyone on Mahi, plus invites | Decided | 2026-09-17 | Phase 2 `get_taggable_friends`, `create_post` |
| 3 | Who is in the feed | People you follow | Mutual follows only · everyone, as today | Decided | 2026-09-17 | Phase 4 `can_view_post`, `get_feed` |
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
| 17 | Swipe navigation | Rebuilt on gesture-handler + reanimated now; keep debugging rather than revert | Keep `PanResponder` | Decided | 2026-10-01 | `HorizontalNavigator`, `VerticalNavigator`, `src/lib/swipeRules.ts` |
| 18 | Profile layout | "Suggested for you" folds away, closed by default; grid shows ≥9 squares (≥6 fallback) | Suggestions always open | Decided | 2026-10-01 | `ProfileScreen` |
| 19 | Welcome cards | 3 cards, once per account per device, existing users too; native paging carousel in a Modal | No onboarding | Decided | 2026-10-01 | `WelcomeCards`, flag `onboarding-welcome-cards` |
| 20 | Locked feed | Names the friend who tagged you; open feed shows hours left | Plain locked cards | Decided | 2026-10-01 | `FeedLockBanner`, flag `feed-lock-explainer` |
| 21 | Camera capture | Keep the second tap; the small window says what's second ("Selfie next"), then shows photo 1 while the screen switches | Auto timer for photo 2 | Decided | 2026-10-01 | `CapturePipGuide`, flag `camera-pip-guide` |
| 22 | Nav rail | Keep 4 icons; floating pill outline; morphing selector; hold-and-drag switches screens live | — | Decided | 2026-10-01 | `NavRail`, flag `nav-rail-morph` |
| 23 | First post with no friends | A clear "Invite 3 friends" step on the tag sheet | Lower the tag minimum | Decided | 2026-10-01 | `InviteStep`, `InviteShareSheet`, flag `tags-invite-step` |
| 24 | Sign-up fields | Date of birth and phone number stay required | Make them optional | Decided | 2026-10-01 | `CreateAccountSheet` |
| 25 | Account basics | Password reset by emailed code; in-app Delete account (App Store requirement) | — | Decided | 2026-10-01 | flags `auth-password-reset`, `account-delete` |
| 26 | Label style | Every ALL-CAPS label to sentence case; MAHI wordmark excepted | Keep caps | Decided | 2026-10-01 | All screens; `src/constants/tokens.ts` |
| 27 | Does a skipped rest day protect the streak | No rest days at all: the streak counts answered tags, not days (#1) | — | Decided | 2026-10-01 | `record_upload_streak` rest-day rule retired, Phase 5 |

## Reactive posting (2026-10-01)

Testing showed that posting a workout every day felt like self-promotion, while answering a friend's
tag worked. **Reactive posting**: you post only when a friend has tagged you and the tag is still
open (48 hours) — your very first post is the one exception. Architecture:
[architecture.md](./architecture.md#reactive-posting).

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 28 | When you can post | Reactive posting: only to answer an open tag, plus your first post; no daily limit — one post per tag answered | One post a day | Decided | 2026-10-01 | `create_post` → `reactive_posting_open`, `src/lib/reactivePosting.ts` |
| 29 | Feed lock | Every post opens the feed for 24 hours. Tagged within them → it locks when they end; not tagged → it stays open until you're tagged, then locks. Miss a tag → locked until a friend tags you again | Open until tagged (2026-09-28 rule) | Decided | 2026-10-01 | `get_feed`, `src/lib/feedLock.ts`, `FeedLockBanner` |
| 30 | Missing a tag | Mahi points back to 0 (#47); the person who missed gets a `streak_lost` notice ("You missed @x's tag. Your points are back to 0.") from the tagger | Silent reset | Decided | 2026-10-02 (wording) | `mark_missed_tags`, `NotificationsScreen` |
| 31 | Seeing the welcome cards again | Settings → Help reopens the three cards | Shown once only | Decided | 2026-10-02 | `SettingsPanel`, `WelcomeCardsModal`, flag `onboarding-welcome-cards` |
| 32 | Settings rows with nothing behind them | Removed (Edit profile, Update bio & link, Safety & privacy, Privacy & data); a row comes back when it's built | Keep as placeholders | Decided | 2026-10-02 | `SettingsPanel` |

## Video posts (2026-10-02)

The owner answered the open question "should posts ever include video?" — yes. Built behind the
default-off flag `video-posts`; architecture: [architecture.md](./architecture.md#video-posts).

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 33 | Video in posts | Each of the two shots (your view = back, selfie = front) can be a photo or a video, whichever the user wants | Photos only · one video per post | Decided | 2026-10-02 | `posts.rear_media_type` / `front_media_type`, `create_post`, `CameraScreen` |
| 34 | How to record | Both: a Photo / Video switch by the shutter, and press and hold the shutter to record (a tap is a photo, as today). Letting go, or 15 seconds, stops | Switch only · hold only | Decided | 2026-10-02 | `src/lib/videoPosts.ts` (`shutterIntent`), `CameraScreen` |
| 35 | Longest video | 15 seconds per video | 10 s · 30 s | Decided | 2026-10-02 | `MAX_VIDEO_SECONDS`, `recordAsync({ maxDuration })` |
| 36 | Playback | Videos start muted, loop while on screen and pause off screen — in the feed, the small window and the post viewer — with a mute / unmute button | Autoplay with sound · tap to play | Decided | 2026-10-02 | `PostVideo`, `SoundButton`, `FeedScreen`, `PostViewer`, `DraggablePip` |
| 37 | Rollout | Everything behind one flag, `video-posts`, OFF for everyone. Off = today's photo-only app, and the microphone is never asked for; on = the microphone is asked for only when someone first records | On for testers first | Decided | 2026-10-02 | `src/lib/featureFlags.ts` (`DEFAULT_OFF_FLAGS`), `useVideoPosts` |
| 38 | Microphone permission | Keep it in the app; the text becomes "Mahi uses the microphone to record sound in your workout videos." (needs the next native build anyway) | Remove it (the 2026-10-01 plan while posts were photo-only) | Decided | 2026-10-02 | `app.config.js` |

A video post answers tags exactly like a photo post: reactive posting, Mahi points, tags, invites and
the feed lock are unchanged (a locked viewer gets no video links).

## Profile pages and viewers (2026-10-02)

Owner's rule for this round: replace the old with the new, never keep both side by side. None of
these needs a new native module, so they ship as plain updates without a flag.

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 39 | Profile scrolling | The whole profile scrolls as one page: the header scrolls away and the grid fills the screen (own and other people's) | Fixed header, grid scrolls below it | Decided | 2026-10-02 | `ProfileMediaMap`, `ProfileScreen`, `UserProfileScreen` |
| 40 | Opening a post from a profile | Full screen from the tapped post; up/down browses all of that profile's posts, one per screen as in the feed; a swipe left or right closes (like Instagram / TikTok) | One post at a time | Decided | 2026-10-02 | `PostViewer`, `PostCard`, `src/lib/viewer.ts` |
| 41 | Profile pictures | Tap any profile's picture: full screen, pinch to zoom, swipe to close. Your own keeps its "+" to change it | Fixed-size enlarge, tap to close | Decided | 2026-10-02 | `AvatarViewer`, `AvatarPicker` |

## Feed polish and comment likes (2026-10-02)

Same rule: replace the old with the new. Items 42–45 change existing screens, so they ship without a
flag; comment likes (46) is a new feature behind `comment-likes`.

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 42 | Like and comment buttons | Higher up the right-hand side, where TikTok and Reels put them, on a full-width dark shade (the old shade stopped short of the buttons) | Low on the right | Decided | 2026-10-02 | `PostCard`, `POST_CARD` tokens |
| 43 | Glass bar side | The left edge on every screen, so it never meets the raised buttons; things on the left move past it, and it hides over profiles, Settings and search | Stay on the right | Decided | 2026-10-02 | `NavRail`, `useRailRoom`, `useCoverRail` |
| 44 | Hold to view | Press and hold a post (feed and post viewer): a light tap, then the name, caption, tags, points, buttons and glass bar fade away until the finger lifts. The small photo stays and stays draggable | — | Decided | 2026-10-02 | `PostCard`, `chromeStore`, `useChromeFade` |
| 45 | Feed icon | A small bounce on the glass bar's Feed icon each time the feed moves to the next post; none with Reduce Motion | — | Decided | 2026-10-02 | `NavRail`, `chromeStore.feedTick` |
| 46 | Comment likes | A heart and count on every comment; tap the count for who liked it (names, pictures, tap for their profile), included now | Hearts only, list later | Decided | 2026-10-02 | `CommentSheet`, `CommentLikersSheet`, migration `20261002130000_comment_likes`, flag `comment-likes` |

## Mahi points (2026-10-02)

The founder, word for word: "You post. Tag 3 people. They have a 48 hour deadline to post as well. If
they meet the deadline = 1 Mahi point. This builds up over time. If you get tagged and don't meet the
48hr deadline, you lose your points and start again. It would then say e.g. Best = 48 points. This is
not streaks. Streaks are a daily thing." Architecture: [architecture.md](./architecture.md#reactive-posting).

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 47 | What people count | Mahi points: +1 for each post that answers at least one open tag (not per tag); a missed tag's 48 hours puts them back to 0; Best is never lowered and always shown. The counter the app called the streak, renamed everywhere people see it | Keep calling it a streak | Decided | 2026-10-02 | `create_post`, `break_missed_streaks`, `src/lib/mahiPoints.ts`, profiles, posts, camera, tag list, search, notices, welcome card, waitlist site |
| 48 | The old points | Retired: no point for the tagger, no 3-a-day cap, no never-resetting total (`point_events`, `award_point`, `daily_point_cap`, `stats.points_daily` dropped) | Keep both numbers | Decided | 2026-10-02 | `20261002170000_mahi_points.sql` |
| 49 | Daily streak | None for now | A daily streak beside the points | Decided | 2026-10-02 | — |
| 50 | Points switch | Points always show; the `mahi-points` flag is removed (delete it in PostHog) | Keep the switch | Decided | 2026-10-02 | `src/lib/featureFlags.ts` |

## Fixed by the PRD (not open questions)

| Rule | Value |
| --- | --- |
| Tags per post | 3 |
| Tag deadline | 48 hours (`app_config.tag_window`) |
| Late-upload grace | 10 minutes (`app_config.answer_grace`) |
| Invite link lifetime | 7 days (`app_config.invite_ttl`) |
| Posts per day | No limit since 2026-10-01: one post per tag answered, as often as you're tagged (the old one-a-day index was dropped by `20261001120000_reactive_posting.sql`) |
