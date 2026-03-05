import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { differenceInCalendarDays } from "date-fns"
import { toZonedTime, fromZonedTime } from "date-fns-tz"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Calculate Days to Expiration (DTE) from an expiry date using US Eastern Time.
 * Handles Daylight Saving Time automatically.
 * @param expiry - Date object or date string (YYYY-MM-DD)
 * @returns Number of days until expiration, or null if invalid/empty
 */
export function calculateDte(expiry: string | Date | null | undefined): number | null {
  if (!expiry) return null;
  
  try {
    // Parse expiry as Eastern Time midnight (timezone-agnostic)
    let expiryMidnightET: Date;
    
    if (typeof expiry === 'string') {
      // Parse YYYY-MM-DD directly as Eastern Time midnight
      const parts = expiry.split('-').map(p => parseInt(p, 10));
      if (parts.length !== 3 || parts.some(p => isNaN(p))) return null;
      const isoString = `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}T00:00:00`;
      expiryMidnightET = fromZonedTime(isoString, 'America/New_York');
    } else {
      // Convert Date to ET, extract date parts, rebuild as ET midnight
      const zonedExpiry = toZonedTime(expiry, 'America/New_York');
      const y = zonedExpiry.getFullYear();
      const m = String(zonedExpiry.getMonth() + 1).padStart(2, '0');
      const d = String(zonedExpiry.getDate()).padStart(2, '0');
      const isoString = `${y}-${m}-${d}T00:00:00`;
      expiryMidnightET = fromZonedTime(isoString, 'America/New_York');
    }
    
    if (isNaN(expiryMidnightET.getTime())) return null;
    
    // Get current date at midnight ET
    const nowZoned = toZonedTime(new Date(), 'America/New_York');
    const y = nowZoned.getFullYear();
    const m = String(nowZoned.getMonth() + 1).padStart(2, '0');
    const d = String(nowZoned.getDate()).padStart(2, '0');
    const todayMidnightET = fromZonedTime(`${y}-${m}-${d}T00:00:00`, 'America/New_York');
    
    // Both dates are now UTC timestamps representing ET midnights
    return differenceInCalendarDays(expiryMidnightET, todayMidnightET);
  } catch {
    return null;
  }
}
