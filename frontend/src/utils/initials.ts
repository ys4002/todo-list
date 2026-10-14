/** Up to two upper-case initials from a display name; falls back to the first letter of `fallback`. */
export function initials(name: string, fallback = ''): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return fallback.trim().charAt(0).toUpperCase()
  const letters = words.length === 1 ? words[0].charAt(0) : words[0].charAt(0) + words[words.length - 1].charAt(0)
  return letters.toUpperCase()
}
