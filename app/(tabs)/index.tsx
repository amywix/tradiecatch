import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Platform, Alert, RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { apiRequest, getApiUrl } from '@/lib/query-client';
import { useData, MissedCall } from '@/lib/data-context';
import { useAuth } from '@/lib/auth-context';
import { formatTimeAgo, formatTime, getInitials, getAvatarColor, confirmAction } from '@/lib/helpers';
import { Greeting, KpiRow, KpiTile, SectionTitle } from '@/components/Dashboard';

const STATE_LABELS: Record<string, string> = {
  none: '',
  awaiting_service: 'Awaiting reply',
  awaiting_sub_option: 'Awaiting details',
  awaiting_urgency: 'Checking urgency',
  awaiting_other_description: 'Awaiting description',
  awaiting_address: 'Awaiting address',
  awaiting_time: 'Awaiting time',
  completed: 'Conversation complete',
};

function CallItem({ item, onSendAutoSms, onBookJob, onDelete, onViewConvo, sendingId }: {
  item: MissedCall;
  onSendAutoSms: (call: MissedCall) => void;
  onBookJob: (call: MissedCall) => void;
  onDelete: (id: string) => void;
  onViewConvo: (call: MissedCall) => void;
  sendingId: string | null;
}) {
  const isSending = sendingId === item.id;
  const hasConversation = item.conversationState !== 'none' && (item.conversationLog?.length || 0) > 0;
  const stateLabel = STATE_LABELS[item.conversationState] || '';

  return (
    <View style={styles.callCard}>
      <View style={styles.callRow}>
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.callerName) }]}>
          <Text style={styles.avatarText}>{getInitials(item.callerName)}</Text>
        </View>
        <View style={styles.callInfo}>
          <View style={styles.callHeader}>
            <Text style={styles.callerName} numberOfLines={1}>{item.callerName}</Text>
            <Text style={styles.callTime}>{formatTimeAgo(new Date(item.timestamp).getTime())}</Text>
          </View>
          <Text style={styles.phoneNumber}>{item.phoneNumber}</Text>
          <View style={styles.callMeta}>
            <View style={styles.callTimeDetail}>
              <Ionicons name="call-outline" size={12} color={Colors.danger} />
              <Text style={styles.callTimeText}>Missed at {formatTime(new Date(item.timestamp).getTime())}</Text>
            </View>
            {item.replied && (
              <View style={styles.repliedBadge}>
                <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
                <Text style={styles.repliedText}>SMS Sent</Text>
              </View>
            )}
            {item.jobBooked && (
              <View style={styles.bookedBadge}>
                <Ionicons name="construct" size={12} color={Colors.accent} />
                <Text style={styles.bookedText}>Job booked</Text>
              </View>
            )}
          </View>
          {!!stateLabel && item.conversationState !== 'none' && (
            <View style={styles.stateBadgeRow}>
              <View style={[
                styles.stateBadge,
                item.conversationState === 'completed' ? styles.stateBadgeComplete : styles.stateBadgeActive,
              ]}>
                <View style={[
                  styles.stateDot,
                  { backgroundColor: item.conversationState === 'completed' ? Colors.success : Colors.warning },
                ]} />
                <Text style={[
                  styles.stateText,
                  { color: item.conversationState === 'completed' ? Colors.success : Colors.warning },
                ]}>
                  {stateLabel}
                </Text>
              </View>
              {item.selectedService && (
                <Text style={styles.serviceText} numberOfLines={1}>{item.selectedService}</Text>
              )}
            </View>
          )}
          {item.isUrgent && (
            <View style={styles.urgentBadge}>
              <Ionicons name="warning" size={12} color={Colors.danger} />
              <Text style={styles.urgentText}>URGENT</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.callActions}>
        {!item.replied && (
          <Pressable
            style={[styles.actionBtnPrimary, isSending && styles.actionBtnDisabled]}
            onPress={() => onSendAutoSms(item)}
            disabled={isSending}
            hitSlop={8}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Ionicons name="chatbubble-outline" size={16} color={Colors.white} />
            )}
            <Text style={styles.actionTextPrimary}>
              {isSending ? 'Sending...' : 'Send Auto-SMS'}
            </Text>
          </Pressable>
        )}
        {hasConversation && (
          <Pressable
            style={styles.actionBtn}
            onPress={() => onViewConvo(item)}
            hitSlop={8}
          >
            <Ionicons name="chatbubbles-outline" size={16} color={Colors.primaryLight} />
            <Text style={[styles.actionText, { color: Colors.primaryLight }]}>View Chat</Text>
          </Pressable>
        )}
        {!item.jobBooked && item.conversationState !== 'completed' && (
          <Pressable
            style={styles.actionBtn}
            onPress={() => onBookJob(item)}
            hitSlop={8}
          >
            <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.textSecondary }]}>Book</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.actionBtnDanger}
          onPress={() => onDelete(item.id)}
          hitSlop={8}
        >
          <Feather name="trash-2" size={15} color={Colors.textTertiary} />
        </Pressable>
      </View>
      {(!!item.voicemailData || !!item.recordingSid) && (
        <Pressable
          style={styles.voicemailBtn}
          onPress={async () => {
            try {
              const res = await apiRequest('GET', `/api/voicemail/${item.id}/link`);
              const { url } = await res.json();
              if (!url) throw new Error('No url returned');
              await Linking.openURL(url);
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Could not open voicemail.');
            }
          }}
          hitSlop={8}
        >
          <Ionicons name="mic-outline" size={14} color={Colors.accent} />
          <Text style={styles.voicemailText}>
            Play voicemail{item.voicemailDurationSeconds ? ` (${item.voicemailDurationSeconds}s)` : ''}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function useSignOut() {
  const { logout } = useAuth();
  return useCallback(() => {
    confirmAction(
      'Sign Out',
      'Are you sure you want to sign out?',
      'Sign Out',
      async () => { await logout(); },
    );
  }, [logout]);
}

export default function CallsScreen() {
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();
  const { missedCalls, removeCall, refreshAll, isLoading, sendAutoSms, settings } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const unrepliedCount = missedCalls.filter(c => !c.replied).length;

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const todayCalls = missedCalls.filter(c => new Date(c.timestamp).getTime() >= startOfToday.getTime());
  const repliedToday = todayCalls.filter(c => c.replied).length;
  const bookedToday = todayCalls.filter(c => c.jobBooked).length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  const handleSendAutoSms = useCallback(async (call: MissedCall) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingId(call.id);
    try {
      await sendAutoSms(call.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('SMS Sent', `Auto-reply SMS sent to ${call.callerName}. The conversation flow has started.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send SMS. Check your Twilio settings.');
    } finally {
      setSendingId(null);
    }
  }, [sendAutoSms]);

  const handleBookJob = useCallback((call: MissedCall) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/book-job', params: { callId: call.id, callerName: call.callerName, phoneNumber: call.phoneNumber } });
  }, []);

  const handleViewConvo = useCallback((call: MissedCall) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/conversation', params: { callId: call.id } });
  }, []);

  const handleDelete = useCallback((id: string) => {
    confirmAction('Delete Call', 'Remove this missed call?', 'Delete', async () => {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await removeCall(id);
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Could not delete call.');
      }
    });
  }, [removeCall]);

  const handleAddCall = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/add-call');
  }, []);

  const renderItem = useCallback(({ item }: { item: MissedCall }) => (
    <CallItem
      item={item}
      onSendAutoSms={handleSendAutoSms}
      onBookJob={handleBookJob}
      onDelete={handleDelete}
      onViewConvo={handleViewConvo}
      sendingId={sendingId}
    />
  ), [handleSendAutoSms, handleBookJob, handleDelete, handleViewConvo, sendingId]);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: (Platform.OS === 'web' ? webTopInset : insets.top) + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerEyebrow}>Inbox</Text>
          <Text style={styles.headerTitle}>Missed Calls</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={handleAddCall} style={styles.addBtn} hitSlop={8} testID="add-call-btn">
            <Ionicons name="add" size={20} color={Colors.white} />
            <Text style={styles.addBtnText}>New</Text>
          </Pressable>
          <Pressable onPress={signOut} style={styles.signOutBtn} hitSlop={8} testID="signout-btn">
            <Feather name="log-out" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={missedCalls}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: (Platform.OS === 'web' ? webBottomInset : 0) + 100 },
        ]}
        scrollEnabled={!!missedCalls.length}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
        }
        ListHeaderComponent={
          <View>
            <Greeting businessName={settings.businessName || 'TradieCatch'} />
            <KpiRow>
              <KpiTile label="Today's calls" value={todayCalls.length} icon="call-outline" tone="info" />
              <KpiTile label="Unreplied" value={unrepliedCount} icon="alert-circle-outline" tone={unrepliedCount > 0 ? 'warning' : 'success'} />
              <KpiTile label="Booked today" value={bookedToday} icon="checkmark-done-outline" tone="accent" />
            </KpiRow>
            {missedCalls.length > 0 && (
              <SectionTitle title="Recent activity" />
            )}
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBadge}>
                <Ionicons name="call-outline" size={36} color={Colors.accent} />
              </View>
              <Text style={styles.emptyTitle}>No missed calls</Text>
              <Text style={styles.emptyText}>Tap + to log a missed call manually</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={Colors.accent} />
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  signOutBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },
  addBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.white,
  },
  listContent: {
    paddingBottom: 16,
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  callCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  callRow: {
    flexDirection: 'row',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.white,
  },
  callInfo: {
    flex: 1,
    gap: 4,
  },
  callHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  callerName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  callTime: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
  },
  phoneNumber: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  callMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  callTimeDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  callTimeText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
  },
  repliedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  repliedText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.success,
  },
  bookedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  bookedText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.accent,
  },
  stateBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  stateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  stateBadgeActive: {
    backgroundColor: '#FFF8E0',
  },
  stateBadgeComplete: {
    backgroundColor: '#E8F8ED',
  },
  stateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stateText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  serviceText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    flex: 1,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    backgroundColor: '#FFEEEE',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  urgentText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: Colors.danger,
  },
  callActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.accent,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionTextPrimary: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.white,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSecondary,
  },
  actionText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  actionBtnDanger: {
    marginLeft: 'auto',
    padding: 8,
  },
  voicemailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
    backgroundColor: Colors.primaryLight + '22',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent + '44',
    alignSelf: 'flex-start',
  },
  voicemailText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.accent,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: 14,
  },
  emptyIconBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
