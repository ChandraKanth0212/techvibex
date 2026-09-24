/**
 * RailOpt UI formatting helpers
 */

export function formatTime(isoString?: string): string {
  if (!isoString) return '--:--';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      // If it's a string like 2026-09-25T02:00:00Z, extract substring
      if (isoString.includes('T')) {
        return isoString.split('T')[1].substring(0, 5);
      }
      return isoString;
    }
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return isoString.substring(11, 16) || isoString;
  }
}

export function formatDate(dateString?: string): string {
  if (!dateString) return '---';
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }
  return dateString;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return remainingMins > 0 ? `${hrs}h ${remainingMins}m` : `${hrs}h`;
}
