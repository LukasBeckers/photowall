// Allowed reaction emojis. Restricting the set keeps DB rows tidy and avoids
// abuse (e.g. someone reacting with a slur as a custom emoji).
export const REACTION_EMOJI = ['❤️', '😂', '🔥', '🎉', '😮'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

export function isAllowedEmoji(s: string): s is ReactionEmoji {
  return (REACTION_EMOJI as readonly string[]).includes(s);
}
