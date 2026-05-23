import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Platform, Alert,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { useAuth } from '@/lib/auth-context';
import { getApiUrl } from '@/lib/query-client';

export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, refreshUser, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const topInset = Platform.OS === 'web' ? 20 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 20 : insets.bottom;

  const handleSubmit = useCallback(async () => {
    setErrorMsg('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMsg('Please fill in every field.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Your new passwords don\'t match.');
      return;
    }
    if (currentPassword === newPassword) {
      setErrorMsg('Pick a new password — it can\'t be the same as the temporary one.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${getApiUrl()}api/auth/change-password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not change your password. Please try again.');
        setIsSubmitting(false);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Refresh the user object so mustChangePassword flips to false and AuthGate
      // sends them into the app.
      await refreshUser();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error. Please try again.');
      setIsSubmitting(false);
    }
  }, [currentPassword, newPassword, confirmPassword, token, refreshUser]);

  const handleSignOut = useCallback(() => {
    const doLogout = async () => {
      await logout();
    };
    if (Platform.OS === 'web') {
      doLogout();
    } else {
      Alert.alert('Sign out?', 'You\'ll need to sign back in to set your password.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: doLogout },
      ]);
    }
  }, [logout]);

  return (
    <View style={[styles.container, { paddingTop: topInset + 16, paddingBottom: bottomInset + 16 }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Animated.View entering={FadeIn.duration(500)} style={styles.iconWrap}>
          <View style={styles.iconBg}>
            <Ionicons name="lock-closed" size={36} color={Colors.accent} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(500)}>
          <Text style={styles.title}>Set your password</Text>
          <Text style={styles.subtitle}>
            Welcome{user?.username ? `, ${user.username}` : ''}. Your account is set up and ready to go — just pick a new password to replace the temporary one we sent you.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).duration(500)} style={styles.form}>
          <Text style={styles.label}>Temporary password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="The password we gave you"
              placeholderTextColor={Colors.textTertiary}
              secureTextEntry={!showCurrent}
              autoCapitalize="none"
              autoCorrect={false}
              testID="current-password-input"
            />
            <Pressable onPress={() => setShowCurrent((v) => !v)} hitSlop={10}>
              <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.label}>New password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={Colors.textTertiary}
              secureTextEntry={!showNew}
              autoCapitalize="none"
              autoCorrect={false}
              testID="new-password-input"
            />
            <Pressable onPress={() => setShowNew((v) => !v)} hitSlop={10}>
              <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.label}>Confirm new password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Type it again"
              placeholderTextColor={Colors.textTertiary}
              secureTextEntry={!showNew}
              autoCapitalize="none"
              autoCorrect={false}
              testID="confirm-password-input"
            />
          </View>

          {errorMsg ? (
            <Text style={styles.error}>{errorMsg}</Text>
          ) : null}

          <Pressable
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            testID="submit-password-btn"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Save and continue</Text>
            )}
          </Pressable>

          <Pressable style={styles.signoutBtn} onPress={handleSignOut} hitSlop={10}>
            <Text style={styles.signoutText}>Sign out</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  iconWrap: { alignItems: 'center', marginTop: 16, marginBottom: 16 },
  iconBg: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFF1E6',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  subtitle: {
    fontSize: 15, color: Colors.textSecondary, textAlign: 'center',
    marginTop: 10, marginBottom: 28, lineHeight: 22, fontFamily: 'Inter_400Regular',
  },
  form: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  label: {
    fontSize: 13, color: Colors.textSecondary, fontWeight: '600',
    marginTop: 16, marginBottom: 8, fontFamily: 'Inter_600SemiBold',
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: 12, paddingHorizontal: 14, height: 50,
    borderWidth: 1, borderColor: Colors.border,
  },
  input: {
    flex: 1, fontSize: 15, color: Colors.text,
    fontFamily: 'Inter_400Regular',
  },
  submitBtn: {
    marginTop: 24, height: 52, borderRadius: 12, backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: Colors.accentText, fontSize: 16, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  signoutBtn: { marginTop: 18, alignItems: 'center', paddingVertical: 8 },
  signoutText: { color: Colors.textSecondary, fontSize: 14, fontFamily: 'Inter_500Medium' },
  error: {
    color: Colors.danger, fontSize: 14, marginTop: 14, textAlign: 'center',
    fontFamily: 'Inter_500Medium',
  },
});
