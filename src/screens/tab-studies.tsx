import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { BlokkenView } from '../components/studies/BlokkenView';
import { BurgieclanView } from '../components/studies/BurgieclanView';
import { CudiView } from '../components/studies/CudiView';
import { STUDIES_TABS, type StudiesTab, type StudiesTabs } from '../components/studies/tabs';
import { useApp } from '../state/app';
import { useTabParam } from '../useTabParam';
import { useTrackView } from '../usage';

/**
 * Studies: alles rond je vakken, in drie tabbladen in de kop.
 *
 * - **Blokken** is samen blokken, zoals de tab vroeger heette (Studeren).
 * - **Cudi** is de cursusdienst, cudi.vtk.be: je cursussen reserveren, zien wat er
 *   klaarligt en tot wanneer, en de uren van deze week.
 * - **Burgieclan** zijn de documenten van je vakken: samenvattingen, examens,
 *   oplossingen.
 *
 * Cudi en Burgieclan zijn aparte sites met een eigen login. De app logt daar
 * niet in: vtk.be spreekt namens jou met allebei (ondertekend, zie
 * `lib/cudi/client.ts` en `lib/burgieclan/client.ts` op de site), zodat je hier
 * met je VTK-account alles ziet zonder tweede aanmelding. Daarom zien ze eruit
 * als de rest van de app en niet als een website in een kader: het zijn gewone
 * schermen op gewone gegevens. Wat bewust op hun eigen site blijft (uploaden en
 * stemmen op Burgieclan, je vakken aanduiden en tweedehands op cudi), opent daar.
 *
 * Een tabblad verdwijnt niet wanneer de koppeling ontbreekt; het zegt het. Een
 * pil die er de ene keer wel en de andere keer niet staat, leert niemand vinden.
 */
export default function StudiesScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const { bootstrap } = useApp();
  const [tab, setTab] = useState<StudiesTab>(() =>
    (STUDIES_TABS as readonly string[]).includes(params.tab ?? '') ? (params.tab as StudiesTab) : 'blokken',
  );
  useTabParam<StudiesTab>(params.tab, STUDIES_TABS, setTab);
  useTrackView(`studies:${tab}`);

  const abilities = bootstrap?.abilities;
  const tabs: StudiesTabs = {
    value: tab,
    onChange: setTab,
    options: [
      { value: 'blokken', label: 'Blokken' },
      { value: 'cudi', label: 'Cudi' },
      { value: 'burgieclan', label: 'Burgieclan' },
    ],
  };

  if (tab === 'cudi') return <CudiView tabs={tabs} linked={abilities?.cudi !== false} />;
  if (tab === 'burgieclan') return <BurgieclanView tabs={tabs} linked={abilities?.burgieclan !== false} />;
  return <BlokkenView tabs={tabs} />;
}
