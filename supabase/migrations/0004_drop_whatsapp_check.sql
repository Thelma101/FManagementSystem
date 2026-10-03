-- The WhatsApp number check was removed; WhatsApp messages now go out through eBulkSMS without a check.
alter table public.contacts drop column if exists whatsapp_status;
alter table public.contacts drop column if exists whatsapp_checked_at;
alter table public.contacts drop column if exists whatsapp_check_source;
