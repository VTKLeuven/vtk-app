import { Image } from 'expo-image';
import { CircleAlert } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import type { AppLocale, AppTheokot, AppTheokotItem, AppTheokotSession } from '../api/contract';
import {
  cancelTheokotOrder,
  fetchTheokot,
  placeTheokotOrder,
  releaseTheokotOrder,
  takeOverTheokotSandwich,
  updateTheokotOrder,
} from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { DatePin } from '../components/DatePin';
import { CARD_SHADOW } from '../components/HomeSection';
import { YellowHead } from '../components/YellowHead';
import { Stepper } from '../components/Stepper';
import { Button, Card, CardList, Empty, ErrorState, Loading, SectionHeading, StaleNotice } from '../components/ui';
import { formatDate, formatDay, formatEuro, formatTime, formatTimeRange } from '../format';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/** Onder dit aantal zegt de voorraad iets; daarboven staat ze er niet, zoals op /theokot. */
const LOW_STOCK = 5;

/**
 * Broodjes: bestellen, in de vorm van de bestelpagina van /theokot.
 *
 * Eén verkoopdag tegelijk, gekozen met de datumpinnen bovenaan; het broodje van
 * de week uitgelicht met zijn foto; het aanbod als lijst met een stapper; en het
 * totaal met de knop vast onderaan het scherm, zoals de site dat op een gsm doet.
 *
 * Alle regels staan op de server (`lib/theokot-orders.ts` in vtk-website-new): de
 * ban, het bestelvenster, hoeveel er per bestelling mag en wat er nog is. Dit
 * scherm rekent er wel mee, maar enkel om knoppen uit te schakelen; het beslist
 * niets. Is het hier soepeler dan op de server, dan is dat een bug in dit scherm.
 *
 * **Er is geen tabblad Afhalen.** Aan de balie van het Theokot scant men je
 * studentenkaart en geen QR-code; een code tonen heeft daar geen zin. Wat je
 * besteld hebt, staat bij de verkoopdag zelf, met het afhaaluur erbij. Een oud
 * adres met `?tab=afhalen` (een pushbericht, een taak op Home) komt dus gewoon
 * hier uit.
 */
export default function BroodjesScreen() {
  const router = useTabRouter();
  const { locale, viewer, gate, refresh: refreshApp } = useApp();
  const resource = useResource('theokot', () => fetchTheokot(locale), locale);

  // De gele kop van de andere schermen; `extra` komt onderaan in het geel (de
  // verkoopdagen, en je bestelling als je er al een hebt).
  const head = (extra?: React.ReactNode) => (
    <YellowHead title="Broodjes" subtitle="Bestellen en afhalen in het Theokot" back>
      {extra}
    </YellowHead>
  );

  if (!viewer) {
    return (
      <>
        {head()}
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>
              Een bestelling hangt aan jouw naam, dus die kan enkel met een account. Hetzelfde
              account als op vtk.be.
            </Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (gate) {
    return (
      <>
        {head()}
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card featured>
            <Text style={styles.title}>
              {gate === 'onboarding' ? 'Werk eerst je profiel af' : 'Bevestig eerst je studie'}
            </Text>
            <Text style={styles.body}>
              Zolang dit openstaat kan je niet bestellen. Het duurt een minuut.
            </Text>
            <Button
              label="Nu doen"
              onPress={() => router.push({ pathname: '/poort', params: { gate } })}
            />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (resource.loading) return <Loading label="Aanbod ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  return (
    <View style={styles.root}>
      <Ordering
        head={head}
        data={resource.data}
        stale={resource.stale}
        refreshing={resource.refreshing}
        onRefresh={() => void resource.refresh()}
        locale={locale}
        onChanged={() => {
          void resource.reload();
          void refreshApp();
        }}
      />
    </View>
  );
}

/**
 * Bestellen: de verkoopdagen als datumpinnen, en van de gekozen dag het aanbod.
 * Standaard de eerste dag waarop je nog kan bestellen of al iets hebt staan.
 */
function Ordering({
  head,
  data,
  stale,
  refreshing,
  onRefresh,
  locale,
  onChanged,
}: {
  /** De gele kop; scrolt mee met de rest. */
  head: (extra?: React.ReactNode) => React.ReactNode;
  data: AppTheokot;
  stale: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  locale: AppLocale;
  onChanged: () => void;
}) {
  const { sessions, ban, message, maxItemsPerOrder, maxWeeklySpecialPerOrder } = data;
  const [picked, setPicked] = useState<string | null>(null);
  const fallback =
    sessions.find((session) => session.canOrder || session.order || session.canTakeOver) ?? sessions[0];
  const session = sessions.find((item) => item.id === picked) ?? fallback;

  // Wat bovenaan op het papier staat, onder de kop: oude gegevens, een schorsing,
  // een bericht van de Theokot-ploeg.
  const notices = (
    <>
      {stale ? <StaleNotice onRetry={onRefresh} /> : null}

      {ban ? (
        <Card featured>
          <View style={styles.rowIcon}>
            <CircleAlert color={COLORS.ink} size={18} />
            <Text style={styles.title}>Tijdelijk geschorst</Text>
          </View>
          <Text style={styles.body}>
            Je kan tot {formatDate(ban.until, locale)} niet bestellen, omdat er bestellingen niet
            opgehaald zijn. Daarna gaat het vanzelf weer.
          </Text>
        </Card>
      ) : null}

      {message ? (
        <Card featured>
          <Text style={styles.kicker}>Van het Theokot</Text>
          <Text style={styles.body}>{message}</Text>
        </Card>
      ) : null}
    </>
  );

  // De verkoopdagen als datumpinnen in het geel (voorstel 1, november 2026).
  const pins =
    sessions.length > 1 ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.daysScroll}
        contentContainerStyle={styles.days}
      >
        {sessions.map((item) => {
          const active = item.id === session?.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.order ? `${formatDay(item.date, locale)}, besteld` : formatDay(item.date, locale)}
              onPress={() => setPicked(item.id)}
            >
              <DatePin iso={item.date} locale={locale} tone={active ? 'ink' : 'plain'} month={false} />
              {item.order ? <View style={styles.dayDot} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    ) : null;

  if (!session) {
    return (
      <ScrollView
        contentContainerStyle={styles.scroll}
        style={styles.root}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.overscroll} />
        {head(pins)}
        <View style={styles.content}>
          {notices}
          <Empty
            title="Geen verkoopdagen open"
            hint="Er staat nu niets klaar om te bestellen. Het Theokot zet de dagen meestal een paar dagen op voorhand open."
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <SessionView
      session={session}
      head={(extra) =>
        head(
          <>
            {pins}
            {extra}
          </>,
        )
      }
      notices={notices}
      refreshing={refreshing}
      onRefresh={onRefresh}
      locale={locale}
      banned={Boolean(ban)}
      maxItems={maxItemsPerOrder}
      maxWeeklySpecial={maxWeeklySpecialPerOrder}
      onChanged={onChanged}
    />
  );
}

function OrderLines({
  order,
  label,
}: {
  order: NonNullable<AppTheokotSession['order']>;
  label: string;
}) {
  return (
    <View style={styles.lines}>
      {order.lines.map((line, index) => (
        <View key={`${line.name}-${index}`} style={styles.orderLine}>
          <Text style={styles.orderQty}>{line.quantity}x</Text>
          <Text style={styles.orderName}>{line.name}</Text>
          <Text style={styles.orderPrice}>{formatEuro(line.quantity * line.unitPriceCents)}</Text>
        </View>
      ))}
      <View style={styles.orderTotal}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.title}>{formatEuro(order.totalCents)}</Text>
      </View>
    </View>
  );
}

/**
 * Eén verkoopdag: je reservatie, het aanbod en de balk onderaan. Een eigen
 * component met een `key` per dag, zodat wat je op de ene dag aantikte niet
 * meeschuift naar de volgende.
 */
function SessionView({
  session,
  head,
  notices,
  refreshing,
  onRefresh,
  locale,
  banned,
  maxItems,
  maxWeeklySpecial,
  onChanged,
}: {
  session: AppTheokotSession;
  /** De gele kop met de verkoopdagen; `extra` is je bestelling, onder de dagen. */
  head: (extra?: React.ReactNode) => React.ReactNode;
  notices: React.ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
  locale: AppLocale;
  banned: boolean;
  maxItems: number;
  maxWeeklySpecial: number;
  onChanged: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  // Een bestaande reservatie aanpassen: dezelfde stappers, met je eigen broodjes
  // al ingevuld en als vrije voorraad meegeteld (`updateOrder` op de server).
  const [editing, setEditing] = useState(false);
  // Een andere dag gekozen: de keuzes van de vorige dag weg. Hier en niet met een
  // `key` op dit scherm, want die bouwde ook de kop met de foto en de scrollstrook
  // opnieuw op, en dan flitste de foto bij elke dagwissel en sprong je naar boven.
  const [shownSession, setShownSession] = useState(session.id);
  if (shownSession !== session.id) {
    setShownSession(session.id);
    setQuantities({});
    setEditing(false);
  }
  const order = session.order;
  const own = useMemo(() => {
    const map: Record<string, number> = {};
    for (const line of order?.lines ?? []) {
      if (line.sessionItemId) map[line.sessionItemId] = (map[line.sessionItemId] ?? 0) + line.quantity;
    }
    return map;
  }, [order]);

  const totals = useMemo(() => {
    let items = 0;
    let specials = 0;
    let cents = 0;
    for (const item of session.items) {
      const quantity = quantities[item.id] ?? 0;
      items += quantity;
      if (item.isWeeklySpecial) specials += quantity;
      cents += quantity * item.priceCents;
    }
    return { items, specials, cents };
  }, [quantities, session.items]);

  const setQuantity = useCallback((itemId: string, next: number) => {
    setQuantities((current) => ({ ...current, [itemId]: next }));
  }, []);

  const pickupEnd = formatTime(session.pickupEnd, locale);
  const ordering = session.window === 'OPEN' && (!order || editing);

  const submit = async () => {
    setBusy(true);
    const lines = session.items
      .map((item) => ({ sessionItemId: item.id, quantity: quantities[item.id] ?? 0 }))
      .filter((line) => line.quantity > 0);
    try {
      if (editing && order) {
        await updateTheokotOrder({ orderId: order.orderId, lines });
        setEditing(false);
      } else {
        await placeTheokotOrder({ sessionId: session.id, lines });
      }
      setQuantities({});
      onChanged();
    } catch (error) {
      Alert.alert(editing ? 'Aanpassen lukte niet' : 'Bestellen lukte niet', orderErrorText(error));
      // Ook bij een fout opnieuw ophalen: "uitverkocht" en "al besteld" betekenen
      // allebei dat dit scherm achterloopt op de werkelijkheid.
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setQuantities(own);
    setEditing(true);
  };

  /**
   * Na de deadline worden de broodjes al gemaakt: annuleren wordt vrijgeven. Een
   * ander kan ze dan overnemen; wat bij het einde van de afhaal nog vrij staat,
   * telt als no-show. Dezelfde uitleg als in de bevestiging op /theokot.
   */
  const release = () => {
    if (!order) return;
    Alert.alert(
      'Vrijgeven voor overname',
      `De deadline is verstreken en je broodjes worden al gemaakt. Wat je nu annuleert, wordt vrijgegeven voor overname. Neemt iemand anders het over, dan vervalt het zonder gevolgen. Blijft het om ${pickupEnd} over, dan telt dit als een no-show.`,
      [
        { text: 'Behouden', style: 'cancel' },
        {
          text: 'Vrijgeven',
          style: 'destructive',
          onPress: () => void act(() => releaseTheokotOrder({ orderId: order.orderId }), 'Vrijgeven lukte niet'),
        },
      ],
    );
  };

  const takeOver = (item: AppTheokotItem) => {
    Alert.alert(
      'Broodje overnemen?',
      `Je neemt 1x ${item.name} over voor ${formatEuro(item.priceCents)}. Je haalt het af en betaalt aan de balie, tot ${pickupEnd}. Haal je het niet op, dan telt dat als een no-show.`,
      [
        { text: 'Toch niet', style: 'cancel' },
        {
          text: 'Overnemen',
          onPress: () => void act(() => takeOverTheokotSandwich(item.id), 'Overnemen lukte niet'),
        },
      ],
    );
  };

  const cancel = () => {
    if (!order) return;
    Alert.alert(
      'Bestelling annuleren',
      `Je annuleert je bestelling van ${formatDay(session.date, locale)}. De broodjes komen weer vrij voor iemand anders.`,
      [
        { text: 'Behouden', style: 'cancel' },
        {
          text: 'Annuleren',
          style: 'destructive',
          onPress: () => void act(() => cancelTheokotOrder(order.orderId), 'Annuleren lukte niet'),
        },
      ],
    );
  };

  const act = async (run: () => Promise<unknown>, failed: string) => {
    setBusy(true);
    try {
      await run();
    } catch (error) {
      Alert.alert(failed, orderErrorText(error));
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const offered = session.canTakeOver ? session.items.filter((item) => (item.released ?? 0) > 0) : [];
  const ownCount = order?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;
  const ownWeekly = (order?.lines ?? []).reduce(
    (sum, line) =>
      sum + (session.items.find((item) => item.id === line.sessionItemId)?.isWeeklySpecial ? line.quantity : 0),
    0,
  );
  const special = session.items.find((item) => item.isWeeklySpecial);
  const regular = session.items.filter((item) => item !== special);

  /** De bovengrens per item: wat er nog is, wat er nog in de bestelling past, en de aparte limiet van het broodje van de week. */
  const limitFor = (item: AppTheokotItem) => {
    const quantity = quantities[item.id] ?? 0;
    const available = item.remaining + (editing ? (own[item.id] ?? 0) : 0);
    const roomInOrder = maxItems - totals.items + quantity;
    const roomForSpecial = item.isWeeklySpecial
      ? maxWeeklySpecial - totals.specials + quantity
      : Number.POSITIVE_INFINITY;
    return { quantity, available, max: Math.max(0, Math.min(available, roomInOrder, roomForSpecial)) };
  };

  const stock = (available: number) =>
    available === 0 ? 'uitverkocht' : available <= LOW_STOCK ? `nog ${available}` : null;

  // Wie al besteld heeft, ziet zijn bestelling meteen in het geel onder de dagen
  // (voorstel 3, november 2026), met aanpassen, annuleren of vrijgeven erbij.
  const yours =
    order && !editing ? (
      <View style={styles.yours}>
        <Text style={styles.kicker}>Jouw bestelling voor {weekdayOf(session.date, locale)}</Text>
        <OrderLines order={order} label="Totaal" />
        <Text style={styles.hint}>
          Afhalen {formatTimeRange(session.pickupStart, session.pickupEnd, locale)} aan de balie, met je studentenkaart.
        </Text>
        {order.releasedCount ? (
          <Text style={styles.hint}>
            {order.releasedCount === 1
              ? '1 broodje van deze bestelling staat vrij voor overname en is niet meer van jou.'
              : `${order.releasedCount} broodjes van deze bestelling staan vrij voor overname en zijn niet meer van jou.`}{' '}
            Wat om {pickupEnd} niet overgenomen is, telt als no-show.
          </Text>
        ) : null}
        {order.canCancel ? (
          <View style={styles.buttons}>
            {order.canEdit ? (
              <View style={styles.flex}>
                <Button label="Aanpassen" variant="ghost" busy={busy} onPress={startEditing} />
              </View>
            ) : null}
            <View style={styles.flex}>
              <Button label="Annuleren" variant="ghost" busy={busy} onPress={cancel} />
            </View>
          </View>
        ) : order.canRelease && order.lines.length > 0 ? (
          <>
            <Text style={styles.hint}>
              De deadline is voorbij en je broodjes worden al gemaakt. Kan je toch niet komen,
              geef ze dan vrij: een ander kan ze overnemen.
            </Text>
            <Button label="Annuleren en vrijgeven" variant="ghost" busy={busy} onPress={release} />
          </>
        ) : (
          <Text style={styles.hint}>
            Kom je bestelling zeker afhalen: drie keer niet afhalen levert een tijdelijke
            schorsing op.
          </Text>
        )}
      </View>
    ) : null;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.overscroll} />
        {head(yours)}
        <View style={styles.content}>
          {notices}

          <Text style={styles.when}>
            {session.window === 'UPCOMING' ? (
              <>Bestellen opent <Text style={styles.strong}>{formatDay(session.orderOpenAt, locale)}</Text>, </>
            ) : session.window === 'OPEN' ? (
              <>Bestellen tot <Text style={styles.strong}>{formatDay(session.orderCloseAt, locale)} {formatTime(session.orderCloseAt, locale)}</Text>, </>
            ) : (
              <>Bestellen is gesloten, </>
            )}
            afhalen <Text style={styles.strong}>{formatTimeRange(session.pickupStart, session.pickupEnd, locale)}</Text>.
          </Text>

          {ordering ? (
            <>
              {special ? (
                <View style={styles.special}>
                  {special.imageUrl ? (
                    <Image cachePolicy="memory-disk" source={{ uri: special.imageUrl }} style={styles.specialPhoto} contentFit="cover" />
                  ) : null}
                  <View style={styles.specialBody}>
                    <Text style={styles.tag}>BROODJE VAN DE WEEK</Text>
                    <Text style={styles.specialName}>{special.name}</Text>
                    {special.ingredients ? <Text style={styles.hint}>{special.ingredients}</Text> : null}
                    <View style={styles.specialLine}>
                      <Text style={styles.price}>
                        {formatEuro(special.priceCents)}
                        {stock(limitFor(special).available) ? (
                          <Text style={styles.low}>   {stock(limitFor(special).available)}</Text>
                        ) : null}
                      </Text>
                      <Stepper
                        value={limitFor(special).quantity}
                        max={limitFor(special).max}
                        label={special.name}
                        disabled={banned || limitFor(special).available === 0}
                        onChange={(next) => setQuantity(special.id, next)}
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              <SectionHeading>Het aanbod</SectionHeading>
              <CardList style={styles.flat}>
                {regular.map((item) => {
                  const { quantity, available, max } = limitFor(item);
                  return (
                    <View key={item.id} style={styles.item}>
                      {/* Het Theokot werkt zonder foto's; een leeg vakje ervoor las als een
                          afbeelding die niet laadde. Zet iemand er toch een, dan staat ze er. */}
                      {item.imageUrl ? (
                        <Image cachePolicy="memory-disk" source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="cover" />
                      ) : null}
                      <View style={styles.flex}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        {item.ingredients ? (
                          <Text style={styles.hint} numberOfLines={2}>
                            {item.ingredients}
                          </Text>
                        ) : null}
                        <Text style={styles.itemMeta}>
                          {formatEuro(item.priceCents)}
                          {stock(available) ? <Text style={styles.low}>   {stock(available)}</Text> : null}
                        </Text>
                      </View>
                      <Stepper
                        value={quantity}
                        max={max}
                        label={item.name}
                        disabled={banned || available === 0}
                        onChange={(next) => setQuantity(item.id, next)}
                      />
                    </View>
                  );
                })}
              </CardList>
            </>
          ) : null}

          {offered.length > 0 && !banned ? (
            <View style={styles.takeover}>
              <SectionHeading>Vrijgekomen broodjes</SectionHeading>
              <Text style={styles.hint}>
                Na de deadline geannuleerd en al gemaakt. Neem je een broodje over, dan haal je het
                af en betaal je aan de balie, tot {pickupEnd}.
              </Text>
              <CardList style={styles.flat}>
                {offered.map((item) => {
                  const full =
                    ownCount + 1 > maxItems || (item.isWeeklySpecial && ownWeekly + 1 > maxWeeklySpecial);
                  return (
                    <View key={item.id} style={styles.item}>
                      <View style={styles.flex}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemMeta}>
                          {formatEuro(item.priceCents)}   {item.released} vrij
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy || full}
                        onPress={() => takeOver(item)}
                        style={({ pressed }) => [styles.smallButton, (busy || full) && styles.disabled, pressed && styles.pressed]}
                      >
                        <Text style={styles.smallButtonLabel}>Overnemen</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </CardList>
            </View>
          ) : null}

          {!ordering && !order && offered.length === 0 ? (
            <Text style={styles.hint}>
              {session.window === 'UPCOMING'
                ? 'Het aanbod verschijnt hier zodra het bestellen opengaat.'
                : 'Bestellen is gesloten voor deze dag.'}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {ordering ? (
        <View style={styles.bar}>
          <View style={styles.flex}>
            <Text style={styles.barTotal}>
              {totals.items === 0
                ? 'Kies je broodjes'
                : `${totals.items} ${totals.items === 1 ? 'broodje' : 'broodjes'}, ${formatEuro(totals.cents)}`}
            </Text>
            <Text style={styles.hint}>
              {editing ? (
                <Text style={styles.link} onPress={() => { setEditing(false); setQuantities({}); }}>
                  Niet aanpassen
                </Text>
              ) : (
                `Tot ${maxItems} per dag`
              )}
            </Text>
          </View>
          <View style={styles.barButton}>
            <Button
              label={editing ? 'Bewaren' : 'Bestellen'}
              busy={busy}
              disabled={banned || totals.items === 0}
              onPress={() => void submit()}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** "maandag", voor "Jouw bestelling voor maandag". */
function weekdayOf(iso: string, locale: AppLocale): string {
  return formatDay(iso, locale).split(' ')[0] ?? '';
}

/**
 * De melding bij een geweigerde bestelling.
 *
 * De server stuurt een code en geen zin, precies zodat die hier in het Nederlands
 * van de app staat. Wat we niet doen is de reden verzwijgen: "er ging iets mis"
 * laat iemand opnieuw proberen terwijl hij geschorst is.
 */
function orderErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Geen verbinding met vtk.be. Probeer het straks opnieuw.';
  }
  switch (error.code) {
    case 'BANNED':
      return 'Je bent tijdelijk geschorst omdat er bestellingen niet opgehaald zijn.';
    case 'ORDER_CLOSED':
      return 'Bestellen is intussen gesloten voor deze dag.';
    case 'ALREADY_ORDERED':
      return 'Je hebt al een bestelling voor deze dag. Eén per dag.';
    case 'SESSION_NOT_FOUND':
      return 'Deze verkoopdag bestaat niet meer.';
    case 'ORDER_NOT_FOUND':
      return 'Die bestelling is er niet meer.';
    case 'NOT_CANCELABLE':
      return 'Deze bestelling kan niet meer geannuleerd worden.';
    case 'CANCEL_DEADLINE_PASSED':
      return 'De annulatiedeadline is voorbij.';
    case 'TAKEOVER_CLOSED':
      return 'De afhaal is voorbij: vrijgeven of overnemen kan niet meer.';
    case 'RELEASE_NOT_POSSIBLE':
      return 'Deze bestelling kan niet vrijgegeven worden. Een bestelling in de doos van een grocomeet ligt niet aan de balie.';
    case 'NOTHING_RELEASED':
      return 'Er is niets vrijgegeven om over te nemen.';
    case 'TAKEOVER_UNAVAILABLE':
      return 'Dit broodje is intussen al overgenomen.';
    case 'INVALID_ORDER':
      return 'Er is intussen iets veranderd aan het aanbod. Het scherm is bijgewerkt; probeer opnieuw.';
    default:
      return error.message;
  }
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
    backgroundColor: COLORS.yellow,
  },
  content: { paddingHorizontal: SPACING.xl - 4, paddingTop: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  flex: { flex: 1 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  strong: { fontFamily: FONTS.semibold, color: COLORS.ink },
  kicker: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  rowIcon: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  link: { color: COLORS.navy, textDecorationLine: 'underline' },

  // De dagen lopen tot tegen de rand van het scherm, met lucht boven en onder:
  // anders knipte de rand van de scrollstrook de schaduw van de vakjes af, en dat
  // las als een grijze band met een harde lijn erachter.
  daysScroll: { flexGrow: 0, marginHorizontal: -(SPACING.xl - 4), marginVertical: -SPACING.md },
  days: { gap: SPACING.sm, paddingHorizontal: SPACING.xl - 4, paddingVertical: SPACING.md },
  // Een stipje onder de dag waarop je al iets besteld hebt.
  dayDot: {
    alignSelf: 'center',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.navy,
    marginTop: 4,
  },
  when: { ...TYPE.small, fontSize: 14, lineHeight: 20, color: COLORS.body },

  // Op Broodjes is alles één vlak: kaarten met een dun randje en zonder schaduw,
  // want de schaduwen kleurden de grond rond de dagen en de kaarten grijzer.
  flat: { shadowOpacity: 0, elevation: 0, borderWidth: 1, borderColor: COLORS.line2 },
  // Je bestelling, als witte kaart in het geel.
  yours: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.lg,
    gap: SPACING.sm,
    ...CARD_SHADOW,
  },
  buttons: { flexDirection: 'row', gap: SPACING.sm },
  lines: { gap: SPACING.xs },
  orderLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  orderQty: { ...TYPE.body, color: COLORS.muted, minWidth: 24, fontVariant: ['tabular-nums'] },
  orderName: { ...TYPE.body, color: COLORS.ink, flex: 1 },
  orderPrice: { ...TYPE.body, color: COLORS.body, fontVariant: ['tabular-nums'] },
  orderTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: SPACING.sm,
    marginTop: SPACING.xs,
  },

  // Het broodje van de week: een witte kaart met een geel label.
  special: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.line2,
  },
  specialPhoto: {
    width: '100%',
    aspectRatio: 2.6,
    backgroundColor: COLORS.paper2,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  specialBody: { padding: SPACING.lg, gap: 6 },
  tag: {
    alignSelf: 'flex-start',
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: COLORS.ink,
    backgroundColor: COLORS.yellow,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  specialName: { fontFamily: FONTS.bold, fontSize: 21, lineHeight: 26, letterSpacing: -0.5, color: COLORS.ink },
  specialLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  price: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  low: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.muted },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  thumb: { width: 44, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.paper2 },
  itemName: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink },
  itemMeta: { ...TYPE.small, color: COLORS.body, fontVariant: ['tabular-nums'] },

  takeover: { gap: SPACING.sm, marginTop: SPACING.sm },
  smallButton: {
    backgroundColor: COLORS.ink,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 16,
    minHeight: 40,
    justifyContent: 'center',
  },
  smallButtonLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.paper },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },


  // Het totaal en de knop, vast onderaan zoals op /theokot op een gsm.
  // Zwevend boven de tabbalk, als een kaart.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.navy,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  barTotal: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  barButton: { minWidth: 132 },
});
