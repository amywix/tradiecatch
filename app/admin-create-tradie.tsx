import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView, Alert,
  ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Colors from '@/constants/colors';
import { useAuth } from '@/lib/auth-context';
import { getApiUrl } from '@/lib/query-client';

const DEFAULT_SERVICE_OPTIONS = [
  'Power point install / repair',
  'Ceiling fan install',
  'Lights not working',
  'Switchboard issue',
  'Power outage / urgent fault',
  'Smoke alarm install',
  'Other',
];

function generateTempPassword(): string {
  const words = ['catch', 'spark', 'volt', 'wire', 'fuse', 'jolt', 'plug', 'amp'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}${num}!`;
}

export default function AdminCreateTradieScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();

  const isAdmin = user?.email === 'admin@callcatch.com';

  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState(() => generateTempPassword());
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState('');
  const [twilioAccountSid, setTwilioAccountSid] = useState('');
  const [twilioAuthToken, setTwilioAuthToken] = useState('');
  const [baseAddress, setBaseAddress] = useState('');
  const [serviceRadiusKm, setServiceRadiusKm] = useState('30');
  const [selectedServices, setSelectedServices] = useState<string[]>(DEFAULT_SERVICE_OPTIONS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<{ email: string; password: string } | null>(null);

  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const toggleService = useCallback((s: string) => {
    setSelectedServices((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);
  }, []);

  const handleRegenPwd = useCallback(() => {
    setTempPassword(generateTempPassword());
  }, []);

  const handleCopy = useCallback(async (text: string, what: string) => {
    try {
      await Clipboard.setStringAsync(text);
      if (Platform.OS !== 'web') Alert.alert('Copied', `${what} copied to clipboard.`);
    } catch (e) {
      Alert.alert('Copy failed', String(e));
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (!businessName.trim() || !email.trim() || !tempPassword.trim()) {
      Alert.alert('Missing info', 'Business name, email, and a temporary password are required.');
      return;
    }
    if (tempPassword.length < 6) {
      Alert.alert('Password too short', 'Temporary password must be at least 6 characters.');
      return;
    }
    const radius = parseInt(serviceRadiusKm, 10);
    if (Number.isNaN(radius) || radius <= 0) {
      Alert.alert('Invalid radius', 'Service radius must be a positive number of km.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${getApiUrl()}api/admin/create-tradie`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          password: tempPassword,
          businessName: businessName.trim(),
          twilioPhoneNumber: twilioPhoneNumber.trim(),
          twilioAccountSid: twilioAccountSid.trim() || undefined,
          twilioAuthToken: twilioAuthToken.trim() || undefined,
          baseAddress: baseAddress.trim(),
          serviceRadiusKm: radius,
          services: selectedServices,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Could not create account', data.error || 'Please try again.');
        setIsSubmitting(false);
        return;
      }
      setCreatedAccount({ email: email.trim(), password: tempPassword });
      if (data.geocoded === false && baseAddress.trim()) {
        Alert.alert(
          'Account created',
          'Address could not be geocoded — the tradie can fix it later in Settings → Service Area.'
        );
      }
    } catch (err: any) {
      Alert.alert('Network error', err?.message || 'Could not reach the server.');
    } finally {
      setIsSubmitting(false);
    }
  }, [businessName, email, tempPassword, twilioPhoneNumber, twilioAccountSid, twilioAuthToken, baseAddress, serviceRadiusKm, selectedServices, token]);

  const handleCreateAnother = useCallback(() => {
    setCreatedAccount(null);
    setBusinessName('');
    setEmail('');
    setTempPassword(generateTempPassword());
    setTwilioPhoneNumber('');
    setBaseAddress('');
    setServiceRadiusKm('30');
    setSelectedServices(DEFAULT_SERVICE_OPTIONS);
  }, []);

  if (!isAdmin) {
    return (
      <View style={[styles.container, { padding: 24 }]}>
        <Text style={styles.title}>Admin only</Text>
        <Text style={styles.helper}>This screen is only available to the operator account.</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (createdAccount) {
    return (
      <ScrollView contentContainerStyle={[styles.container, { padding: 24, paddingBottom: bottomInset + 24 }]}>
        <View style={styles.successHeader}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
          </View>
          <Text style={styles.title}>Account ready</Text>
          <Text style={styles.helper}>Send these credentials to the tradie. They'll be forced to change the password on first login.</Text>
        </View>

        <View style={styles.credCard}>
          <View style={styles.credRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.credLabel}>Email</Text>
              <Text style={styles.credValue}>{createdAccount.email}</Text>
            </View>
            <Pressable style={styles.copyBtn} onPress={() => handleCopy(createdAccount.email, 'Email')}>
              <Ionicons name="copy-outline" size={18} color={Colors.accent} />
            </Pressable>
          </View>
          <View style={styles.credDivider} />
          <View style={styles.credRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.credLabel}>Temporary password</Text>
              <Text style={styles.credValue}>{createdAccount.password}</Text>
            </View>
            <Pressable style={styles.copyBtn} onPress={() => handleCopy(createdAccount.password, 'Password')}>
              <Ionicons name="copy-outline" size={18} color={Colors.accent} />
            </Pressable>
          </View>
        </View>

        <Pressable style={styles.primaryBtn} onPress={handleCreateAnother}>
          <Text style={styles.primaryBtnText}>Create another account</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/(tabs)/settings')}>
          <Text style={styles.secondaryBtnText}>Back to Settings</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={[styles.container, { padding: 20, paddingBottom: bottomInset + 24 }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={20}
    >
      <Text style={styles.helper}>
        Provision a new tradie account. Everything you collected on the sales-form intake goes here, and the tradie's first action will be to set their own password.
      </Text>

      <Field label="Business name *" value={businessName} onChange={setBusinessName} placeholder="e.g. Dave's Electrical" testID="business-name" />
      <Field label="Login email *" value={email} onChange={setEmail} placeholder="dave@example.com" keyboard="email-address" testID="email" />

      <View style={styles.field}>
        <Text style={styles.label}>Temporary password *</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={tempPassword}
            onChangeText={setTempPassword}
            autoCapitalize="none"
            autoCorrect={false}
            testID="temp-password"
          />
          <Pressable style={styles.iconBtn} onPress={handleRegenPwd} hitSlop={6}>
            <Ionicons name="refresh" size={18} color={Colors.accent} />
          </Pressable>
        </View>
        <Text style={styles.hint}>The tradie will be forced to change this on first login.</Text>
      </View>

      <Field label="Twilio phone number assigned" value={twilioPhoneNumber} onChange={setTwilioPhoneNumber} placeholder="+61..." testID="twilio-phone" />

      <Field label="Base address (for service area)" value={baseAddress} onChange={setBaseAddress} placeholder="123 Main St, Suburb NSW" testID="base-address" />
      <Field label="Service radius (km)" value={serviceRadiusKm} onChange={setServiceRadiusKm} keyboard="number-pad" testID="radius" />

      <View style={styles.field}>
        <Text style={styles.label}>Services offered</Text>
        <View style={styles.chipWrap}>
          {DEFAULT_SERVICE_OPTIONS.map((s) => {
            const on = selectedServices.includes(s);
            return (
              <Pressable
                key={s}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => toggleService(s)}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable style={styles.advancedToggle} onPress={() => setShowAdvanced((v) => !v)}>
        <Ionicons name={showAdvanced ? 'chevron-down' : 'chevron-forward'} size={16} color={Colors.textSecondary} />
        <Text style={styles.advancedText}>Advanced: override Twilio creds</Text>
      </Pressable>
      {showAdvanced && (
        <View>
          <Text style={styles.hint}>Leave blank to use the default operator Twilio credentials from environment variables.</Text>
          <Field label="Twilio Account SID" value={twilioAccountSid} onChange={setTwilioAccountSid} placeholder="AC..." />
          <Field label="Twilio Auth Token" value={twilioAuthToken} onChange={setTwilioAuthToken} placeholder="(secret)" secure />
        </View>
      )}

      <Pressable style={[styles.primaryBtn, isSubmitting && styles.btnDisabled]} onPress={handleCreate} disabled={isSubmitting} testID="submit-btn">
        {isSubmitting ? <ActivityIndicator color={Colors.accentText} /> : <Text style={styles.primaryBtnText}>Create account</Text>}
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

function Field({ label, value, onChange, placeholder, keyboard, secure, testID }: {
  label: string; value: string; onChange: (s: string) => void;
  placeholder?: string; keyboard?: 'default' | 'email-address' | 'number-pad';
  secure?: boolean; testID?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textTertiary}
        keyboardType={keyboard || 'default'}
        autoCapitalize={keyboard === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={false}
        secureTextEntry={!!secure}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: Colors.background },
  helper: { fontSize: 14, color: Colors.textSecondary, marginBottom: 18, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 8, fontFamily: 'Inter_700Bold' },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6, fontFamily: 'Inter_600SemiBold' },
  input: {
    backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, height: 46,
    fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border,
    fontFamily: 'Inter_400Regular',
  },
  hint: { fontSize: 12, color: Colors.textSecondary, marginTop: 6, fontFamily: 'Inter_400Regular' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  chipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 13, color: Colors.text, fontFamily: 'Inter_500Medium' },
  chipTextOn: { color: Colors.accentText, fontFamily: 'Inter_600SemiBold' },
  advancedToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, marginTop: 6, marginBottom: 4,
  },
  advancedText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  primaryBtn: {
    marginTop: 18, height: 52, borderRadius: 12, backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: Colors.accentText, fontSize: 16, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  secondaryBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 12 },
  secondaryBtnText: { color: Colors.textSecondary, fontSize: 14, fontFamily: 'Inter_500Medium' },
  successHeader: { alignItems: 'center', marginBottom: 24 },
  successIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#E8F8ED',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  credCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 8,
  },
  credRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  credLabel: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_500Medium', marginBottom: 4 },
  credValue: { fontSize: 16, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  credDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  copyBtn: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
});
