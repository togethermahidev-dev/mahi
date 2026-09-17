# Decisions — Tag Loop

What was chosen for the tag loop, what else was on the table, and where the plan uses it.
Source of the questions: the PRD "Mahi PRD — Tag 3 Friends". Build plan: [tag-loop-plan.md](./tag-loop-plan.md).

To change a decision: edit its row here and in the PRD, then update every plan section listed in
"Used in". Numeric values (hours, caps, quiet hours) live in the `app_config` table, so changing them
needs a migration, not an app release.

| # | Decision | Chosen | Other options | Status | Decided | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Streak rule | Not chosen | Weekly streak (weeks in a row with ≥1 post) plus total visits · total visits only · daily streak with no rest days | Parked — decide when Phase 5 starts | — | Phase 5 |
| 2 | Who can be tagged | Mutual follows, plus invites | Anyone you follow, plus invites · anyone on Mahi, plus invites | Decided | 2026-09-17 | Phase 2 `get_taggable_friends`, `create_post` |
| 3 | Who is in the feed | People you follow | Mutual follows only · everyone, as today | Decided | 2026-09-17 | Phase 4 `can_view_post`, `get_feed` |
| 4 | How long a post unlocks the feed | 24 hours (`app_config.unlock_window`) | Until midnight · 48 hours | Decided | 2026-09-17 | Phase 4 `viewer_unlocked_until` |
| 5 | Who sees a missed tag | Tagger and tagged only | All their friends · nobody | Decided | 2026-09-17 | Phase 2 `mark_missed_tags`, notifications |
| 6 | Does the tagger earn a point | Yes | No | Decided | 2026-09-17 | Phase 5 `point_events` |
| 7 | Daily points cap | 3 (`app_config.daily_point_cap`) | No cap · 1 per day | Decided | 2026-09-17 | Phase 5 `create_post` step 6 |
| 8 | Fewer than 3 people to tag | Invite links fill the gap; fewer tags allowed until invite links ship | Allow fewer tags permanently | Decided | 2026-09-17 | Phase 2 `create_post` step 3, Phase 7 |
| 9 | New user's feed | Locked until their first post | Open for the first 24 hours | Decided | 2026-09-17 | Phase 4 `viewer_unlocked_until` (null = locked) |
| 10 | Existing users' streaks | Not chosen | Carry the number over · start again | Parked — decide with #1 | — | Phase 5 |
| 11 | Quiet hours | 22:00–07:00 in each user's time zone (`app_config.quiet_start/quiet_end`) | None · each user picks | Decided | 2026-09-17 | Phase 1 `enqueue_push` |
| 12 | Success targets | Not chosen | Starter targets: 70% of posts answer a tag · 50% of tags answered in 48 h · 30% of invites join · 60% of users post weekly | Parked — decide before the Phase 8 beta | — | Phase 8 |
| 13 | Where database changes are built | Directly on production (`pzepodsppqtvptzmwxzs`, free plan, no preview branches) | A second free Supabase project as a test copy | Decided | 2026-09-17 | Phase 0 safeguards, every "apply" step |

## Fixed by the PRD (not open questions)

| Rule | Value |
| --- | --- |
| Tags per post | 3 |
| Tag deadline | 48 hours (`app_config.tag_window`) |
| Late-upload grace | 10 minutes (`app_config.answer_grace`) |
| Invite link lifetime | 7 days (`app_config.invite_ttl`) |
| Posts per day | 1 |
