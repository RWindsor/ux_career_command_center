/**
 * Strips HTML tags from an ATS-provided description, leaving readable
 * plain text. Deliberately not a full sanitizer — output is only ever
 * stored as `jobs.description` (a plain-text column, rendered with
 * `<pre>`, and sent as text to Gemini), never re-rendered as HTML, so
 * there's no injection surface to defend against here.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** UX/Product Design role filtering per the product brief — title-based, deliberately permissive. */
const ROLE_KEYWORDS = [
  "ux",
  "user experience",
  "product design",
  "ui design",
  "ui/ux",
  "user interface",
  "interaction design",
  "visual design",
  "design system",
  "user research",
  "usability",
];

export function matchesDesignRole(title: string): boolean {
  const normalized = title.toLowerCase();
  return ROLE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function normalizeForDedupe(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
