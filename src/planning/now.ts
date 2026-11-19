const nowFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Vandaag en het uur in Leuven, wat de klok van de telefoon ook zegt. In dezelfde
 * vorm als de planning ze stuurt ("YYYY-MM-DD" en minuten sinds middernacht), zodat
 * een planning uit de leescache van gisteren niet als die van vandaag leest.
 */
export function nowInLeuven(): { date: string; minutes: number } {
  const parts = nowFormat.formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}
