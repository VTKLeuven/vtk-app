import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { ChevronRight, ExternalLink, LockKeyhole } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ApiError } from '../api/client';
import type { AppAdminBoDue, AppAdminTile } from '../api/contract';
import { fetchAdminDashboard, openDoor } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { ErrorState, Loading, MarginRegister, SectionHeading, StaleNotice } from '../components/ui';
import { useTabRouter } from '../navigation';
import { useApp } from '../state/app';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from '../components/HomeSection';

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
 *
 * **Het ziet eruit als /admin op een telefoon** (`app/[locale]/admin/page.tsx`):
 * de deurkaart met het slotje, de kaart met de BO-resultaten met haar gele rand
 * links, en de snelkoppelingen in hun banen (een vierkantje navy voor "Voor
 * iedereen", geel voor je post, grijs voor wat van jou is) met de tegels onder
 * elkaar, de chip, de naam en de host. Op een telefoon is het raster van de site
 * (`minmax(180px, 1fr)`) één kolom breed, en dus hier ook.
 */
export default function BeheerScreen() {
  const router = useTabRouter();
  const { locale, viewer } = useApp();
  const resource = useResource('beheer', () => fetchAdminDashboard(locale), locale);
  const [door, setDoor] = useState<{ busy: boolean; message: string | null; ok: boolean }>({
    busy: false,
    message: null,
    ok: false,
  });

  const head = (
    <PageHead title="Dashboard" subtitle={viewer ? `Welkom, ${viewer.name.split(' ')[0]}.` : 'De admin van vtk.be'} />
  );

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
              <LockKeyhole size={20} color={COLORS.ink} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.doorTitle}>Deur</Text>
              <Text style={[styles.doorHint, door.message && !door.ok && styles.error, door.ok && styles.ok]}>
                {door.message ?? 'Open de voordeur op afstand.'}
              </Text>
            </View>
            <PillButton
              label={door.busy ? 'Openen...' : 'Deur openen'}
              primary
              disabled={door.busy}
              onPress={() => void pressDoor()}
            />
          </View>
        ) : null}

        {data.boDue.length > 0 ? <BoDue items={data.boDue} onOpen={openLink} adminUrl={data.adminUrl} /> : null}

        <View style={styles.block}>
          <View style={styles.tilesBar}>
            <Text style={styles.tilesTitle}>Snelkoppelingen</Text>
            {data.tilesUrl ? (
              <PillButton
                label="Aanpassen"
                onPress={() => openLink({ url: data.tilesUrl!, label: 'Snelkoppelingen', external: false })}
              />
            ) : null}
          </View>
          {tileSections.length === 0 ? (
            <Text style={styles.hint}>
              Nog geen tegels. Voeg er een toe of vraag een beheerder om standaardtegels.
            </Text>
          ) : null}
          {tileSections.map((section) => (
            <View key={section.label} style={styles.lane}>
              <View style={styles.laneHead}>
                <View
                  style={[
                    styles.laneDot,
                    section.kind === 'global' && styles.laneDotGlobal,
                    section.kind === 'group' && styles.laneDotGroup,
                  ]}
                />
                <Text style={styles.laneTitle} numberOfLines={1}>
                  {section.label}
                </Text>
                {section.hint ? (
                  <Text style={styles.laneSub} numberOfLines={1}>
                    {section.hint}
                  </Text>
                ) : null}
                <Text style={styles.laneCount}>{section.tiles.length}</Text>
              </View>
              <View style={styles.tiles}>
                {section.tiles.map((tile) => (
                  <Tile key={tile.id} tile={tile} onPress={() => openLink(tile)} />
                ))}
              </View>
            </View>
          ))}
        </View>

        {data.sections.length > 0 ? (
          <View style={styles.block}>
            <SectionHeading>Onderdelen</SectionHeading>
            {data.sections.map((section) => (
              <MarginRegister
                key={section.key}
                title={section.label}
                style={styles.group}
                links={section.links.map((link) => ({
                  label: link.label,
                  external: link.external,
                  onPress: () => openLink(link),
                }))}
              />
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

/** Een tegel zoals `.vtk-shortcut-tile`: de gekleurde chip, de naam, en de host gedempt eronder. */
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
      <Text style={styles.tileHost} numberOfLines={1}>
        {tile.host ?? hostOf(tile.url)}
      </Text>
      {tile.external ? <ExternalLink size={13} color={COLORS.muted} style={styles.tileExternal} /> : null}
    </Pressable>
  );
}

/** `.vtk-bo-due`: per post de activiteiten waarvan het resultaat nog naar het BO moet. */
function BoDue({
  items,
  onOpen,
  adminUrl,
}: {
  items: AppAdminBoDue[];
  onOpen: (link: { url: string; label: string; external: boolean }) => void;
  adminUrl: string;
}) {
  const posts = new Map<string, AppAdminBoDue[]>();
  for (const item of items) posts.set(item.post, [...(posts.get(item.post) ?? []), item]);
  const single = posts.size === 1;
  return (
    <View style={styles.bo}>
      <Text style={styles.boTitle}>Nog te brengen resultaten</Text>
      {[...posts.entries()].map(([post, list]) => (
        <View key={post} style={styles.boPost}>
          {!single ? <Text style={styles.boPostName}>{post}</Text> : null}
          {list.map((due, index) => {
            const external = !isSite(due.url, adminUrl);
            return (
              <Pressable
                key={`${due.activity}-${index}`}
                accessibilityRole="link"
                accessibilityLabel={external ? `${due.activity}, rekenblad openen in Drive` : due.activity}
                onPress={() => onOpen({ url: due.url, label: due.activity, external })}
                style={({ pressed }) => [styles.boRow, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text style={styles.boActivity}>{due.activity}</Text>
                  <Text style={styles.boMeta}>{due.detail}</Text>
                </View>
                {external ? (
                  <ExternalLink size={16} color={COLORS.muted} />
                ) : (
                  <ChevronRight size={16} color={COLORS.muted} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** `.vtk-tile-btn`: een pil met een rand, of navy gevuld. */
function PillButton({
  label,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.pill,
        primary && styles.pillPrimary,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Text style={[styles.pillLabel, primary && styles.pillLabelPrimary]}>{label}</Text>
    </Pressable>
  );
}

function groupTiles(tiles: AppAdminTile[]) {
  const sections = new Map<string, { kind?: AppAdminTile['sectionKind']; hint?: string; tiles: AppAdminTile[] }>();
  for (const tile of tiles) {
    const section = sections.get(tile.section) ?? { kind: tile.sectionKind, hint: tile.sectionHint, tiles: [] };
    section.tiles.push(tile);
    sections.set(tile.section, section);
  }
  return [...sections.entries()].map(([label, section]) => ({ label, ...section }));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
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
  content: { padding: SPACING.lg, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  block: { gap: SPACING.md },
  pressed: { opacity: 0.6 },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  error: { color: COLORS.dangerInk },
  ok: { color: COLORS.okInk, fontFamily: FONTS.semibold },

  door: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.lg,
    ...CARD_SHADOW,
  },
  doorIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorTitle: { fontFamily: FONTS.semibold, fontSize: 14, lineHeight: 20, color: COLORS.ink },
  doorHint: { ...TYPE.small, fontSize: 12, color: COLORS.muted },

  pill: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
    ...CARD_SHADOW,
  },
  pillPrimary: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  pillLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.ink },
  pillLabelPrimary: { color: COLORS.paper },

  bo: {
    gap: 10,
    paddingVertical: 16,
    paddingRight: 18,
    paddingLeft: 21,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  boTitle: { fontFamily: FONTS.semibold, fontSize: 16, lineHeight: 22, color: COLORS.ink },
  boPost: { gap: 4 },
  boPostName: {
    marginTop: 4,
    fontFamily: FONTS.bold,
    fontSize: 10.5,
    letterSpacing: 0.84,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  boRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  boActivity: { fontFamily: FONTS.semibold, fontSize: 14, lineHeight: 19, color: COLORS.ink },
  boMeta: { ...TYPE.small, fontSize: 12.5, color: COLORS.muted, fontVariant: ['tabular-nums'] },

  tilesBar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, justifyContent: 'space-between' },
  tilesTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  lane: { gap: 10, marginTop: SPACING.sm },
  laneHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  laneDot: { width: 7, height: 7, borderRadius: 2, backgroundColor: COLORS.muted },
  laneDotGlobal: { backgroundColor: COLORS.navy },
  laneDotGroup: { backgroundColor: COLORS.yellow },
  laneTitle: {
    flexShrink: 1,
    fontFamily: FONTS.bold,
    fontSize: 12,
    letterSpacing: 0.96,
    textTransform: 'uppercase',
    color: COLORS.ink,
  },
  laneSub: { flexShrink: 1, fontSize: 12, fontFamily: FONTS.regular, color: COLORS.muted },
  laneCount: {
    marginLeft: 'auto',
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.muted,
    fontVariant: ['tabular-nums'],
  },

  tiles: { gap: 14 },
  tile: {
    gap: 10,
    padding: 18,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    shadowColor: '#0A0F1F',
    shadowOpacity: 0.04,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 1,
  },
  tilePressed: { borderColor: 'rgba(14, 26, 54, 0.28)' },
  chip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipImage: { width: 28, height: 28 },
  tileLabel: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 18, letterSpacing: -0.15, color: COLORS.ink },
  tileHost: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.muted },
  tileExternal: { position: 'absolute', top: 18, right: 18 },

  group: { marginBottom: SPACING.sm },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
});
