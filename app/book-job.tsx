import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Platform, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useData } from '@/lib/data-context';

const JOB_TYPES = [
  'Power point install/repair', 'Ceiling fan install', 'Lights not working',
  'Switchboard issue', 'Power outage', 'Smoke alarm install',
  'Safety inspection', 'Rewiring', 'General electrical',
];

export default function BookJobScreen() {
  const insets = useSafeAreaInsets();
  const { callId, callerName, phoneNumber } = useLocalSearchParams<{
    callId: string;
    callerName: string;
    phoneNumber: string;
  }>();
  const { addNewJob } = useData();

  const [jobType, setJobType] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const isValid = jobType && date && time;

  const handleSave = useCallback(async () => {
    if (!isValid) return;
    setSaving(true);

    try {
      await addNewJob({
        callerName: callerName || 'Unknown',
        phoneNumber: phoneNumber || '',
        jobType,
        date,
        time,
        address,
        notes,
        status: 'pending',
        missedCallId: callId,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save job. Please try again.');
      setSaving(false);
    }
  }, [isValid, addNewJob, callerName, phoneNumber, jobType, date, time, address, notes, callId]);

  const webTopInset = Platform.OS === 'web' ? 20 : 0;

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getNextWeekStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const quickDates = [
    { label: 'Today', value: getTodayStr() },
    { label: 'Tomorrow', value: getTomorrowStr() },
    { label: 'Next week', value: getNextWeekStr() },
  ];

  const quickTimes = [
    { label: '8:00 AM', value: '08:00' },
    { label: '9:00 AM', value: '09:00' },
    { label: '10:00 AM', value: '10:00' },
    { label: '1:00 PM', value: '13:00' },
    { label: '2:00 PM', value: '14:00' },
    { label: '3:00 PM', value: '15:00' },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: (Platform.OS === 'web' ? webTopInset : insets.top) + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Book Job</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.recipientCard}>
          <Ionicons name="person-outline" size={20} color={Colors.textSecondary} />
          <View>
            <Text style={styles.recipientName}>{callerName || 'New Customer'}</Text>
            {phoneNumber ? <Text style={styles.recipientPhone}>{phoneNumber}</Text> : null}
          </View>
        </View>

        <Text style={styles.fieldLabel}>Job Type</Text>
        <View style={styles.chipGrid}>
          {JOB_TYPES.map((type) => (
            <Pressable
              key={type}
              style={[styles.chip, jobType === type && styles.chipSelected]}
              onPress={() => {
                Haptics.selectionAsync();
                setJobType(type);
              }}
            >
              <Text style={[styles.chipText, jobType === type && styles.chipTextSelected]}>
                {type}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Date</Text>
        <View style={styles.quickRow}>
          {quickDates.map((qd) => (
            <Pressable
              key={qd.label}
              style={[styles.quickBtn, date === qd.value && styles.quickBtnSelected]}
              onPress={() => {
                Haptics.selectionAsync();
                setDate(qd.value);
              }}
            >
              <Text style={[styles.quickBtnText, date === qd.value && styles.quickBtnTextSelected]}>
                {qd.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={Colors.textTertiary}
        />

        <Text style={styles.fieldLabel}>Time</Text>
        <View style={styles.quickRow}>
          {quickTimes.map((qt) => (
            <Pressable
              key={qt.label}
              style={[styles.quickBtn, time === qt.value && styles.quickBtnSelected]}
              onPress={() => {
                Haptics.selectionAsync();
                setTime(qt.value);
              }}
            >
              <Text style={[styles.quickBtnText, time === qt.value && styles.quickBtnTextSelected]}>
                {qt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Address</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="Job site address"
          placeholderTextColor={Colors.textTertiary}
        />

        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Any details about the job..."
          placeholderTextColor={Colors.textTertiary}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: (Platform.OS === 'web' ? 20 : insets.bottom) + 12 }]}>
        <Pressable
          style={[styles.saveBtn, (!isValid || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!isValid || saving}
        >
          <Ionicons name="checkmark-circle" size={22} color={Colors.white} />
          <Text style={styles.saveBtnText}>
            {saving ? 'Saving...' : 'Book Job'}
          </Text>
        </Pressable>
      </View>
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
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  content: {
    padding: 16,
    gap: 10,
    paddingBottom: 140,
  },
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  recipientName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  recipientPhone: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingLeft: 4,
    marginTop: 4,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.text,
  },
  chipTextSelected: {
    color: Colors.white,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSecondary,
  },
  quickBtnSelected: {
    backgroundColor: Colors.accent,
  },
  quickBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  quickBtnTextSelected: {
    color: Colors.accentText,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: 14,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    borderRadius: 14,
    paddingVertical: 16,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.white,
  },
});
