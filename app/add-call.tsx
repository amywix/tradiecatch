import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useData } from '@/lib/data-context';

export default function AddCallScreen() {
  const insets = useSafeAreaInsets();
  const { addNewCall } = useData();

  const [callerName, setCallerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const isValid = phoneNumber.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (!isValid) return;
    setSaving(true);

    try {
      await addNewCall(callerName.trim() || 'Unknown Caller', phoneNumber.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      const message = err?.message || 'Failed to add call. Please try again.';
      Alert.alert('Error', message);
      setSaving(false);
    }
  }, [isValid, addNewCall, callerName, phoneNumber]);

  const webTopInset = Platform.OS === 'web' ? 20 : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: (Platform.OS === 'web' ? webTopInset : insets.top) + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Log Missed Call</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconRow}>
          <View style={styles.bigIcon}>
            <Ionicons name="call-outline" size={40} color={Colors.accent} />
          </View>
          <Text style={styles.subtitle}>Add a missed call to follow up on</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+61412345678"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="phone-pad"
            autoFocus
          />
          <Text style={styles.fieldHint}>Include country code (e.g. +61 for Australia)</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Name (optional)</Text>
          <TextInput
            style={styles.input}
            value={callerName}
            onChangeText={setCallerName}
            placeholder="Caller's name"
            placeholderTextColor={Colors.textTertiary}
          />
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: (Platform.OS === 'web' ? 20 : insets.bottom) + 12 }]}>
        <Pressable
          style={[styles.saveBtn, (!isValid || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!isValid || saving}
        >
          <Ionicons name="add-circle" size={22} color={Colors.white} />
          <Text style={styles.saveBtnText}>
            {saving ? 'Adding...' : 'Add Call'}
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
    padding: 20,
    gap: 24,
  },
  iconRow: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  bigIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    paddingLeft: 4,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fieldHint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
    paddingLeft: 4,
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
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.accentText,
  },
});
