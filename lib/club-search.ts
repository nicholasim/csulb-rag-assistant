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
export function beachSyncSearch(rawTerm: unknown, question: string, avoidNames: string[] = [], clubCheckText = question): BeachSyncSearch | null {
  // clubCheckText may include the rewritten search queries; the fallback topic uses only `question`
  // (the student's own words).
  if (!isClubQuestion(clubCheckText)) return null;
  // Entry 36: if Gemini left the keyword empty, use the student's own words for the topic.
  // Entry 37: also when Gemini's keyword is only generic words or part of an office or page name
  // ("life and development" from "Student Life & Development").
  const given = typeof rawTerm === "string" ? cleanTerm(rawTerm) : "";
  const usable = given.length >= 2 && !isGenericTerm(given) && !isPartOfName(given, avoidNames);
  const term = usable ? given : cleanTerm(topicFromQuestion(question));
  if (term.length < 2 || isGenericTerm(term)) return null;
  return { term, url: `${BEACHSYNC_SEARCH_URL}?query=${encodeURIComponent(term)}` };
}

// Words that say nothing about the topic ("is there a ... club for ... students").
const FILLER = /(?<![\p{L}'])(i'm|im|i've|i'd|is|are|there|any|anything|a|an|and|or|the|some|for|about|on|in|at|of|with|me|my|we|our|us|you|how|what|where|when|which|who|do|does|did|can|could|should|would|will|to|get|find|join|joining|start|starting|involved|here|campus|csulb|cal|state|long|beach|students?|majors?|people|i|good|cool|fun|other|related|clubs?|organi[sz]ations?|orgs?|societ(?:y|ies)|associations?|groups?|communit(?:y|ies)|cultures?|cultural|heritage|identity)(?![\p{L}'])/giu;
// Entry 37: words that alone are never a useful club search (they come from office and page names).
const GENERIC = /(?<![\p{L}'])(life|development|students?|centers?|centres?|offices?|resources?|services?|programs?|affairs|campus|communit(?:y|ies)|cultures?|cultural|and|of|the|for|clubs?|organi[sz]ations?|orgs?|groups?|csulb|university)(?![\p{L}'])/giu;
const stripFiller = (s: string) => s.replace(FILLER, " ").replace(/\s+/g, " ").trim();

/** True if nothing but generic words is left ("life and development", "student resources"). */
export function isGenericTerm(term: string) {
  return term.toLowerCase().replace(GENERIC, " ").trim() === "";
}

/**
 * True if the term is an office or page name, or a piece of one that has 2+ words including a
 * generic word ("life and development", "Black Resource Center"); "&" is read as "and". A single
 * real topic word that happens to be in a name ("LGBTQ" in "LGBTQ+ Resource Center") is kept.
 */
function isPartOfName(term: string, names: string[]) {
  const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const t = norm(term);
  const piece = t.split(" ").length >= 2 && t.split(" ").some((w) => isGenericTerm(w));
  return names.some((name) => norm(name) === t || (piece && ` ${norm(name)} `.includes(` ${t} `)));
}

/**
 * The topic of a club question in the student's own words (Entry 36): the words just before
 * "club/organization/society/association/group" ("is there an underwater basket weaving club" ->
 * "underwater basket weaving"), or after "clubs for/about" ("clubs for nursing students" -> "nursing").
 * Entry 37: with no club word ("I'm queer, where can I find community?"), whatever is left after
 * removing filler words, if that's 1 to 3 words ("queer").
 */
export function topicFromQuestion(question: string) {
  const text = question.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ");
  const before = text.match(/([\p{L}\p{N}\s'-]{2,60}?)\s+(clubs?|organi[sz]ations?|orgs?|societ(?:y|ies)|associations?|groups?)\b/u)?.[1] ?? "";
  const after = text.match(/\b(?:clubs?|organi[sz]ations?|orgs?|groups?)\s+(?:for|about|related to|on)\s+([\p{L}\p{N}\s'-]{2,60})/u)?.[1] ?? "";
  // The words right next to "club" are the topic, so keep the last 3 words before it.
  const fromBefore = stripFiller(before).split(" ").filter(Boolean).slice(-3).join(" ");
  const fromClubWords = fromBefore || stripFiller(after);
  if (fromClubWords) return fromClubWords;
  const rest = stripFiller(text).split(" ").filter(Boolean);
  return rest.length >= 1 && rest.length <= 3 ? rest.join(" ") : "";
}

/** Keep only letters, numbers, spaces and hyphens, at most 3 words and 40 characters. */
function cleanTerm(raw: string) {
  return raw
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\b(clubs?|organi[sz]ations?|orgs?)\b/gi, " ") // "chess club" -> "chess": the search is already for clubs
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ")
    .slice(0, 40)
    .trim();
}
