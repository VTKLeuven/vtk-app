import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { ChevronRight, DoorOpen, ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ApiError } from '../api/client';
import type { AppAdminLink, AppAdminTile } from '../api/contract';
import { fetchAdminDashboard, openDoor } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { Button, ErrorState, Loading, SectionHeading, StaleNotice } from '../components/ui';
import { useTabRouter } from '../navigation';
import { useApp } from '../state/app';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * Beheer: de admin van vtk.be, voor wie er rechten voor heeft.
 *
 * Tot november 2026 zat de admin bewust niet in de app (regel 3). Wat er nu in
 * staat, is wat je met een telefoon in je hand doet als praesidiumlid: de deur
 * openen, zien wat je post nog naar het BO moet brengen, je snelkoppelingen, en
 * snel een onderdeel openen om iets na te kijken. Dat deel is native.
 *
 * **Een onderdeel zelf opent als de pagina van de site** (`/web`), zonder haar kop
 * en zijbalk. Dat is een keuze en geen achterstand: de admin is tientallen
 * schermen met tabellen, formulieren en bevestigingen, en elke regel erin hoort
 * op één plek te leven. De lijst hier is wel exact de zijbalk van /admin voor
 * jou: dezelfde groepen, dezelfde volgorde, gefilterd op je rechten door de
 * server (`visibleAdminNav`).
 */
export default function BeheerScreen() {
  const router = useTabRouter();
  const { locale } = useApp();
  const resource = useResource('beheer', () => fetchAdminDashboard(locale), locale);
  const [door, setDoor] = useState<{ busy: boolean; message: string | null; ok: boolean }>({
    busy: false,
    message: null,
    ok: false,
  });

  const head = <PageHead title="Beheer" subtitle="De admin van vtk.be" />;

  if (resource.loading && !resource.data) {
    return (
      <>
        {head}
        <Loading />
      </>
    );
  }
  if (!resource.data) {
    return (
      <>
        {head}
        <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
      </>
    );
  }

  const data = resource.data;

  const openLink = (link: { url: string; label: string; external: boolean }) => {
    if (link.external || !isSite(link.url, data.adminUrl)) void WebBrowser.openBrowserAsync(link.url);
    else router.push({ pathname: '/web', params: { url: link.url, title: link.label } });
  };

  const pressDoor = async () => {
    setDoor({ busy: true, message: null, ok: false });
    try {
      await openDoor();
      setDoor({ busy: false, message: 'De deur is open.', ok: true });
    } catch (error) {
      setDoor({ busy: false, message: doorError(error), ok: false });
    }
  };

  const tileSections = groupTiles(data.tiles);

  return (
    <>
      {head}
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />}
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {data.canOpenDoor ? (
          <View style={styles.door}>
            <View style={styles.doorIcon}>
              <DoorOpen size={22} color={COLORS.navy} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.title}>Voordeur</Text>
              <Text style={[styles.hint, door.message && !door.ok && styles.error]}>
                {door.message ?? 'Op afstand openen. Elke opening komt in het logboek.'}
              </Text>
            </View>
            <View style={styles.doorButton}>
              <Button label="Openen" busy={door.busy} onPress={() => void pressDoor()} />
            </View>
          </View>
        ) : null}

        {data.boDue.length > 0 ? (
          <View style={styles.block}>
            <SectionHeading>Nog te brengen resultaten</SectionHeading>
            <View style={styles.register}>
              {data.boDue.map((due, index) => (
                <Pressable
                  key={`${due.post}-${due.activity}-${index}`}
                  accessibilityRole="link"
                  onPress={() => openLink({ url: due.url, label: due.activity, external: !isSite(due.url, data.adminUrl) })}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{due.activity}</Text>
                    <Text style={styles.hint}>
                      {due.post} · {due.detail}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={COLORS.muted} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {tileSections.map((section) => (
          <View key={section.label} style={styles.block}>
            <SectionHeading>{section.label}</SectionHeading>
            <View style={styles.tiles}>
              {section.tiles.map((tile) => (
                <Tile key={tile.id} tile={tile} onPress={() => openLink(tile)} />
              ))}
            </View>
          </View>
        ))}

        {data.sections.length > 0 ? (
          <View style={styles.block}>
            <SectionHeading>Onderdelen</SectionHeading>
            {data.sections.map((section) => (
              <Register key={section.key} title={section.label} links={section.links} onOpen={openLink} />
            ))}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/web', params: { url: data.adminUrl, title: 'Beheer' } })}
          style={({ pressed }) => [styles.footer, pressed && styles.pressed]}
        >
          <Text style={styles.body}>Het dashboard zoals op de site</Text>
          <ChevronRight size={18} color={COLORS.muted} />
        </Pressable>
      </ScrollView>
    </>
  );
}

/** Een tegel zoals op het dashboard van /admin: de gekleurde chip met het pictogram, de naam eronder. */
function Tile({ tile, onPress }: { tile: AppAdminTile; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tile.external ? `${tile.label}, opent een browser` : tile.label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <View style={[styles.chip, { backgroundColor: tile.chip.background }]}>
        {tile.imageUrl ? (
          <Image source={{ uri: tile.imageUrl }} style={styles.chipImage} contentFit="contain" />
        ) : (
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path
              d={tile.iconPath}
              stroke={tile.chip.foreground}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        )}
      </View>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {tile.label}
      </Text>
      {tile.external ? <ExternalLink size={12} color={COLORS.muted} style={styles.tileExternal} /> : null}
    </Pressable>
  );
}

/** Een groep uit de zijbalk, als het register in de marge van de site. */
function Register({
  title,
  links,
  onOpen,
}: {
  title: string | null;
  links: AppAdminLink[];
  onOpen: (link: AppAdminLink) => void;
}) {
  return (
    <View style={styles.group}>
      {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
      <View style={styles.groupLine}>
        {links.map((link) => (
          <Pressable
            key={link.key}
            accessibilityRole={link.external ? 'link' : 'button'}
            accessibilityLabel={link.external ? `${link.label}, opent een browser` : link.label}
            onPress={() => onOpen(link)}
            hitSlop={4}
            style={({ pressed }) => [styles.groupRow, pressed && styles.pressed]}
          >
            <Text style={styles.groupLabel}>{link.label}</Text>
            {link.external ? <Text style={styles.hint}>↗</Text> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function groupTiles(tiles: AppAdminTile[]) {
  const sections = new Map<string, AppAdminTile[]>();
  for (const tile of tiles) {
    const list = sections.get(tile.section) ?? [];
    list.push(tile);
    sections.set(tile.section, list);
  }
  return [...sections.entries()].map(([label, list]) => ({ label, tiles: list }));
}

function isSite(url: string, adminUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(adminUrl).origin;
  } catch {
    return false;
  }
}

function doorError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Geen verbinding. Probeer het opnieuw.';
  switch (error.code) {
    case 'not_configured':
      return 'De deurscanner is nog niet ingesteld (Beheer, IT).';
    case 'unreachable':
      return 'De deurscanner is niet bereikbaar. Staat de Pi aan?';
    case 'pi_error':
      return 'De deurscanner gaf een fout terug.';
    case 'FORBIDDEN':
      return 'Je mag de deur niet op afstand openen.';
    default:
      return error.message;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  block: { gap: SPACING.md },
  pressed: { opacity: 0.6 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  error: { color: COLORS.dangerInk },

  door: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.yellow,
    padding: SPACING.lg,
  },
  doorIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorButton: { minWidth: 96 },

  register: { borderTopWidth: 1, borderTopColor: COLORS.line2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line2,
  },
  rowTitle: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  tile: {
    width: '31.5%',
    minHeight: 104,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  tilePressed: { backgroundColor: COLORS.paper2 },
  chip: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipImage: { width: 28, height: 28 },
  tileLabel: { fontFamily: FONTS.semibold, fontSize: 13, lineHeight: 17, color: COLORS.ink },
  tileExternal: { position: 'absolute', top: SPACING.sm, right: SPACING.sm },

  group: { gap: SPACING.xs, marginBottom: SPACING.sm },
  groupTitle: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: COLORS.ink,
  },
  groupLine: { borderLeftWidth: 1, borderLeftColor: COLORS.line2, paddingLeft: 14 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingVertical: 7,
  },
  groupLabel: { ...TYPE.body, color: COLORS.body },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
});
