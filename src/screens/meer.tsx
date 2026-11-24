import { Image } from 'expo-image';

import * as WebBrowser from 'expo-web-browser';
import { ChevronDown, ChevronRight, ExternalLink, MessageSquare, Search } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { baseUrl } from '../api/client';
import type { AppLocale, AppNavTab } from '../api/contract';
import { CARD_SHADOW } from '../components/HomeSection';
import { PageHead } from '../components/PageHead';
import { ErrorState, Loading, MarginRegister, SectionHeading, StaleNotice, type RegisterLink } from '../components/ui';
import { nativeRouteFor, pageSlugFor } from '../nativeRoute';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * Meer: alles wat je opzoekt in plaats van doet.
 *
 * De vier tabs ervoor zijn werkwoorden (kijken wat er open is, plannen, kopen,
 * bestellen). Dit is het zelfstandig naamwoord: de mensen, de foto's, de piano,
 * de shiften, de hele CMS-boom uit het beheer, en je eigen profiel.
 *
 * In de vorm van de site (november 2026): je profiel als donker glas in de kop,
 * de snelkoppelingen als het register in de marge (een kleine kop in kapitalen,
 * een haarlijn links, gedempte links met lucht ertussen; geen witte groepen met
 * icoontjes), en de onderdelen van VTK als de tegels van een categoriepagina:
 * de foto links, de naam rechts.
 *
 * De structuur van de onderste helft komt uit `bootstrap` en dus uit `HeaderTab`
 * in het beheer. Er staat hier geen vaste lijst in de app: wie in de admin een
 * pagina publiceert, ziet ze meteen.
 *
 * **Alles wat een eigen scherm heeft, opent native.** Het CMS kent de app niet,
 * dus daar staat "Piano reserveren" als link naar `/piano`; `nativeRouteFor`
 * vertaalt dat naar het pianoscherm in plaats van naar een browser. Een browser
 * is de laatste optie, niet de eerste.
 */

type Link = RegisterLink;

export default function MeerScreen() {
  const router = useTabRouter();
  const { bootstrap, viewer, locale, loading, stale, error, refresh } = useApp();
  const [open, setOpen] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!bootstrap) {
    return (
      <ErrorState
        message={error?.message ?? 'De navigatie kon niet geladen worden.'}
        onRetry={() => void refresh()}
      />
    );
  }

  const openOnWeb = (href: string) => {
    const url = /^https?:\/\//i.test(href) ? href : `${baseUrl()}${href}`;
    void WebBrowser.openBrowserAsync(url);
  };

  const doen: Link[] = [
    ...(viewer ? [{ label: 'Bonnetjes', onPress: () => router.push('/bonnetjes') }] : []),
    { label: 'Shiften', onPress: () => router.push('/shiften') },
    { label: "Foto's", onPress: () => router.push('/media') },
    { label: 'Piano', onPress: () => router.push('/piano') },
    ...(viewer ? [{ label: 'Code scannen', onPress: () => router.push('/scannen') }] : []),
    // Enkel voor wie iets te scannen heeft; de rest heeft hier niets aan.
    ...(bootstrap?.abilities?.scanTickets
      ? [{ label: 'Tickets scannen', onPress: () => router.push('/deur') }]
      : []),
  ];
  const mensen: Link[] = [
    { label: 'Praesidium', onPress: () => router.push('/praesidium') },
    { label: 'Werkgroepen', onPress: () => router.push('/werkgroepen') },
    { label: "POC's", onPress: () => router.push('/pocs') },
    ...(viewer ? [{ label: 'Peilingen', onPress: () => router.push('/peilingen') }] : []),
  ];
  // Voor de kring: enkel voor wie er rechten voor heeft (`bootstrap.abilities`).
  // De cursusdienst en Burgieclan staan sinds november 2026 onder Studies, als
  // eigen schermen; hier stonden ze als link naar hun site.
  const kring: Link[] = [
    ...(bootstrap?.abilities?.admin
      ? [{ label: 'Beheer', hint: 'De admin van vtk.be', onPress: () => router.push('/beheer') }]
      : []),
    ...(bootstrap?.abilities?.transport
      ? [{ label: 'Transport', hint: 'De ritten van Logistiek', onPress: () => router.push('/vervoer') }]
      : []),
  ];

  return (
    <>
      <PageHead title="Meer" back={false}>
        {/* Jij, als witte kaart in de kop. Een eigen tab was dat niet waard: je
            opent je profiel een paar keer per jaar, niet een paar keer per dag. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={viewer ? `Profiel van ${viewer.name}` : 'Inloggen'}
          onPress={() => router.push(viewer ? '/profiel' : '/inloggen')}
          style={({ pressed }) => [styles.me, pressed && styles.pressedDark]}
        >
          {viewer?.avatarUrl ? (
            <Image cachePolicy="memory-disk" source={{ uri: viewer.avatarUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Text style={styles.initials}>{viewer ? initialsOf(viewer.name) : '?'}</Text>
            </View>
          )}
          <View style={styles.flex}>
            <Text style={styles.meName} numberOfLines={1}>
              {viewer?.name ?? 'Niet ingelogd'}
            </Text>
            <Text style={styles.meHint} numberOfLines={1}>
              {viewer ? 'Je profiel en meldingen' : 'Log in om te bestellen en tickets te kopen'}
            </Text>
          </View>
          <ChevronRight color={COLORS.muted} size={18} />
        </Pressable>

        {/* Feedback op de app gaat naar Dopl, het formulier zonder zijn eigen kop,
            in je taal en met je naam en e-mail al ingevuld als je ingelogd bent. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Feedback over de app geven"
          onPress={() =>
            router.push({ pathname: '/web', params: { url: feedbackUrl(locale, viewer), title: 'Feedback App' } })
          }
          style={({ pressed }) => [styles.search, pressed && styles.pressedDark]}
        >
          <View style={styles.searchIcon}>
            <MessageSquare color={COLORS.ink} size={15} />
          </View>
          <Text style={[styles.feedbackText, styles.flex]}>Feedback App</Text>
          <ChevronRight color={COLORS.muted} size={18} />
        </Pressable>

        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Zoeken"
          onPress={() => router.push('/zoeken')}
          style={({ pressed }) => [styles.search, pressed && styles.pressedDark]}
        >
          <View style={styles.searchIcon}>
            <Search color={COLORS.ink} size={15} />
          </View>
          <Text style={styles.searchText}>Zoeken op vtk.be</Text>
        </Pressable>
      </PageHead>

      <ScrollView contentContainerStyle={styles.content} style={styles.root}>
        {stale ? <StaleNotice onRetry={() => void refresh()} /> : null}

        <View style={styles.columns}>
          <MarginRegister title="Doen" links={doen} style={styles.flex} />
          <MarginRegister title="Mensen" links={mensen} style={styles.flex} />
        </View>
        {viewer ? (
          <MarginRegister
            title="Meldingen"
            links={[{ label: 'Wat je wil weten', hint: 'Broodjes, shiften, categorieën', onPress: () => router.push('/meldingen') }]}
          />
        ) : null}
        {kring.length > 0 ? <MarginRegister title="Voor de kring" links={kring} style={styles.flex} /> : null}

        <View style={styles.tiles}>
          <SectionHeading>Alles van VTK</SectionHeading>
          {bootstrap.tabs.map((tab) => (
            <TabTile
              key={tab.id}
              tab={tab}
              expanded={open === tab.id}
              onToggle={() => setOpen(open === tab.id ? null : tab.id)}
              onNative={(route) => {
                // `/studies?tab=cudi`: de query als parameter, anders komt het vraagteken in het pad.
                const [pathname, query] = route.split('?');
                router.push(query ? { pathname, params: Object.fromEntries(new URLSearchParams(query)) } : pathname);
              }}
              onCategory={() => router.push(`/categorie/${tab.slug}`)}
              onPage={(slug) => router.push(`/pagina/${slug}`)}
              onWeb={openOnWeb}
            />
          ))}
          {bootstrap.tabs.length === 0 ? (
            <Text style={styles.hint}>Er staan nog geen onderdelen klaar.</Text>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

/**
 * Een onderdeel van de site als de tegel van een categoriepagina: de foto links
 * (uit /admin/home), de naam rechts. Zonder foto het gestreepte vlak van de site.
 * Een onderdeel met items klapt uit en toont ze als register; een onderdeel met
 * een eigen scherm (Broodjes, Media) opent dat scherm.
 */
function TabTile({
  tab,
  expanded,
  onToggle,
  onNative,
  onCategory,
  onPage,
  onWeb,
}: {
  tab: AppNavTab;
  expanded: boolean;
  onToggle: () => void;
  onNative: (route: string) => void;
  onCategory: () => void;
  onPage: (slug: string) => void;
  onWeb: (href: string) => void;
}) {
  // Een onderdeel met een eigen adres (Shiften naar `/shift`, Cursusdienst naar
  // cudi.vtk.be) opent het scherm in de app als dat er is, en pas anders de browser.
  const tabNative = nativeRouteFor(tab.externalUrl ?? `/${tab.slug}`) ?? nativeRouteFor(`/${tab.slug}`);
  const external = Boolean(tab.externalUrl) && !tabNative;
  const expandable = !external && !tabNative && tab.children.length > 0;

  const openTab = () => {
    if (external) onWeb(tab.externalUrl as string);
    else if (tabNative) onNative(tabNative);
    else if (expandable) onToggle();
    else onCategory();
  };

  return (
    <View style={styles.tile}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tab.label}
        accessibilityState={{ expanded: expandable ? expanded : undefined }}
        onPress={openTab}
        style={({ pressed }) => [styles.tileHead, pressed && styles.pressed]}
      >
        {tab.imageUrl ? (
          <Image cachePolicy="memory-disk" source={{ uri: tab.imageUrl }} style={styles.tilePhoto} contentFit="cover" />
        ) : (
          <View style={[styles.tilePhoto, styles.striped]}>
            {Array.from({ length: 8 }, (_, index) => (
              <View key={index} style={[styles.stripe, { left: index * 16 - 30 }]} />
            ))}
          </View>
        )}
        <View style={styles.tileText}>
          <Text style={styles.tileLabel}>{tab.label}</Text>
          <Text style={styles.hint}>
            {external
              ? 'Opent een andere site'
              : expandable
                ? `${tab.children.length} ${tab.children.length === 1 ? 'onderdeel' : 'onderdelen'}`
                : 'Lees meer'}
          </Text>
        </View>
        {/* Een geel rondje met de pijl: het accent van de tegel. */}
        <View style={[styles.go, expanded && styles.goOpen]}>
          {external ? (
            <ExternalLink color={COLORS.ink} size={15} />
          ) : expandable ? (
            <ChevronDown color={expanded ? COLORS.yellow : COLORS.ink} size={17} style={expanded ? styles.chevronOpen : undefined} />
          ) : (
            <ChevronRight color={COLORS.ink} size={17} />
          )}
        </View>
      </Pressable>

      {expandable && expanded ? (
        <View style={styles.children}>
          {tab.children.map((child) => {
            // Ook een externe link kan een scherm in de app hebben (de winkel op cudi).
            const native = nativeRouteFor(child.href);
            const page = child.external ? null : pageSlugFor(child.href, tab.slug);

            return (
              <Pressable
                key={child.id}
                accessibilityRole="button"
                accessibilityLabel={child.label}
                onPress={() => {
                  if (native) onNative(native);
                  else if (page) onPage(page);
                  else onWeb(child.href);
                }}
                style={({ pressed }) => [styles.child, pressed && styles.pressed]}
              >
                <Text style={styles.childLabel}>{child.label}</Text>
                {/* Enkel wat de app echt verlaat, krijgt het pijltje naar buiten.
                    Een CMS-pagina en een native scherm blijven allebei binnen. */}
                {native || page ? (
                  <ChevronRight color={COLORS.muted} size={15} />
                ) : (
                  <ExternalLink color={COLORS.muted} size={15} />
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Het feedbackformulier van de app op Dopl (`?embed=1` laat zijn eigen kop weg). */
const FEEDBACK_FORM = 'https://dopl.vtk.be/f/dopl-app-feedback';

function feedbackUrl(locale: AppLocale, viewer: { name: string; email: string } | null): string {
  const params = new URLSearchParams({ embed: '1', lang: locale });
  if (viewer?.email) params.set('email', viewer.email);
  if (viewer?.name) params.set('name', viewer.name);
  return `${FEEDBACK_FORM}?${params.toString()}`;
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  pressedDark: { opacity: 0.7 },
  hint: { ...TYPE.small, color: COLORS.muted },

  me: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  avatar: { width: 44, height: 44, borderRadius: RADIUS.pill, backgroundColor: COLORS.yellow },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  meName: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
  meHint: { ...TYPE.small, fontSize: 13, color: COLORS.muted },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
    minHeight: 48,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  searchText: { ...TYPE.small, fontSize: 14, color: COLORS.muted },
  feedbackText: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  searchIcon: {
    width: 30,
    height: 30,
    marginLeft: -SPACING.sm,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },

  columns: { flexDirection: 'row', gap: SPACING.xl },

  tiles: { gap: SPACING.md },
  tile: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    ...CARD_SHADOW,
  },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingRight: SPACING.lg },
  tilePhoto: {
    width: 76,
    height: 76,
    backgroundColor: COLORS.paper2,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  // Het gestreepte vlak van de site voor een tegel zonder foto.
  striped: { overflow: 'hidden' },
  stripe: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    width: 7,
    backgroundColor: COLORS.paper,
    transform: [{ rotate: '35deg' }],
  },
  tileText: { flex: 1, gap: 2, paddingVertical: SPACING.sm },
  tileLabel: { fontFamily: FONTS.semibold, fontSize: 16, lineHeight: 21, color: COLORS.ink },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  go: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goOpen: { backgroundColor: COLORS.ink },
  children: { borderTopWidth: 1, borderTopColor: COLORS.line },
  child: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  childLabel: { ...TYPE.body, color: COLORS.body, flex: 1 },
});
