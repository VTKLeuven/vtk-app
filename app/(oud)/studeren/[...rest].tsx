// Gemaakt door scripts/genereer-routes.mjs. Pas src/navigation.ts aan.

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OudAdresInTab() {
  const { rest } = useLocalSearchParams<{ rest: string[] }>();
  const path = Array.isArray(rest) ? rest.join('/') : (rest ?? '');
  return <Redirect href={`/studies/${path}`} withAnchor />;
}
