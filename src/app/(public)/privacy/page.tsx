import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy notice",
  description:
    "What Protocol Monitor holds about subscribers, where it came from, the lawful basis, how long it is kept, and how to be removed.",
};

// PLACEHOLDER COPY — the operator is supplying the real text (§8, §10.3).
// The headings below are the Article 14 points the notice has to cover, so the
// structure can stay while the words are replaced.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy notice</h1>
      <p className="mt-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        Placeholder text. The operator is supplying the final wording; the headings are
        the points it has to cover.
      </p>

      <div className="mt-8 flex flex-col gap-6 leading-relaxed">
        <section>
          <h2 className="font-semibold">Who we are</h2>
          <p>
            [Trading name, contact address and a reply-to that a person reads. Data
            controller identity.]
          </p>
        </section>

        <section>
          <h2 className="font-semibold">What we hold</h2>
          <p>
            Your email address, the organisation type you chose at signup, when you
            confirmed, and delivery outcomes for the emails we send you (delivered,
            bounced, complained). Replies you send us are kept against the issue they
            answer.
          </p>
          <p className="mt-2">
            <strong>No patient data, ever.</strong> Nothing in this service holds
            identifiable patient information, by design.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Where it came from</h2>
          <p>
            [Either you gave it to us at signup, or we collected it from a named public
            source — say which sources, as Article 14 requires when the data did not
            come from the person directly.]
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Lawful basis</h2>
          <p>[Consent for the digest; legitimate interests where relevant, named.]</p>
        </section>

        <section>
          <h2 className="font-semibold">How long we keep it</h2>
          <p>[Retention period, and what happens after you unsubscribe.]</p>
        </section>

        <section>
          <h2 className="font-semibold">Who else sees it</h2>
          <p>
            [Processors: the email provider that delivers the digest, and the database
            host. Nothing is sold or shared for marketing.]
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Your rights, and how to be removed</h2>
          <p>
            Every email carries a one-click unsubscribe link that works without an
            account. You can also ask us to delete what we hold, or to send you a copy
            of it, by replying to any issue or emailing [address]. [Right to complain to
            the ICO.]
          </p>
        </section>
      </div>
    </main>
  );
}
