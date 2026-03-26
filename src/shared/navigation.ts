import type { OmniboxResolution, SearchProvider } from "./types";

const URL_PROTOCOL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;
const IP_ADDRESS_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/.*)?$/;
const LOCALHOST_PATTERN = /^localhost(?::\d+)?(?:\/.*)?$/i;

function normalizeCandidateUrl(input: string) {
  const trimmed = input.trim();

  if (!trimmed || /\s/.test(trimmed) && !URL_PROTOCOL_PATTERN.test(trimmed)) {
    return null;
  }

  if (URL_PROTOCOL_PATTERN.test(trimmed)) {
    try {
      return new URL(trimmed).toString();
    } catch {
      return null;
    }
  }

  const looksLikeHost =
    trimmed.includes(".") || IP_ADDRESS_PATTERN.test(trimmed) || LOCALHOST_PATTERN.test(trimmed);

  if (!looksLikeHost) {
    return null;
  }

  const prefix = LOCALHOST_PATTERN.test(trimmed) || IP_ADDRESS_PATTERN.test(trimmed) ? "http://" : "https://";

  try {
    return new URL(`${prefix}${trimmed}`).toString();
  } catch {
    return null;
  }
}

export function normalizeSearchProvider(searchProvider: unknown): SearchProvider {
  return searchProvider === "wikipedia" ? "wikipedia" : "google";
}

export function buildSearchUrl(query: string, provider: SearchProvider) {
  const encoded = encodeURIComponent(query.trim());

  switch (provider) {
    case "wikipedia":
      return `https://en.wikipedia.org/w/index.php?search=${encoded}`;
    case "google":
    default:
      return `https://www.google.com/search?q=${encoded}`;
  }
}

export function resolveOmniboxInput(input: string, provider: SearchProvider): OmniboxResolution {
  const normalizedInput = input.trim();
  const normalizedUrl = normalizeCandidateUrl(normalizedInput);

  if (normalizedUrl) {
    return {
      kind: "url",
      url: normalizedUrl,
      input: normalizedInput,
      query: null,
      origin: "omnibox-url"
    };
  }

  return {
    kind: "search",
    url: buildSearchUrl(normalizedInput, provider),
    input: normalizedInput,
    query: normalizedInput,
    origin: "search"
  };
}
