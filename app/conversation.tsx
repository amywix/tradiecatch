import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/colors';
import { useData, MissedCall } from '@/lib/data-context';
import { getInitials, getAvatarColor } from '@/lib/helpers';

interface ConvoMessage {
  role: string;
  message: string;
  timestamp: string;
}

function MessageBubble({ item }: { item: ConvoMessage }) {
  const isBusiness = item.role === 'business';
  const time = new Date(item.timestamp);
  const timeStr = time.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <View style={[styles.bubbleRow, isBusiness ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
      <View style={[styles.bubble, isBusiness ? styles.bubbleBusiness : styles.bubbleCustomer]}>
        <Text style={[styles.bubbleText, isBusiness ? styles.bubbleTextBusiness : styles.bubbleTextCustomer]}>
          {item.message}
        </Text>
        <Text style={[styles.bubbleTime, isBusiness ? styles.bubbleTimeBusiness : styles.bubbleTimeCustomer]}>
          {timeStr}
        </Text>
      </View>
    </View>
  );
}

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const { callId } = useLocalSearchParams<{ callId: string }>();
  const { getCall, refreshCalls } = useData();
  const [call, setCall] = useState<MissedCall | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCall = useCallback(async () => {
    if (!callId) return;
    try {
      const data = await getCall(callId);
      setCall(data);
    } catch (err) {
      console.error('Failed to load call:', err);
    } finally {
      setLoading(false);
    }
  }, [callId, getCall]);

  useEffect(() => {
    loadCall();
    const interval = setInterval(loadCall, 5000);
    return () => clearInterval(interval);
  }, [loadCall]);

  const messages = (call?.conversationLog || []) as ConvoMessage[];
  const webTopInset = Platform.OS === 'web' ? 20 : 0;

  const STATE_LABELS: Record<string, string> = {
    awaiting_service: 'Waiting for service selection',
    awaiting_sub_option: 'Waiting for details',
    awaiting_urgency: 'Checking urgency level',
    awaiting_other_description: 'Waiting for description',
    awaiting_address: 'Waiting for address',
    awaiting_time: 'Waiting for preferred time',
    completed: 'Conversation complete',
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: (Platform.OS === 'web' ? webTopInset : insets.top) + 12 }]}>
        <Pressable onPress={() => { refreshCalls(); router.back(); }} hitSlop={12}>
          <Ionicons name="arrow-back" size={28} color={Colors.text} />
        </Pressable>
        {call && (
          <View style={styles.headerCenter}>
            <View style={[styles.headerAvatar, { backgroundColor: getAvatarColor(call.callerName) }]}>
              <Text style={styles.headerAvatarText}>{getInitials(call.callerName)}</Text>
            </View>
            <View>
              <Text style={styles.headerName}>{call.callerName}</Text>
              <Text style={styles.headerPhone}>{call.phoneNumber}</Text>
            </View>
          </View>
        )}
        <Pressable onPress={loadCall} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={Colors.textSecondary} />
        </Pressable>
      </View>

      {call && call.conversationState && call.conversationState !== 'none' && (
        <View style={[
          styles.statusBar,
          call.conversationState === 'completed' ? styles.statusBarComplete : styles.statusBarActive,
        ]}>
          <Ionicons
            name={call.conversationState === 'completed' ? 'checkmark-circle' : 'time-outline'}
            size={16}
            color={call.conversationState === 'completed' ? Colors.success : Colors.warning}
          />
          <Text style={[
            styles.statusText,
            { color: call.conversationState === 'completed' ? Colors.success : Colors.warning },
          ]}>
            {STATE_LABELS[call.conversationState] || call.conversationState}
          </Text>
          {call.isUrgent && (
            <View style={styles.urgentChip}>
              <Ionicons name="warning" size={12} color={Colors.danger} />
              <Text style={styles.urgentChipText}>URGENT</Text>
            </View>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={48} color={Colors.textTertiary} />
          <Text style={styles.emptyText}>No messages yet</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          renderItem={({ item }) => <MessageBubble item={item} />}
          keyExtractor={(_, index) => index.toString()}
          contentContainerStyle={[
            styles.messageList,
            { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {call && call.selectedService && (
        <View style={[styles.infoBar, { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 12 }]}>
          <View style={styles.infoItem}>
            <Ionicons name="construct-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.infoText} numberOfLines={1}>{call.selectedService}</Text>
          </View>
          {call.jobAddress && (
            <View style={styles.infoItem}>
              <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.infoText} numberOfLines={1}>{call.jobAddress}</Text>
            </View>
          )}
          {call.selectedTime && (
            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.infoText}>{call.selectedTime}</Text>
            </View>
          )}
        </View>
      )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 12,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: Colors.white,
  },
  headerName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  headerPhone: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statusBarActive: {
    backgroundColor: '#FFF8E0',
  },
  statusBarComplete: {
    backgroundColor: '#E8F8ED',
  },
  statusText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  urgentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFEEEE',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  urgentChipText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: Colors.danger,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
  },
  messageList: {
    padding: 16,
    gap: 8,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  bubbleRowLeft: {
    justifyContent: 'flex-start',
  },
  bubbleRowRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleBusiness: {
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleCustomer: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  bubbleTextBusiness: {
    color: Colors.accentText,
  },
  bubbleTextCustomer: {
    color: Colors.text,
  },
  bubbleTime: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  bubbleTimeBusiness: {
    color: 'rgba(10,10,10,0.55)',
  },
  bubbleTimeCustomer: {
    color: Colors.textTertiary,
  },
  infoBar: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 6,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    flex: 1,
  },
});
