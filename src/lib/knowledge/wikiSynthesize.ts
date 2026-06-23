// wikiSynthesize — turn a room's raw cotext.md captures into proposed wiki
// documents (decisions / concepts / errors / projects / design / dev-tasks).
//
// The LLM is asked to: (1) skip trivial chatter, (2) group related captures
// into one document per distinct idea, (3) reference existing wiki docs via
// [[slug]] links so the new docs land connected to the graph.
//
// The user reviews + edits + selects in WikiSynthesisModal before anything is
// pushed — this is the human-in-the-loop safety net against hallucination.

import { runChat } from '../agent/providers';
import { getProvider, type ProviderId } from '../agent/models';

const WIKI_CATEGORIES = ['decisions', 'concepts', 'errors', 'projects', 'design', 'dev-tasks'] as const;
export type WikiCategory = typeof WIKI_CATEGORIES[number];

// type singular for frontmatter (e.g. decisions → decision)
const CATEGORY_TO_TYPE: Record<WikiCategory, string> = {
  decisions: 'decision',
  concepts: 'concept',
  errors: 'error',
  projects: 'project',
  design: 'design',
  'dev-tasks': 'dev-task',
};

export interface WikiProposal {
  category: WikiCategory;
  slug: string;
  title: string;
  tags: string[];
  body: string;
  rationale: string;
}

export interface SynthesizeArgs {
  /** Provider config — BYOK from caller (same shape AgentPanel uses). */
  providerId: ProviderId;
  model: string;
  apiKey: string;
  /** Room's cotext.md text (the raw chat captures). */
  roomContent: string;
  /** Optional: existing NEURAL_INDEX.md so the LLM can [[link]] to known docs. */
  existingIndex?: string;
  /** Repo label for context (owner/repo). */
  repoLabel: string;
  /** Room label (path) for context. */
  roomLabel: string;
  signal?: AbortSignal;
}

const SYSTEM_PROMPT = `You are a wiki organizer for a multi-agent knowledge repository.
The repo follows a LLM-wiki convention: a "raw chat captures" layer (cotext.md
blocks) feeds a "curated wiki" layer (AI-Sessions/wiki/{category}/{slug}.md),
which a compiler turns into a knowledge graph (.cotext/neural.json).

Your job: read the room's raw captures and propose new wiki documents that
formalize the distinct ideas/decisions/concepts/errors/projects/design/dev-tasks
worth promoting. Output STRICT JSON only — no prose, no markdown fences around it.`;

function buildUserPrompt(args: SynthesizeArgs): string {
  return `REPO: ${args.repoLabel}
ROOM: ${args.roomLabel}

ROOM RAW CAPTURES (cotext.md):
${args.roomContent.slice(0, 16000)}
${args.roomContent.length > 16000 ? '\n[... truncated ...]\n' : ''}

EXISTING WIKI INDEX (slugs you can [[link]] to):
${(args.existingIndex || '(none yet)').slice(0, 4000)}

TASK: Propose wiki documents to formalize the durable ideas in this room.
Output JSON with this exact shape:
{
  "docs": [
    {
      "category": "decisions" | "concepts" | "errors" | "projects" | "design" | "dev-tasks",
      "slug": "kebab-case-slug",
      "title": "Human-readable Title",
      "tags": ["tag-a", "tag-b"],
      "body": "Markdown body. Use [[existing-slug]] to link to docs in the index. Don't include frontmatter — that's auto-generated.",
      "rationale": "One sentence on why this belongs in the wiki (Save Filter: reusable / handoff-worthy / decision-trail / risk / team-rule)."
    }
  ]
}

Rules:
- Skip one-off questions, banter, or trivia.
- Each doc must satisfy the Save Filter (reusable, handoff-worthy, decision-trail, risk, or team-rule).
- Use [[slug]] (no .md suffix) to cross-link with existing wiki when relevant.
- Slugs: lowercase, kebab-case, ASCII only. Keep short.
- Body: 100-600 words. Markdown allowed (headings, lists, code, blockquotes).
- Output STRICT JSON ONLY. No prose, no \`\`\` fences.
- If nothing in the room is wiki-worthy, return {"docs": []}.`;
}

interface RawDoc {
  category?: string;
  slug?: string;
  title?: string;
  tags?: unknown;
  body?: string;
  rationale?: string;
}

function isValidSlug(s: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,80}$/.test(s);
}

function sanitizeProposal(raw: RawDoc): WikiProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const category = raw.category as WikiCategory;
  if (!WIKI_CATEGORIES.includes(category)) return null;
  if (typeof raw.slug !== 'string' || !isValidSlug(raw.slug)) return null;
  if (typeof raw.title !== 'string' || raw.title.trim().length === 0) return null;
  if (typeof raw.body !== 'string' || raw.body.trim().length === 0) return null;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 8)
    : [];
  return {
    category,
    slug: raw.slug,
    title: raw.title.trim(),
    tags,
    body: raw.body.trim(),
    rationale: typeof raw.rationale === 'string' ? raw.rationale.trim() : '',
  };
}

function parseProposals(raw: string): WikiProposal[] {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const open = s.indexOf('{');
  const close = s.lastIndexOf('}');
  if (open === -1 || close <= open) return [];
  s = s.slice(open, close + 1);
  try {
    const parsed = JSON.parse(s);
    const docs = Array.isArray(parsed?.docs) ? parsed.docs : [];
    return docs
      .map(sanitizeProposal)
      .filter((d: WikiProposal | null): d is WikiProposal => d !== null);
  } catch {
    return [];
  }
}

export async function synthesizeWikiDocs(args: SynthesizeArgs): Promise<WikiProposal[]> {
  const provider = getProvider(args.providerId);
  const raw = await runChat({
    shape: provider.shape,
    baseURL: provider.baseURL,
    apiKey: args.apiKey,
    model: args.model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(args) }],
    signal: args.signal,
  });
  return parseProposals(raw);
}

/**
 * Compose the final markdown for a wiki doc — frontmatter auto-generated from
 * proposal fields. Body comes through verbatim so user edits in the modal
 * round-trip cleanly.
 */
export function composeWikiDoc(prop: WikiProposal, today = new Date().toISOString().slice(0, 10)): string {
  const tagsLine = prop.tags.length > 0 ? `\ntags: [${prop.tags.join(', ')}]` : '';
  return `---
type: ${CATEGORY_TO_TYPE[prop.category]}
date: ${today}
status: draft${tagsLine}
---

# ${prop.title}

${prop.body.trim()}
`;
}

export function wikiPath(prop: WikiProposal): string {
  return `AI-Sessions/wiki/${prop.category}/${prop.slug}.md`;
}
