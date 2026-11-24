import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppCudiOrder } from '../api/contract';
import { cancelCudiLine, cudiCheckout, fetchCudiOverview } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { CudiOrderCard } from '../components/studies/CudiOrderCard';
import { Button, Card, Empty, ErrorState, Loading, SectionHeading, StaleNotice } from '../components/ui';
import { useTabRouter } from '../navigation';
import { useApp } from '../state/app';
import { COLORS, SPACING, TYPE } from '../theme/tokens';

/**
 * Al je bestellingen bij de cursusdienst, zoals Mijn bestellingen op cudi:
 * bovenaan wat nog iets van je vraagt, daaronder de rest.
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
          <View style={styles.block}>
            <SectionHeading>Lopend</SectionHeading>
            {open.map(card)}
          </View>
        ) : null}
        {done.length > 0 ? (
          <View style={styles.block}>
            <SectionHeading>Afgehandeld</SectionHeading>
            {done.map(card)}
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.xl - 4, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  block: { gap: SPACING.md },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
});
