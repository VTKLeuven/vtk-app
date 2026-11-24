import type { HeadTab } from '../PageHead';

/** De drie tabbladen van Studies, als pillen in de kop. */
export type StudiesTab = 'blokken' | 'cudi' | 'burgieclan';

export type StudiesTabs = {
  options: HeadTab<StudiesTab>[];
  value: StudiesTab;
  onChange: (next: StudiesTab) => void;
};

export const STUDIES_TABS: readonly StudiesTab[] = ['blokken', 'cudi', 'burgieclan'];
