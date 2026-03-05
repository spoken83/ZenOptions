import { fromZonedTime, format, toZonedTime } from "date-fns-tz";

const ET_TIMEZONE = "America/New_York";

export function getUserTimezoneAbbr(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone.includes("Singapore") || timezone.includes("Asia/Singapore")) return "SGT";
  if (timezone.includes("Hong_Kong") || timezone.includes("Asia/Hong_Kong")) return "HKT";
  if (timezone.includes("London") || timezone.includes("Europe/London")) return "GMT";
  if (timezone.includes("Los_Angeles") || timezone.includes("America/Los_Angeles")) return "PT";
  if (timezone.includes("Chicago") || timezone.includes("America/Chicago")) return "CT";
  if (timezone.includes("Denver") || timezone.includes("America/Denver")) return "MT";
  if (timezone.includes("New_York") || timezone.includes("America/New_York")) return "ET";
  if (timezone.includes("Tokyo") || timezone.includes("Asia/Tokyo")) return "JST";
  if (timezone.includes("Sydney") || timezone.includes("Australia/Sydney")) return "AEST";
  return timezone.split("/").pop()?.replace("_", " ") || "Local";
}

function calculateDayOffset(date: Date): string {
  const etZoned = toZonedTime(date, ET_TIMEZONE);
  const etYear = etZoned.getFullYear();
  const etMonth = etZoned.getMonth();
  const etDay = etZoned.getDate();
  
  const localYear = date.getFullYear();
  const localMonth = date.getMonth();
  const localDay = date.getDate();
  
  const etDateAtNoon = new Date(Date.UTC(etYear, etMonth, etDay, 12, 0, 0));
  const localDateAtNoon = new Date(Date.UTC(localYear, localMonth, localDay, 12, 0, 0));
  
  const dayDiffMs = localDateAtNoon.getTime() - etDateAtNoon.getTime();
  const dayDiff = Math.round(dayDiffMs / (1000 * 60 * 60 * 24));
  
  if (dayDiff > 0) return " +1";
  if (dayDiff < 0) return " -1";
  return "";
}

export function formatTimestampInET(timestamp: Date | string | number): {
  etDisplay: string;
  localDisplay: string;
  combined: string;
} {
  const date = new Date(timestamp);
  
  const etDisplay = format(date, "MMM d, HH:mm", { timeZone: ET_TIMEZONE });
  
  const localHours = date.getHours();
  const localMinutes = date.getMinutes();
  const localTime = `${String(localHours).padStart(2, "0")}:${String(localMinutes).padStart(2, "0")}`;
  
  const dayOffset = calculateDayOffset(date);
  
  const tzAbbr = getUserTimezoneAbbr();
  const localDisplay = `${localTime}${dayOffset}`;
  
  if (tzAbbr === "ET") {
    return {
      etDisplay,
      localDisplay,
      combined: `${etDisplay} ET`,
    };
  }
  
  return {
    etDisplay,
    localDisplay,
    combined: `${etDisplay} ET (${localDisplay} ${tzAbbr})`,
  };
}

export function formatDateTimeInET(timestamp: Date | string | number): string {
  const date = new Date(timestamp);
  
  const etDisplay = format(date, "MMM d, yyyy, HH:mm:ss", { timeZone: ET_TIMEZONE });
  
  const tzAbbr = getUserTimezoneAbbr();
  
  if (tzAbbr === "ET") {
    return `${etDisplay} ET`;
  }
  
  const localDisplay = format(date, "HH:mm:ss");
  const dayOffset = calculateDayOffset(date);
  
  return `${etDisplay} ET (${localDisplay}${dayOffset} ${tzAbbr})`;
}

export function convertETtoLocal(etTime: string): string {
  if (!etTime) return "";
  const [hours, minutes] = etTime.split(":").map(Number);
  
  const now = new Date();
  const etDateStr = format(now, "yyyy-MM-dd", { timeZone: ET_TIMEZONE });
  
  const etDateTimeStr = `${etDateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  
  const utcInstant = fromZonedTime(etDateTimeStr, ET_TIMEZONE);
  
  const localHours = utcInstant.getHours();
  const localMinutes = utcInstant.getMinutes();
  
  const localYear = utcInstant.getFullYear();
  const localMonth = utcInstant.getMonth();
  const localDay = utcInstant.getDate();
  
  const [etYear, etMonth, etDay] = etDateStr.split("-").map(Number);
  
  const etDateObj = new Date(Date.UTC(etYear, etMonth - 1, etDay, 12, 0, 0));
  const localDateObj = new Date(Date.UTC(localYear, localMonth, localDay, 12, 0, 0));
  
  const dayDiffMs = localDateObj.getTime() - etDateObj.getTime();
  const dayDiff = Math.round(dayDiffMs / (1000 * 60 * 60 * 24));
  
  let dayOffset = "";
  if (dayDiff > 0) {
    dayOffset = " +1";
  } else if (dayDiff < 0) {
    dayOffset = " -1";
  }
  
  return `${String(localHours).padStart(2, "0")}:${String(localMinutes).padStart(2, "0")}${dayOffset}`;
}
