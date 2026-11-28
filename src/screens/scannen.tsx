
import { Beer, Coins, DoorOpen, ScanLine, TicketCheck } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import type { AppFakCheckin, AppPassHolder } from '../api/contract';
import { fakCheckin, lookupPass, redeemScannerInvite, redeemVouchers } from '../api/endpoints';
import { PageHead } from '../components/PageHead';
import { QrScanner } from '../components/QrScanner';
import { Stepper } from '../components/Stepper';
import { Button, Card, Loading } from '../components/ui';
import { formatEuro, formatVouchers } from '../format';
import { scanKindOf, UNKNOWN_SCAN_MESSAGE } from '../scanKind';
import { useApp } from '../state/app';
import { useTabRouter } from '../navigation';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { HeadScroll } from '../components/HeadScroll';
import { t } from '../i18n';

type ScanResult =
  | { kind: 'busy' }
  | { kind: 'error'; message: string }
  | { kind: 'ticket' }
  | { kind: 'invite'; title: string; eventId: string; already: boolean }
  | { kind: 'fakbar'; text: string; detail: string }
  | { kind: 'pass'; pass: string; holder: AppPassHolder };

/**
 * Eén scanner voor alles wat je bij VTK voorgehouden krijgt.
 *
 * Vier soorten codes, en de code zegt zelf welke (zie `src/scanKind.ts`):
 *
 * - **een uitnodiging** van een praesidiumlid: je krijgt scanrechten voor dat ene
 *   evenement en staat een tel later aan de deur. Dit is de reden dat een shifter
 *   niets hoeft te installeren en niemand hem met de hand moet toevoegen.
 * - **de code aan de fakbar**: check-in zonder studentenkaart.
 * - **de pas van een student**: bonnetjes aanvaarden als betaling.
 * - **een ticket**: dat scan je niet hier maar aan de deur (`deur.tsx`), want een
 *   ticket is altijd voor één evenement, en de scanner daar heeft de offline
 *   lijst, de wachtrij en de namen. Dit scherm verwijst ernaar.
 *
 * Dit scherm staat voor iedereen open (onder Meer), want de fakbar-QR en de
 * uitnodiging scant een gewone student. De deurscanner niet: die bestaat enkel
 * voor wie iets te scannen heeft (`abilities.scanTickets`).
 *
 * De uitkomst blijft staan tot je ze wegtikt, en de camera pauzeert zolang. Aan
 * een deur wil je zien wat er gebeurde voor de volgende persoon voorstapt; een
 * melding die na een seconde wegvalt, wordt door de helft gemist.
 */
export default function ScannenScreen() {
  const router = useTabRouter();
  const { viewer, bootstrap, refresh } = useApp();
  const [result, setResult] = useState<ScanResult | null>(null);

  const mayAcceptVouchers = bootstrap?.abilities?.acceptVouchers ?? false;
  const mayScanTickets = bootstrap?.abilities?.scanTickets ?? false;

  const handle = useCallback(
    (value: string) => {
      const kind = scanKindOf(value);

      if (kind === 'ticket') {
        setResult({ kind: 'ticket' });
        return;
      }
      if (kind === 'unknown') {
        setResult({ kind: 'error', message: UNKNOWN_SCAN_MESSAGE });
        return;
      }

      setResult({ kind: 'busy' });

      if (kind === 'invite') {
        void redeemScannerInvite(value)
          .then((invite) => {
            setResult({
              kind: 'invite',
              title: invite.title,
              eventId: invite.eventId,
              already: invite.alreadyHadAccess,
            });
            // De rechten opnieuw ophalen: wie net scanner werd, hoort vanaf nu
            // Tickets scannen te zien in Tickets en onder Meer.
            void refresh();
          })
          .catch((error) => setResult({ kind: 'error', message: scanError(error) }));
        return;
      }

      if (kind === 'fakbar') {
        void fakCheckin(value)
          .then((checkin) =>
            setResult({
              kind: 'fakbar',
              text: checkin.counted ? t('Ingecheckt', 'Checked in') : t('Al ingecheckt', 'Already checked in'),
              detail: fakCheckinDetail(checkin),
            }),
          )
          .catch((error) => setResult({ kind: 'error', message: scanError(error) }));
        return;
      }

      if (!mayAcceptVouchers) {
        setResult({
          kind: 'error',
          message: t('Dit is de pas van een student. Je hebt geen rechten om er bonnetjes van af te boeken.', 'This is a student pass. You do not have rights to deduct vouchers from it.'),
        });
        return;
      }

      void lookupPass(value)
        .then((holder) => setResult({ kind: 'pass', pass: value, holder }))
        .catch((error) => setResult({ kind: 'error', message: scanError(error) }));
    },
    [mayAcceptVouchers, refresh],
  );

  if (!viewer) {
    return (
      <>
        <HeadScroll head={<PageHead title={t('Scannen', 'Scan')} />} contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>{t('Log eerst in', 'Log in first')}</Text>
            <Text style={styles.body}>
              {t('Wat je scant hangt aan jouw account: je scanrechten, je check-in aan de bar, en wie er afboekt.', 'What you scan is linked to your account: your scan rights, your check-in at the bar, and who deducts.')}
            </Text>
            <Button label={t('Inloggen', 'Log in')} onPress={() => router.push('/inloggen')} />
          </Card>
        </HeadScroll>
      </>
    );
  }

  return (
    <>
      <HeadScroll head={<PageHead title={t('Scannen', 'Scan')} subtitle={t('Uitnodiging, fakbar of een pas', 'Invitation, student bar or a pass')} />} contentContainerStyle={styles.content} style={styles.root}>
        <QrScanner
          onScan={handle}
          paused={result !== null}
          hint={t('Houd de code in het vierkant', 'Hold the code inside the square')}
        />

        {result ? (
          <Result
            result={result}
            onClose={() => setResult(null)}
            onOpenEvent={(id) => {
              setResult(null);
              router.push(`/scan/${id}`);
            }}
            onOpenDoor={() => {
              setResult(null);
              router.push('/deur');
            }}
            mayScanTickets={mayScanTickets}
            onRedeemed={() => setResult(null)}
          />
        ) : null}

        {/* Enkel voor wie iets te scannen heeft. Een gewone student krijgt
            deze knop pas na een uitnodiging, en dan ook meteen het event. */}
        {mayScanTickets && !result ? (
          <Button label={t('Tickets scannen', 'Scan tickets')} variant="ghost" onPress={() => router.push('/deur')} />
        ) : null}
      </HeadScroll>
    </>
  );
}

/** Wat er na een scan op het scherm blijft staan tot iemand het wegtikt. */
function Result({
  result,
  onClose,
  onOpenEvent,
  onOpenDoor,
  mayScanTickets,
  onRedeemed,
}: {
  result: ScanResult;
  onClose: () => void;
  onOpenEvent: (eventId: string) => void;
  onOpenDoor: () => void;
  mayScanTickets: boolean;
  onRedeemed: () => void;
}) {
  if (result.kind === 'busy') return <Loading label={t('Bezig', 'Busy')} />;

  // Een ticket telt pas wanneer het aan de deur van zijn evenement gescand wordt;
  // hier zou het nergens meetellen.
  if (result.kind === 'ticket') {
    return (
      <Card style={styles.resultCard}>
        <View style={styles.resultHead}>
          <DoorOpen color={COLORS.muted} size={18} />
          <Text style={styles.title}>{t('Dit is een ticket', 'This is a ticket')}</Text>
        </View>
        <Text style={styles.body}>
          {mayScanTickets
            ? t('Tickets scan je onder Tickets scannen: kies daar het evenement, dan telt de scan ook mee.', 'Scan tickets under Scan tickets: choose the event there, so the scan counts.')
            : t('Tickets scant wie aan de deur staat. Kom je helpen? Vraag de organisator om de uitnodigings-QR en scan die hier.', 'Tickets are scanned by the people at the door. Coming to help? Ask the organiser for the invitation QR and scan it here.')}
        </Text>
        {mayScanTickets ? <Button label={t('Naar Tickets scannen', 'To Scan tickets')} onPress={onOpenDoor} /> : null}
        <Button label={t('Opnieuw scannen', 'Scan again')} variant="ghost" onPress={onClose} />
      </Card>
    );
  }

  if (result.kind === 'error') {
    return (
      <Card style={styles.resultCard}>
        <View style={styles.resultHead}>
          <ScanLine color={COLORS.muted} size={18} />
          <Text style={styles.title}>{t('Dat lukte niet', 'That did not work')}</Text>
        </View>
        <Text style={styles.body}>{result.message}</Text>
        <Button label={t('Opnieuw scannen', 'Scan again')} variant="ghost" onPress={onClose} />
      </Card>
    );
  }

  if (result.kind === 'invite') {
    return (
      <Card featured style={styles.resultCard}>
        <View style={styles.resultHead}>
          <TicketCheck color={COLORS.ink} size={18} />
          <Text style={styles.title}>
            {result.already ? t('Je kon dit al scannen', 'You could already scan this') : t('Je kan dit evenement nu scannen', 'You can now scan this event')}
          </Text>
        </View>
        <Text style={styles.body}>{result.title}</Text>
        <Button label={t('Beginnen met scannen', 'Start scanning')} onPress={() => onOpenEvent(result.eventId)} />
        <Button label={t('Sluiten', 'Close')} variant="ghost" onPress={onClose} />
      </Card>
    );
  }

  if (result.kind === 'fakbar') {
    return (
      <Card featured style={styles.resultCard}>
        <View style={styles.resultHead}>
          <Beer color={COLORS.ink} size={18} />
          <Text style={styles.title}>{result.text}</Text>
        </View>
        <Text style={styles.body}>{result.detail}</Text>
        <Button label={t('Sluiten', 'Close')} variant="ghost" onPress={onClose} />
      </Card>
    );
  }

  return <PassResult pass={result.pass} holder={result.holder} onClose={onClose} onDone={onRedeemed} />;
}

/**
 * Betalen met bonnetjes: eerst zien wie het is, dan pas een bedrag.
 *
 * Twee stappen met opzet. Wie achter een toog scant, hoort de naam en het saldo
 * te zien voor er iets afgaat; één beweging zou betekenen dat je afboekt bij
 * iemand die je nog niet herkend hebt. Het kost een halve seconde en het scheelt
 * de discussie achteraf.
 */
function PassResult({
  pass,
  holder,
  onClose,
  onDone,
}: {
  pass: string;
  holder: AppPassHolder;
  onClose: () => void;
  onDone: () => void;
}) {
  // Aan de toog gaan enkel hele bonnetjes af. Een broodje aan de afhaalbalie kost
  // per half, dus het saldo kan op een half eindigen; dat half blijft staan.
  const payable = Math.floor(holder.vouchers);
  const [amount, setAmount] = useState(Math.min(1, payable));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const redeem = async () => {
    setBusy(true);
    try {
      const result = await redeemVouchers({ pass, amount, place: 'Toog' });
      setMessage(
        t(
          `${result.amount} afgeboekt bij ${result.name}. Nog ${formatVouchers(result.remaining)} over.`,
          `${result.amount} deducted from ${result.name}. ${formatVouchers(result.remaining)} left.`,
        ),
      );
    } catch (error) {
      setMessage(scanError(error));
    } finally {
      setBusy(false);
    }
  };

  if (message) {
    return (
      <Card featured style={styles.resultCard}>
        <View style={styles.resultHead}>
          <Coins color={COLORS.ink} size={18} />
          <Text style={styles.title}>{t('Klaar', 'Done')}</Text>
        </View>
        <Text style={styles.body}>{message}</Text>
        <Button label={t('Volgende', 'Next')} onPress={onDone} />
      </Card>
    );
  }

  return (
    <Card style={styles.resultCard}>
      <View style={styles.resultHead}>
        <Coins color={COLORS.strong} size={18} />
        <Text style={styles.title}>{holder.name}</Text>
      </View>
      {holder.rNumber ? <Text style={styles.hint}>{holder.rNumber}</Text> : null}

      <View style={styles.balance}>
        <Text style={styles.body}>{t('Openstaande bonnetjes', 'Available vouchers')}</Text>
        <Text style={styles.balanceValue}>{formatVouchers(holder.vouchers)}</Text>
      </View>

      {holder.theokotOrder ? (
        <View style={styles.orderBox}>
          <Text style={styles.kicker}>{t('BROODJE VAN VANDAAG', "TODAY'S SANDWICH")}</Text>
          {holder.theokotOrder.lines.map((line, index) => (
            <Text key={`${line.name}-${index}`} style={styles.body}>
              {line.quantity}x {line.name}
            </Text>
          ))}
          <Text style={styles.hint}>
            {t('Te betalen:', 'To pay:')} {formatEuro(holder.theokotOrder.totalCents)}
            {holder.theokotOrder.canRedeemVouchers
              ? t(`, of ${formatVouchers(holder.theokotOrder.voucherCost)} bonnetjes`, `, or ${formatVouchers(holder.theokotOrder.voucherCost)} vouchers`)
              : ''}
          </Text>
        </View>
      ) : null}

      {payable === 0 ? (
        <Text style={styles.body}>
          {holder.vouchers > 0
            ? t('Er staat enkel een half bonnetje open. Aan de toog gaan er enkel hele af; het half kan aan de afhaalbalie van het Theokot.', 'Only half a voucher is available. At the bar only whole ones are deducted; the half can be used at the Theokot pickup desk.')
            : t('Er staan geen bonnetjes open, dus er valt niets af te boeken.', 'No vouchers are available, so there is nothing to deduct.')}
        </Text>
      ) : (
        <>
          <View style={styles.amountRow}>
            <Text style={styles.body}>{t('Af te boeken', 'To deduct')}</Text>
            <Stepper
              value={amount}
              max={payable}
              label="bonnetjes"
              onChange={setAmount}
            />
          </View>
          <Button
            label={`${amount} afboeken`}
            busy={busy}
            disabled={amount < 1}
            onPress={() => void redeem()}
          />
        </>
      )}

      <Button label={t('Annuleren', 'Cancel')} variant="ghost" onPress={onClose} />
    </Card>
  );
}

/**
 * De zin bij een geweigerde scan. De server stuurt een code en geen tekst, precies
 * zodat die hier in het Nederlands van de app staat; enkel bij een onbekende code
 * valt hij terug op de melding van de server.
 */
/**
 * De stand onder een check-in aan de bar. Tijdens een periode (een groot
 * evenement met een check-in per uur) is dat de stand van die periode, en zegt
 * een scan die niet telde vanaf wanneer de volgende wel telt. Geeft de periode
 * geen pinten, dan zeggen we niets over pinten.
 */
function fakCheckinDetail(checkin: AppFakCheckin): string {
  const stand = checkin.period
    ? t(`${checkin.total} check-ins tijdens ${checkin.period}.`, `${checkin.total} check-ins during ${checkin.period}.`)
    : t(`${checkin.total} punten.`, `${checkin.total} points.`);
  // `!== false`: een server van voor de periodes stuurt dit veld nog niet.
  const beer = checkin.freeBeer
    ? t(' Je hebt een gratis pint verdiend.', ' You earned a free beer.')
    : checkin.freeBeers !== false
      ? t(` Nog ${checkin.toNextBeer} tot een gratis pint.`, ` ${checkin.toNextBeer} more until a free beer.`)
      : '';
  const next = !checkin.counted && checkin.period && checkin.message ? `${checkin.message} ` : '';
  return `${next}${stand}${beer}`;
}

function scanError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return t('Geen verbinding. Aan een deur zonder netwerk werkt scannen niet; probeer het opnieuw.', 'No connection. Scanning does not work at a door without a network; try again.');
  }
  switch (error.code) {
    case 'PASS_EXPIRED':
      return t('Deze code is verlopen. Laat ze opnieuw tonen; ze vernieuwt zichzelf om de twee minuten.', 'This code has expired. Have it shown again; it refreshes itself every two minutes.');
    case 'PASS_INVALID':
      return t('Deze code hoort niet bij VTK.', 'This code does not belong to VTK.');
    case 'INVITE_EXPIRED':
      return t('Deze uitnodiging is verlopen. Vraag ze opnieuw te tonen; ze ververst om de twintig seconden.', 'This invitation has expired. Ask to show it again; it refreshes every twenty seconds.');
    case 'NOT_ENOUGH':
      return t('Er staan niet genoeg bonnetjes open.', 'Not enough vouchers are available.');
    case 'CONFLICT':
      return t('Het saldo veranderde net. Scan opnieuw.', 'The balance just changed. Scan again.');
    case 'SELF':
      return t('Je kan niet bij jezelf afboeken.', 'You cannot deduct from yourself.');
    case 'BAR_CLOSED':
      return t("'t ElixIr staat nu niet als open geregistreerd, dus deze check-in telt niet.", "'t ElixIr is not registered as open right now, so this check-in does not count.");
    case 'NO_RNUMBER':
      return t('Je account heeft geen r-nummer, dus je stand kan nergens aan hangen.', 'Your account has no r-number, so your score cannot be linked to anything.');
    default:
      return error.message;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  kicker: { ...TYPE.kicker, color: COLORS.muted },

  resultCard: { gap: SPACING.md },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },

  balance: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.paper2,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  balanceValue: { ...TYPE.sectionTitle, color: COLORS.ink },
  orderBox: {
    backgroundColor: COLORS.paper2,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    gap: 2,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
