import type { AppPlanning, AppPlanningSession } from '../api/contract';
import { addDays, daysBetween, mondayOf, toneOf, type Tone } from './grid';

/**
 * Het overzicht van een semester, zoals de tabbladen "Per vak" en "Semester" in
 * de planner van Burgieclan (`frontend/src/components/study-planner/model.ts`):
 * per vak wat afgevinkt is, wat voorbij is maar niet afgevinkt ("in te halen")
 * en wat nog moet komen. Verborgen lessen tellen niet mee.
 *
 * Dezelfde regels als op Burgieclan, zodat beide hetzelfde getal tonen. Puur,
 * zonder React.
 */

export type OverviewSession = {
  session: AppPlanningSession;
  tone: Tone;
  /** Lesweek in het semester, vanaf 1. */
  week: number;
  past: boolean;
  /** Voorbij en niet afgevinkt. */
  missed: boolean;
  mandatory: boolean;
};

export type CourseRow = {
  key: string;
  label: string;
  sessions: OverviewSession[];
  past: number;
  done: number;
  missed: number;
  upcoming: number;
  mandatoryLeft: number;
  next: OverviewSession | null;
};

export type Totals = { past: number; done: number; missed: number; upcoming: number; mandatoryLeft: number };

export type SemesterView = {
  key: string;
  /** De maandag van elke lesweek, van de eerste tot de laatste met lessen. */
  mondays: string[];
  /** De lesweek van vandaag, of null wanneer vandaag buiten de kolommen valt. */
  current: number | null;
  /** De lesweek van de eerste kolom. */
  firstWeek: number;
  totalWeeks: number;
  firstDate: string;
  lastDate: string;
  rows: CourseRow[];
  totals: Totals;
};

/** "2026-1" voor augustus tot januari, "2027-2" voor februari tot juli. */
export function semesterKey(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (month >= 8) return `${year}-1`;
  if (month === 1) return `${year - 1}-1`;
  return `${year}-2`;
}

/** "Semester 1", "Semester 2". */
export function semesterName(key: string): string {
  return `Semester ${key.slice(-1)}`;
}

/** "Semester 1, 2026-2027". */
export function semesterLabel(key: string): string {
  const year = Number(key.slice(0, 4));
  const academic = key.endsWith('-1') ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  return `${semesterName(key)}, ${academic}`;
}

/**
 * De maandag van de eerste lesweek volgens het patroon van KU Leuven: semester 1
 * begint op de maandag van 20 tot 26 september, semester 2 op die van 8 tot 14
 * februari. Niet af te leiden uit de lessen zelf: de feed reikt maar een paar
 * weken terug.
 */
function teachingStart(key: string): string {
  const [year, semester] = key.split('-');
  const from = semester === '1' ? `${year}-09-20` : `${year}-02-08`;
  const monday = mondayOf(from);
  return monday < from ? addDays(monday, 7) : monday;
}

const FIRST_SEMESTER_WEEKS = 13;

const visible = (planning: AppPlanning) =>
  planning.sessions.filter((s) => s.hidden === null).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

export function semesterKeys(planning: AppPlanning): string[] {
  return [...new Set(visible(planning).map((s) => semesterKey(s.date)))].sort();
}

/** Het semester van vandaag, anders het volgende met lessen, anders het laatste. */
export function defaultSemester(planning: AppPlanning, keys: string[]): string | null {
  const now = semesterKey(planning.today);
  if (keys.includes(now)) return now;
  return keys.find((k) => k > now) ?? keys[keys.length - 1] ?? null;
}

function isPast(s: AppPlanningSession, today: string, now: number): boolean {
  return s.date < today || (s.date === today && s.endMin <= now);
}

export function buildSemester(planning: AppPlanning, key: string, now: number): SemesterView | null {
  const sessions = visible(planning).filter((s) => semesterKey(s.date) === key);
  if (sessions.length === 0) return null;
  const firstDate = sessions[0].date;
  const lastDate = sessions[sessions.length - 1].date;
  const first = mondayOf(firstDate);
  const weeks = daysBetween(first, mondayOf(lastDate)) / 7 + 1;
  const mondays = Array.from({ length: weeks }, (_, i) => addDays(first, 7 * i));
  const start = teachingStart(key);
  const firstWeek = first >= start ? daysBetween(start, first) / 7 + 1 : 1;
  const weekOf = (date: string) => firstWeek + daysBetween(first, mondayOf(date)) / 7;
  const todayWeek = weekOf(planning.today);
  const current = todayWeek >= firstWeek && todayWeek < firstWeek + weeks ? todayWeek : null;
  const totalWeeks = Math.max(firstWeek + weeks - 1, key.endsWith('-1') && first >= start ? FIRST_SEMESTER_WEEKS : 0);

  const totals: Totals = { past: 0, done: 0, missed: 0, upcoming: 0, mandatoryLeft: 0 };
  const rows: CourseRow[] = [];
  const labels = new Map(planning.subjects.map((s) => [s.key, s.label]));
  const order = [...planning.subjects.map((s) => s.key)];
  for (const s of sessions) if (!order.includes(s.subject)) order.push(s.subject);

  for (const subject of order) {
    const own = sessions.filter((s) => s.subject === subject);
    if (own.length === 0) continue;
    const list: OverviewSession[] = own.map((session) => {
      const past = isPast(session, planning.today, now);
      return {
        session,
        tone: toneOf(session.type),
        week: weekOf(session.date),
        past,
        missed: past && !session.done,
        mandatory: session.mandatory !== null,
      };
    });
    const past = list.filter((s) => s.past).length;
    const done = list.filter((s) => s.past && s.session.done).length;
    const row: CourseRow = {
      key: subject,
      label: labels.get(subject) ?? own[0].course,
      sessions: list,
      past,
      done,
      missed: past - done,
      upcoming: list.length - past,
      mandatoryLeft: list.filter((s) => !s.past && s.mandatory).length,
      next: list.find((s) => !s.past) ?? null,
    };
    totals.past += row.past;
    totals.done += row.done;
    totals.missed += row.missed;
    totals.upcoming += row.upcoming;
    totals.mandatoryLeft += row.mandatoryLeft;
    rows.push(row);
  }
  return { key, mondays, current, firstWeek, totalWeeks, firstDate, lastDate, rows, totals };
}
