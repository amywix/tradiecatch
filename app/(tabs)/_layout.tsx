import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, router } from "expo-router";
import { NativeTabs, Icon, Label, Badge } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { ActivityIndicator, Platform, StyleSheet, useColorScheme, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { useData } from "@/lib/data-context";
import { useSubscription } from "@/lib/subscription-context";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

function NativeTabLayout() {
  const { missedCalls } = useData();
  const { user } = useAuth();
  const isDemo = user?.email === 'demo';
  const unreplied = missedCalls.filter(c => !c.replied).length;

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "phone.arrow.down.left", selected: "phone.arrow.down.left.fill" }} />
        <Label>Calls</Label>
        {unreplied > 0 && <Badge>{unreplied}</Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="jobs">
        <Icon sf={{ default: "wrench.and.screwdriver", selected: "wrench.and.screwdriver.fill" }} />
        <Label>Jobs</Label>
      </NativeTabs.Trigger>
      {!isDemo && (
        <NativeTabs.Trigger name="settings">
          <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
          <Label>Settings</Label>
        </NativeTabs.Trigger>
      )}
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const { missedCalls } = useData();
  const { user } = useAuth();
  const isDemo = user?.email === 'demo';
  const unreplied = missedCalls.filter(c => !c.replied).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.light.tabIconDefault,
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 11,
        },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : isDark ? "#000" : "#fff",
          borderTopWidth: isWeb ? 0 : 0,
          borderTopColor: isDark ? "#333" : Colors.border,
          elevation: 0,
          ...(isWeb
            ? {
                height: 84,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: -2 },
                shadowOpacity: 0.06,
                shadowRadius: 12,
              }
            : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "#000" : "#fff" }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Calls",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="call-outline" size={size} color={color} />
          ),
          tabBarBadge: unreplied > 0 ? unreplied : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.danger, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: "Jobs",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
          href: isDemo ? null : '/settings',
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { settings, isLoading } = useData();
  const { isPro, isLoading: subLoading } = useSubscription();
  const { user } = useAuth();
  const hasRedirected = useRef(false);

  // The admin operator and the demo account both bypass the paywall. The admin
  // never needs to pay; the demo needs to be visible to prospects without a
  // Stripe subscription so the guys can show how the app works.
  const bypassPaywall = user?.email === 'admin@callcatch.com' || user?.email === 'demo';

  useEffect(() => {
    if (isLoading || subLoading || hasRedirected.current) return;

    if (!isPro && !bypassPaywall) {
      hasRedirected.current = true;
      router.replace('/paywall');
    }
    // Onboarding wizard removed: every tradie account is provisioned by the
    // operator before first login (business name, service area, Twilio number,
    // services all pre-set). The forced password change is handled by AuthGate
    // in app/_layout.tsx.
  }, [isLoading, subLoading, isPro, bypassPaywall]);

  if (isLoading || subLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (!isPro && !bypassPaywall) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }} />
    );
  }

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
