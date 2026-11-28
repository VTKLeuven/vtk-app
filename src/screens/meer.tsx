import { useScrollToTop } from 'expo-router';
import { Image } from 'expo-image';

import * as WebBrowser from 'expo-web-browser';
import { ChevronDown, ChevronRight, ExternalLink, MessageSquare, Moon, Search, Sun } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import { baseUrl, mediaUrl } from '../api/client';
import { fetchMedia } from '../api/endpoints';
import { useResource } from '../api/useResource';
import type { AppLocale, AppNavTab } from '../api/contract';
import { CARD_SHADOW } from '../components/HomeSection';
import { YellowHead } from '../components/YellowHead';
import { ErrorState, Loading, MarginRegister, SectionHeading, StaleNotice, type RegisterLink } from '../components/ui';
import { nativeRouteFor, pageSlugFor } from '../nativeRoute';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { applyTheme, THEME, type ThemeMode } from '../theme/mode';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { t } from '../i18n';

/**
 * Meer: alles wat je opzoekt in plaats van doet.
 *
 * De vier tabs ervoor zijn werkwoorden (kijken wat er open is, plannen, kopen,
 * bestellen). Dit is het zelfstandig naamwoord: de mensen, de foto's, de piano,
 * de shiften, de hele CMS-boom uit het beheer, en je eigen profiel.
 *
 * In de vorm van de site (november 2026), met sinds eind november de gele kop van
 * Home en de andere tabs (`YellowHead`): je profiel als witte kaart in de kop,
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
  // Een tik op de tab waar je al staat, scrolt naar boven.
  const topRef = useRef<ScrollViewInstance>(null);
  useScrollToTop(topRef);
  const router = useTabRouter();
  const { bootstrap, viewer, locale, loading, stale, error, refresh } = useApp();
  // De kaft van het nieuwste Bakske, als foto bij Media (dezelfde cache als Home).
  const media = useResource('media', () => fetchMedia(locale), locale);
  const bakske = media.data?.publications.find((item) => item.kind === 'bakske') ?? null;
  const mediaCover = bakske?.coverUrl ? (mediaUrl(bakske.coverUrl) ?? null) : null;
  const [open, setOpen] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!bootstrap) {
    return (
      <ErrorState
        message={error?.message ?? t('De navigatie kon niet geladen worden.', 'The navigation could not be loaded.')}
        onRetry={() => void refresh()}
      />
    );
  }

  const openOnWeb = (href: string) => {
    const url = /^https?:\/\//i.test(href) ? href : `${baseUrl()}${href}`;
    void WebBrowser.openBrowserAsync(url);
  };

  const doen: Link[] = [
    ...(viewer ? [{ label: t('Bonnetjes', 'Vouchers'), onPress: () => router.push('/bonnetjes') }] : []),
    { label: t('Shiften', 'Shifts'), onPress: () => router.push('/shiften') },
    { label: t("Foto's", 'Photos'), onPress: () => router.push('/albums') },
    { label: 'Media', onPress: () => router.push('/media') },
    { label: 'Piano', onPress: () => router.push('/piano') },
    { label: t('Liederboek', 'Songbook'), onPress: () => router.push('/liederboek') },
    // Wegwijzer (`/wegwijzer`) staat er tijdelijk niet bij: zolang Career het
    // grondplan niet publiek zet, is er niets te zien.
    // Enkel voor wie iets te scannen heeft; de rest heeft hier niets aan.
    ...(bootstrap?.abilities?.scanTickets
      ? [{ label: t('Tickets scannen', 'Scan tickets'), onPress: () => router.push('/deur') }]
      : []),
  ];
  const mensen: Link[] = [
    { label: 'Praesidium', onPress: () => router.push('/praesidium') },
    { label: t('Werkgroepen', 'Working groups'), onPress: () => router.push('/werkgroepen') },
    { label: "POC's", onPress: () => router.push('/pocs') },
    ...(viewer ? [{ label: t('Peilingen', 'Polls'), onPress: () => router.push('/peilingen') }] : []),
  ];
  // Voor de kring: enkel voor wie er rechten voor heeft (`bootstrap.abilities`).
  // De cursusdienst en Burgieclan staan sinds november 2026 onder Studies, als
  // eigen schermen; hier stonden ze als link naar hun site.
  const kring: Link[] = [
    ...(bootstrap?.abilities?.admin
      ? [{ label: t('Beheer', 'Admin'), hint: t('De admin van vtk.be', 'The admin of vtk.be'), onPress: () => router.push('/beheer') }]
      : []),
    ...(bootstrap?.abilities?.transport
      ? [{ label: 'Transport', hint: t('De ritten van Logistiek', 'The rides of Logistics'), onPress: () => router.push('/vervoer') }]
      : []),
  ];

  return (
    <View style={styles.root}>
      <ScrollView ref={topRef} contentContainerStyle={styles.scroll} style={styles.root}>
        <View style={styles.overscroll} />
        <YellowHead title={t('Meer', 'More')}>
          {/* Jij, als witte kaart in de kop. Een eigen tab was dat niet waard: je
              opent je profiel een paar keer per jaar, niet een paar keer per dag. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={viewer ? t(`Profiel van ${viewer.name}`, `Profile of ${viewer.name}`) : t('Inloggen', 'Log in')}
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
                {viewer?.name ?? t('Niet ingelogd', 'Not logged in')}
              </Text>
              <Text style={styles.meHint} numberOfLines={1}>
                {viewer ? t('Je profiel en meldingen', 'Your profile and notifications') : t('Log in om te bestellen en tickets te kopen', 'Log in to order and buy tickets')}
              </Text>
            </View>
            <ChevronRight color={COLORS.muted} size={18} />
          </Pressable>

          {/* Twee kolommen: links feedback, rechts het thema. Feedback op de app gaat
              naar Dopl, het formulier zonder zijn eigen kop, in je taal en met je naam
              en e-mail al ingevuld als je ingelogd bent. */}
          <View style={styles.pair}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Feedback over de app geven', 'Give feedback on the app')}
              onPress={() =>
                router.push({ pathname: '/web', params: { url: feedbackUrl(locale, viewer), title: 'Feedback App' } })
              }
              style={({ pressed }) => [styles.search, styles.flex, styles.pairItem, pressed && styles.pressedDark]}
            >
              <View style={styles.searchIcon}>
                <MessageSquare color={COLORS.yellow} size={15} />
              </View>
              <Text style={[styles.feedbackText, styles.flex]} numberOfLines={1}>
                Feedback App
              </Text>
            </Pressable>
            <ThemePicker />
          </View>

          <Pressable
            accessibilityRole="search"
            accessibilityLabel={t('Zoeken', 'Search')}
            onPress={() => router.push('/zoeken')}
            style={({ pressed }) => [styles.search, pressed && styles.pressedDark]}
          >
            <View style={styles.searchIcon}>
              <Search color={COLORS.yellow} size={15} />
            </View>
            <Text style={styles.searchText}>{t('Zoeken op vtk.be', 'Search vtk.be')}</Text>
          </Pressable>
        </YellowHead>
        {stale ? <StaleNotice onRetry={() => void refresh()} /> : null}
        <View style={styles.content}>
          <View style={styles.columns}>
            <MarginRegister title={t('Doen', 'Do')} links={doen} style={styles.flex} />
            <MarginRegister title={t('Mensen', 'People')} links={mensen} style={styles.flex} />
          </View>
          {viewer ? (
            <MarginRegister
              title={t('Meldingen', 'Notifications')}
              links={[{ label: t('Wat je wil weten', 'What you want to know'), hint: t('Broodjes, shiften, categorieën', 'Sandwiches, shifts, categories'), onPress: () => router.push('/meldingen') }]}
            />
          ) : null}
          {kring.length > 0 ? <MarginRegister title={t('Voor de kring', 'For the association')} links={kring} style={styles.flex} /> : null}

          <View style={styles.tiles}>
            <SectionHeading>{t('Alles van VTK', 'Everything from VTK')}</SectionHeading>
            {bootstrap.tabs.map((tab) => (
              <TabTile
                key={tab.id}
                tab={tab}
                photo={photoFor(tab, mediaCover)}
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
              <Text style={styles.hint}>{t('Er staan nog geen onderdelen klaar.', 'There are no sections yet.')}</Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Een onderdeel van de site als de tegel van een categoriepagina: de foto links
 * (uit /admin/home), de naam rechts. Zonder foto het gestreepte vlak van de site.
 * Een onderdeel met items klapt uit en toont ze als register; een onderdeel met
 * een eigen scherm (Broodjes, Media) opent dat scherm.
 */
/**
 * Een foto voor een onderdeel zonder foto in het CMS (/admin/home): Career en
 * Over VTK met een foto van de site zelf, Media met de kaft van het nieuwste
 * Bakske. Zet iemand er in het CMS een, dan wint die.
 */
const FALLBACK_PHOTOS: Record<string, number> = {
  career: require('../../assets/meer/career.jpg'),
  'over-vtk': require('../../assets/meer/over-vtk.jpg'),
};

function photoFor(tab: AppNavTab, mediaCover: string | null): { uri: string } | number | null {
  if (tab.imageUrl) return { uri: tab.imageUrl };
  if (tab.slug === 'media' && mediaCover) return { uri: mediaCover };
  return FALLBACK_PHOTOS[tab.slug] ?? null;
}

function TabTile({
  tab,
  photo,
  expanded,
  onToggle,
  onNative,
  onCategory,
  onPage,
  onWeb,
}: {
  tab: AppNavTab;
  photo: { uri: string } | number | null;
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
        {photo ? (
          <Image cachePolicy="memory-disk" source={photo} style={styles.tilePhoto} contentFit="cover" />
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
              ? t('Opent een andere site', 'Opens another site')
              : expandable
                ? `${tab.children.length} ${tab.children.length === 1 ? 'onderdeel' : 'onderdelen'}`
                : t('Lees meer', 'Read more')}
          </Text>
        </View>
        {/* Een geel rondje met de pijl: het accent van de tegel. */}
        <View style={[styles.go, expanded && styles.goOpen]}>
          {external ? (
            <ExternalLink color={COLORS.onYellow} size={15} />
          ) : expandable ? (
            <ChevronDown color={expanded ? COLORS.yellow : COLORS.onYellow} size={17} style={expanded ? styles.chevronOpen : undefined} />
          ) : (
            <ChevronRight color={COLORS.onYellow} size={17} />
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

/**
 * Licht of donker. Standaard licht, en bewust niet de instelling van het toestel:
 * de app volgt de site. Wisselen herstart de app (zie `src/theme/mode.ts`), dus
 * dat zeggen we eerst.
 */
function ThemePicker() {
  const choose = (next: ThemeMode) => {
    if (next === THEME) return;
    Alert.alert(
      next === 'dark' ? t('Donker thema', 'Dark theme') : t('Licht thema', 'Light theme'),
      t('De app herstart om de nieuwe kleuren toe te passen.', 'The app restarts to apply the new colours.'),
      [
        { text: t('Annuleren', 'Cancel'), style: 'cancel' },
        { text: t('Herstarten', 'Restart'), onPress: () => void applyTheme(next) },
      ],
    );
  };
  const options: { value: ThemeMode; label: string; Icon: typeof Sun }[] = [
    { value: 'light', label: t('Licht', 'Light'), Icon: Sun },
    { value: 'dark', label: t('Donker', 'Dark'), Icon: Moon },
  ];
  return (
    <View style={[styles.search, styles.flex, styles.theme]} accessibilityRole="radiogroup" accessibilityLabel={t('Thema', 'Theme')}>
      {options.map(({ value, label, Icon }) => {
        const active = value === THEME;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${label} thema`}
            onPress={() => choose(value)}
            style={({ pressed }) => [styles.themeOption, active && styles.themeOptionActive, pressed && styles.pressed]}
          >
            <Icon color={active ? COLORS.onSelectedAccent : COLORS.muted} size={15} />
            <Text style={[styles.themeLabel, active && styles.themeLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
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
  scroll: { paddingBottom: SPACING.xxl },
  // Wat boven de kop verschijnt als je op iOS omlaag trekt: geel, zoals de kop.
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: COLORS.head,
  },
  content: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.xl, gap: SPACING.xl },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  pressedDark: { opacity: 0.7 },
  hint: { ...TYPE.small, color: COLORS.muted },

  me: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  avatar: { width: 44, height: 44, borderRadius: RADIUS.pill, backgroundColor: COLORS.yellow },
  // Navy en niet geel: een geel rondje verdwijnt tegen de gele kop.
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.band },
  initials: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.yellow },
  meName: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
  meHint: { ...TYPE.small, fontSize: 13, color: COLORS.muted },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: -SPACING.xs,
    paddingHorizontal: SPACING.lg,
    minHeight: 48,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  searchText: { ...TYPE.small, fontSize: 14, color: COLORS.muted },
  pair: { flexDirection: 'row', gap: SPACING.sm, marginTop: -SPACING.xs },
  // De kiezer: twee helften in dezelfde witte pil als de knop ernaast.
  pairItem: { marginTop: 0 },
  theme: { marginTop: 0, paddingHorizontal: 4, gap: 4 },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 40,
    borderRadius: RADIUS.pill,
  },
  themeOptionActive: { backgroundColor: COLORS.selected },
  themeLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.muted },
  themeLabelActive: { color: COLORS.onSelectedAccent },
  feedbackText: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  searchIcon: {
    width: 30,
    height: 30,
    marginLeft: -SPACING.sm,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.band,
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
  goOpen: { backgroundColor: COLORS.band },
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
