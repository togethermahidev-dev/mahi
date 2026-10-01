-- Undo 20260917111346_push. Queued pushes and device tokens are lost.
begin;

select cron.unschedule('send-push');
select cron.unschedule('push-receipts');

drop trigger if exists push_on_notification on public.notifications;

drop function if exists public.invoke_send_push(text);
drop function if exists public.push_on_notification();
drop function if exists public.mark_push_receipts_checked(bigint[]);
drop function if exists public.pending_push_receipts(int);
drop function if exists public.remove_push_tokens(text[]);
drop function if exists public.complete_push(jsonb);
drop function if exists public.claim_push_batch(int);
drop function if exists public.unregister_push_token(text);
drop function if exists public.register_push_token(text, text);
drop function if exists public.enqueue_push(uuid, uuid, text, text, jsonb, timestamptz, text);
drop function if exists public.push_send_time(timestamptz, text);

drop table if exists public.push_outbox;
drop table if exists public.push_tokens;
drop table if exists public.app_config;

-- pg_cron and pg_net are left installed; drop them by hand if nothing else uses them.

delete from supabase_migrations.schema_migrations where version = '20260917111346';

commit;
