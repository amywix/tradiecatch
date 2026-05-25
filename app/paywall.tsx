import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { useSubscription } from '@/lib/subscription-context';

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { checkSubscription } = useSubscription();
  const [errorMsg, setErrorMsg] = useState('');
  const [checkingSubscription, setCheckingSubscription] = useState(false);

  const webTopInset = Platform.OS === 'web' ? 16 : 0;

  const handleAlreadySubscribed = useCallback(async () => {
    setCheckingSubscription(true);
    setErrorMsg('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const active = await checkSubscription();
    setCheckingSubscription(false);
    if (active) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } else {
      setErrorMsg("We couldn't find an active subscription for your account yet. If you've just paid, wait a moment and try again — or contact us at hello@callcatch.com.");
    }
  }, [checkSubscription]);

  return (
    <View style={[styles.container, { paddingTop: (Platform.OS === 'web' ? webTopInset : insets.top) + 16 }]}>
      <Animated.View entering={FadeIn.duration(600)} style={styles.content}>
        <View style={styles.iconContainer}>
          <View style={styles.iconBg}>
            <Ionicons name="flash" size={48} color={Colors.accent} />
          </View>
        </View>

        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.title}>Subscription Required</Text>
          <Text style={styles.subtitle}>
            Your CallCatch account isn't active yet
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).duration(500)} style={styles.featuresList}>
          <PaywallFeature icon="chatbubbles" text="Unlimited auto-SMS replies" />
          <PaywallFeature icon="construct" text="Automated job booking via SMS" />
          <PaywallFeature icon="calendar" text="Full job management dashboard" />
          <PaywallFeature icon="analytics" text="Conversation tracking & history" />
          <PaywallFeature icon="shield-checkmark" text="Priority customer support" />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(500).duration(500)} style={styles.infoCard}>
          <Ionicons name="mail-outline" size={20} color={Colors.accent} />
          <Text style={styles.infoText}>
            We'll send you a secure Stripe payment link to start your subscription. Once you've paid, tap the button below to activate your account.
          </Text>
        </Animated.View>
      </Animated.View>

      <View style={[styles.bottomSection, { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 16 }]}>
        {errorMsg ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.subscribeBtn, checkingSubscription && styles.subscribeBtnDisabled]}
          onPress={handleAlreadySubscribed}
          disabled={checkingSubscription}
        >
          {checkingSubscription ? (
            <ActivityIndicator size="small" color={Colors.accentText} />
          ) : (
            <Text style={styles.subscribeBtnText}>I've Paid &mdash; Activate Account</Text>
          )}
        </Pressable>

        <Text style={styles.helperText}>
          Need help? Email hello@callcatch.com
        </Text>
      </View>
    </View>
  );
}

function PaywallFeature({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureCheck}>
        <Ionicons name="checkmark" size={16} color={Colors.white} />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  iconBg: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFF0E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  featuresList: {
    marginTop: 28,
    gap: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: Colors.text,
  },
  priceCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    marginTop: 28,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
  },
  infoCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    marginTop: 28,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
    lineHeight: 20,
  },
  helperText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  priceBadge: {
    backgroundColor: Colors.accent,
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  priceBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: Colors.accentText,
    letterSpacing: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceAmount: {
    fontSize: 40,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  pricePeriod: {
    fontSize: 18,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginLeft: 4,
  },
  priceDesc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
    marginTop: 6,
  },
  bottomSection: {
    paddingHorizontal: 24,
    gap: 14,
  },
  subscribeBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeBtnDisabled: {
    opacity: 0.6,
  },
  subscribeBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: Colors.accentText,
  },
  linkText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FFD0D0',
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.danger,
    lineHeight: 18,
  },
});
