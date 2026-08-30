import Anthropic from "@anthropic-ai/sdk";

export interface DraftRequest {
  title: string;
  sourceLabel: string;
  changeType: string;
  /** The material the item carries — publisher note, body excerpt, or excerpt. */
  material: string;
}

/** Injectable so tests can assert exactly what is (and is not) sent to a model. */
export type Drafter = (request: DraftRequest) => Promise<string>;

const SYSTEM = `You draft one-sentence impact lines for a weekly digest read by clinical governance leads at UK healthcare organisations.

Given a change to national guidance, write a single sentence saying which class of local document the change sends someone back to — a protocol, a patient group direction, an emergency drug list, a clinic SOP.

Rules:
- Report only what the supplied material supports. Never infer clinical detail that is not there.
- Never give clinical advice and never say what a protocol should say.
- Name document classes, not named organisations or products beyond those in the material.
- One sentence, plain English, no preamble, no quotation marks.
- If the material is too thin to say anything useful, reply exactly: NO DRAFT`;

export const claudeDrafter: Drafter = async (request) => {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    system: SYSTEM,
    // Routine bounded extraction with mandatory operator review after it —
    // medium is the cost/quality balance here, not a quality ceiling.
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content: `Source: ${request.sourceLabel}
Change type: ${request.changeType}
Title: ${request.title}

Material:
${request.material}`,
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return text === "NO DRAFT" ? "" : text;
};
