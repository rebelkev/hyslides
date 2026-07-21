const BLOCKED_WORDS = new Set([
  "asshole", "bastard", "bitch", "bullshit", "cunt", "dick", "fag", "faggot",
  "fuck", "motherfucker", "nigga", "nigger", "piss", "porn", "retard", "shit",
  "slut", "whore",
]);

const BLOCKED_PHRASES = ["kill yourself", "go kill yourself"];

const LEET_CHARACTERS = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s",
};

export function containsBlockedLanguage(value) {
  const normalized = normalizeModerationText(value);
  if (!normalized) return false;
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.some((token) => BLOCKED_WORDS.has(token))) return true;
  const padded = ` ${tokens.join(" ")} `;
  return BLOCKED_PHRASES.some((phrase) => padded.includes(` ${phrase} `));
}

export function normalizeModerationText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[013457@$]/g, (character) => LEET_CHARACTERS[character] || character)
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
