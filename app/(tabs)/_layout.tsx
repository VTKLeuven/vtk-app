import { Tabs } from 'expo-router';
import { BookOpen, CalendarDays, House, LayoutGrid, Ticket, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View, type ColorValue } from 'react-native';

import { COLORS, FONTS, RADIUS } from '../../src/theme/tokens';
import { t } from '../../src/i18n';

/**
 * De tabbalk: het enige wat deze app echt anders maakt dan de site.
 *
 * Elke tab hieronder is een map met een eigen stack erin, niet één scherm. Dat
 * staat uitgelegd in `src/navigation.ts`; kort: terugvegen popt een stack, dus
 * moet er onder elk scherm dat je opent het tabscherm liggen waar je vandaan
 * kwam. Dit bestand is het enige onder `app/` dat met de hand geschreven is; de
 * rest komt uit `npm run routes`.
 *
 * Vijf tabs, en elk daarvan is een van de redenen waarom er een app is:
 *
 * - **Home** is vandaag: wat is er open, en wat wacht er op mij.
 * - **Kalender** is wat er te doen is, met een ster om iets in je eigen lijst te
 *   zetten en in de agenda van je telefoon.
 * - **Studies** is alles rond je vakken, in drie tabbladen in de kop: samen
 *   blokken (wie van je vrienden er nu zit, en je eigen teller), de
 *   cursusdienst (reserveren en afhalen) en Burgieclan (de documenten van je
 *   vakken). Het is niet iets onder Meer, omdat je het tijdens het semester en
 *   de blok meerdere keren per dag opent; dat is precies het criterium waarmee de
 *   andere gekozen zijn. Tot november 2026 heette de tab Studeren en had ze enkel
 *   het eerste; `/studeren` verwijst nog door.
 * - **Tickets** is kopen én tonen, in twee segmenten. Ze staan samen omdat het in
 *   het hoofd van wie ze opent één zaak is; ze uit elkaar trekken zou betekenen
 *   dat je moet weten in welke van twee tabs je moet zijn voor je iets ziet.
 * - **Meer** draagt de hele CMS-boom plus foto's, shiften, piano, de mensen en je
 *   profiel. Alles wat je opzoekt in plaats van doet.
 *
 * Wat er bewust **niet** in staat: een aparte Profiel-tab. Die was een vijfde
 * plaats waard toen de app vooral de site was; nu is het één rij bovenaan Meer.
 * De scanknop en je bonnetjes staan bovenaan Home, want die wil je vanaf het
 * eerste scherm kunnen bereiken zonder eerst ergens in te duiken. Broodjes staat
 * als snelkoppeling op Home.
 *
 * De balk volgt de site: papieren grond, een dunne `--line` bovenrand, navy voor
 * wat actief is. Sinds de gele koppen (november 2026) staat de actieve tab op een
 * gele pil, zoals in de ontwerpen van Home: het enige geel in de balk, en het
 * zegt waar je bent.
 */
export default function TabsLayout() {
  return (
    <Tabs
      /**
       * Teruggaan brengt je naar de tab waar je vandaan kwam, niet naar Home.
       * De standaard (`firstRoute`) stuurt je altijd naar de eerste tab, en dat
       * voelt als weggeslingerd worden.
       */
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.strong,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: {
          backgroundColor: COLORS.paper,
          borderTopColor: COLORS.line,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: FONTS.medium, fontSize: 11 },
        // Breed genoeg voor de pil achter het icoon; standaard is het vakje zo groot als het icoon.
        tabBarIconStyle: { width: PILL_WIDTH, height: PILL_HEIGHT },
        tabBarLabel: ({ focused, color, children }) => (
          <Text style={[styles.label, { color }, focused && styles.labelActive]}>{children}</Text>
        ),
        sceneStyle: { backgroundColor: COLORS.paper },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{ title: 'Home', tabBarIcon: tabIcon(House) }}
      />
      <Tabs.Screen
        name="kalender"
        options={{
          title: t('Kalender', 'Calendar'),
          tabBarIcon: tabIcon(CalendarDays),
        }}
      />
      <Tabs.Screen
        name="studies"
        options={{
          title: 'Studies',
          tabBarIcon: tabIcon(BookOpen),
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Tickets',
          tabBarIcon: tabIcon(Ticket),
        }}
      />
      <Tabs.Screen
        name="meer"
        options={{
          title: t('Meer', 'More'),
          tabBarIcon: tabIcon(LayoutGrid),
        }}
      />
    </Tabs>
  );
}

const PILL_WIDTH = 60;
const PILL_HEIGHT = 32;

/**
 * Het icoon van een tab, op een gele pil wanneer de tab open staat. De balk tekent
 * elk icoon twee keer (actief en niet) en laat ze in elkaar overvloeien, dus de
 * pil verschijnt en verdwijnt vanzelf zacht.
 */
function tabIcon(Icon: LucideIcon) {
  return function TabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return (
      <View style={[styles.pill, focused && styles.pillActive]}>
        <Icon color={focused ? COLORS.onYellow : typeof color === 'string' ? color : COLORS.muted} size={size} strokeWidth={focused ? 2.2 : 2} />
      </View>
    );
  };
}

const styles = StyleSheet.create({
  pill: {
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: COLORS.yellow },
  label: { fontFamily: FONTS.medium, fontSize: 11, marginTop: 2 },
  labelActive: { fontFamily: FONTS.bold },
});
