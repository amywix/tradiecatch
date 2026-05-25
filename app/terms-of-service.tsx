import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Colors from '@/constants/colors';

export default function TermsOfServiceScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.updated}>Last updated: April 2026</Text>

        <Section title="1. Agreement to Terms">
          By creating an account or using CallCatch ("the Service", "we", "us", "our"), you agree
          to be bound by these Terms of Service. If you do not agree to these terms, do not use the
          Service. You must be at least 18 years old and operating a legitimate trade business to
          use CallCatch.
        </Section>

        <Section title="2. Description of the Service">
          CallCatch is a software-as-a-service platform that helps tradespeople manage missed
          calls, automate SMS follow-ups with their customers, and book jobs. We provision and
          manage a dedicated business phone number for you and run the SMS and voice automation on
          your behalf — there is nothing for you to plug in or configure on the telephony side.
        </Section>

        <Section title="3. Your Account">
          Your account is created for you by CallCatch after you arrange a subscription with us. You will be issued a
          temporary password and prompted to change it on your first login. You are responsible for
          keeping your new password confidential and for all activity that occurs under your
          account. You agree to notify us immediately of any unauthorised use of your account.
        </Section>

        <Section title="4. Subscription, Billing & Cancellation">
          <BulletItem title="Subscription required">
            Access to the automated call and SMS features requires an active paid subscription.
            Without an active subscription you will be redirected to the paywall screen and the
            automated features will be disabled.
          </BulletItem>
          <BulletItem title="Payment">
            Subscription payments are processed by Stripe. By subscribing, you authorise us (via
            Stripe) to charge the recurring subscription fee to your nominated payment method until
            you cancel.
          </BulletItem>
          <BulletItem title="Cancellation">
            You can cancel your subscription at any time from Settings → Subscription → Manage,
            which opens the Stripe Customer Portal. Cancellation takes effect at the end of the
            current billing period unless we tell you otherwise. You will retain access to the
            Service until the end of the period you have already paid for.
          </BulletItem>
          <BulletItem title="Refunds">
            Subscription fees are non-refundable except where required by law (including under the
            Australian Consumer Law where applicable).
          </BulletItem>
          <BulletItem title="Price changes">
            We may change subscription pricing from time to time. We will give you reasonable
            advance notice of any price increase, and the new price will apply at the start of your
            next billing period.
          </BulletItem>
        </Section>

        <Section title="5. What Your Subscription Includes">
          <BulletItem title="Dedicated business phone number">
            Your subscription includes a dedicated Australian phone number that we provision and
            run for you. You do not need a separate Twilio account.
          </BulletItem>
          <BulletItem title="SMS and voice usage (fair use)">
            Your subscription includes a fair-use allowance of up to 1,000 outbound and inbound SMS
            messages per month and 500 voice minutes per month combined across calls and
            voicemail. This allowance covers normal sole-trader and small-team electrician usage.
          </BulletItem>
          <BulletItem title="If you go over the fair-use cap">
            If your usage consistently exceeds the fair-use cap, we may contact you to discuss a
            higher tier or a usage-based add-on. We will not silently bill you extra — we'll always
            talk to you first before changing your plan.
          </BulletItem>
          <BulletItem title="No telephony bill from us">
            Outside of your CallCatch subscription, you will not receive a separate bill from us
            or from Twilio for normal usage within the cap. Any extra usage charges (if you opt
            into a higher tier) will be invoiced through CallCatch only.
          </BulletItem>
        </Section>

        <Section title="6. Your Use of the Service">
          <BulletItem title="Lawful use only">
            You agree to use the Service only for lawful purposes and in accordance with these
            Terms. You will not use the Service to send spam, harass anyone, or send messages to
            people who have not given you a reasonable basis to contact them.
          </BulletItem>
          <BulletItem title="Australian Spam Act 2003">
            If you are operating in Australia, you must comply with the Spam Act 2003 (Cth) and any
            related ACMA guidance. This generally means you must have the recipient's consent to
            send commercial SMS, identify yourself in the message, and provide a way for the
            recipient to opt out. The Service replies to people who have already contacted you
            (inferred consent), but you remain responsible for your overall messaging conduct.
          </BulletItem>
          <BulletItem title="Customer data">
            Information your customers provide via the SMS conversation (name, phone, address,
            email, job details) is collected and stored in your account. You are the controller of
            that data and must handle it lawfully, including under the Australian Privacy
            Principles where they apply to your business.
          </BulletItem>
          <BulletItem title="No abuse of the platform">
            You will not attempt to reverse engineer, copy, resell, or interfere with the Service,
            its infrastructure, or other users' accounts.
          </BulletItem>
        </Section>

        <Section title="7. Intellectual Property">
          The CallCatch app, branding, and underlying software are owned by us and protected by
          intellectual property laws. We grant you a limited, non-exclusive, non-transferable,
          revocable licence to use the Service for the operation of your trade business while your
          subscription is active.
        </Section>

        <Section title="8. Service Availability">
          We aim to keep the Service available and reliable, but we do not guarantee uninterrupted
          or error-free operation. The Service depends on third-party providers (Twilio, Stripe,
          our hosting provider, OpenStreetMap for geocoding, etc.) and may be affected by their
          downtime or changes. Scheduled and unscheduled maintenance may occur from time to time.
        </Section>

        <Section title="9. Disclaimers">
          To the maximum extent permitted by law, the Service is provided "as is" and "as
          available" without warranties of any kind, whether express or implied. We do not warrant
          that the Service will meet your specific requirements, that bookings will always be
          captured correctly, or that every customer SMS will be delivered. Nothing in these Terms
          excludes any consumer guarantees that cannot be excluded under the Australian Consumer
          Law.
        </Section>

        <Section title="10. Limitation of Liability">
          To the maximum extent permitted by law, CallCatch will not be liable for any indirect,
          incidental, special, consequential or exemplary damages, including loss of profits, lost
          jobs, lost customers, or business interruption, arising out of or relating to your use
          of the Service. Where liability cannot be fully excluded, our total liability to you for
          any claim is limited to the subscription fees you have paid us in the 12 months before
          the claim arose.
        </Section>

        <Section title="11. Indemnity">
          You agree to indemnify us against any claims, losses or costs (including reasonable legal
          fees) arising from your breach of these Terms, your misuse of the Service, your messaging
          conduct toward your customers, or your handling of customer data.
        </Section>

        <Section title="12. Termination">
          You may stop using the Service at any time by cancelling your subscription and (if you
          wish) requesting account deletion. We may suspend or terminate your account if you breach
          these Terms, fail to pay, or use the Service in a way that is harmful to us, our other
          users, or third parties. On termination your access to the Service will end and we will
          delete your data in accordance with our Privacy Policy.
        </Section>

        <Section title="13. Changes to These Terms">
          We may update these Terms from time to time. If we make material changes we will notify
          you in the app or by email. Continued use of the Service after the changes take effect
          constitutes acceptance of the updated Terms. The "Last updated" date at the top of this
          page tells you when the Terms were last changed.
        </Section>

        <Section title="14. Governing Law">
          These Terms are governed by the laws of New South Wales, Australia. The courts of New
          South Wales have non-exclusive jurisdiction over any dispute arising under these Terms.
        </Section>

        <Section title="15. Contact">
          Questions about these Terms? Contact us at:{'\n\n'}
          <Text style={styles.contactEmail}>support@callcatch.com</Text>
        </Section>

        <Pressable style={styles.crossLink} onPress={() => router.push('/privacy-policy')}>
          <Ionicons name="shield-checkmark-outline" size={16} color={Colors.accent} />
          <Text style={styles.crossLinkText}>View Privacy Policy</Text>
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
  container: { flex: 1, backgroundColor: Colors.background },
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
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  content: { padding: 20, gap: 8 },
  updated: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textTertiary, marginBottom: 8 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 8 },
  sectionBody: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 22 },
  bulletItem: { marginBottom: 10 },
  bulletTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 2 },
  bulletBody: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 21 },
  contactEmail: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.accent },
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
