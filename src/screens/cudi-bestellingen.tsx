import * as WebBrowser from 'expo-web-browser';
import { Hourglass, PackageCheck, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppCudiOrder } from '../api/contract';
import { cancelCudiLine, cudiCheckout, fetchCudiOverview } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { CudiOrderCard, euro, TONES } from '../components/studies/CudiOrderCard';
import { Button, Card, Empty, ErrorState, Loading, SectionHeading, StaleNotice } from '../components/ui';
import { useTabRouter } from '../navigation';
import { useApp } from '../state/app';
import { COLORS, FONTS, SPACING, TYPE } from '../theme/tokens';

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

  const head = <PageHead title="Bestellingen" subtitle="Bij de cursusdienst" />;

  // Een oude link of een pushbericht kan hier binnenkomen zonder dat je ingelogd bent.
  if (!viewer) {
    return (
      <>
        {head}
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>Je bestellingen bij de cursusdienst hangen aan je VTK-account.</Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
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
        <Empty title="Nog geen bestellingen" hint="Wat je bij de cursusdienst reserveert, staat hier." />
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
    Alert.alert('Uit je bestelling halen?', `${line.title}, uit bestelling #${order.number}. Wie na jou op de wachtlijst staat, krijgt je exemplaar.`, [
      { text: 'Behouden', style: 'cancel' },
      {
        text: 'Uit bestelling halen',
        style: 'destructive',
        onPress: async () => {
          setBusy(line.id);
          try {
            const result = await cancelCudiLine(locale, line.id);
            if (!result.ok) Alert.alert('Niet geannuleerd', result.message);
            await resource.reload();
          } catch (error) {
            Alert.alert('Niet geannuleerd', messageFor(error instanceof Error ? error : null));
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
      Alert.alert('Betalen lukte niet', messageFor(error instanceof Error ? error : null));
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
      {head}
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />}
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}
        {open.length > 0 ? (
          <View style={styles.tiles}>
            <Tile icon={PackageCheck} tone={TONES.ok} value={String(ready)} label={ready === 1 ? 'cursus ligt klaar' : 'cursussen liggen klaar'} />
            <Tile icon={Hourglass} tone={TONES.waiting} value={String(waiting)} label="op de wachtlijst" />
            <Tile icon={Wallet} tone={TONES.info} value={euro(toPay)} label="nog te betalen" />
          </View>
        ) : null}
        {open.length > 0 ? (
          <View style={styles.block}>
            <SectionHeading>{`Lopend · ${open.length}`}</SectionHeading>
            {open.map(card)}
          </View>
        ) : null}
        {done.length > 0 ? (
          <View style={styles.block}>
            <SectionHeading>{`Afgehandeld · ${done.length}`}</SectionHeading>
            {done.map(card)}
          </View>
        ) : null}
      </ScrollView>
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
