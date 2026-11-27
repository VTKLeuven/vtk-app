import { useMemo } from 'react';

import type { AppPublication } from '../api/contract';
import { mediaUrl } from '../api/client';
import { PhotoViewer, type ViewerPhoto } from './PhotoViewer';

/**
 * De lezer: elke bladzijde als beeld in de fotoviewer, dus vegen om te bladeren,
 * knijpen of dubbeltikken om te lezen, en omlaag vegen om te sluiten. De
 * bladzijden tekent de server uit de pdf (`pages` in het contract).
 */
export function MagazineReader({
  publication,
  page,
  onPageChange,
  onClose,
}: {
  publication: AppPublication | null;
  page: number | null;
  onPageChange: (page: number) => void;
  onClose: () => void;
}) {
  const pages = useMemo<ViewerPhoto[]>(
    () =>
      (publication?.pages ?? []).map((url, index, all) => ({
        id: `${publication?.id}-${index + 1}`,
        url: mediaUrl(url) as string,
        // De kaft hangt al in de cache van de plank; bladzijde 1 staat er zo meteen.
        thumbUrl: index === 0 ? mediaUrl(publication?.coverUrl ?? null) : null,
        filename: `Bladzijde ${index + 1} van ${all.length}`,
      })),
    [publication],
  );

  return (
    <PhotoViewer
      photos={pages}
      index={pages.length > 0 ? page : null}
      onIndexChange={onPageChange}
      onClose={onClose}
    />
  );
}

