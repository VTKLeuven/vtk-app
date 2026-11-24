import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { CalendarClock, Check, ChevronDown, ChevronRight, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  AppCudiArticle,
  AppCudiCatalog,
  AppCudiOrder,
  AppCudiOrderResult,
  AppCudiTimeslots,
  AppLocale,
} from '../../api/contract';
import {
  cudiCheckout,
  fetchCudiCatalog,
  fetchCudiOverview,
  fetchCudiTimeslots,
  placeCudiOrder,
} from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { formatDayShort, formatTime } from '../../format';
import { useTabRouter } from '../../navigation';
import { useApp } from '../../state/app';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { PageHead } from '../PageHead';
import { SearchField } from '../SearchField';
import { Stepper } from '../Stepper';
import { Button, Card, CardList, Empty, ErrorState, Loading, MarginRegister, SectionHeading, StaleNotice } from '../ui';
import { CudiOrderCard, euro } from './CudiOrderCard';
import type { StudiesTabs } from './tabs';
import { CARD_SHADOW } from '../HomeSection';

/**
 * Wanneer een oudere cudi geen maximum meestuurt: één. Strenger dan cudi kan nooit
 * kwaad, soepeler wel (Regel 1).
 */
const FALLBACK_MAX = 1;

type Cart = Record<string, number>;
type Placed = Extract<AppCudiOrderResult, { ok: true }>;

/**
 * De cursusdienst, het tweede tabblad van Studies.
 *
 * Van boven naar onder in de volgorde waarin je het nodig hebt:
 *
 * 1. **Wat klaarligt**, met tot wanneer en de knop om een tijdslot te kiezen.
 *    Ligt er iets voor je, dan is dat de reden dat je hier bent.
 * 2. Wat nog op levering wacht, en de link naar al je bestellingen.
 * 3. **Zoeken** en de cursussen van jouw vakken, als register met een stapper,
 *    en de balk met het totaal onder de lijst, zoals bij Broodjes.
 * 4. Het algemene materiaal ("Voor iedereen"), dichtgeklapt: het is lang en
 *    zelden waarvoor je komt.
 *
 * **Cudi beslist alles**: reserveren gaat door dezelfde functie als de knop in de
 * webshop (`placeOrderForUser`), ook het maximum per artikel en de wachtlijst.
 */
export function CudiView({ tabs, linked }: { tabs: StudiesTabs; linked: boolean }) {
  const router = useTabRouter();
  const insets = useSafeAreaInsets();
  const { locale, viewer } = useApp();
  const enabled = Boolean(viewer) && linked;
  const scroll = useRef<ScrollViewInstance>(null);

  const overview = useResource('cudi', () => fetchCudiOverview(locale), `${locale}:${viewer?.id ?? 'anon'}`, enabled);
  const catalog = useResource(
    'cudi-catalogus',
    () => fetchCudiCatalog(locale),
    `${locale}:${viewer?.id ?? 'anon'}`,
    enabled,
  );
  const timeslots = useResource(
    'cudi-tijdsloten',
    () => fetchCudiTimeslots(locale),
    `${locale}:${viewer?.id ?? 'anon'}`,
    enabled,
  );

  const [query, setQuery] = useState('');
  const search = useCatalogSearch(query, locale, enabled);
  const [generalOpen, setGeneralOpen] = useState(false);
  const [cart, setCart] = useState<Cart>({});
  // Wat er in het mandje zit, blijft gekend ook als het niet meer in de zoekresultaten staat.
  const [known, setKnown] = useState<Record<string, AppCudiArticle>>({});
  const [confirming, setConfirming] = useState(false);
  const [paymentChoice, setPaymentChoice] = useState<'ONSITE' | 'ONLINE'>('ONSITE');
  const [busy, setBusy] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      void overview.reload();
      void catalog.reload();
      void timeslots.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]),
  );

  const articles = useMemo(() => {
    const map = new Map<string, AppCudiArticle>(Object.entries(known));
    for (const source of [catalog.data, search.catalog]) {
      for (const subject of source?.subjects ?? []) for (const a of subject.articles) map.set(a.id, a);
      for (const group of source?.general ?? []) for (const a of group.articles) map.set(a.id, a);
    }
    return map;
  }, [catalog.data, search.catalog, known]);

  const lines = Object.entries(cart)
    .filter(([id, quantity]) => quantity > 0 && articles.has(id))
    .map(([id, quantity]) => ({ article: articles.get(id) as AppCudiArticle, quantity }));
  const total = lines.reduce((sum, line) => sum + line.article.price * line.quantity, 0);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);

  const hours = overview.data?.hours ?? null;
  const head = (
    <PageHead
      title="Studies"
      subtitle={
        hours && !hours.unavailable
          ? `De cursusdienst is ${hours.openNow ? 'open' : 'gesloten'}, ${hours.detail}`
          : 'Je cursussen reserveren en afhalen'
      }
      back={false}
      tabs={tabs}
    />
  );

  if (!viewer) {
    return (
      <>
        {head}
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>
              Een reservatie hangt aan jouw naam. Met je VTK-account reserveer je hier, zonder apart
              account bij de cursusdienst.
            </Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (!linked || overview.data?.available === false) {
    return (
      <>
        {head}
        <Empty
          title="Reserveren kan hier nog niet"
          hint="Op cudi.vtk.be wel, met hetzelfde VTK-account."
          action={{ label: 'Naar cudi.vtk.be', onPress: () => void WebBrowser.openBrowserAsync('https://cudi.vtk.be/vtk/shop') }}
        />
      </>
    );
  }

  if (overview.loading && !overview.data) {
    return (
      <>
        {head}
        <Loading label="De cursusdienst ophalen" />
      </>
    );
  }
  if (!overview.data) {
    return (
      <>
        {head}
        <ErrorState message={messageFor(overview.error)} onRetry={() => void overview.refresh()} />
      </>
    );
  }

  const data = overview.data;
  const ordering = catalog.data?.ordering ?? data.ordering;
  const cudiBase = data.shopUrl.replace(/\/shop\/?$/, '');
  const openStep = (url: string, title: string) => router.push({ pathname: '/web', params: { url, title } });

  const setQuantity = (article: AppCudiArticle, quantity: number) => {
    setPlaced(null);
    setKnown((current) => ({ ...current, [article.id]: article }));
    setCart((current) => ({ ...current, [article.id]: quantity }));
  };

  const clearCart = () =>
    Alert.alert('Mandje leegmaken?', `${count} ${count === 1 ? 'artikel' : 'artikels'} uit je mandje halen.`, [
      { text: 'Behouden', style: 'cancel' },
      { text: 'Leegmaken', style: 'destructive', onPress: () => setCart({}) },
    ]);

  const startConfirm = () => {
    setPaymentChoice(ordering.paymentMode === 'ONLINE_ONLY' ? 'ONLINE' : 'ONSITE');
    setConfirming(true);
  };

  const submit = async () => {
    setBusy('submit');
    try {
      const result = await placeCudiOrder(locale, {
        items: lines.map((line) => ({ articleId: line.article.id, quantity: line.quantity })),
        paymentChoice: ordering.paymentMode === 'BOTH' ? paymentChoice : undefined,
      });
      setConfirming(false);
      if (!result.ok) {
        // Wat cudi weigerde, gaat uit het mandje; de rest blijft staan.
        if (result.articleIds.length > 0) {
          setCart((current) => {
            const next = { ...current };
            for (const id of result.articleIds) delete next[id];
            return next;
          });
        }
        Alert.alert('Niet gereserveerd', result.message);
        void catalog.reload();
        return;
      }
      setCart({});
      setPlaced(result);
      scroll.current?.scrollTo({ y: 0, animated: true });
      if (result.checkoutUrl) await WebBrowser.openBrowserAsync(result.checkoutUrl);
      void overview.reload();
      void catalog.reload();
    } catch (error) {
      setConfirming(false);
      Alert.alert('Niet gereserveerd', messageFor(error instanceof Error ? error : null));
    } finally {
      setBusy(null);
    }
  };

  const pay = async (order: AppCudiOrder) => {
    setBusy(order.id);
    try {
      const { checkoutUrl } = await cudiCheckout(locale, order.id);
      await WebBrowser.openBrowserAsync(checkoutUrl);
      void overview.reload();
    } catch (error) {
      Alert.alert('Betalen lukte niet', messageFor(error instanceof Error ? error : null));
    } finally {
      setBusy(null);
    }
  };

  const open = data.orders.filter((order) => order.open);
  const ready = open.flatMap((order) =>
    order.lines.filter((line) => line.status === 'ASSIGNED').map((line) => ({ order, line })),
  );
  const waiting = open.filter((order) => !order.lines.some((line) => line.status === 'ASSIGNED'));
  const closedMessage = !data.gate && !ordering.open ? ordering.message : null;
  const searching = query.trim().length >= 2;
  const shown = searching ? search.catalog : catalog.data;

  return (
    <View style={styles.root}>
      {head}
      <ScrollView
        ref={scroll}
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={overview.refreshing}
            onRefresh={() => {
              void overview.refresh();
              void catalog.reload();
              void timeslots.reload();
            }}
          />
        }
      >
        {overview.stale ? <StaleNotice onRetry={() => void overview.refresh()} /> : null}

        {data.gate ? (
          <Card featured>
            <Text style={styles.title}>
              {data.gate.kind === 'TERMS' ? 'Eerst één keer naar de cursusdienst' : 'De webshop staat dicht'}
            </Text>
            <Text style={styles.body}>
              {data.gate.kind === 'TERMS'
                ? 'Log er eenmalig in met je VTK-account en aanvaard de voorwaarden. Daarna reserveer je hier.'
                : 'De cursusdienst heeft online bestellen voorlopig uitgezet.'}
            </Text>
            {data.gate.kind === 'TERMS' ? (
              <Button label="Verder op de cursusdienst" onPress={() => openStep(data.gate!.url, 'Cursusdienst')} />
            ) : null}
          </Card>
        ) : null}

        {closedMessage ? (
          <Card featured>
            <Text style={styles.title}>Reserveren kan nu niet</Text>
            <Text style={styles.body}>{closedMessage}</Text>
          </Card>
        ) : null}

        {placed ? <PlacedNotice result={placed} /> : null}

        {ready.length > 0 ? (
          <ReadyCard
            ready={ready}
            locale={locale}
            timeslots={timeslots.data}
            onTimeslots={() => router.push('/cudi-tijdsloten')}
          />
        ) : timeslots.data?.enabled ? (
          <TimeslotCard
            timeslots={timeslots.data}
            locale={locale}
            onOpen={() => router.push('/cudi-tijdsloten')}
          />
        ) : null}

        {waiting.map((order) => (
          <CudiOrderCard
            key={order.id}
            order={order}
            ordering={data.ordering}
            locale={locale}
            busy={busy}
            onPay={() => void pay(order)}
          />
        ))}

        {data.orders.length > 0 ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/cudi-bestellingen')}
            style={({ pressed }) => [styles.history, pressed && styles.pressed]}
          >
            <Text style={styles.body}>{open.length > 0 ? 'Al je bestellingen' : 'Je vorige bestellingen'}</Text>
            <ChevronRight size={18} color={COLORS.muted} />
          </Pressable>
        ) : null}

        {!data.gate ? (
          <View style={styles.block}>
            <SectionHeading>{searching ? 'Zoeken' : 'Voor jouw vakken'}</SectionHeading>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Zoek een vak of cursus"
              label="Zoeken in de cursusdienst"
              style={styles.search}
            />
            {searching ? (
              search.loading && !search.catalog ? (
                <ActivityIndicator color={COLORS.navy} style={styles.spinner} />
              ) : search.error ? (
                <Text style={styles.hint}>{search.error}</Text>
              ) : search.catalog ? (
                <>
                  <Text style={styles.hint}>
                    {search.catalog.searchedAll ? 'In het hele aanbod van de cursusdienst.' : 'In de vakken op je profiel.'}
                  </Text>
                  <SubjectList
                    catalog={search.catalog}
                    cart={cart}
                    orderingOpen={ordering.open}
                    onQuantity={setQuantity}
                  />
                  {search.catalog.subjects.length === 0 && search.catalog.general.length === 0 ? (
                    <Text style={styles.hint}>Niets gevonden voor {`“${query.trim()}”`}.</Text>
                  ) : null}
                </>
              ) : null
            ) : catalog.loading && !catalog.data ? (
              <Loading label="Het aanbod ophalen" />
            ) : !catalog.data ? (
              <ErrorState message={messageFor(catalog.error)} onRetry={() => void catalog.refresh()} />
            ) : !catalog.data.hasProfileSubjects ? (
              <Card>
                <Text style={styles.title}>Duid eerst je vakken aan</Text>
                <Text style={styles.body}>
                  Je ziet hier de cursussen van de vakken op je profiel bij de cursusdienst. Kies ze één
                  keer; daarna staan ze hier.
                </Text>
                <Button
                  label="Vakken kiezen"
                  variant="ghost"
                  onPress={() => openStep(catalog.data!.subjectsUrl, 'Je vakken')}
                />
              </Card>
            ) : catalog.data.subjects.length === 0 ? (
              <Text style={styles.hint}>Voor je vakken is er dit semester (nog) niets te reserveren.</Text>
            ) : (
              <SubjectList catalog={catalog.data} cart={cart} orderingOpen={ordering.open} onQuantity={setQuantity} />
            )}
          </View>
        ) : null}

        {!data.gate && shown && shown.general.length > 0 ? (
          <View style={styles.block}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: searching || generalOpen }}
              onPress={() => setGeneralOpen((value) => !value)}
              disabled={searching}
              style={({ pressed }) => [styles.collapse, pressed && styles.pressed]}
            >
              <View style={styles.flex}>
                <Text style={styles.collapseTitle}>Voor iedereen</Text>
                <Text style={styles.hint} numberOfLines={1}>
                  {shown.general.reduce((sum, group) => sum + group.articles.length, 0)} artikels:{' '}
                  {shown.general.map((group) => group.type.toLocaleLowerCase('nl')).join(', ')}
                </Text>
              </View>
              {!searching ? (
                <ChevronDown
                  size={20}
                  color={COLORS.muted}
                  style={generalOpen ? styles.chevronOpen : undefined}
                />
              ) : null}
            </Pressable>
            {searching || generalOpen
              ? shown.general.map((group) => (
                  <View key={group.type} style={styles.subject}>
                    <View style={styles.subjectHead}>
                      <Text style={styles.subjectName}>{group.type}</Text>
                    </View>
                    <CardList>
                      {group.articles.map((article) => (
                        <ArticleRow
                          key={article.id}
                          article={article}
                          quantity={cart[article.id] ?? 0}
                          orderingOpen={ordering.open}
                          onQuantity={(q) => setQuantity(article, q)}
                        />
                      ))}
                    </CardList>
                  </View>
                ))
              : null}
          </View>
        ) : null}

        {hours && !hours.unavailable && hours.entries.length > 0 ? (
          <View style={styles.block}>
            <SectionHeading>Openingsuren deze week</SectionHeading>
            <CardList>
              {hours.entries.map((entry) => (
                <View key={entry.day} style={styles.hoursRow}>
                  <Text style={styles.hoursDay}>{entry.day}</Text>
                  <Text style={styles.hoursValue}>{entry.hours}</Text>
                </View>
              ))}
            </CardList>
            {hours.note ? <Text style={styles.hint}>{hours.note}</Text> : null}
          </View>
        ) : null}

        <MarginRegister
          title="Op cudi.vtk.be"
          links={[
            { label: 'Tweedehands', url: `${cudiBase}/secondhand` },
            { label: 'Printen', url: `${cudiBase}/printer` },
          ].map((link) => ({
            label: link.label,
            external: true,
            onPress: () => void WebBrowser.openBrowserAsync(link.url),
          }))}
        />
      </ScrollView>

      {count > 0 ? (
        <View style={styles.bar}>
          <View style={styles.flex}>
            <Text style={styles.barTotal}>
              {count} {count === 1 ? 'artikel' : 'artikels'}, {euro(total)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mandje leegmaken"
              onPress={clearCart}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            >
              <Text style={styles.barLink}>Mandje leegmaken</Text>
            </Pressable>
          </View>
          <View style={styles.barButton}>
            <Button label="Reserveren" disabled={!ordering.open} onPress={startConfirm} />
          </View>
        </View>
      ) : null}

      <Modal visible={confirming} transparent animationType="slide" onRequestClose={() => setConfirming(false)}>
        <View style={styles.sheetRoot}>
          <Pressable
            style={styles.scrim}
            onPress={() => busy === null && setConfirming(false)}
            accessibilityLabel="Sluiten"
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Je reservatie</Text>
              <Pressable
                onPress={() => setConfirming(false)}
                disabled={busy !== null}
                hitSlop={12}
                accessibilityLabel="Sluiten"
                accessibilityRole="button"
              >
                <X size={20} color={COLORS.muted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetBody}>
              <CardList inset={0} style={styles.sheetList}>
                {lines.map(({ article, quantity }) => (
                  <View key={article.id} style={styles.sheetLine}>
                    <View style={styles.flex}>
                      <Text style={styles.name} numberOfLines={2}>
                        {quantity > 1 ? `${quantity} × ` : ''}
                        {article.title}
                      </Text>
                      <Text style={[styles.meta, article.availableNow ? styles.readyText : styles.waitText]}>
                        {article.availableNow ? 'Ligt meteen klaar' : 'Op de wachtlijst tot er een binnen is'}
                      </Text>
                    </View>
                    <Text style={styles.price}>{euro(article.price * quantity)}</Text>
                  </View>
                ))}
                <View style={styles.sheetTotal}>
                  <Text style={styles.title}>Totaal</Text>
                  <Text style={styles.price}>{euro(total)}</Text>
                </View>
              </CardList>

              {ordering.paymentMode === 'BOTH' && ordering.onlineCheckout ? (
                <View style={styles.choices} accessibilityRole="radiogroup">
                  {(
                    [
                      { value: 'ONSITE', label: 'Betalen bij het afhalen', hint: 'Aan de balie van de cursusdienst' },
                      { value: 'ONLINE', label: 'Nu online betalen', hint: 'Daarna opent de betaalpagina' },
                    ] as const
                  ).map((choice) => {
                    const active = paymentChoice === choice.value;
                    return (
                      <Pressable
                        key={choice.value}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        onPress={() => setPaymentChoice(choice.value)}
                        style={[styles.choice, active && styles.choiceActive]}
                      >
                        <View style={[styles.radio, active && styles.radioActive]}>
                          {active ? <Check size={12} color={COLORS.paper} /> : null}
                        </View>
                        <View style={styles.flex}>
                          <Text style={styles.name}>{choice.label}</Text>
                          <Text style={styles.meta}>{choice.hint}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.hint}>
                  {ordering.paymentMode === 'ONLINE_ONLY'
                    ? 'Je betaalt meteen online; na het reserveren opent de betaalpagina.'
                    : 'Je betaalt bij het afhalen, aan de balie van de cursusdienst.'}
                </Text>
              )}
            </ScrollView>

            <View style={styles.sheetButtons}>
              <Button label="Reserveren" busy={busy === 'submit'} onPress={() => void submit()} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Zoeken terwijl je tikt, met een korte pauze; een traag antwoord overschrijft geen sneller. */
function useCatalogSearch(query: string, locale: AppLocale, enabled: boolean) {
  const [state, setState] = useState<{ catalog: AppCudiCatalog | null; loading: boolean; error: string | null }>({
    catalog: null,
    loading: false,
    error: null,
  });
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < 2) return;
    const id = ++latest.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState((current) => ({ ...current, loading: true, error: null }));
      fetchCudiCatalog(locale, q, controller.signal)
        .then((result) => {
          if (latest.current === id) setState({ catalog: result, loading: false, error: null });
        })
        .catch((error: Error) => {
          if (latest.current === id && error.name !== 'AbortError') {
            setState({ catalog: null, loading: false, error: messageFor(error) });
          }
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, locale, enabled]);

  return query.trim().length < 2 ? NO_SEARCH : state;
}

const NO_SEARCH = { catalog: null as AppCudiCatalog | null, loading: false, error: null };

/**
 * Wat er klaarligt, bovenaan: per cursus tot wanneer, en de knop voor een
 * tijdslot. Een gereserveerd slot staat erbij, zodat je weet wanneer je gaat.
 */
function ReadyCard({
  ready,
  locale,
  timeslots,
  onTimeslots,
}: {
  ready: { order: AppCudiOrder; line: AppCudiOrder['lines'][number] }[];
  locale: AppLocale;
  timeslots: AppCudiTimeslots | null;
  onTimeslots: () => void;
}) {
  const next = timeslots?.mine[0] ?? null;
  const usesSlots = timeslots ? timeslots.enabled : true;
  return (
    <Card featured>
      <View style={styles.readyHead}>
        <Text style={[styles.title, styles.flex]}>Klaar om af te halen</Text>
        <Text style={[styles.pill, styles.pillOk]}>{ready.length}</Text>
      </View>
      <View style={styles.readyLines}>
        {ready.map(({ order, line }) => (
          <View key={line.id} style={styles.readyLine}>
            <Text style={styles.readyTitle} numberOfLines={2}>
              {line.quantity > 1 ? `${line.quantity} × ` : ''}
              {line.title}
            </Text>
            <Text style={styles.meta}>
              {line.pickupDeadline
                ? `Tot ${formatDayShort(line.pickupDeadline, locale)} ${formatTime(line.pickupDeadline, locale)}`
                : 'Ligt klaar'}
              {' · '}#{order.number}
            </Text>
          </View>
        ))}
      </View>
      {next ? (
        <View style={styles.slot}>
          <CalendarClock size={18} color={COLORS.okInk} />
          <Text style={[styles.slotText, styles.flex]}>
            Je tijdslot: {formatDayShort(next.start, locale)} {formatTime(next.start, locale)} -{' '}
            {formatTime(next.end, locale)}
          </Text>
        </View>
      ) : null}
      {usesSlots ? (
        <Button
          label={next ? 'Tijdslot wijzigen' : 'Tijdslot reserveren'}
          variant={next ? 'ghost' : 'primary'}
          onPress={onTimeslots}
        />
      ) : (
        <Text style={styles.hint}>Kom langs tijdens de openingsuren, hieronder.</Text>
      )}
    </Card>
  );
}

/**
 * De tijdsloten, ook zonder iets dat klaarligt: op cudi.vtk.be kan je altijd een
 * tijdslot nemen, dus hier ook. Tot november 2026 stond de knop enkel in
 * `ReadyCard`, en wie niets klaar had liggen, vond de tijdsloten nergens.
 */
function TimeslotCard({
  timeslots,
  locale,
  onOpen,
}: {
  timeslots: AppCudiTimeslots;
  locale: AppLocale;
  onOpen: () => void;
}) {
  const next = timeslots.mine[0] ?? null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        next
          ? `Je tijdslot, ${formatDayShort(next.start, locale)} ${formatTime(next.start, locale)}. Wijzigen`
          : 'Een tijdslot reserveren om af te halen'
      }
      onPress={onOpen}
      style={({ pressed }) => [styles.slotCard, pressed && styles.pressed]}
    >
      <View style={styles.slotIcon}>
        <CalendarClock size={20} color={COLORS.ink} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.title}>{next ? 'Je tijdslot' : 'Tijdslot reserveren'}</Text>
        <Text style={styles.meta}>
          {next
            ? `${formatDayShort(next.start, locale)} ${formatTime(next.start, locale)} - ${formatTime(next.end, locale)}`
            : 'Kies wanneer je je cursussen komt afhalen'}
        </Text>
      </View>
      <ChevronRight size={18} color={COLORS.muted} />
    </Pressable>
  );
}

function SubjectList({
  catalog,
  cart,
  orderingOpen,
  onQuantity,
}: {
  catalog: AppCudiCatalog;
  cart: Cart;
  orderingOpen: boolean;
  onQuantity: (article: AppCudiArticle, quantity: number) => void;
}) {
  return (
    <>
      {catalog.subjects.map((subject) => (
        <View key={subject.id} style={styles.subject}>
          <View style={styles.subjectHead}>
            {subject.code ? <Text style={styles.code}>{subject.code}</Text> : null}
            <Text style={styles.subjectName}>{subject.name}</Text>
          </View>
          <CardList>
            {subject.articles.map((article) => (
              <ArticleRow
                key={article.id}
                article={article}
                quantity={cart[article.id] ?? 0}
                orderingOpen={orderingOpen}
                onQuantity={(q) => onQuantity(article, q)}
              />
            ))}
          </CardList>
        </View>
      ))}
    </>
  );
}

/**
 * Eén cursus. Twee lagen, zodat een lange titel niet tussen de omslag en de
 * stapper geperst wordt: bovenaan de titel en de auteur over de volle breedte,
 * daaronder de prijs en de pillen, met de stapper rechts.
 *
 * De pillen spreken de kleurtaal van de shiften op de site: groen is in orde
 * (op voorraad, al gekocht), geel is van jou en ligt klaar, oker is wachten
 * (gereserveerd, wachtlijst), rood is op, grijs is niet te bestellen.
 */
function ArticleRow({
  article,
  quantity,
  orderingOpen,
  onQuantity,
}: {
  article: AppCudiArticle;
  quantity: number;
  orderingOpen: boolean;
  onQuantity: (quantity: number) => void;
}) {
  const reserved = article.mine.find((m) => m.kind === 'ASSIGNED' || m.kind === 'BOOKED');
  const bought = article.mine.find((m) => m.kind === 'SOLD');
  const byline = [article.author, article.type].filter(Boolean).join(' · ');
  const max = article.maxQuantity ?? FALLBACK_MAX;
  const stockStyle =
    article.stock?.tone === 'red' ? styles.pillDanger : article.stock?.tone === 'amber' ? styles.pillLow : styles.pillOk;

  return (
    <View style={styles.item}>
      <View style={styles.itemTop}>
        {article.coverUrl ? (
          <Image cachePolicy="memory-disk" source={{ uri: article.coverUrl }} style={styles.cover} contentFit="cover" />
        ) : null}
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={3}>
            {article.title}
          </Text>
          {byline ? (
            <Text style={styles.meta} numberOfLines={1}>
              {byline}
            </Text>
          ) : null}
          {article.note ? (
            <Text style={styles.hint} numberOfLines={2}>
              {article.note}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.itemBottom}>
        <View style={styles.tags}>
          <Text style={styles.price}>{euro(article.price)}</Text>
          {article.memberPrice && article.listPrice > article.price ? (
            <Text style={styles.strike}>{euro(article.listPrice)}</Text>
          ) : null}
          {reserved ? (
            reserved.kind === 'ASSIGNED' ? (
              <Text style={[styles.pill, styles.pillMine]}>Ligt voor je klaar</Text>
            ) : (
              <Text style={[styles.pill, styles.pillLow]}>Gereserveerd</Text>
            )
          ) : bought ? (
            <Text style={[styles.pill, styles.pillOk]}>Al gekocht</Text>
          ) : article.stock ? (
            <Text style={[styles.pill, stockStyle]}>{article.stock.label}</Text>
          ) : null}
          {!article.orderable && orderingOpen && !reserved && !bought ? (
            <Text style={[styles.pill, styles.pillFull]}>Nu niet online te reserveren</Text>
          ) : null}
        </View>
        {article.orderable && max > 0 ? (
          <Stepper value={quantity} max={max} label={article.title} onChange={onQuantity} />
        ) : null}
      </View>
    </View>
  );
}

function PlacedNotice({ result }: { result: Placed }) {
  const ready = result.items.filter((item) => item.status === 'ASSIGNED').reduce((s, i) => s + i.quantity, 0);
  const waiting = result.items.filter((item) => item.status === 'BOOKED').reduce((s, i) => s + i.quantity, 0);
  const parts = [
    ready > 0 ? `${ready} ${ready === 1 ? 'ligt' : 'liggen'} klaar` : null,
    waiting > 0 ? `${waiting} op de wachtlijst` : null,
  ].filter(Boolean);
  return (
    <Card featured>
      <View style={styles.readyHead}>
        <Check size={18} color={COLORS.okInk} />
        <Text style={[styles.title, styles.flex]}>Gereserveerd</Text>
      </View>
      <Text style={styles.body}>
        {parts.join(', ')}.{' '}
        {waiting > 0
          ? 'De cursusdienst mailt je zodra er iets voor je klaarligt.'
          : 'Kies hierboven een tijdslot om af te halen.'}
      </Text>
    </Card>
  );
}

const pillBase = {
  ...TYPE.small,
  fontSize: 12,
  lineHeight: 16,
  fontFamily: FONTS.semibold,
  borderRadius: RADIUS.pill,
  paddingHorizontal: 9,
  paddingVertical: 3,
  overflow: 'hidden' as const,
};

const styles = StyleSheet.create({
  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  slotIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // In het blad onderaan is de lijst geen kaart: het blad is zelf al wit.
  sheetList: { backgroundColor: 'transparent', borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  block: { gap: SPACING.md },
  pressed: { opacity: 0.6 },
  spinner: { alignSelf: 'flex-start', marginVertical: SPACING.md },
  search: { margin: 0, marginBottom: 0 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  meta: { ...TYPE.small, color: COLORS.body },
  readyText: { color: COLORS.okInk, fontFamily: FONTS.semibold },
  waitText: { color: COLORS.lowInk },

  history: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.line2,
  },

  readyHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  readyLines: { borderTopWidth: 1, borderTopColor: COLORS.line2 },
  readyLine: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.line2, gap: 2 },
  readyTitle: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.okBg,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  slotText: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.okInk },

  collapse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 56,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.line2,
  },
  collapseTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  chevronOpen: { transform: [{ rotate: '180deg' }] },

  subject: { gap: SPACING.xs },
  subjectHead: { marginTop: SPACING.sm, gap: 1 },
  code: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    letterSpacing: 0.7,
    color: COLORS.muted,
    fontVariant: ['tabular-nums'],
  },
  subjectName: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink },

  item: {
    gap: SPACING.sm,
    paddingVertical: 12,
  },
  itemTop: { flexDirection: 'row', gap: SPACING.md },
  itemBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  cover: { width: 40, height: 54, borderRadius: 6, backgroundColor: COLORS.paper2 },
  name: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink },
  tags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  price: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  strike: { ...TYPE.small, color: COLORS.muted, textDecorationLine: 'line-through' },

  pill: pillBase,
  pillOk: { backgroundColor: COLORS.okBg, color: COLORS.okInk },
  pillLow: { backgroundColor: COLORS.lowBg, color: COLORS.lowInk },
  pillDanger: { backgroundColor: COLORS.dangerBg, color: COLORS.dangerInk },
  pillMine: { backgroundColor: COLORS.yellow, color: COLORS.ink },
  pillFull: { backgroundColor: COLORS.paper2, color: COLORS.muted },

  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  hoursDay: { ...TYPE.body, color: COLORS.body },
  hoursValue: { ...TYPE.body, color: COLORS.ink, fontVariant: ['tabular-nums'] },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl - 4,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.line2,
  },
  barTotal: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  barLink: { ...TYPE.small, color: COLORS.navy, textDecorationLine: 'underline' },
  barButton: { minWidth: 132 },

  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 15, 31, 0.45)' },
  sheet: {
    maxHeight: '85%',
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl - 4,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  sheetTitle: { ...TYPE.heading, color: COLORS.ink, flex: 1 },
  sheetBody: { paddingHorizontal: SPACING.xl - 4, gap: SPACING.lg, paddingBottom: SPACING.md },
  sheetLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingVertical: 10,
  },
  sheetTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: SPACING.md },
  choices: { gap: SPACING.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 56,
    padding: SPACING.md,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    ...CARD_SHADOW,
  },
  choiceActive: { borderColor: COLORS.navy },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  sheetButtons: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.sm },
});
