-- Undo 20261007300000_apple_tokens: the kept Apple refresh tokens are dropped. apple-token then
-- fails to save (the app reports a warning, sign-in carries on) and delete-account finds no token,
-- so it deletes without revoking at Apple. Deploy the older functions first if rolling back for good.
begin;

drop table public.apple_tokens;

commit;
