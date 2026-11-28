import { useLocalSearchParams } from 'expo-router';

import { Share2, UserMinus } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { AppStudyGroup, AppStudyMemberState } from '../../api/contract';
import {
  fetchStudyOverview,
  leaveStudyGroup,
  updateStudyGroup,
} from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { HeadButton, PageHead } from '../../components/PageHead';
import { Skyline, relativeBuildings } from '../../components/Skyline';
import { Button, Card, ErrorState, Loading } from '../../components/ui';
import { formatSpan } from '../../format';
import { useTabRouter } from '../../navigation';
import { COLORS, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { groupErrorText } from './nieuw';
import { HeadScroll } from '../../components/HeadScroll';
import { t } from '../../i18n';

/**
 * Eén blokgroep: de code, de leden, het doel.
 *
 * De skyline bovenaan is de groep zelf: elk lid een gebouw, hoog naar wat het deze
 * week zat, met licht achter de ramen bij wie nu bezig is. Dat zegt in één beeld
 * wat de lijst eronder in cijfers herhaalt, en het is meteen de reden dat de
 * cijfers niet bovenaan hoeven te staan.
 */

/** De hoogte van het skylinepaneel; bepaalt hoeveel verdiepingen er passen. */
const SKYLINE_HEIGHT = 132;

/** De doelen die je kan kiezen. Een vrij getal invullen levert niets extra op. */
const GOALS: { label: string; minutes: number | null }[] = [
  { label: t('Geen doel', 'No goal'), minutes: null },
  { label: '20u', minutes: 20 * 60 },
  { label: '40u', minutes: 40 * 60 },
  { label: '60u', minutes: 60 * 60 },
  { label: '100u', minutes: 100 * 60 },
];

export default function StudiegroepScreen() {
  const router = useTabRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [busy, setBusy] = useState(false);

  const resource = useResource('studeren', () => fetchStudyOverview(), 'detail');
  const group = resource.data?.groups.find((item) => item.id === id) ?? null;

  const share = async () => {
    if (!group) return;
    await Share.share({
      message: t(
        `Kom blokken met ${group.name}. Open de VTK-app, tab Studies, en gebruik code ${group.code}.`,
        `Come study with ${group.name}. Open the VTK app, Studies tab, and use code ${group.code}.`,
      ),
    });
  };

  const setGoal = async (minutes: number | null) => {
    if (!group) return;
    setBusy(true);
    try {
      await updateStudyGroup(group.id, { weeklyGoalMinutes: minutes });
      await resource.reload();
    } catch (error) {
      Alert.alert(t('Dat lukte niet', 'That did not work'), groupErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = (member: AppStudyMemberState) => {
    if (!group) return;
    Alert.alert(
      t(`${member.name} verwijderen`, `Remove ${member.name}`),
      t(
        `${member.name} verdwijnt uit ${group.name} en ziet jullie tijden niet meer. De gestudeerde tijd zelf blijft van ${member.name}.`,
        `${member.name} is removed from ${group.name} and no longer sees your times. The studied time itself stays with ${member.name}.`,
      ),
      [
        { text: t('Laten staan', 'Keep'), style: 'cancel' },
        {
          text: t('Verwijderen', 'Remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveStudyGroup(group.id, member.userId);
              await resource.reload();
            } catch (error) {
              Alert.alert(t('Dat lukte niet', 'That did not work'), groupErrorText(error));
            }
          },
        },
      ],
    );
  };

  const leave = () => {
    if (!group) return;
    const last = group.memberCount === 1;
    Alert.alert(
      last ? t(`${group.name} verwijderen`, `Delete ${group.name}`) : t(`Uit ${group.name} stappen`, `Leave ${group.name}`),
      last
        ? t('Je bent het laatste lid, dus de groep verdwijnt en de code werkt niet meer. Je eigen studietijd blijft gewoon staan.', 'You are the last member, so the group disappears and the code stops working. Your own study time stays.')
        : t('Je verdwijnt uit de lijst en ziet hun tijden niet meer. Je eigen studietijd blijft gewoon staan, en met de code kan je later terugkomen.', 'You disappear from the list and no longer see their times. Your own study time stays, and you can come back later with the code.'),
      [
        { text: t('Blijven', 'Stay'), style: 'cancel' },
        {
          text: last ? t('Verwijderen', 'Remove') : t('Eruit stappen', 'Leave'),
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveStudyGroup(group.id);
              router.back();
            } catch (error) {
              Alert.alert(t('Dat lukte niet', 'That did not work'), groupErrorText(error));
            }
          },
        },
      ],
    );
  };

  if (resource.loading && !resource.data) return <Loading label={t('Groep ophalen', 'Loading group')} />;
  if (!group) {
    return (
      <>
        <PageHead title={t('Blokgroep', 'Study group')} />
        <ErrorState
          message={resource.data ? t('Deze groep bestaat niet meer.', 'This group no longer exists.') : messageFor(resource.error)}
          onRetry={() => void resource.refresh()}
        />
      </>
    );
  }

  return (
    <>
      <HeadScroll head={<PageHead
        title={group.name}
        kicker={t('Blokgroep', 'Study group')}
        subtitle={`${group.memberCount} ${group.memberCount === 1 ? 'lid' : 'leden'}`}
        right={
          <HeadButton accessibilityLabel={t('Code delen', 'Share code')} onPress={() => void share()}>
            <Share2 color={COLORS.ink} size={21} />
          </HeadButton>
        }
      />}
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
          />
        }
      >
        <Skyline buildings={skylineOf(group)} height={SKYLINE_HEIGHT} moon />

        <Card>
          <Text style={styles.label}>{t('Code om te delen', 'Code to share')}</Text>
          <Text style={styles.code}>{group.code}</Text>
          <Text style={styles.hint}>
            {t('Wie deze code heeft, kan erbij. Deel ze dus alleen met wie je erbij wil.', 'Anyone with this code can join. So only share it with people you want in the group.')}
          </Text>
          <Button label={t('Code doorsturen', 'Send code')} variant="ghost" onPress={() => void share()} />
        </Card>

        <Card>
          <Text style={styles.label}>{t('Samen deze week', 'Together this week')}</Text>
          <Text style={styles.big}>
            {formatSpan(group.weekSeconds)}
            {group.weeklyGoalMinutes ? t(` van de ${formatSpan(group.weeklyGoalMinutes * 60)}`, ` of ${formatSpan(group.weeklyGoalMinutes * 60)}`) : ''}
          </Text>
          {group.isOwner ? (
            <>
              <Text style={styles.hint}>
                Een groepsdoel maakt het samenwerken in plaats van enkel wedijveren;
                ook wie onderaan staat, telt mee.
              </Text>
              <View style={styles.goals}>
                {GOALS.map((goal) => {
                  const active = (group.weeklyGoalMinutes ?? null) === goal.minutes;
                  return (
                    <Pressable
                      key={goal.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={goal.label}
                      disabled={busy}
                      onPress={() => void setGoal(goal.minutes)}
                      style={[styles.goal, active && styles.goalOn]}
                    >
                      <Text style={[styles.goalText, active && styles.goalTextOn]}>
                        {goal.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={styles.hint}>
              {t('Alleen wie de groep maakte, kan het doel wijzigen.', 'Only the person who created the group can change the goal.')}
            </Text>
          )}
        </Card>

        <Card>
          <Text style={styles.label}>{t('Leden', 'Members')}</Text>
          {group.members.map((member) => (
            <View key={member.userId} style={styles.member}>
              <View style={styles.memberText}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.isYou ? `${member.name} (jij)` : member.name}
                </Text>
                <Text style={styles.memberSub}>
                  {member.studying
                    ? t(`Nu bezig, ${formatSpan(member.liveSeconds ?? 0)}`, `Studying now, ${formatSpan(member.liveSeconds ?? 0)}`)
                    : t(`${formatSpan(member.weekSeconds)} deze week`, `${formatSpan(member.weekSeconds)} this week`)}
                </Text>
              </View>
              {group.isOwner && !member.isYou ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(`Verwijderen: ${member.name}`, `Remove: ${member.name}`)}
                  onPress={() => remove(member)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                >
                  <UserMinus color={COLORS.muted} size={17} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>

        <Button
          label={group.memberCount === 1 ? t('Groep verwijderen', 'Delete group') : t('Uit deze groep stappen', 'Leave this group')}
          variant="ghost"
          onPress={leave}
        />
      </HeadScroll>
    </>
  );
}

/** Elk lid een gebouw, hoog naar wat het deze week zat. */
function skylineOf(group: AppStudyGroup) {
  return relativeBuildings(
    group.members.slice(0, 8).map((member) => ({
      key: member.userId,
      seconds: member.weekSeconds,
      active: member.studying,
    })),
    SKYLINE_HEIGHT,
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  label: { ...TYPE.kicker, color: COLORS.muted, marginBottom: SPACING.sm },
  hint: { ...TYPE.small, color: COLORS.muted },
  big: { ...TYPE.sectionTitle, color: COLORS.ink },
  code: {
    ...TYPE.pageTitle,
    color: COLORS.ink,
    letterSpacing: 6,
    marginBottom: SPACING.sm,
  },

  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  goal: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
  },
  goalOn: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  goalText: { ...TYPE.small, color: COLORS.body },
  goalTextOn: { color: COLORS.onYellow, fontFamily: TYPE.cardTitle.fontFamily },

  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  memberText: { flex: 1, minWidth: 0 },
  memberName: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  memberSub: { ...TYPE.small, color: COLORS.muted },
  remove: { padding: 6 },
  pressed: { opacity: 0.6 },
});
