import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Colors from '@/constants/colors';

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.updated}>Last updated: March 2026</Text>

        <Section title="Overview">
          CallCatch ("we", "us", "our") is a mobile application for tradespeople to manage missed calls,
          automate SMS follow-ups, and book jobs. This Privacy Policy explains what data we collect, how we
          use it, and your rights regarding your information.
        </Section>

        <Section title="Information We Collect">
          <BulletItem title="Account information">
            Your name, email address, and a temporary password are set up by us when we create your account. You change the password on your first login. Passwords are stored using industry-standard bcrypt hashing and are never stored in plain text.
          </BulletItem>
          <BulletItem title="Business information">
            Your business name and the services you offer, which you provide in the Settings screen.
          </BulletItem>
          <BulletItem title="Call and job data">
            Missed call records including caller phone numbers, names, job addresses, email addresses,
            service types, and appointment details collected via the automated SMS conversation.
          </BulletItem>
          <BulletItem title="Your dedicated business phone number">
            CallCatch provisions and operates a Twilio account on your behalf. Your dedicated
            business phone number is provisioned, paid for, and managed by us — you do not need
            your own Twilio account and we do not store any Twilio credentials on your behalf.
          </BulletItem>
          <BulletItem title="Voicemail recordings">
            Voicemails left by your callers are stored on Twilio's infrastructure. We do not retain
            audio data on CallCatch servers. When you tap a voicemail link in the app, the audio
            is streamed to you on demand from Twilio.
          </BulletItem>
          <BulletItem title="Billing information">
            Subscription and payment data is handled by Stripe. We store your Stripe Customer ID and
            Subscription ID to manage your subscription status. We never store full credit card details.
          </BulletItem>
        </Section>

        <Section title="How We Use Your Information">
          <BulletItem title="Automated SMS conversations">
            When a caller texts your dedicated business number, we use the conversation state machine to guide them
            through booking a job. Caller data (name, address, service, time preference) is stored in
            your account as a missed call record and converted into a job when booking completes.
          </BulletItem>
          <BulletItem title="SMS and voice sending">
            We use the Twilio account that we operate on your behalf to send automated SMS replies
            and play your voicemail greeting to callers. The dedicated business number is used only
            for your CallCatch account.
          </BulletItem>
          <BulletItem title="Job management">
            Call and job records are used to populate your Calls and Jobs tabs within the app.
          </BulletItem>
          <BulletItem title="Subscription billing">
            We use Stripe to process your monthly subscription payment. Stripe operates under its own
            privacy policy at stripe.com/privacy.
          </BulletItem>
        </Section>

        <Section title="Data Sharing">
          We do not sell, rent, or share your personal data or your customers' data with third parties
          for marketing purposes. We only share data with the following service providers as necessary
          to operate the app:{'\n\n'}
          {'• '}Twilio — to send and receive SMS messages{'\n'}
          {'• '}Stripe — to process subscription payments{'\n'}
          {'• '}Neon (PostgreSQL) — to store your data securely in the cloud
        </Section>

        <Section title="Data Storage and Security">
          Your data is stored in a PostgreSQL database hosted by Neon on AWS infrastructure in the
          US West region. All data is transmitted over HTTPS/TLS. Each tradie account is isolated —
          you can only access your own data.
        </Section>

        <Section title="Customer Data (Your Callers)">
          As a CallCatch user, you are responsible for ensuring that your use of the automated SMS
          system complies with applicable telecommunications laws in your country (e.g. the Spam Act
          2003 in Australia). Customers who reply to your SMS have initiated contact with you. Their
          data (name, phone, address, email) is stored only in your account and used only for the
          purpose of booking and managing jobs.
        </Section>

        <Section title="Data Retention">
          Your data is retained for as long as your account is active. You can delete individual
          call records and jobs from within the app. To request full account deletion, contact us
          at the email below and we will remove all your data within 30 days.
        </Section>

        <Section title="Your Rights">
          You have the right to:{'\n\n'}
          {'• '}Access the data we hold about you{'\n'}
          {'• '}Correct inaccurate data{'\n'}
          {'• '}Request deletion of your data{'\n'}
          {'• '}Export your data{'\n\n'}
          To exercise any of these rights, contact us using the details below.
        </Section>

        <Section title="Children's Privacy">
          CallCatch is intended for use by adults running trade businesses. We do not knowingly
          collect data from anyone under 18 years of age.
        </Section>

        <Section title="Changes to This Policy">
          We may update this Privacy Policy from time to time. We will notify you of significant
          changes by posting the updated policy in the app. Continued use of the app after changes
          constitutes acceptance of the updated policy.
        </Section>

        <Section title="Contact Us">
          If you have any questions about this Privacy Policy or how we handle your data, please
          contact us at:{'\n\n'}
          <Text style={styles.contactEmail}>support@callcatch.com</Text>
        </Section>

        <Pressable style={styles.crossLink} onPress={() => router.push('/terms-of-service')}>
          <Ionicons name="document-text-outline" size={16} color={Colors.accent} />
          <Text style={styles.crossLinkText}>View Terms of Service</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </View>
  );
}

function BulletItem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.bulletItem}>
      <Text style={styles.bulletTitle}>{title}</Text>
      <Text style={styles.bulletBody}>{children}</Text>
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
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  content: {
    padding: 20,
    gap: 8,
  },
  updated: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
    marginBottom: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  bulletItem: {
    marginBottom: 10,
  },
  bulletTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
    marginBottom: 2,
  },
  bulletBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 21,
  },
  contactEmail: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.accent,
  },
  crossLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  crossLinkText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
});
