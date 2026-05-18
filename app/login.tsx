import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Platform, Alert,
  ActivityIndicator, KeyboardAvoidingView, ScrollView, Linking, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useAuth } from '@/lib/auth-context';

type Screen = 'landing' | 'login';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [screen, setScreen] = useState<Screen>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Info', 'Please enter your email and password.');
      return;
    }
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Invalid email or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScreen('landing');
  };

  const openSalesContact = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = 'mailto:hello@tradiecatch.com?subject=TradieCatch%20signup%20enquiry';
    Linking.openURL(url).catch(() => {
      Alert.alert('Get in touch', 'Email us at hello@tradiecatch.com to set up your account.');
    });
  };

  if (screen === 'landing') {
    return (
      <View style={[styles.landing, { paddingTop: topInset + 20, paddingBottom: bottomInset + 20 }]}>
        <Animated.View entering={FadeIn.duration(700)} style={styles.landingHero}>
          <Image
            source={require('@/assets/images/brand-logo.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <Text style={styles.tagline}>Never miss a customer again</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.landingFeatures}>
          <LandingFeature icon="chatbubbles-outline" text="Auto SMS replies to missed calls" />
          <LandingFeature icon="construct-outline" text="Customers book jobs via SMS" />
          <LandingFeature icon="calendar-outline" text="Manage all your jobs in one place" />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(500).duration(500)} style={styles.landingActions}>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setScreen('login');
            }}
            testID="login-btn"
          >
            <Text style={styles.primaryBtnText}>Sign In</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryBtn}
            onPress={openSalesContact}
            testID="enquire-btn"
          >
            <Text style={styles.secondaryBtnText}>Don't have an account? Get in touch</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.formScreen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: topInset + 16, paddingBottom: bottomInset + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={goBack} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>

        <Animated.View entering={FadeIn.duration(400)} style={styles.formCard}>
          <View style={styles.formHeader}>
            <View style={styles.formLogoBg}>
              <Ionicons name="flash" size={28} color={Colors.accent} />
            </View>
            <Text style={styles.formTitle}>Welcome Back</Text>
            <Text style={styles.formSubtitle}>Sign in to your TradieCatch account</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                testID="email-input"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!showPassword}
                testID="password-input"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting}
            testID="submit-btn"
          >
            {isSubmitting ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.submitBtnText}>Sign In</Text>
            )}
          </Pressable>

          <Pressable style={styles.switchBtn} onPress={openSalesContact}>
            <Text style={styles.switchText}>
              Don't have an account?{' '}
              <Text style={styles.switchTextBold}>Get in touch</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LandingFeature({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.landingFeatureRow}>
      <View style={styles.landingFeatureIcon}>
        <Ionicons name={icon as any} size={18} color={Colors.accentLight} />
      </View>
      <Text style={styles.landingFeatureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  landing: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  landingHero: {
    alignItems: 'center',
    paddingTop: 20,
  },
  brandLogo: {
    width: 320,
    height: 130,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.6)',
  },
  landingFeatures: {
    gap: 12,
    paddingHorizontal: 8,
  },
  landingFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  landingFeatureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 199, 44, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  landingFeatureText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.8)',
  },
  landingActions: {
    gap: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.accent,
    borderRadius: 16,
    paddingVertical: 18,
  },
  primaryBtnText: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.accentText,
  },
  secondaryBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.7)',
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  formScreen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  formHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  formLogoBg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 199, 44, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
  },
  eyeBtn: {
    padding: 8,
  },
  submitBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: Colors.accentText,
  },
  switchBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  switchTextBold: {
    fontFamily: 'Inter_700Bold',
    color: Colors.accent,
  },
});
