import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { Check, ChevronRight, X } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
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

import type { AppCudiArticle, AppCudiCatalog, AppCudiOrder, AppCudiOrderResult } from '../../api/contract';
import { cudiCheckout, fetchCudiCatalog, fetchCudiOverview, placeCudiOrder } from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { useTabRouter } from '../../navigation';
import { useApp } from '../../state/app';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { PageHead } from '../PageHead';
import { Stepper } from '../Stepper';
import { Button, Card, Empty, ErrorState, Loading, MarginRegister, SectionHeading, StaleNotice } from '../ui';
import { CudiOrderCard, euro } from './CudiOrderCard';
import type { StudiesTabs } from './tabs';

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
 * Wat cudi.vtk.be doet in Bestel boeken en Mijn bestellingen, in de vorm van de
 * app en precies zoals Broodjes: bovenaan wat er voor jou klaarligt en tot
 * wanneer, daaronder de cursussen van jouw vakken als register met een stapper,
 * en het totaal met de knop vast onder de lijst. Reserveren opent een blad om na
 * te kijken.
 *
 * **Cudi beslist alles.** De lijst toont wat er te bestellen valt, maar de
 * reservatie gaat door dezelfde functie als de knop in de webshop
 * (`placeOrderForUser` bij cudi): de voorraad, de wachtlijst, het semester, de
 * vakken op je profiel en het maximum per artikel (`maxQuantity`, van cudi).
 * Weigert cudi iets, dan zegt een melding waarom en gaan die artikels uit het
 * mandje.
 *
 * Wat op cudi zelf blijft: de voorwaarden aanvaarden (een juridische stap), je
 * vakken aanduiden, een afhaalmoment kiezen, tweedehands en printen.
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

  const [cart, setCart] = useState<Cart>({});
  const [confirming, setConfirming] = useState(false);
  const [paymentChoice, setPaymentChoice] = useState<'ONSITE' | 'ONLINE'>('ONSITE');
  const [busy, setBusy] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      void overview.reload();
      void catalog.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]),
  );

  const articles = useMemo(() => {
    const map = new Map<string, AppCudiArticle>();
    for (const subject of catalog.data?.subjects ?? []) for (const a of subject.articles) map.set(a.id, a);
    for (const group of catalog.data?.general ?? []) for (const a of group.articles) map.set(a.id, a);
    return map;
  }, [catalog.data]);

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
          ? `Cudi ${hours.openNow ? 'is open' : 'is gesloten'}, ${hours.detail}`
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

  const setQuantity = (id: string, quantity: number) => {
    setPlaced(null);
    setCart((current) => ({ ...current, [id]: quantity }));
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
  // Ligt er iets klaar, dan is de volgende vraag "wanneer kan ik het halen": de uren
  // staan dan meteen onder je bestellingen in plaats van onder de hele catalogus.
  const readyNow = open.some((order) => order.status === 'READY' || order.status === 'ONLINE_PAID');
  const hoursBlock =
    hours && !hours.unavailable && hours.entries.length > 0 ? (
      <View style={styles.block}>
        <SectionHeading>Deze week</SectionHeading>
        <View style={styles.register}>
          {hours.entries.map((entry) => (
            <View key={entry.day} style={styles.hoursRow}>
              <Text style={styles.hoursDay}>{entry.day}</Text>
              <Text style={styles.hoursValue}>{entry.hours}</Text>
            </View>
          ))}
        </View>
        {hours.note ? <Text style={styles.hint}>{hours.note}</Text> : null}
      </View>
    ) : null;

  const closedMessage = !data.gate && !ordering.open ? ordering.message : null;

  return (
    <View style={styles.root}>
      {head}
      <ScrollView
        ref={scroll}
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={overview.refreshing}
            onRefresh={() => {
              void overview.refresh();
              void catalog.reload();
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

        {open.length > 0 ? (
          <View style={styles.block}>
            <SectionHeading
              right={
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push('/cudi-bestellingen')}
                  hitSlop={12}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Text style={styles.link}>Alle bestellingen →</Text>
                </Pressable>
              }
            >
              Jouw bestellingen
            </SectionHeading>
            {open.map((order) => (
              <CudiOrderCard
                key={order.id}
                order={order}
                ordering={data.ordering}
                locale={locale}
                busy={busy}
                onPay={() => void pay(order)}
              />
            ))}
          </View>
        ) : data.orders.length > 0 ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/cudi-bestellingen')}
            style={({ pressed }) => [styles.history, pressed && styles.pressed]}
          >
            <Text style={styles.body}>Je vorige bestellingen</Text>
            <ChevronRight size={18} color={COLORS.muted} />
          </Pressable>
        ) : null}

        {readyNow ? hoursBlock : null}

        <Catalog
          catalog={catalog.data}
          loading={catalog.loading}
          error={catalog.error}
          onRetry={() => void catalog.refresh()}
          cart={cart}
          orderingOpen={ordering.open}
          onQuantity={setQuantity}
          onSubjects={(url) => openStep(url, 'Je vakken')}
        />

        {!readyNow ? hoursBlock : null}

        <MarginRegister
          title="Op cudi.vtk.be"
          links={[
            { label: 'Een afhaalmoment kiezen', url: `${cudiBase}/account/slots` },
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
              <View style={styles.register}>
                {lines.map(({ article, quantity }) => (
                  <View key={article.id} style={styles.sheetLine}>
                    <View style={styles.flex}>
                      <Text style={styles.name} numberOfLines={2}>
                        {quantity > 1 ? `${quantity} × ` : ''}
                        {article.title}
                      </Text>
                      <Text style={[styles.meta, article.availableNow && styles.strong]}>
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
              </View>

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

function Catalog({
  catalog,
  loading,
  error,
  onRetry,
  cart,
  orderingOpen,
  onQuantity,
  onSubjects,
}: {
  catalog: AppCudiCatalog | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  cart: Cart;
  orderingOpen: boolean;
  onQuantity: (id: string, quantity: number) => void;
  onSubjects: (url: string) => void;
}) {
  if (loading && !catalog) return <Loading label="Het aanbod ophalen" />;
  if (!catalog) return <ErrorState message={messageFor(error)} onRetry={onRetry} />;
  if (catalog.gate) return null;

  return (
    <>
      <View style={styles.block}>
        <SectionHeading>Voor jouw vakken</SectionHeading>
        {!catalog.hasProfileSubjects ? (
          <Card>
            <Text style={styles.title}>Duid eerst je vakken aan</Text>
            <Text style={styles.body}>
              Je ziet hier de cursussen van de vakken op je profiel bij de cursusdienst. Kies ze één
              keer; daarna staan ze hier.
            </Text>
            <Button label="Vakken kiezen" variant="ghost" onPress={() => onSubjects(catalog.subjectsUrl)} />
          </Card>
        ) : catalog.subjects.length === 0 ? (
          <Text style={styles.hint}>Voor je vakken is er dit semester (nog) niets te reserveren.</Text>
        ) : (
          catalog.subjects.map((subject) => (
            <View key={subject.id} style={styles.subject}>
              <View style={styles.subjectHead}>
                {subject.code ? <Text style={styles.code}>{subject.code}</Text> : null}
                <Text style={styles.subjectName}>{subject.name}</Text>
              </View>
              <View style={styles.register}>
                {subject.articles.map((article) => (
                  <ArticleRow
                    key={article.id}
                    article={article}
                    quantity={cart[article.id] ?? 0}
                    orderingOpen={orderingOpen}
                    onQuantity={(q) => onQuantity(article.id, q)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </View>

      {catalog.general.length > 0 ? (
        <View style={styles.block}>
          <SectionHeading>Voor iedereen</SectionHeading>
          {catalog.general.map((group) => (
            <View key={group.type} style={styles.subject}>
              <View style={styles.subjectHead}>
                <Text style={styles.subjectName}>{group.type}</Text>
              </View>
              <View style={styles.register}>
                {group.articles.map((article) => (
                  <ArticleRow
                    key={article.id}
                    article={article}
                    quantity={cart[article.id] ?? 0}
                    orderingOpen={orderingOpen}
                    onQuantity={(q) => onQuantity(article.id, q)}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

/**
 * Eén cursus. Twee lagen, zodat een lange titel niet tussen de omslag en de
 * stapper geperst wordt: bovenaan de titel en de auteur over de volle breedte,
 * daaronder de prijs en wat er over dit exemplaar te zeggen valt, met de stapper
 * rechts.
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

  return (
    <View style={styles.item}>
      <View style={styles.itemTop}>
        {article.coverUrl ? (
          <Image source={{ uri: article.coverUrl }} style={styles.cover} contentFit="cover" />
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
          {article.mandatory ? <Text style={styles.tag}>Verplicht</Text> : null}
          {reserved ? (
            <Text style={styles.mine}>{reserved.kind === 'ASSIGNED' ? 'Ligt voor je klaar' : 'Gereserveerd'}</Text>
          ) : bought ? (
            <Text style={styles.tag}>Al gekocht</Text>
          ) : article.stock ? (
            <Text style={[styles.stock, article.stock.tone === 'red' && styles.stockRed]}>{article.stock.label}</Text>
          ) : null}
          {!article.orderable && orderingOpen && !reserved && !bought ? (
            <Text style={styles.tag}>Nu niet online te reserveren</Text>
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
      <View style={styles.placedHead}>
        <Check size={18} color={COLORS.navy} />
        <Text style={[styles.title, styles.flex]}>Gereserveerd</Text>
      </View>
      <Text style={styles.body}>
        {parts.join(', ')}.{' '}
        {waiting > 0
          ? 'De cursusdienst mailt je zodra er iets voor je klaarligt.'
          : 'Haal je cursussen af aan de balie van de cursusdienst.'}
      </Text>
    </Card>
  );
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
  meta: { ...TYPE.small, color: COLORS.body },
  strong: { color: COLORS.ink, fontFamily: FONTS.semibold },
  link: { ...TYPE.small, fontFamily: FONTS.semibold, color: COLORS.navy },

  history: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.line2,
  },
  placedHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },

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
  register: { borderTopWidth: 1, borderTopColor: COLORS.line2 },
  item: {
    gap: SPACING.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line2,
  },
  itemTop: { flexDirection: 'row', gap: SPACING.md },
  itemBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  cover: { width: 40, height: 54, borderRadius: 6, backgroundColor: COLORS.paper2 },
  name: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink },
  tags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm },
  price: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  strike: { ...TYPE.small, color: COLORS.muted, textDecorationLine: 'line-through' },
  tag: {
    ...TYPE.small,
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.navy,
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  mine: {
    ...TYPE.small,
    fontSize: 12,
    fontFamily: FONTS.semibold,
    color: COLORS.ink,
    backgroundColor: COLORS.yellow,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  stock: { ...TYPE.small, fontSize: 12, color: COLORS.muted },
  stockRed: { color: COLORS.dangerInk },

  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line2,
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line2,
  },
  sheetTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: SPACING.md },
  choices: { gap: SPACING.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 56,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
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
