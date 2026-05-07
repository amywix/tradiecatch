import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

type KpiTone = 'accent' | 'success' | 'warning' | 'info' | 'neutral';

const TONE: Record<KpiTone, { bg: string; fg: string }> = {
  accent: { bg: Colors.accentSoft, fg: Colors.accent },
  success: { bg: Colors.successSoft, fg: Colors.success },
  warning: { bg: Colors.warningSoft, fg: Colors.warning },
  info: { bg: Colors.infoSoft, fg: Colors.primaryLight },
  neutral: { bg: Colors.surfaceSecondary, fg: Colors.textSecondary },
};

export function KpiTile({
  label, value, icon, tone = 'neutral', onPress, active,
}: {
  label: string;
  value: string | number;
  icon: IconName;
  tone?: KpiTone;
  onPress?: () => void;
  active?: boolean;
}) {
  const t = TONE[tone];
  const Wrap: any = onPress ? Pressable : View;
  return (
    <Wrap
      onPress={onPress}
      style={[
        styles.tile,
        active && { borderColor: t.fg, borderWidth: 1.5 },
      ]}
    >
      <View style={[styles.tileIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={16} color={t.fg} />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
    </Wrap>
  );
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.kpiRow}>{children}</View>;
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

export function Greeting({ name, businessName }: { name?: string; businessName?: string }) {
  const display = (name || businessName || '').trim();
  return (
    <View style={styles.greetingWrap}>
      <Text style={styles.greetingHello}>{getGreeting()}{display ? ',' : ''}</Text>
      {!!display && <Text style={styles.greetingName} numberOfLines={1}>{display}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  greetingWrap: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
  },
  greetingHello: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },
  greetingName: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    marginTop: 2,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  tile: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  tileIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileValue: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    lineHeight: 24,
  },
  tileLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
