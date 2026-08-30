// §8: one configurable block, so NICE's heavier phase-3 requirements (their
// logo above the fold, specified wording, nothing implying endorsement) can be
// switched on later without touching page layout.
export function Attribution({ includeNice = false }: { includeNice?: boolean }) {
  return (
    <div className="text-xs leading-relaxed text-muted-foreground">
      <p>
        Contains public sector information licensed under the{" "}
        <a
          className="underline underline-offset-2"
          href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
        >
          Open Government Licence v3.0
        </a>
        . UKHSA and MHRA material is Crown copyright. Departmental logos and crests are
        not covered by that licence and are not reproduced here.
      </p>
      {includeNice && (
        <p className="mt-2">
          {/* Placeholder: exact wording and logo placement are set by the NICE
              licence at phase 3, and require NICE sign-off before go-live. */}
          NICE content is reproduced under licence. This service is not endorsed by NICE.
        </p>
      )}
    </div>
  );
}
