export const CULTURESPARK_TIME_ZONE = "Europe/Istanbul";

export const formatInIstanbul = (
  value: Date | string,
  locale = "tr-TR",
): string => {
  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: CULTURESPARK_TIME_ZONE,
  }).format(date);
};

export const toRfc3339 = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);

  return date.toISOString();
};
