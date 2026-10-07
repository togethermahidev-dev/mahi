-- Removes the old messaging path so nothing can send around send_message's rules.
--
-- When to use: after the app build that sends through send_message is live in both stores and
-- app_config.min_app_version has been raised to that build's version.

-- Direct inserts into messages (old app builds) stop working.
drop policy if exists messages_insert on public.messages;
revoke insert on public.messages from authenticated;

notify pgrst, 'reload schema';

-- Added with 20261006190000_message_requests: old apps also open, accept and deny requests by
-- writing to conversations directly. Once every phone answers requests through
-- accept_message_request / decline_message_request and starts chats with start_conversation:
drop policy if exists conversations_insert on public.conversations;
drop policy if exists conversations_update on public.conversations;
drop policy if exists conversations_delete on public.conversations;
revoke insert, update, delete on public.conversations from authenticated;

notify pgrst, 'reload schema';
