-- Apple tokens (build 13, Sign in with Apple). Apple requires that deleting an account also
-- revokes the app's access with Apple (App Store guideline 5.1.1(v)). That needs Apple's refresh
-- token, which only the server can get: at sign-in the app hands Apple's one-time authorization
-- code to the apple-token function, which swaps it at Apple for a refresh token and keeps it here.
-- delete-account reads it, revokes it at Apple, then deletes the account (the row goes with it).
-- Only the server functions (service role) can read or write this table: row security is on with
-- no policies, and the app's roles have no rights at all.
begin;

create table public.apple_tokens (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at    timestamptz not null default now()
);

alter table public.apple_tokens enable row level security;
revoke all on table public.apple_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.apple_tokens to service_role;

commit;
