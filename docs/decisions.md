# Decisions — Tag Loop

What was chosen for the tag loop, what else was on the table, and where the plan uses it.
Source of the questions: the PRD "Mahi PRD — Tag 3 Friends". Build plan: [tag-loop-plan.md](./tag-loop-plan.md).

To change a decision: edit its row here and in the PRD, then update every plan section listed in
"Used in". Numeric values (hours, caps, quiet hours) live in the `app_config` table, so changing them
needs a migration, not an app release.

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Streak rule | Tag streak under reactive posting (#28): each post that answers a tag adds 1; miss a tag's 48 hours and the streak goes back to 0; the best streak stays on show. No rest days, training days, weekly calendar or streak calendar | Weekly streak (weeks in a row with ≥1 post) plus total visits · total visits only · daily streak with no rest days | Decided | 2026-10-01 | Phase 5 (replaced by the tag streak), `create_post`, `20261001120000_reactive_posting.sql` |
| 2 | Who can be tagged | Mutual follows, plus invites | Anyone you follow, plus invites · anyone on Mahi, plus invites | Decided | 2026-09-17 | Phase 2 `get_taggable_friends`, `create_post` |
| 3 | Who is in the feed | People you follow | Mutual follows only · everyone, as today | Decided | 2026-09-17 | Phase 4 `can_view_post`, `get_feed` |
| 4 | How long a post unlocks the feed | 24 hours (`app_config.unlock_window`) | Until midnight · 48 hours | Decided | 2026-09-17 | Phase 4 `viewer_unlocked_until` |
| 5 | Who sees a missed tag | Tagger and tagged only | All their friends · nobody | Decided | 2026-09-17 | Phase 2 `mark_missed_tags`, notifications |
| 6 | Does the tagger earn a point | Yes | No | Decided | 2026-09-17 | Phase 5 `point_events` |
| 7 | Daily points cap | 3 (`app_config.daily_point_cap`) | No cap · 1 per day | Decided | 2026-09-17 | Phase 5 `create_post` step 6 |
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
| 30 | Missing a tag | Streak back to 0; the person who missed gets a `streak_lost` notice ("You missed @x's tag. Your streak is back to 0.") from the tagger | Silent reset | Decided | 2026-10-01 | `mark_missed_tags`, `NotificationsScreen` |

## Fixed by the PRD (not open questions)

| Rule | Value |
| --- | --- |
| Tags per post | 3 |
| Tag deadline | 48 hours (`app_config.tag_window`) |
| Late-upload grace | 10 minutes (`app_config.answer_grace`) |
| Invite link lifetime | 7 days (`app_config.invite_ttl`) |
| Posts per day | No limit since 2026-10-01: one post per tag answered, as often as you're tagged (the old one-a-day index was dropped by `20261001120000_reactive_posting.sql`) |
