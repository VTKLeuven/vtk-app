import type { AppPlanning, AppPlanningExam, AppPlanningTask } from '../api/contract';
import { addDays, daysBetween, mondayOf } from './grid';

/**
 * De blokkalender, zoals het tabblad Blok in de planner van Burgieclan
 * (`frontend/src/components/study-planner/block/model.ts`): een kleur per vak,
 * wat er op elke dag staat (examens, taken, een vrije dag), hoe ver elk vak
 * staat, en het volgende examen. Er wordt niets voor iemand gepland; hij vult
 * het zelf in.
 */

export type BlokCourse = {
  /** "course:<id>" of "name:<naam>". */
  key: string;
  label: string;
  /** Index in `COURSE_COLORS`. */
  colour: number;
  /** Het eerste examen vanaf vandaag, anders het laatste. */
  exam: AppPlanningExam | null;
  tasks: number;
  done: number;
  /** Voorbij en niet afgevinkt. */
  missed: number;
};

export type BlokDay = { date: string; exams: AppPlanningExam[]; tasks: AppPlanningTask[]; free: boolean };

export type BlokView = {
  today: string;
  /** Vakken met een examen of een taak; die met een examen eerst, op datum. */
  courses: BlokCourse[];
  course: (key: string | null) => BlokCourse | null;
  /** Wat je kan kiezen bij een vak: eerst de eigen vakken, dan die uit het lessenrooster. */
  options: { key: string; label: string }[];
  day: (date: string) => BlokDay;
  /** Taken die voorbij zijn en niet afgevinkt, oudste eerst. */
  missed: AppPlanningTask[];
  next: { exam: AppPlanningExam; days: number } | null;
  empty: boolean;
};

const EMPTY_BLOCK = { exams: [], tasks: [], freeDays: [] };

export function buildBlok(planning: AppPlanning): BlokView {
  const { exams, tasks, freeDays } = planning.block ?? EMPTY_BLOCK;
  const today = planning.today;

  const byKey = new Map<string, BlokCourse>();
  const add = (key: string, label: string) => {
    let course = byKey.get(key);
    if (!course) {
      course = { key, label, colour: 0, exam: null, tasks: 0, done: 0, missed: 0 };
      byKey.set(key, course);
    }
    return course;
  };
  for (const exam of exams) {
    const c = add(exam.subject, exam.subjectLabel);
    if (!c.exam || (c.exam.date < today && exam.date >= today)) c.exam = exam;
  }
  for (const task of tasks) {
    if (!task.subject) continue;
    const c = add(task.subject, task.subjectLabel ?? task.subject);
    c.tasks++;
    if (task.done) c.done++;
    else if (task.date < today) c.missed++;
  }
  const courses = [...byKey.values()].sort((a, b) => {
    if (a.exam && b.exam) return a.exam.date.localeCompare(b.exam.date) || a.label.localeCompare(b.label);
    if (a.exam || b.exam) return a.exam ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  courses.forEach((c, i) => (c.colour = i));

  const options = courses.map((c) => ({ key: c.key, label: c.label }));
  for (const s of planning.subjects) if (!byKey.has(s.key)) options.push({ key: s.key, label: s.label });

  const free = new Set(freeDays);
  const group = <T extends { date: string }>(list: T[]) => {
    const map = new Map<string, T[]>();
    for (const x of list) map.set(x.date, [...(map.get(x.date) ?? []), x]);
    return map;
  };
  const examsOn = group(exams);
  const tasksOn = group(tasks);
  const upcoming = exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  return {
    today,
    courses,
    course: (key) => (key ? (byKey.get(key) ?? null) : null),
    options,
    day: (date) => ({ date, exams: examsOn.get(date) ?? [], tasks: tasksOn.get(date) ?? [], free: free.has(date) }),
    missed: tasks.filter((t) => !t.done && t.date < today).sort((a, b) => a.date.localeCompare(b.date)),
    next: upcoming.length > 0 ? { exam: upcoming[0], days: daysBetween(today, upcoming[0].date) } : null,
    empty: exams.length === 0 && tasks.length === 0 && freeDays.length === 0,
  };
}

/** De weken van een maand, maandag tot zondag; `month` is "YYYY-MM". */
export function monthWeeks(month: string): string[][] {
  const weeks: string[][] = [];
  for (let monday = mondayOf(`${month}-01`); monday.slice(0, 7) <= month; monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
  }
  return weeks;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "vandaag", "morgen", "over 12 dagen". */
export function dayDistance(date: string, today: string): string {
  const days = daysBetween(today, date);
  if (days === 0) return 'vandaag';
  if (days === 1) return 'morgen';
  if (days > 1) return `over ${days} dagen`;
  if (days === -1) return 'gisteren';
  return `${-days} dagen geleden`;
}
