-- §6.3: the model's proposed impact statement lives in its own column. It
-- becomes the admin's text only by explicit acceptance (copied into
-- admin_note); nothing in admin_note is ever model-written directly.
alter table changes add column draft_note text;
alter table changes add column draft_generated_at timestamptz;
