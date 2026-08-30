-- Seed the launch sources (SPEC.md §4.1, §4.3, §4.5).
-- A source is a row, not code (§4.2); adding or removing one is an insert/update.

insert into sources (key, name, adapter, feed_url, enabled, licence_note) values
  (
    'ukhsa_green_book',
    'UKHSA — Green Book and immunisation guidance',
    'govuk_atom',
    'https://www.gov.uk/search/guidance-and-regulation.atom?organisations%5B%5D=uk-health-security-agency&keywords=green+book',
    true,
    'Crown copyright, Open Government Licence v3.0'
  ),
  (
    'ukhsa_wide',
    'UKHSA — wider guidance (no keyword filter)',
    'govuk_atom',
    'https://www.gov.uk/search/guidance-and-regulation.atom?organisations%5B%5D=uk-health-security-agency',
    true,
    'Crown copyright, Open Government Licence v3.0'
  ),
  (
    'mhra_alerts',
    'MHRA — alerts, recalls and safety information',
    'govuk_atom',
    'https://www.gov.uk/drug-device-alerts.atom',
    true,
    'Crown copyright, Open Government Licence v3.0'
  ),
  (
    'mhra_dsu',
    'MHRA — Drug Safety Update',
    'govuk_atom',
    'https://www.gov.uk/drug-safety-update.atom',
    true,
    'Crown copyright, Open Government Licence v3.0'
  ),
  (
    'nice',
    'NICE — guidance and quality standards',
    'manual',
    null,
    true,
    'No licence held. Clipboard/manual workflow only (§6.4); published entries are operator commentary with a link back. Syndication API is phase 3, behind the metadata licence.'
  )
on conflict (key) do nothing;
