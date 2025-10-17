export function getAvatarInitial(name: string) {
  if (!name) return "?"
  return name.trim()[0]?.toUpperCase() ?? "?"
}

export function normalizeHexColor(hex: string | null | undefined, fallback = "#14532D") {
  if (!hex) {
    return fallback
  }
  const normalized = hex.startsWith("#") ? hex : `#${hex}`
  if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return normalized.toUpperCase()
  }
  return fallback
}

export function getAvatarTextColor(hex: string | null | undefined, fallback = "#14532D") {
  const normalized = normalizeHexColor(hex, fallback)
  const value = normalized.slice(1)
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? "#0F172A" : "#FFFFFF"
}
