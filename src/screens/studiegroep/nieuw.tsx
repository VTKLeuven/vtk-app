
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { createStudyGroup, joinStudyGroup } from '../../api/endpoints';
import { PageHead } from '../../components/PageHead';
import { Button, Card } from '../../components/ui';
import { useTabRouter } from '../../navigation';
import { COLORS, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { HeadScroll } from '../../components/HeadScroll';
import { t } from '../../i18n';

/**
 * Een groep maken, of erbij komen met een code.
 *
 * Twee kaarten onder elkaar en geen segmenten: dit is geen keuze die je maakt
 * maar een die je al gemaakt hebt voor je hier bent. Wie een code kreeg, tikt hem
 * in; wie er geen heeft, maakt er een.
 */
export default function NieuweStudiegroepScreen() {
  const router = useTabRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      await createStudyGroup(name.trim());
      router.back();
    } catch (error) {
      Alert.alert(t('Dat lukte niet', 'That did not work'), groupErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    try {
      await joinStudyGroup(code.trim());
      router.back();
    } catch (error) {
      Alert.alert(t('Dat lukte niet', 'That did not work'), groupErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <HeadScroll head={<PageHead title={t('Blokgroep', 'Study group')} subtitle={t('Maak er een of kom erbij met een code', 'Create one or join with a code')} />} style={styles.root} contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.cardTitle}>{t('Ik heb een code', 'I have a code')}</Text>
          <Text style={styles.body}>
            {t('Zes tekens, van iemand die de groep al heeft.', 'Six characters, from someone who already has the group.')}
          </Text>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase())}
            placeholder="ABC123"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            style={[styles.input, styles.codeInput]}
          />
          <Button
            label={t('Deelnemen', 'Join')}
            busy={busy}
            onPress={join}
            variant={code.trim().length >= 4 ? 'primary' : 'ghost'}
          />
        </Card>

        <Card>
          <Text style={styles.cardTitle}>{t('Nieuwe groep', 'New group')}</Text>
          <Text style={styles.body}>
            {t('Je krijgt meteen een code om door te sturen. Alleen wie in de groep zit, ziet jullie tijden.', 'You immediately get a code to share. Only group members see your times.')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('Blokgroep Arenberg', 'Study group Arenberg')}
            placeholderTextColor={COLORS.muted}
            maxLength={40}
            style={styles.input}
          />
          <Button
            label={t('Groep maken', 'Create group')}
            busy={busy}
            onPress={create}
            variant={name.trim().length >= 2 ? 'primary' : 'ghost'}
          />
        </Card>

        <View style={styles.note}>
          <Text style={styles.hint}>
            {t('Je studietijd is enkel zichtbaar voor wie in dezelfde groep zit. Stap je eruit, dan ben je meteen uit die lijst weg. Er is geen ranglijst over heel VTK.', 'Your study time is only visible to people in the same group. If you leave, you are removed from that list right away. There is no ranking across all of VTK.')}
          </Text>
        </View>
      </HeadScroll>
    </>
  );
}

/** De foutcodes uit `lib/app-api/studyGroups.ts`, in mensentaal. */
export function groupErrorText(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code.includes('NOT_FOUND')) return t('Die code bestaat niet. Kijk hem nog eens na.', 'That code does not exist. Check it again.');
  if (code.includes('GROUP_FULL')) return t('Die groep zit vol.', 'That group is full.');
  if (code.includes('TOO_MANY_GROUPS')) return t('Je zit al in het maximum aantal groepen.', 'You are already in the maximum number of groups.');
  if (code.includes('INVALID_NAME')) return t('Kies een naam van 2 tot 40 tekens.', 'Choose a name of 2 to 40 characters.');
  if (code.includes('NOT_OWNER')) return t('Alleen wie de groep maakte, kan dat.', 'Only the person who created the group can do that.');
  return t('Er ging iets mis. Probeer het straks opnieuw.', 'Something went wrong. Try again later.');
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  cardTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  note: { paddingHorizontal: SPACING.xs },
  input: {
    ...TYPE.body,
    color: COLORS.ink,
    backgroundColor: COLORS.paper2,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 11,
  },
  codeInput: {
    ...TYPE.sectionTitle,
    letterSpacing: 4,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
