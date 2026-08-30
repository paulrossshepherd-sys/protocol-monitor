-- Operator correction to §4.1: the wide UKHSA feed is the single UKHSA source.
-- The keyword-filtered green-book feed is a strict subset of it and
-- double-reports every item. Row kept (disabled) for reference.
update sources set enabled = false where key = 'ukhsa_green_book';
