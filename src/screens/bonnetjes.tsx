import { Check, Ticket } from 'lucide-react-native';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { AppShiftYear, AppVoucherEntry } from '../api/contract';
import { fetchVouchers } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { PassCode } from '../components/PassCode';
import { RewardCoins } from '../components/RewardCoins';
import { Button, Card, CardList, ErrorState, Loading, SectionHeading, StaleNotice } from '../components/ui';
import { formatShortDate, formatVouchers } from '../format';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { CARD_SHADOW } from '../components/HomeSection';
import { HeadScroll } from '../components/HeadScroll';
import { t } from '../i18n';

/**
 * Bonnetjes: je shiften van dit jaar, wat ze opleverden en wat je ermee kan.
 *
 * De vorm komt van /shift/history op de site: je titel groot bovenaan met de
 * ladder van 3 tot 50 shiften en waar jij staat, daaronder je saldo met wat er
 * ooit verdiend en al gebruikt is, en wat er recent afging. De pas om mee te
 * betalen staat tussen het saldo en de lijst, want daarvoor open je dit scherm
 * aan een toog.
 *
 * **Eén bonnetje per begonnen uur shift**, en dat is een kringregel die op de
 * server leeft (`lib/shift/rewards.ts`), net als de titels en de telling
 * (`buildShiftHistory`). Hier staan enkel de uitkomsten.
 *
 * De naam is bewust "bonnetjes" en niet iets nieuws. De admin, de mails en de
 * afhaalbalie zeggen het al zo.
 *
 * Een server van voor november 2026 stuurt `shiftYear`, `earned` en `used` niet;
 * dan valt de ladder weg en blijft het saldo met de lijst.
 */
export default function BonnetjesScreen() {
  const router = useTabRouter();
  const { locale, viewer } = useApp();
  const resource = useResource(
    'bonnetjes',
    () => (viewer ? fetchVouchers(locale) : Promise.reject(new Error(t('Niet ingelogd', 'Not logged in')))),
    `${viewer?.id ?? 'anon'}:${locale}`,
  );

  if (!viewer) {
    return (
      <>
        <HeadScroll head={<PageHead title={t('Bonnetjes', 'Vouchers')} />} contentContainerStyle={styles.content} style={styles.root}>
          <View style={styles.pad}>
            <Card>
              <Text style={styles.title}>{t('Log eerst in', 'Log in first')}</Text>
              <Text style={styles.body}>{t('Je bonnetjes hangen aan je shiften en dus aan je account.', 'Your vouchers come from your shifts and so are linked to your account.')}</Text>
              <Button label={t('Inloggen', 'Log in')} onPress={() => router.push('/inloggen')} />
            </Card>
          </View>
        </HeadScroll>
      </>
    );
  }

  if (resource.loading) return <Loading label={t('Bonnetjes ophalen', 'Loading vouchers')} />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const { balance, earned, used, shiftYear, history } = resource.data;
  const spent = history.filter((entry) => entry.kind === 'spent').slice(0, 8);
  const earnedEntries = history.filter((entry) => entry.kind === 'earned').slice(0, 8);

  return (
    <>
      <HeadScroll head={<PageHead title={t('Bonnetjes', 'Vouchers')} subtitle={t('Eén per begonnen uur shift', 'One per started hour of shift')} />}
        contentContainerStyle={styles.content}
        style={styles.root}
        refreshControl={
          <RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} />
        }
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {shiftYear ? (
          <View style={styles.pad}>
            <Hero year={shiftYear} locale={locale} />
          </View>
        ) : null}

        <View style={[styles.pad, styles.section]}>
          <SectionHeading>{t('Je bonnetjes', 'Your vouchers')}</SectionHeading>
          <View style={styles.balanceRow}>
            <View style={styles.balance}>
              <RewardCoins
                display={formatVouchers(balance, locale)}
                label={`${formatVouchers(balance, locale)} ${balance === 1 ? t('bonnetje open', 'voucher available') : t('bonnetjes open', 'vouchers available')}`}
                size="lg"
              />
              <Text style={styles.hint}>{balance === 1 ? t('staat open', 'available') : t('staan open', 'available')}</Text>
            </View>
            {earned !== undefined && used !== undefined ? (
              <View style={styles.sums}>
                <Sum label={t('Ooit verdiend', 'Earned in total')} value={formatVouchers(earned, locale)} />
                <Sum label={t('Al gebruikt', 'Used')} value={formatVouchers(used, locale)} />
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.pad}>
          {balance > 0 ? (
            <View style={styles.passBlock}>
              <PassCode caption={t('Laat dit scannen om ermee te betalen.', 'Have this scanned to pay with them.')} />
              <Text style={styles.hint}>
                {t('Aan de toog en aan de afhaalbalie van het Theokot. Wie aanvaardt, ziet eerst je naam en je saldo en tikt dan pas een aantal in.', 'At the bar and at the Theokot pickup desk. The person accepting first sees your name and balance and only then enters an amount.')}
              </Text>
            </View>
          ) : (
            <Card>
              <Text style={styles.body}>
                {t('Je hebt geen openstaande bonnetjes. Ze komen er vanzelf bij zodra een shift waarop je stond, voorbij is.', 'You have no vouchers available. They are added automatically once a shift you were on is over.')}
              </Text>
              <Button label={t('Shiften bekijken', 'View shifts')} variant="ghost" onPress={() => router.push('/shiften')} />
            </Card>
          )}
        </View>

        {spent.length > 0 ? (
          <Register title={t('Recent gebruikt', 'Recently used')} entries={spent} locale={locale} />
        ) : null}
        {earnedEntries.length > 0 ? (
          <Register title={t('Recent verdiend', 'Recently earned')} entries={earnedEntries} locale={locale} />
        ) : null}

        {history.length > 0 && earned === undefined ? (
          <Text style={[styles.hint, styles.pad]}>
            {t('Deze lijst telt niet op naar het getal hierboven. Bonnetjes die een beheerder in geld uitbetaalde, gaan wel van je saldo af maar staan hier niet in.', 'This list does not add up to the number above. Vouchers that an admin paid out in money are deducted from your balance but are not listed here.')}
          </Text>
        ) : null}
      </HeadScroll>
    </>
  );
}

function shifts(n: number): string {
  return n === 1 ? '1 shift' : t(`${n} shiften`, `${n} shifts`);
}

/**
 * Je titel en de ladder, zoals de bovenste kaart van /shift/history. Op een
 * telefoon staat de ladder rechtop, van laag naar hoog, met "Jij" ertussen op de
 * plaats waar je nu staat.
 */
function Hero({ year, locale }: { year: AppShiftYear; locale: 'nl' | 'en' }) {
  const { count, tier, next } = year;
  const lede = [t(`Je deed dit werkingsjaar ${shifts(count)}.`, `You did ${shifts(count)} this academic year.`)];
  if (!next) lede.push(t('Hoger dan dit gaat de ladder niet.', 'The ladder does not go higher than this.'));
  else {
    const left = next.min - count;
    const unlocksPresale = next.min === year.presaleAt && !year.inPraesidiumNow;
    lede.push(
      unlocksPresale
        ? t(
            `Nog ${shifts(left)} tot ${next.name}, en dan zit je in de voorverkoop.`,
            `${shifts(left)} more until ${next.name}, and then you are in the presale.`,
          )
        : t(`Nog ${shifts(left)} tot ${next.name}.`, `${shifts(left)} more until ${next.name}.`),
    );
  }
  if (year.inPraesidiumNow) lede.push(t('Als praesidiumlid zit je al in de voorverkoop.', 'As a praesidium member you are already in the presale.'));
  else if (count >= year.presaleAt) lede.push(t('Je zit in de voorverkoop.', 'You are in the presale.'));

  // De ladder van laag naar hoog, met "Jij" voor de eerste titel die je nog niet hebt.
  const rows: ({ kind: 'tier'; min: number; name: string } | { kind: 'you' })[] = [];
  let placed = false;
  for (const step of year.tiers) {
    if (!placed && step.min > count) {
      rows.push({ kind: 'you' });
      placed = true;
    }
    rows.push({ kind: 'tier', ...step });
  }
  if (!placed) rows.push({ kind: 'you' });

  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>
            {t('WERKINGSJAAR', 'ACADEMIC YEAR')} {year.label}
          </Text>
          <Text style={[styles.tier, !tier && styles.tierEmpty]}>{tier ? tier.name : t('Nog geen titel', 'No title yet')}</Text>
        </View>
        <View style={styles.earned}>
          <RewardCoins
            display={formatVouchers(year.vouchers, locale)}
            label={t(
              `${formatVouchers(year.vouchers, locale)} bonnetjes verdiend dit werkingsjaar`,
              `${formatVouchers(year.vouchers, locale)} vouchers earned this academic year`,
            )}
            size="lg"
            withheld={year.praesidium}
          />
          <Text style={[styles.hint, styles.right]}>
            {year.praesidium ? t('geen bonnetjes in een praesidiumjaar', 'no vouchers in a praesidium year') : t('verdiend dit jaar', 'earned this year')}
          </Text>
        </View>
      </View>
      <Text style={styles.body}>{lede.join(' ')}</Text>

      <View style={styles.ladder} accessibilityLabel={t('Titels per aantal shiften', 'Titles per number of shifts')}>
        <View style={styles.rail} />
        {rows.map((row) => {
          if (row.kind === 'you') {
            return (
              <View key="you" style={styles.step}>
                <View style={[styles.node, styles.nodeYou]} />
                <View style={styles.youPill}>
                  <Text style={styles.youText}>{t('Jij:', 'You:')} {shifts(count)}</Text>
                </View>
              </View>
            );
          }
          const state = count >= row.min ? 'done' : next?.min === row.min ? 'next' : 'todo';
          return (
            <View
              key={row.min}
              style={styles.step}
              accessible
              accessibilityLabel={t(
                `${row.name}, vanaf ${shifts(row.min)}${state === 'done' ? ', gehaald' : ''}`,
                `${row.name}, from ${shifts(row.min)}${state === 'done' ? ', reached' : ''}`,
              )}
            >
              <View
                style={[
                  styles.node,
                  state === 'done' && styles.nodeDone,
                  state === 'next' && styles.nodeNext,
                ]}
              >
                {state === 'done' ? <Check color={COLORS.onYellow} size={12} strokeWidth={3} /> : null}
              </View>
              <Text style={styles.stepMin}>{row.min}</Text>
              <Text style={[styles.stepName, state !== 'todo' && styles.stepNameOn]} numberOfLines={1}>
                {row.name}
              </Text>
              {row.min === year.presaleAt ? (
                <View style={styles.presale}>
                  <Ticket color={COLORS.ink} size={12} />
                  <Text style={styles.presaleText}>{t('Voorverkoop', 'Presale')}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Sum({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.sum}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={styles.sumValue}>{value}</Text>
    </View>
  );
}

/** Een afschrift met haarlijnen, zoals "Recent gebruikt" op de site: wanneer, wat, hoeveel. */
function Register({
  title,
  entries,
  locale,
}: {
  title: string;
  entries: AppVoucherEntry[];
  locale: 'nl' | 'en';
}) {
  return (
    <View style={styles.section}>
      <View style={styles.pad}>
        <SectionHeading>{title}</SectionHeading>
      </View>
      <CardList inset={0} style={styles.cardList}>
        {entries.map((entry) => (
          <View key={entry.id} style={styles.entry}>
            <Text style={styles.entryWhen}>{formatShortDate(entry.at, locale, false)}</Text>
            <Text style={styles.entryWhat} numberOfLines={2}>
              {entry.id.startsWith('theokot:') ? t('Broodje aan de afhaalbalie', 'Sandwich at the pickup desk') : entry.label}
            </Text>
            <Text style={entry.kind === 'earned' ? styles.plus : styles.minus}>
              {entry.kind === 'earned' ? '+' : '-'}
              {formatVouchers(entry.amount, locale)}
            </Text>
          </View>
        ))}
      </CardList>
    </View>
  );
}

const styles = StyleSheet.create({
  cardList: { marginHorizontal: SPACING.lg },
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { paddingTop: SPACING.xl, gap: SPACING.xl, paddingBottom: SPACING.xxl },
  pad: { paddingHorizontal: SPACING.xl - 4 },
  section: { gap: SPACING.md },
  flex: { flex: 1 },
  right: { textAlign: 'right' },

  hero: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg + 2,
    gap: SPACING.md,
    ...CARD_SHADOW,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  eyebrow: { ...TYPE.kicker, color: COLORS.muted },
  tier: {
    fontFamily: FONTS.semibold,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1,
    color: COLORS.ink,
    marginTop: 4,
  },
  tierEmpty: { color: COLORS.muted, fontSize: 26, lineHeight: 32 },
  earned: { alignItems: 'flex-end', gap: 2, maxWidth: 130 },

  ladder: { marginTop: SPACING.xs, gap: 2 },
  // De lijn achter de knopen, van de eerste tot de laatste.
  rail: {
    position: 'absolute',
    left: 10,
    top: 12,
    bottom: 12,
    width: 2,
    backgroundColor: COLORS.paper2,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 32 },
  node: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeDone: { backgroundColor: COLORS.yellow, borderColor: COLORS.coinRim },
  nodeNext: { borderWidth: 3, borderColor: COLORS.ink },
  nodeYou: { width: 12, height: 12, borderRadius: 6, marginHorizontal: 5, borderWidth: 0, backgroundColor: COLORS.ink },
  stepMin: {
    width: 24,
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  stepName: { ...TYPE.body, color: COLORS.muted, flexShrink: 1 },
  stepNameOn: { color: COLORS.ink, fontFamily: FONTS.semibold },
  presale: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.paper2,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  presaleText: { fontFamily: FONTS.semibold, fontSize: 11.5, color: COLORS.ink },
  youPill: {
    backgroundColor: COLORS.ink,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  youText: { fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.paper },

  balanceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: SPACING.lg },
  balance: { gap: 2 },
  sums: { gap: SPACING.sm, alignItems: 'flex-end' },
  sum: { alignItems: 'flex-end' },
  sumLabel: { ...TYPE.small, color: COLORS.muted },
  sumValue: { fontFamily: FONTS.semibold, fontSize: 17, color: COLORS.ink, fontVariant: ['tabular-nums'] },

  passBlock: { gap: SPACING.md },


  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  entryWhen: { width: 56, ...TYPE.small, color: COLORS.muted, fontVariant: ['tabular-nums'] },
  entryWhat: { flex: 1, ...TYPE.body, color: COLORS.ink },
  plus: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  minus: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.muted, fontVariant: ['tabular-nums'] },

  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
});
