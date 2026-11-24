/**
 * club-search.ts: the "Search BeachSync" button for club questions (Entry 34).
 *
 * BeachSync (csulb.campuslabs.com, run by Campus Labs, outside csulb.edu) has CSULB's full list of
 * student organizations. Its robots.txt doesn't allow automated access to its data, so we never
 * fetch or store anything from it. We only link to its search page, pre-filled with a short keyword
 * Gemini picks from the student's words ("chess", "Cambodian"). The app builds the link itself;
 * Gemini never writes it. Club listings there are written by the student organizations.
 */
export const BEACHSYNC_SEARCH_URL = "https://csulb.campuslabs.com/engage/organizations";

export type BeachSyncSearch = { term: string; url: string };

// Only show the button when the question is about finding a club, a group, or a community.
// (A safety check on Gemini's club_search, so an unrelated question never gets a club button.)
const CLUB_WORDS = /\b(clubs?|organi[sz]ations?|orgs?|student groups?|groups?|involved|join(ing)?|societ(y|ies)|associations?|fraternit(y|ies)|sororit(y|ies)|chapters?|communit(y|ies)|cultur(e|es|al)|heritage|meet (other|people)|make friends)\b/i;

export function isClubQuestion(text: string) {
  return CLUB_WORDS.test(text);
}

/**
 * Turn Gemini's keyword into a BeachSync search, or null if there's no usable keyword or the
 * question isn't about clubs. The keyword keeps only letters, numbers, spaces, and hyphens
 * (at most 3 words, 40 characters), so nothing odd ends up in the link.
 */
export function beachSyncSearch(rawTerm: unknown, question: string): BeachSyncSearch | null {
  if (typeof rawTerm !== "string" || !isClubQuestion(question)) return null;
  const term = rawTerm
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\b(clubs?|organi[sz]ations?|orgs?)\b/gi, " ") // "chess club" -> "chess": the search is already for clubs
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ")
    .slice(0, 40)
    .trim();
  if (term.length < 2) return null;
  return { term, url: `${BEACHSYNC_SEARCH_URL}?query=${encodeURIComponent(term)}` };
}
