/**
 * Duration utilities for experience filtering.
 * Converts various duration formats to minutes for reliable numeric comparison.
 */

/** Duration filter preset ranges in minutes */
export const DURATION_RANGES: Record<string, { label: string; min: number; max: number | null }> = {
  short: { label: 'Under 2 hours', min: 0, max: 120 },
  'half-day': { label: '2–4 hours', min: 120, max: 240 },
  'full-day': { label: '4–8 hours', min: 240, max: 480 },
  'multi-day': { label: 'Multi-day', min: 480, max: null },
};

/**
 * Parse a duration string to total minutes.
 * Handles:
 * - ISO 8601: "PT3H30M", "PT210M", "P1D", "P2DT4H"
 * - Formatted: "3 hours", "3h 30m", "1 day", "30 min", "2 hours 30 minutes"
 * - Numeric: 210 (already minutes)
 */
export function parseDurationToMinutes(duration: string | number | null | undefined): number {
  if (duration == null) return 0;
  if (typeof duration === 'number') return duration;

  const str = String(duration).trim();
  if (!str) return 0;

  // Try ISO 8601 first: P1DT3H30M, PT210M, PT3H, etc.
  const isoMatch = str.toUpperCase().match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (isoMatch) {
    const days = parseInt(isoMatch[1] || '0', 10);
    const hours = parseInt(isoMatch[2] || '0', 10);
    const minutes = parseInt(isoMatch[3] || '0', 10);
    return days * 24 * 60 + hours * 60 + minutes;
  }

  // Try formatted text: "3h 30m", "3 hours 30 minutes", "1 day", "30 min"
  let totalMinutes = 0;
  const lower = str.toLowerCase();

  const dayMatch = lower.match(/(\d+)\s*day/);
  if (dayMatch?.[1]) totalMinutes += parseInt(dayMatch[1], 10) * 24 * 60;

  const hourMatch = lower.match(/(\d+)\s*h(?:our)?s?/);
  if (hourMatch?.[1]) totalMinutes += parseInt(hourMatch[1], 10) * 60;

  const minMatch = lower.match(/(\d+)\s*m(?:in(?:ute)?s?)?(?!\w)/);
  if (minMatch?.[1]) totalMinutes += parseInt(minMatch[1], 10);

  return totalMinutes;
}

/**
 * Classify a duration (in minutes) into a filter preset key.
 */
export function classifyDuration(minutes: number): string | null {
  if (minutes <= 0) return null;
  for (const [key, range] of Object.entries(DURATION_RANGES)) {
    if (minutes >= range.min && (range.max === null || minutes < range.max)) {
      return key;
    }
  }
  return null;
}
