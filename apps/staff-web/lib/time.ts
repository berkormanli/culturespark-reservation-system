const ISTANBUL_LOCALE = "tr-TR";
const ISTANBUL_TIME_ZONE = "Europe/Istanbul";

export const toIstanbulDateTimeLabel = (isoString: string): string =>
  new Intl.DateTimeFormat(ISTANBUL_LOCALE, {
    timeZone: ISTANBUL_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(isoString));

export const toIstanbulTimeLabel = (isoString: string): string =>
  new Intl.DateTimeFormat(ISTANBUL_LOCALE, {
    timeZone: ISTANBUL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoString));

export const toDateInputValue = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: ISTANBUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export const toDateTimeInputValue = (isoString: string): string => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISTANBUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(isoString));
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")}T${lookup.get("hour")}:${lookup.get("minute")}`;
};

export const fromDateTimeInputToIso = (value: string): string =>
  `${value}:00+03:00`;

export const getStartOfDayIso = (dateValue: string): string =>
  `${dateValue}T00:00:00+03:00`;

export const getEndOfDayIsoExclusive = (dateValue: string): string =>
  `${dateValue}T23:59:59+03:00`;

export const addDays = (dateValue: string, days: number): string => {
  const date = new Date(`${dateValue}T00:00:00+03:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateInputValue(date);
};
