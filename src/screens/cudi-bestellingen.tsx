import * as WebBrowser from 'expo-web-browser';
import { Hourglass, PackageCheck, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { AppCudiOrder } from '../api/contract';
import { cancelCudiLine, cudiCheckout, fetchCudiOverview } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { CudiOrderCard, euro, TONES } from '../components/studies/CudiOrderCard';
import { Button, Card, Empty, ErrorState, Loading, SectionHeading, StaleNotice } from '../components/ui';
import { useTabRouter } from '../navigation';
import { useApp } from '../state/app';
import { COLORS, FONTS, SPACING, TYPE } from '../theme/tokens';
import { HeadScroll } from '../components/HeadScroll';
import { t } from '../i18n';

/**
 * Al je bestellingen bij de cursusdienst, zoals Mijn bestellingen op cudi:
 * bovenaan in drie gekleurde tegels wat klaarligt, wat op de wachtlijst staat en
 * wat je nog moet betalen, daaronder wat nog iets van je vraagt, en dan de rest.
 *
 * Een regel annuleren kan hier, met dezelfde regels als op cudi (enkel zolang de
 * bestelling loopt en het artikel het toelaat). Een bestelling die cudi enkel
 * online laat betalen en die nog niet betaald is, krijgt de knop om dat alsnog te
 * doen.
 */
export default function CudiBestellingenScreen() {
  const { locale, viewer } = useApp();
  const router = useTabRouter();
  const resource = useResource(
    'cudi',
    () => fetchCudiOverview(locale),
    `${locale}:${viewer?.id ?? 'anon'}`,
    Boolean(viewer),
  );
  const [busy, setBusy] = useState<string | null>(null);

  const head = <PageHead title={t('Bestellingen', 'Orders')} subtitle={t('Bij de cursusdienst', 'At the course shop')} />;

  // Een oude link of een pushbericht kan hier binnenkomen zonder dat je ingelogd bent.
  if (!viewer) {
    return (
      <>
        <HeadScroll head={head} style={styles.root} contentContainerStyle={styles.content}>
          <Card>
            <Text style={styles.title}>{t('Log eerst in', 'Log in first')}</Text>
            <Text style={styles.body}>{t('Je bestellingen bij de cursusdienst hangen aan je VTK-account.', 'Your course shop orders are linked to your VTK account.')}</Text>
            <Button label={t('Inloggen', 'Log in')} onPress={() => router.push('/inloggen')} />
          </Card>
        </HeadScroll>
      </>
    );
  }

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
  if (data.orders.length === 0) {
    return (
      <>
        {head}
        <Empty title={t('Nog geen bestellingen', 'No orders yet')} hint={t('Wat je bij de cursusdienst reserveert, staat hier.', 'What you reserve at the course shop shows up here.')} />
      </>
    );
  }

  const open = data.orders.filter((order) => order.open);
  const done = data.orders.filter((order) => !order.open);
  const openLines = open.flatMap((order) => order.lines);
  const ready = openLines.filter((line) => line.status === 'ASSIGNED').reduce((n, line) => n + line.quantity, 0);
  const waiting = openLines.filter((line) => line.status === 'BOOKED').reduce((n, line) => n + line.quantity, 0);
  const toPay = open.filter((order) => !order.paidOnline).reduce((sum, order) => sum + order.total, 0);

  const cancel = (order: AppCudiOrder, line: AppCudiOrder['lines'][number]) => {
    Alert.alert(t('Uit je bestelling halen?', 'Remove from your order?'), t(
      `${line.title}, uit bestelling #${order.number}. Wie na jou op de wachtlijst staat, krijgt je exemplaar.`,
      `${line.title}, from order #${order.number}. Whoever is after you on the waiting list gets your copy.`,
    ), [
      { text: t('Behouden', 'Keep'), style: 'cancel' },
      {
        text: t('Uit bestelling halen', 'Remove from order'),
        style: 'destructive',
        onPress: async () => {
          setBusy(line.id);
          try {
            const result = await cancelCudiLine(locale, line.id);
            if (!result.ok) Alert.alert(t('Niet geannuleerd', 'Not cancelled'), result.message);
            await resource.reload();
          } catch (error) {
            Alert.alert(t('Niet geannuleerd', 'Not cancelled'), messageFor(error instanceof Error ? error : null));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const pay = async (order: AppCudiOrder) => {
    setBusy(order.id);
    try {
      const { checkoutUrl } = await cudiCheckout(locale, order.id);
      await WebBrowser.openBrowserAsync(checkoutUrl);
      await resource.reload();
    } catch (error) {
      Alert.alert(t('Betalen lukte niet', 'Payment failed'), messageFor(error instanceof Error ? error : null));
    } finally {
      setBusy(null);
    }
  };

  const card = (order: AppCudiOrder) => (
    <CudiOrderCard
      key={order.id}
      order={order}
      ordering={data.ordering}
      locale={locale}
      busy={busy}
      onCancel={(line) => cancel(order, line)}
      onPay={() => void pay(order)}
    />
  );

  return (
    <>
      <HeadScroll head={head}
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />}
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}
        {open.length > 0 ? (
          <View style={styles.tiles}>
            <Tile icon={PackageCheck} tone={TONES.ok} value={String(ready)} label={ready === 1 ? t('cursus ligt klaar', 'course book ready') : t('cursussen liggen klaar', 'course books ready')} />
            <Tile icon={Hourglass} tone={TONES.waiting} value={String(waiting)} label={t('op de wachtlijst', 'on the waiting list')} />
            <Tile icon={Wallet} tone={TONES.info} value={euro(toPay)} label={t('nog te betalen', 'still to pay')} />
          </View>
        ) : null}
        {open.length > 0 ? (
          <View style={styles.block}>
            <SectionHeading>{t(`Lopend · ${open.length}`, `In progress · ${open.length}`)}</SectionHeading>
            {open.map(card)}
          </View>
        ) : null}
        {done.length > 0 ? (
          <View style={styles.block}>
            <SectionHeading>{t(`Afgehandeld · ${done.length}`, `Completed · ${done.length}`)}</SectionHeading>
            {done.map(card)}
          </View>
        ) : null}
      </HeadScroll>
    </>
  );
}

/** Eén getal bovenaan, in de kleur van wat het telt. */
function Tile({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: typeof Wallet;
  tone: { bg: string; ink: string };
  value: string;
  label: string;
}) {
  return (
    <View style={[styles.tile, { backgroundColor: tone.bg }]} accessible accessibilityLabel={`${value} ${label}`}>
      <Icon size={18} color={tone.ink} />
      <Text style={[styles.tileValue, { color: tone.ink }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.tileLabel, { color: tone.ink }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  block: { gap: SPACING.md },
  tiles: { flexDirection: 'row', gap: SPACING.sm },
  tile: { flex: 1, borderRadius: 18, padding: SPACING.md, gap: 4 },
  tileValue: { fontFamily: FONTS.bold, fontSize: 22, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  tileLabel: { ...TYPE.small, fontSize: 12, lineHeight: 15, fontFamily: FONTS.medium },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
});
