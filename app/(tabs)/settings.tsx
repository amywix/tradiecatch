import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Switch, Platform,
  Alert, ActivityIndicator, Modal, KeyboardAvoidingView, TouchableOpacity,
} from 'react-native';
import { Audio } from 'expo-av';
import * as ExpoClipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useData } from '@/lib/data-context';
import { confirmAction } from '@/lib/helpers';
import { useSubscription } from '@/lib/subscription-context';
import { useAuth } from '@/lib/auth-context';
import { apiRequest } from '@/lib/query-client';
import { router } from 'expo-router';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateAppSettings, updateServices, refreshAll } = useData();
  const { isPro, openCustomerPortal } = useSubscription();
  const { user, logout } = useAuth();
  const isAdmin = user?.email === 'admin@callcatch.com';
  const isDemo = user?.email === 'demo';

  // Defensive: the Settings tab is hidden for the demo account in
  // app/(tabs)/_layout.tsx, but if a demo user somehow lands here via a deep
  // link, bounce them straight back to the Calls tab.
  useEffect(() => {
    if (isDemo) {
      router.replace('/(tabs)');
    }
  }, [isDemo]);
  const [businessName, setBusinessName] = useState(settings.businessName);
  const [editingName, setEditingName] = useState(false);
  const [editingServiceIdx, setEditingServiceIdx] = useState<number | null>(null);
  const [editingServiceText, setEditingServiceText] = useState('');
  const [addingService, setAddingService] = useState(false);
  const [newServiceText, setNewServiceText] = useState('');
  const [voiceMessage, setVoiceMessage] = useState(settings.missedCallVoiceMessage || 'Sorry we missed your call. We will SMS you now to follow up.');

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [activeRecording, setActiveRecording] = useState<Audio.Recording | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSound, setPlaybackSound] = useState<Audio.Sound | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hasServerRecording, setHasServerRecording] = useState(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const webFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isWebUploading, setIsWebUploading] = useState(false);

  // Sync server recording state from settings
  useEffect(() => {
    setHasServerRecording(!!(settings.voiceRecordingData));
  }, [settings.voiceRecordingData]);

  // Clean up audio resources on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (activeRecording) activeRecording.stopAndUnloadAsync().catch(() => {});
      if (playbackSound) playbackSound.unloadAsync().catch(() => {});
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Please allow microphone access to record a voicemail greeting.');
          return;
        }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      }
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setActiveRecording(recording);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (err) {
      Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!activeRecording) return;
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    try {
      await activeRecording.stopAndUnloadAsync();
      if (Platform.OS !== 'web') await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = activeRecording.getURI();
      setRecordingUri(uri);
      setActiveRecording(null);
      setIsRecording(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert('Error', 'Could not finish recording.');
      setIsRecording(false);
      setActiveRecording(null);
    }
  }, [activeRecording]);

  const togglePlayback = useCallback(async () => {
    if (!recordingUri) return;
    if (isPlaying && playbackSound) {
      await playbackSound.pauseAsync();
      setIsPlaying(false);
      return;
    }
    if (playbackSound) {
      await playbackSound.playFromPositionAsync(0);
      setIsPlaying(true);
      return;
    }
    try {
      if (Platform.OS !== 'web') await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: recordingUri }, { shouldPlay: true });
      setPlaybackSound(sound);
      setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) setIsPlaying(false);
      });
    } catch (err) {
      Alert.alert('Error', 'Could not play recording.');
    }
  }, [recordingUri, isPlaying, playbackSound]);

  const discardLocalRecording = useCallback(async () => {
    if (playbackSound) { await playbackSound.unloadAsync().catch(() => {}); setPlaybackSound(null); }
    setRecordingUri(null);
    setIsPlaying(false);
    setRecordingSeconds(0);
  }, [playbackSound]);

  const uploadRecording = useCallback(async () => {
    if (!recordingUri) return;
    setIsUploading(true);
    try {
      const response = await fetch(recordingUri);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => { const b64 = (reader.result as string).split(',')[1]; resolve(b64); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const mimeType = blob.type || 'audio/m4a';
      const res = await apiRequest('POST', '/api/settings/voice-recording', { audioBase64: base64, mimeType });
      if (!res.ok) throw new Error('Upload failed');
      setHasServerRecording(true);
      if (playbackSound) { await playbackSound.unloadAsync().catch(() => {}); setPlaybackSound(null); }
      setRecordingUri(null);
      setIsPlaying(false);
      setRecordingSeconds(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert('Error', 'Could not save recording. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [recordingUri, playbackSound]);

  const deleteServerRecording = useCallback(async () => {
    confirmAction(
      'Delete Recording',
      'Remove your voicemail recording? Callers will hear the default text message instead.',
      'Delete',
      async () => {
        try {
          await apiRequest('DELETE', '/api/settings/voice-recording');
          await refreshAll();
          setHasServerRecording(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (err: any) {
          Alert.alert('Error', err?.message || 'Could not delete recording.');
        }
      },
    );
  }, [refreshAll]);

  const reRecordVoicemail = useCallback(async () => {
    confirmAction(
      'Re-record',
      'Delete the current recording and record a new one?',
      'Re-record',
      async () => {
        try {
          await apiRequest('DELETE', '/api/settings/voice-recording');
          await refreshAll();
          setHasServerRecording(false);
        } catch (err: any) {
          Alert.alert('Error', err?.message || 'Could not delete recording.');
        }
      },
    );
  }, [refreshAll]);

  const handleWebFileUpload = useCallback(async (file: File) => {
    setIsWebUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => { const b64 = (reader.result as string).split(',')[1]; resolve(b64); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await apiRequest('POST', '/api/settings/voice-recording', { audioBase64: base64, mimeType: file.type || 'audio/mpeg' });
      if (!res.ok) throw new Error('Upload failed');
      setHasServerRecording(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Error', 'Could not upload recording. Please try a different file.');
    } finally {
      setIsWebUploading(false);
      if (webFileInputRef.current) webFileInputRef.current.value = '';
    }
  }, []);

  const services = settings.services || [];

  const handleSaveBusinessName = useCallback(async () => {
    await updateAppSettings({ businessName: businessName.trim() });
    setEditingName(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [businessName, updateAppSettings]);

  const handleToggleAutoReply = useCallback(async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateAppSettings({ autoReplyEnabled: value });
  }, [updateAppSettings]);

  const handleToggleVoicemail = useCallback(async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateAppSettings({ voicemailEnabled: value } as any);
  }, [updateAppSettings]);

  const handleSaveTradieMobile = useCallback(async (value: string) => {
    await updateAppSettings({ tradieMobileNumber: value.trim() } as any);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [updateAppSettings]);

  const handleSetForwardingMode = useCallback(async (mode: 'carrier_forward' | 'twilio_dial') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateAppSettings({ forwardingMode: mode } as any);
  }, [updateAppSettings]);

  const [tradieMobile, setTradieMobile] = useState((settings as any).tradieMobileNumber || '');
  useEffect(() => {
    setTradieMobile((settings as any).tradieMobileNumber || '');
  }, [(settings as any).tradieMobileNumber]);

  const handleToggleBookingCalendar = useCallback(async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateAppSettings({ bookingCalendarEnabled: value });
  }, [updateAppSettings]);

  const handleSetBookingProvider = useCallback(async (provider: 'manual' | 'calendly' | 'google') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateAppSettings({ bookingProvider: provider } as any);
  }, [updateAppSettings]);

  const [calendlyLinkInput, setCalendlyLinkInput] = useState((settings as any).calendlyLink || '');
  const [googleCalLinkInput, setGoogleCalLinkInput] = useState((settings as any).googleCalendarLink || '');
  useEffect(() => {
    setCalendlyLinkInput((settings as any).calendlyLink || '');
  }, [(settings as any).calendlyLink]);
  useEffect(() => {
    setGoogleCalLinkInput((settings as any).googleCalendarLink || '');
  }, [(settings as any).googleCalendarLink]);

  const handleSaveCalendlyLink = useCallback(async () => {
    await updateAppSettings({ calendlyLink: calendlyLinkInput.trim() } as any);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [updateAppSettings, calendlyLinkInput]);

  const handleSaveGoogleCalLink = useCallback(async () => {
    await updateAppSettings({ googleCalendarLink: googleCalLinkInput.trim() } as any);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [updateAppSettings, googleCalLinkInput]);

  const handleSaveVoiceMessage = useCallback(async () => {
    await updateAppSettings({ missedCallVoiceMessage: voiceMessage.trim() || 'Sorry we missed your call. We will SMS you now to follow up.' });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [updateAppSettings, voiceMessage]);

  // ── Service Area ───────────────────────────────────────────────────────────
  const [editingArea, setEditingArea] = useState(false);
  const [areaAddress, setAreaAddress] = useState((settings as any).baseAddress || '');
  const [areaRadius, setAreaRadius] = useState(String((settings as any).serviceRadiusKm ?? 30));
  const [areaSaving, setAreaSaving] = useState(false);
  const [areaError, setAreaError] = useState<string | null>(null);
  useEffect(() => {
    setAreaAddress((settings as any).baseAddress || '');
    setAreaRadius(String((settings as any).serviceRadiusKm ?? 30));
  }, [(settings as any).baseAddress, (settings as any).serviceRadiusKm]);

  const handleSaveServiceArea = useCallback(async () => {
    const addr = areaAddress.trim();
    const r = parseInt(areaRadius, 10);
    if (!addr || addr.length < 5) {
      setAreaError('Enter a full address with suburb and postcode.');
      return;
    }
    if (isNaN(r) || r <= 0 || r > 500) {
      setAreaError('Radius must be a number between 1 and 500 km.');
      return;
    }
    setAreaError(null);
    setAreaSaving(true);
    try {
      let coords: { lat: number; lng: number } | null = null;
      try {
        const lookup: any = await apiRequest('POST', '/api/settings/geocode', { address: addr });
        if (lookup && typeof lookup.lat === 'number' && typeof lookup.lng === 'number') {
          coords = { lat: lookup.lat, lng: lookup.lng };
        }
      } catch (geoErr: any) {
        // Geocoding failed — surface a clear error; still save the text fields
        // so the tradie can correct it later.
        setAreaError(geoErr?.message || "Couldn't find that address. Try adding the suburb and postcode.");
      }
      await updateAppSettings({
        baseAddress: addr,
        ...(coords ? { baseLat: coords.lat, baseLng: coords.lng } : { baseLat: null, baseLng: null }),
        serviceRadiusKm: r,
      } as any);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (coords) {
        setEditingArea(false);
      }
    } finally {
      setAreaSaving(false);
    }
  }, [areaAddress, areaRadius, updateAppSettings]);

  // ── Message Bank ──────────────────────────────────────────────────────────
  const DEFAULT_MSGS: Record<string, string> = {
    greeting_missed_call: "Hi! Sorry we missed your call!{businessLine}\n\nCan we grab your name to get started?",
    greeting_demo: "Hi! Thanks for reaching out!{businessLine}\n\nCan we grab your name to get started?",
    service_intro: "Thanks {name}! What can we help you with today?\n\nReply with the number below:\n\n{menu}",
    address_request: "Great! {service}.\n\nWhat's the address for the job?",
    email_request: "Almost done! What's the best email address to send confirmation and updates to?",
    time_preference: "Thanks! And what's the best time:\n1. Morning\n2. Afternoon\n3. ASAP",
    booked_manual: "All locked in! {dateTime}.\n\nWe've confirmed your appointment.{urgentNote}\n\n- {businessName}",
    booked_link: "Thanks! Pick a time that suits you here and we'll be locked in:\n\n{link}\n\nWe'll get a confirmation as soon as you book.{urgentNote}\n\n- {businessName}",
    followup_complete: "Thanks for reaching out! We'll be in touch soon.\n\n- {businessName}",
  };
  const MSG_LABELS: Record<string, { label: string; hint: string }> = {
    greeting_missed_call: { label: 'Missed Call Greeting', hint: 'Use {businessName} or {businessLine} ("\\nThis is Name.")' },
    greeting_demo: { label: 'Demo / Text Trigger Greeting', hint: 'Sent when someone texts the word "Tradie". Use {businessName}' },
    service_intro: { label: 'Service Selection Intro', hint: 'Use {name} for customer\'s name and {menu} for services list' },
    address_request: { label: 'Address Request', hint: 'Use {service} for the chosen service' },
    email_request: { label: 'Email Request', hint: 'Sent after address is collected' },
    time_preference: { label: 'Time Preference', hint: 'Shown when no booking calendar. Edit the 3 options as needed' },
    booked_manual: { label: 'Booking Confirmation (Manual)', hint: 'Use {dateTime}, {urgentNote}, {businessName}' },
    booked_link: { label: 'Booking Confirmation (Calendar Link)', hint: 'Sent when Calendly/Google Calendar is enabled. Use {link}, {urgentNote}, {businessName}' },
    followup_complete: { label: 'After-Booking Follow-up', hint: 'Sent if customer replies after booking. Use {businessName}' },
  };
  const currentMsgs: Record<string, string> = { ...DEFAULT_MSGS, ...(settings.conversationMessages || {}) };
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [editingMsgKey, setEditingMsgKey] = useState<string>('');
  const [editingMsgText, setEditingMsgText] = useState('');
  const [msgSaving, setMsgSaving] = useState(false);

  const openMsgEdit = useCallback((key: string) => {
    setEditingMsgKey(key);
    setEditingMsgText(currentMsgs[key] || DEFAULT_MSGS[key] || '');
    setShowMsgModal(true);
  }, [currentMsgs]);

  const handleSaveMsg = useCallback(async () => {
    if (!editingMsgKey) return;
    const trimmed = editingMsgText.trim();
    if (!trimmed) return;
    setMsgSaving(true);
    try {
      const updated = { ...(settings.conversationMessages || {}), [editingMsgKey]: trimmed };
      await updateAppSettings({ conversationMessages: updated });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowMsgModal(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save message.');
    } finally {
      setMsgSaving(false);
    }
  }, [editingMsgKey, editingMsgText, settings.conversationMessages, updateAppSettings]);

  const handleDeleteCustomMsg = useCallback(async (key: string) => {
    const info = MSG_LABELS[key];
    const label = info?.label || key;
    const doDelete = async () => {
      const stored = { ...(settings.conversationMessages || {}) };
      delete stored[key];
      await updateAppSettings({ conversationMessages: stored });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    if (Platform.OS === 'web') {
      const ok = window.confirm(`Delete your custom "${label}" and restore the default text?`);
      if (ok) await doDelete();
      return;
    }
    Alert.alert('Delete Customisation', `Delete your custom "${label}" and restore the default text?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  }, [settings.conversationMessages, updateAppSettings]);

  const handleResetMsg = useCallback(async () => {
    if (!editingMsgKey) return;
    Alert.alert('Reset to Default', 'Restore this message to the original default text?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset', style: 'destructive', onPress: async () => {
          const defaultText = DEFAULT_MSGS[editingMsgKey] || '';
          setEditingMsgText(defaultText);
          const stored = { ...(settings.conversationMessages || {}) };
          delete stored[editingMsgKey];
          await updateAppSettings({ conversationMessages: stored }).catch(() => {});
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setShowMsgModal(false);
        }
      },
    ]);
  }, [editingMsgKey, settings.conversationMessages, updateAppSettings]);

  // ── Twilio ─────────────────────────────────────────────────────────────────
  const [showTwilioModal, setShowTwilioModal] = useState(false);
  const [twilioSid, setTwilioSid] = useState(settings.twilioAccountSid || '');
  const [twilioToken, setTwilioToken] = useState(settings.twilioAuthToken || '');
  const [twilioPhone, setTwilioPhone] = useState(settings.twilioPhoneNumber || '');
  const [twilioSaving, setTwilioSaving] = useState(false);
  const [twilioTestStatus, setTwilioTestStatus] = useState<null | 'testing' | 'ok' | 'error'>(null);
  const [twilioTestMsg, setTwilioTestMsg] = useState('');

  const handleTestTwilio = useCallback(async () => {
    setTwilioTestStatus('testing');
    setTwilioTestMsg('');
    try {
      const res = await apiRequest('POST', '/api/settings/test-twilio');
      const data = await res.json();
      if (data.ok) {
        setTwilioTestStatus('ok');
        setTwilioTestMsg(data.accountName ? `Connected — account: ${data.accountName}` : 'Connected successfully');
      } else {
        setTwilioTestStatus('error');
        setTwilioTestMsg(data.error || 'Could not connect to Twilio.');
      }
    } catch (err: any) {
      setTwilioTestStatus('error');
      setTwilioTestMsg(err.message || 'Connection test failed.');
    }
  }, []);

  const openTwilioModal = useCallback(() => {
    setTwilioSid(settings.twilioAccountSid || '');
    setTwilioToken(settings.twilioAuthToken || '');
    setTwilioPhone(settings.twilioPhoneNumber || '');
    setShowTwilioModal(true);
  }, [settings.twilioAccountSid, settings.twilioAuthToken, settings.twilioPhoneNumber]);

  const handleSaveTwilio = useCallback(async () => {
    if (!twilioSid.trim() || !twilioToken.trim() || !twilioPhone.trim()) {
      Alert.alert('Missing Details', 'Please enter your Account SID, Auth Token, and phone number.');
      return;
    }
    setTwilioSaving(true);
    try {
      await updateAppSettings({
        twilioAccountSid: twilioSid.trim(),
        twilioAuthToken: twilioToken.trim(),
        twilioPhoneNumber: twilioPhone.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowTwilioModal(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save Twilio details.');
    } finally {
      setTwilioSaving(false);
    }
  }, [twilioSid, twilioToken, twilioPhone, updateAppSettings]);

  const bookingSlots = settings.bookingSlots || ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"];
  const [editingSlotIdx, setEditingSlotIdx] = useState<number | null>(null);
  const [editingSlotText, setEditingSlotText] = useState('');
  const [addingSlot, setAddingSlot] = useState(false);
  const [newSlotText, setNewSlotText] = useState('');

  const bookingDates = settings.bookingDates || [];
  const [editingDateIdx, setEditingDateIdx] = useState<number | null>(null);
  const [editingDateText, setEditingDateText] = useState('');
  const [addingDate, setAddingDate] = useState(false);
  const [newDateText, setNewDateText] = useState('');

  const handleSaveDateEdit = useCallback(async () => {
    if (editingDateIdx === null) return;
    const trimmed = editingDateText.trim();
    if (!trimmed) return;
    const updated = [...bookingDates];
    updated[editingDateIdx] = trimmed;
    await updateAppSettings({ bookingDates: updated });
    setEditingDateIdx(null);
    setEditingDateText('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [editingDateIdx, editingDateText, bookingDates, updateAppSettings]);

  const handleAddDate = useCallback(async () => {
    const trimmed = newDateText.trim();
    if (!trimmed) return;
    const updated = [...bookingDates, trimmed];
    await updateAppSettings({ bookingDates: updated });
    setNewDateText('');
    setAddingDate(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [newDateText, bookingDates, updateAppSettings]);

  const handleDeleteDate = useCallback(async (idx: number) => {
    if (bookingDates.length <= 1) {
      Alert.alert("Can't Remove", "You need at least one available date.");
      return;
    }
    const updated = bookingDates.filter((_: string, i: number) => i !== idx);
    await updateAppSettings({ bookingDates: updated });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [bookingDates, updateAppSettings]);

  const handleSaveSlotEdit = useCallback(async () => {
    if (editingSlotIdx === null) return;
    const trimmed = editingSlotText.trim();
    if (!trimmed) return;
    const updated = [...bookingSlots];
    updated[editingSlotIdx] = trimmed;
    await updateAppSettings({ bookingSlots: updated });
    setEditingSlotIdx(null);
    setEditingSlotText('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [editingSlotIdx, editingSlotText, bookingSlots, updateAppSettings]);

  const handleAddSlot = useCallback(async () => {
    const trimmed = newSlotText.trim();
    if (!trimmed) return;
    const updated = [...bookingSlots, trimmed];
    await updateAppSettings({ bookingSlots: updated });
    setNewSlotText('');
    setAddingSlot(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [newSlotText, bookingSlots, updateAppSettings]);

  const handleDeleteSlot = useCallback(async (idx: number) => {
    if (bookingSlots.length <= 1) {
      Alert.alert("Can't Remove", "You need at least one time slot.");
      return;
    }
    const updated = bookingSlots.filter((_: string, i: number) => i !== idx);
    await updateAppSettings({ bookingSlots: updated });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [bookingSlots, updateAppSettings]);

  const handleEditService = useCallback((idx: number) => {
    setEditingServiceIdx(idx);
    setEditingServiceText(services[idx]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [services]);

  const [servicesSaved, setServicesSaved] = useState(false);

  const handleSaveServiceEdit = useCallback(async () => {
    if (editingServiceIdx === null) return;
    const trimmed = editingServiceText.trim();
    if (!trimmed) {
      setEditingServiceIdx(null);
      setEditingServiceText('');
      return;
    }
    const updated = [...services];
    updated[editingServiceIdx] = trimmed;
    setEditingServiceIdx(null);
    setEditingServiceText('');
    await updateServices(updated);
    setServicesSaved(true);
    setTimeout(() => setServicesSaved(false), 2500);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [editingServiceIdx, editingServiceText, services, updateServices]);

  const handleDeleteService = useCallback(async (idx: number) => {
    if (services.length <= 1) {
      if (Platform.OS === 'web') {
        window.alert("You need at least one service.");
      } else {
        Alert.alert("Can't Remove", "You need at least one service.");
      }
      return;
    }
    const doRemove = async () => {
      const updated = services.filter((_, i) => i !== idx);
      await updateServices(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    if (Platform.OS === 'web') {
      const ok = window.confirm(`Remove "${services[idx]}" from your services?`);
      if (ok) await doRemove();
      return;
    }
    Alert.alert(
      'Remove Service',
      `Remove "${services[idx]}" from your services?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]
    );
  }, [services, updateServices]);

  const handleAddService = useCallback(async () => {
    const trimmed = newServiceText.trim();
    if (!trimmed) { setAddingService(false); return; }
    const updated = [...services, trimmed];
    setNewServiceText('');
    setAddingService(false);
    await updateServices(updated);
    setServicesSaved(true);
    setTimeout(() => setServicesSaved(false), 2500);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [newServiceText, services, updateServices]);

  const handleMoveService = useCallback(async (idx: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= services.length) return;
    const updated = [...services];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    await updateServices(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [services, updateServices]);

  const webTopInset = Platform.OS === 'web' ? 16 : 0;
  const webBottomInset = Platform.OS === 'web' ? 16 : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: (Platform.OS === 'web' ? webTopInset : insets.top) + 12 }]}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: (Platform.OS === 'web' ? webBottomInset : 0) + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: '#E8EEF8' }]}>
                  <Ionicons name="business-outline" size={18} color={Colors.primaryLight} />
                </View>
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Business Name</Text>
                  {editingName ? (
                    <View style={styles.editRow}>
                      <TextInput
                        style={styles.editInput}
                        value={businessName}
                        onChangeText={setBusinessName}
                        placeholder="Enter your business name"
                        placeholderTextColor={Colors.textTertiary}
                        autoFocus
                        onSubmitEditing={handleSaveBusinessName}
                      />
                      <Pressable onPress={handleSaveBusinessName} hitSlop={8}>
                        <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => setEditingName(true)}>
                      <Text style={styles.settingValue}>
                        {settings.businessName || 'Tap to set'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
              {!editingName && (
                <Pressable onPress={() => setEditingName(true)} hitSlop={8}>
                  <Feather name="edit-2" size={16} color={Colors.textTertiary} />
                </Pressable>
              )}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Area</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: '#E8EEF8' }]}>
                  <Ionicons name="location-outline" size={18} color={Colors.primaryLight} />
                </View>
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Base address & travel radius</Text>
                  <Text style={styles.settingDescription}>
                    Jobs outside this area won't auto-book. We'll notify you to review them manually.
                  </Text>
                </View>
              </View>
              {!editingArea && (
                <Pressable onPress={() => setEditingArea(true)} hitSlop={8}>
                  <Feather name="edit-2" size={16} color={Colors.textTertiary} />
                </Pressable>
              )}
            </View>

            {!editingArea ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                <Text style={styles.settingValue}>
                  {(settings as any).baseAddress?.trim() || 'Tap edit to set your base address'}
                </Text>
                <Text style={[styles.settingDescription, { marginTop: 4 }]}>
                  Travel radius: {(settings as any).serviceRadiusKm ?? 30} km
                  {((settings as any).baseAddress?.trim() && ((settings as any).baseLat == null || (settings as any).baseLng == null))
                    ? '  •  ⚠️ address not located — service-area check disabled'
                    : ''}
                </Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                <Text style={[styles.settingDescription, { marginBottom: 6 }]}>Base address</Text>
                <TextInput
                  style={[styles.editInput, { paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 8 }]}
                  value={areaAddress}
                  onChangeText={setAreaAddress}
                  placeholder="e.g. 12 Smith St, Parramatta NSW 2150"
                  placeholderTextColor={Colors.textTertiary}
                  autoCapitalize="words"
                />
                <Text style={[styles.settingDescription, { marginTop: 12, marginBottom: 6 }]}>Travel radius (km)</Text>
                <TextInput
                  style={[styles.editInput, { paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 8 }]}
                  value={areaRadius}
                  onChangeText={(v) => setAreaRadius(v.replace(/[^0-9]/g, ''))}
                  placeholder="30"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                {areaError && (
                  <Text style={{ color: Colors.danger || '#D32F2F', marginTop: 8, fontSize: 13 }}>{areaError}</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <Pressable
                    onPress={() => { setEditingArea(false); setAreaError(null); setAreaAddress((settings as any).baseAddress || ''); setAreaRadius(String((settings as any).serviceRadiusKm ?? 30)); }}
                    style={[styles.upgradeBtn, { flex: 1, backgroundColor: Colors.surface }]}
                  >
                    <Text style={[styles.upgradeBtnText, { color: Colors.text }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSaveServiceArea}
                    disabled={areaSaving}
                    style={[styles.upgradeBtn, { flex: 1, opacity: areaSaving ? 0.6 : 1 }]}
                  >
                    {areaSaving ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.upgradeBtnText}>Save</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: isPro ? '#E8F8ED' : '#FFF0E8' }]}>
                  <Ionicons
                    name={isPro ? 'shield-checkmark' : 'flash'}
                    size={18}
                    color={isPro ? Colors.success : Colors.accent}
                  />
                </View>
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>{isPro ? 'CallCatch Pro' : 'No Active Subscription'}</Text>
                  <Text style={styles.settingDescription}>
                    {isPro ? 'Your subscription is active' : 'Subscribe to continue using CallCatch'}
                  </Text>
                </View>
              </View>
              {isPro ? (
                <Pressable
                  style={[styles.upgradeBtn, { backgroundColor: Colors.surface }]}
                  onPress={openCustomerPortal}
                >
                  <Text style={[styles.upgradeBtnText, { color: Colors.accent }]}>Manage</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.upgradeBtn}
                  onPress={() => router.push('/paywall')}
                >
                  <Text style={styles.upgradeBtnText}>Upgrade</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Auto-Reply</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: '#E8F8ED' }]}>
                  <Ionicons name="chatbubbles-outline" size={18} color={Colors.success} />
                </View>
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Auto-Reply SMS</Text>
                  <Text style={styles.settingDescription}>
                    Automatically send SMS when you miss a call
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.autoReplyEnabled}
                onValueChange={handleToggleAutoReply}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor={Colors.white}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Voicemail & Call Forwarding</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: '#FFE8D6' }]}>
                  <Ionicons name="mic-outline" size={18} color={Colors.accent} />
                </View>
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Capture Voicemail</Text>
                  <Text style={styles.settingDescription}>
                    Record a message after the greeting and SMS the link to your mobile
                  </Text>
                </View>
              </View>
              <Switch
                value={(settings as any).voicemailEnabled !== false}
                onValueChange={handleToggleVoicemail}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor={Colors.white}
              />
            </View>

            <View style={styles.flowDivider} />

            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={styles.settingLabel}>Your Mobile Number</Text>
              <Text style={[styles.settingDescription, { marginBottom: 8 }]}>
                Where voicemail recordings get sent (and where Twilio calls if you choose Option A below)
              </Text>
              <TextInput
                style={styles.input}
                value={tradieMobile}
                onChangeText={setTradieMobile}
                onBlur={() => handleSaveTradieMobile(tradieMobile)}
                placeholder="+61 4XX XXX XXX"
                placeholderTextColor={Colors.textLight}
                keyboardType="phone-pad"
                autoCorrect={false}
              />
            </View>

            <View style={styles.flowDivider} />

            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={styles.settingLabel}>How Calls Reach Voicemail</Text>
              <TouchableOpacity
                style={[
                  styles.modeOption,
                  ((settings as any).forwardingMode || 'carrier_forward') === 'carrier_forward' && styles.modeOptionActive,
                ]}
                onPress={() => handleSetForwardingMode('carrier_forward')}
              >
                <View style={styles.modeOptionHeader}>
                  <Ionicons
                    name={((settings as any).forwardingMode || 'carrier_forward') === 'carrier_forward' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={Colors.accent}
                  />
                  <Text style={styles.modeOptionTitle}>Option B — Carrier Forward (recommended)</Text>
                </View>
                <Text style={styles.modeOptionDesc}>
                  Customers ring your normal mobile number. Your carrier forwards unanswered calls to Twilio, which records the voicemail. Use the diversion codes below to set this up once.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeOption,
                  ((settings as any).forwardingMode || 'carrier_forward') === 'twilio_dial' && styles.modeOptionActive,
                ]}
                onPress={() => handleSetForwardingMode('twilio_dial')}
              >
                <View style={styles.modeOptionHeader}>
                  <Ionicons
                    name={((settings as any).forwardingMode) === 'twilio_dial' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={Colors.accent}
                  />
                  <Text style={styles.modeOptionTitle}>Option A — Twilio Calls You First</Text>
                </View>
                <Text style={styles.modeOptionDesc}>
                  Customers ring your Twilio number directly. Twilio rings your mobile for 20 seconds; if you don't answer, it records voicemail. Best when you advertise the Twilio number.
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SMS Flow</Text>
          <View style={styles.card}>
            <View style={styles.flowStep}>
              <View style={[styles.flowStepNumber, { backgroundColor: Colors.accent }]}>
                <Text style={styles.flowStepNumberText}>1</Text>
              </View>
              <View style={styles.flowStepContent}>
                <Text style={styles.flowStepTitle}>Initial SMS</Text>
                <Text style={styles.flowStepDesc}>Missed call greeting with service menu</Text>
              </View>
            </View>
            <View style={styles.flowDivider} />
            <View style={styles.flowStep}>
              <View style={[styles.flowStepNumber, { backgroundColor: Colors.warning }]}>
                <Text style={styles.flowStepNumberText}>2</Text>
              </View>
              <View style={styles.flowStepContent}>
                <Text style={styles.flowStepTitle}>Service Selection</Text>
                <Text style={styles.flowStepDesc}>Customer picks their service need</Text>
              </View>
            </View>
            <View style={styles.flowDivider} />
            <View style={styles.flowStep}>
              <View style={[styles.flowStepNumber, { backgroundColor: Colors.primaryLight }]}>
                <Text style={styles.flowStepNumberText}>3</Text>
              </View>
              <View style={styles.flowStepContent}>
                <Text style={styles.flowStepTitle}>Job Details</Text>
                <Text style={styles.flowStepDesc}>Collect address and preferred time</Text>
              </View>
            </View>
            <View style={styles.flowDivider} />
            <View style={styles.flowStep}>
              <View style={[styles.flowStepNumber, { backgroundColor: Colors.success }]}>
                <Text style={styles.flowStepNumberText}>4</Text>
              </View>
              <View style={styles.flowStepContent}>
                <Text style={styles.flowStepTitle}>Booking Confirmed</Text>
                <Text style={styles.flowStepDesc}>Job auto-created in your Jobs tab</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Message Bank ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Message Bank</Text>
          <Text style={[styles.sectionHint, { marginBottom: 4 }]}>Edit every SMS your customers receive. Tap a message to customise it.</Text>
          <View style={styles.card}>
            {Object.keys(DEFAULT_MSGS).map((key, idx, arr) => {
              const info = MSG_LABELS[key];
              const isCustomised = !!(settings.conversationMessages?.[key]);
              return (
                <React.Fragment key={key}>
                  <Pressable style={styles.settingRow} onPress={() => openMsgEdit(key)}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.settingLabel}>{info?.label ?? key}</Text>
                        {isCustomised && (
                          <View style={{ backgroundColor: Colors.accent + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 10, color: Colors.accent, fontFamily: 'Inter_600SemiBold' }}>CUSTOM</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.settingDescription} numberOfLines={2}>
                        {currentMsgs[key].replace(/\{[^}]+\}/g, '…').replace(/\n/g, ' ').trim()}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {isCustomised && (
                        <Pressable
                          onPress={(e) => { e.stopPropagation?.(); handleDeleteCustomMsg(key); }}
                          hitSlop={10}
                          testID={`delete-msg-${key}`}
                        >
                          <Feather name="trash-2" size={16} color={Colors.danger} />
                        </Pressable>
                      )}
                      <Feather name="edit-2" size={16} color={Colors.textTertiary} />
                    </View>
                  </Pressable>
                  {idx < arr.length - 1 && <View style={styles.flowDivider} />}
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {/* Message Edit Modal */}
        <Modal visible={showMsgModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowMsgModal(false)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={{ flex: 1, backgroundColor: Colors.background }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                <Pressable onPress={() => setShowMsgModal(false)}>
                  <Text style={{ color: Colors.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 15 }}>Cancel</Text>
                </Pressable>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text }}>
                  {MSG_LABELS[editingMsgKey]?.label ?? editingMsgKey}
                </Text>
                <Pressable onPress={handleSaveMsg} disabled={msgSaving}>
                  {msgSaving ? (
                    <ActivityIndicator size="small" color={Colors.accent} />
                  ) : (
                    <Text style={{ color: Colors.accent, fontFamily: 'Inter_700Bold', fontSize: 15 }}>Save</Text>
                  )}
                </Pressable>
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
                {editingMsgKey && MSG_LABELS[editingMsgKey]?.hint ? (
                  <View style={{ backgroundColor: Colors.surface, borderRadius: 10, padding: 12 }}>
                    <Text style={{ color: Colors.accent, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 4 }}>Available variables</Text>
                    <Text style={{ color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
                      {MSG_LABELS[editingMsgKey].hint}
                    </Text>
                  </View>
                ) : null}
                <TextInput
                  style={{
                    backgroundColor: Colors.surface,
                    borderRadius: 12,
                    padding: 14,
                    color: Colors.text,
                    fontFamily: 'Inter_400Regular',
                    fontSize: 15,
                    minHeight: 180,
                    textAlignVertical: 'top',
                    borderWidth: 1,
                    borderColor: Colors.border,
                  }}
                  value={editingMsgText}
                  onChangeText={setEditingMsgText}
                  multiline
                  autoFocus
                  placeholder="Enter message text..."
                  placeholderTextColor={Colors.textTertiary}
                />
                <Pressable
                  onPress={handleResetMsg}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12 }}
                >
                  <Feather name="rotate-ccw" size={14} color={Colors.textTertiary} />
                  <Text style={{ color: Colors.textTertiary, fontFamily: 'Inter_500Medium', fontSize: 13 }}>Reset to default</Text>
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Services Offered</Text>
            {servicesSaved && (
              <View style={styles.savedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                <Text style={styles.savedBadgeText}>Saved</Text>
              </View>
            )}
            <Pressable
              style={styles.addButton}
              onPress={() => { setAddingService(true); setNewServiceText(''); }}
              hitSlop={8}
            >
              <Ionicons name="add-circle" size={22} color={Colors.accent} />
            </Pressable>
          </View>
          <Text style={styles.sectionHint}>
            These options are sent to customers via SMS when they reply to your missed call. Tap any service to rename it.
          </Text>
          <View style={styles.card}>
            {services.map((service, idx) => (
              <View key={`service-${idx}`}>
                {idx > 0 && <View style={styles.serviceDivider} />}
                {editingServiceIdx === idx ? (
                  <View style={styles.serviceEditRow}>
                    <View style={styles.serviceNum}>
                      <Text style={styles.serviceNumText}>{idx + 1}</Text>
                    </View>
                    <TextInput
                      style={styles.serviceEditInput}
                      value={editingServiceText}
                      onChangeText={setEditingServiceText}
                      autoFocus
                      onSubmitEditing={handleSaveServiceEdit}
                      onBlur={handleSaveServiceEdit}
                      placeholder="Service name"
                      placeholderTextColor={Colors.textTertiary}
                      returnKeyType="done"
                    />
                    <Pressable onPress={handleSaveServiceEdit} hitSlop={8}>
                      <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.serviceRow}>
                    <View style={styles.serviceNum}>
                      <Text style={styles.serviceNumText}>{idx + 1}</Text>
                    </View>
                    <Pressable style={styles.serviceTextWrap} onPress={() => handleEditService(idx)}>
                      <Text style={styles.serviceText}>{service}</Text>
                    </Pressable>
                    <View style={styles.serviceActions}>
                      {idx > 0 && (
                        <Pressable onPress={() => handleMoveService(idx, 'up')} hitSlop={6}>
                          <Ionicons name="chevron-up" size={18} color={Colors.textTertiary} />
                        </Pressable>
                      )}
                      {idx < services.length - 1 && (
                        <Pressable onPress={() => handleMoveService(idx, 'down')} hitSlop={6}>
                          <Ionicons name="chevron-down" size={18} color={Colors.textTertiary} />
                        </Pressable>
                      )}
                      <Pressable onPress={() => handleEditService(idx)} hitSlop={6}>
                        <Feather name="edit-2" size={14} color={Colors.textTertiary} />
                      </Pressable>
                      <Pressable onPress={() => handleDeleteService(idx)} hitSlop={6}>
                        <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            ))}

            {addingService && (
              <>
                <View style={styles.serviceDivider} />
                <View style={styles.serviceEditRow}>
                  <View style={[styles.serviceNum, { backgroundColor: Colors.accent + '20' }]}>
                    <Ionicons name="add" size={14} color={Colors.accent} />
                  </View>
                  <TextInput
                    style={styles.serviceEditInput}
                    value={newServiceText}
                    onChangeText={setNewServiceText}
                    autoFocus
                    onSubmitEditing={handleAddService}
                    onBlur={handleAddService}
                    placeholder="New service name"
                    placeholderTextColor={Colors.textTertiary}
                    returnKeyType="done"
                  />
                  <Pressable onPress={handleAddService} hitSlop={8}>
                    <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>

        {isAdmin ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Twilio Connection (Admin)</Text>
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIcon, { backgroundColor: settings.twilioAccountSid ? '#E8F8ED' : '#FFEEEE' }]}>
                    <Ionicons
                      name={settings.twilioAccountSid ? 'checkmark-circle' : 'alert-circle-outline'}
                      size={18}
                      color={settings.twilioAccountSid ? Colors.success : Colors.danger}
                    />
                  </View>
                  <View style={styles.settingContent}>
                    <Text style={styles.settingLabel}>SMS Status</Text>
                    <Text style={styles.settingValue}>
                      {settings.twilioAccountSid ? 'Connected' : 'Not configured'}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.settingDivider} />
              <Pressable style={styles.twilioDetailsBtn} onPress={openTwilioModal}>
                <Ionicons name={settings.twilioAccountSid ? 'pencil-outline' : 'add-circle-outline'} size={18} color={Colors.accent} />
                <Text style={styles.twilioDetailsBtnText}>
                  {settings.twilioAccountSid ? 'Edit Twilio Details' : 'Add Twilio Details'}
                </Text>
              </Pressable>
              {settings.twilioAccountSid ? (
                <>
                  <View style={styles.settingDivider} />
                  <Pressable
                    style={[styles.twilioDetailsBtn, twilioTestStatus === 'testing' && { opacity: 0.6 }]}
                    onPress={handleTestTwilio}
                    disabled={twilioTestStatus === 'testing'}
                  >
                    {twilioTestStatus === 'testing' ? (
                      <ActivityIndicator size="small" color={Colors.accent} />
                    ) : (
                      <Ionicons name="wifi-outline" size={18} color={Colors.accent} />
                    )}
                    <Text style={styles.twilioDetailsBtnText}>
                      {twilioTestStatus === 'testing' ? 'Testing…' : 'Test Connection'}
                    </Text>
                  </Pressable>
                  {twilioTestStatus === 'ok' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 12 }}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                      <Text style={{ color: Colors.success, fontSize: 13 }}>{twilioTestMsg}</Text>
                    </View>
                  )}
                  {twilioTestStatus === 'error' && (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                      <Text style={{ color: Colors.danger, fontSize: 13 }}>{twilioTestMsg}</Text>
                    </View>
                  )}
                </>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Business Phone Number</Text>
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIcon, { backgroundColor: '#E8F8ED' }]}>
                    <Ionicons name="call-outline" size={18} color={Colors.success} />
                  </View>
                  <View style={styles.settingContent}>
                    <Text style={styles.settingLabel}>
                      {settings.twilioPhoneNumber || 'Not set yet'}
                    </Text>
                    <Text style={styles.settingDescription}>
                      This is your dedicated CallCatch number. Customers call this number, missed calls get an instant SMS reply, and bookings flow into your Jobs tab. The number is set up and managed for you — no action needed.
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Voicemail Greeting</Text>
          <View style={styles.card}>
            <Text style={styles.settingDescription}>
              Record your own voice message for callers to hear when you miss their call.
            </Text>

            {/* Status row */}
            <View style={styles.recordingStatusRow}>
              <View style={[styles.recordingDot, {
                backgroundColor: hasServerRecording ? Colors.success : recordingUri ? '#F59E0B' : Colors.textTertiary,
              }]} />
              <Text style={styles.recordingStatusText}>
                {hasServerRecording
                  ? 'Custom recording active'
                  : recordingUri
                  ? 'Recording ready — tap Save to activate'
                  : isRecording
                  ? 'Recording…'
                  : 'Using default text message'}
              </Text>
            </View>

            {/* Timer while recording */}
            {isRecording && (
              <Text style={styles.recordingTimer}>
                {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
              </Text>
            )}

            {/* Record button (shown when no local or server recording) */}
            {Platform.OS !== 'web' && !recordingUri && !hasServerRecording && (
              <Pressable
                style={[styles.recordButton, isRecording && styles.recordButtonActive]}
                onPress={isRecording ? stopRecording : startRecording}
              >
                <Ionicons name={isRecording ? 'stop' : 'mic'} size={28} color={Colors.white} />
                <Text style={styles.recordButtonText}>{isRecording ? 'Stop' : 'Record'}</Text>
              </Pressable>
            )}

            {/* Local recording controls (recorded but not yet saved) */}
            {recordingUri && !hasServerRecording && (
              <View style={styles.recordingControls}>
                <Pressable style={styles.recordingPlayBtn} onPress={togglePlayback}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color={Colors.accent} />
                  <Text style={styles.recordingPlayBtnText}>{isPlaying ? 'Pause' : 'Preview'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.recordingSaveBtn, isUploading && { opacity: 0.6 }]}
                  onPress={uploadRecording}
                  disabled={isUploading}
                >
                  {isUploading
                    ? <ActivityIndicator color={Colors.white} size="small" />
                    : <Ionicons name="cloud-upload-outline" size={18} color={Colors.white} />}
                  <Text style={styles.recordingSaveBtnText}>{isUploading ? 'Saving…' : 'Save'}</Text>
                </Pressable>
                <Pressable style={styles.recordingDiscardBtn} onPress={discardLocalRecording}>
                  <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                </Pressable>
              </View>
            )}

            {/* Server recording controls (recording already saved) */}
            {hasServerRecording && (
              <View style={styles.recordingControls}>
                <Pressable style={styles.recordingPlayBtn} onPress={reRecordVoicemail}>
                  <Ionicons name="mic-outline" size={18} color={Colors.accent} />
                  <Text style={styles.recordingPlayBtnText}>Re-record</Text>
                </Pressable>
                <Pressable style={styles.recordingDiscardBtn} onPress={deleteServerRecording}>
                  <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                </Pressable>
              </View>
            )}

            {/* Web: file upload */}
            {Platform.OS === 'web' && !hasServerRecording && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.settingDescription, { marginBottom: 10 }]}>
                  Upload an audio file (MP3, M4A, WAV) recorded on your phone or computer:
                </Text>
                {/* Hidden native file input */}
                {/* @ts-ignore — web-only element */}
                <input
                  ref={webFileInputRef}
                  type="file"
                  accept="audio/*"
                  style={{ display: 'none' }}
                  onChange={(e: any) => {
                    const file = e.target?.files?.[0];
                    if (file) handleWebFileUpload(file);
                  }}
                />
                <Pressable
                  style={[styles.recordButton, { marginBottom: 16 }, isWebUploading && { opacity: 0.6 }]}
                  onPress={() => webFileInputRef.current?.click()}
                  disabled={isWebUploading}
                >
                  {isWebUploading
                    ? <ActivityIndicator color={Colors.white} size="small" />
                    : <Ionicons name="cloud-upload-outline" size={22} color={Colors.white} />}
                  <Text style={styles.recordButtonText}>{isWebUploading ? 'Uploading…' : 'Upload Audio File'}</Text>
                </Pressable>
                <Text style={[styles.settingDescription, { marginBottom: 8 }]}>
                  Or use a text greeting instead:
                </Text>
                <TextInput
                  style={styles.editInput}
                  value={voiceMessage}
                  onChangeText={setVoiceMessage}
                  multiline
                  placeholder="Sorry we missed your call. We will SMS you now to follow up."
                  placeholderTextColor={Colors.textTertiary}
                />
                <Pressable style={[styles.upgradeBtn, { marginTop: 10 }]} onPress={handleSaveVoiceMessage}>
                  <Text style={styles.upgradeBtnText}>Save Message</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Booking Calendar</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: '#EDE8F8' }]}>
                  <Ionicons name="calendar-outline" size={18} color="#7C5CBF" />
                </View>
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>Self-Service Booking</Text>
                  <Text style={styles.settingDescription}>
                    Let customers pick a date and time slot via SMS
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.bookingCalendarEnabled}
                onValueChange={handleToggleBookingCalendar}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor={Colors.white}
              />
            </View>
          </View>
          {settings.bookingCalendarEnabled && (() => {
            const provider = ((settings as any).bookingProvider || 'manual') as 'manual' | 'calendly' | 'google';
            return (
            <View style={[styles.card, { marginTop: 8, padding: 0 }]}>
              <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={styles.settingLabel}>Booking Source</Text>
                <Text style={[styles.settingDescription, { marginTop: 2, marginBottom: 8 }]}>
                  Pick how customers book a time after they reply via SMS.
                </Text>

                <TouchableOpacity
                  style={[styles.modeOption, provider === 'manual' && styles.modeOptionActive]}
                  onPress={() => handleSetBookingProvider('manual')}
                >
                  <View style={styles.modeOptionHeader}>
                    <Ionicons name={provider === 'manual' ? 'radio-button-on' : 'radio-button-off'} size={20} color={Colors.accent} />
                    <Text style={styles.modeOptionTitle}>Built-in slots (default)</Text>
                  </View>
                  <Text style={styles.modeOptionDesc}>
                    Customers pick from your time slots and dates over SMS. Defaults to the next 7 days if you don't set custom dates below.
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeOption, provider === 'calendly' && styles.modeOptionActive]}
                  onPress={() => handleSetBookingProvider('calendly')}
                >
                  <View style={styles.modeOptionHeader}>
                    <Ionicons name={provider === 'calendly' ? 'radio-button-on' : 'radio-button-off'} size={20} color={Colors.accent} />
                    <Text style={styles.modeOptionTitle}>Calendly link</Text>
                  </View>
                  <Text style={styles.modeOptionDesc}>
                    We'll text the caller your Calendly link so they pick a time on your real calendar.
                  </Text>
                  {provider === 'calendly' && !((settings as any).calendlyLink || '').trim() && (
                    <View style={{ marginTop: 8, padding: 10, backgroundColor: Colors.warning + '20', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: Colors.warning }}>
                      <Text style={{ color: Colors.warning, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                        Add your Calendly link below — until you do, customers will keep using the built-in slot picker.
                      </Text>
                    </View>
                  )}
                  {provider === 'calendly' && (
                    <View style={{ marginTop: 10 }}>
                      <TextInput
                        style={[styles.serviceEditInput, { backgroundColor: Colors.background, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 }]}
                        value={calendlyLinkInput}
                        onChangeText={setCalendlyLinkInput}
                        placeholder="https://calendly.com/your-name/30min"
                        placeholderTextColor={Colors.textTertiary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        onBlur={handleSaveCalendlyLink}
                        onSubmitEditing={handleSaveCalendlyLink}
                      />
                      <Pressable onPress={handleSaveCalendlyLink} style={{ marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.accent, borderRadius: 8 }}>
                        <Text style={{ color: Colors.accentText, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Save Calendly Link</Text>
                      </Pressable>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeOption, provider === 'google' && styles.modeOptionActive]}
                  onPress={() => handleSetBookingProvider('google')}
                >
                  <View style={styles.modeOptionHeader}>
                    <Ionicons name={provider === 'google' ? 'radio-button-on' : 'radio-button-off'} size={20} color={Colors.accent} />
                    <Text style={styles.modeOptionTitle}>Google Calendar booking link</Text>
                  </View>
                  <Text style={styles.modeOptionDesc}>
                    Paste the booking page link from Google Calendar (Settings → Appointment schedules → Share).
                  </Text>
                  {provider === 'google' && !((settings as any).googleCalendarLink || '').trim() && (
                    <View style={{ marginTop: 8, padding: 10, backgroundColor: Colors.warning + '20', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: Colors.warning }}>
                      <Text style={{ color: Colors.warning, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                        Add your Google Calendar booking link below — until you do, customers will keep using the built-in slot picker.
                      </Text>
                    </View>
                  )}
                  {provider === 'google' && (
                    <View style={{ marginTop: 10 }}>
                      <TextInput
                        style={[styles.serviceEditInput, { backgroundColor: Colors.background, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 }]}
                        value={googleCalLinkInput}
                        onChangeText={setGoogleCalLinkInput}
                        placeholder="https://calendar.app.google/..."
                        placeholderTextColor={Colors.textTertiary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        onBlur={handleSaveGoogleCalLink}
                        onSubmitEditing={handleSaveGoogleCalLink}
                      />
                      <Pressable onPress={handleSaveGoogleCalLink} style={{ marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.accent, borderRadius: 8 }}>
                        <Text style={{ color: Colors.accentText, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Save Google Calendar Link</Text>
                      </Pressable>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            );
          })()}
          {settings.bookingCalendarEnabled && ((settings as any).bookingProvider || 'manual') === 'manual' && (
            <>
              <View style={[styles.sectionHeader, { marginTop: 8 }]}>
                <Text style={[styles.sectionHint, { fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary }]}>Time Slots</Text>
                <Pressable
                  style={styles.addButton}
                  onPress={() => { setAddingSlot(true); setNewSlotText(''); }}
                  hitSlop={8}
                >
                  <Ionicons name="add-circle" size={22} color={Colors.accent} />
                </Pressable>
              </View>
              <Text style={styles.sectionHint}>
                These time slots are offered to customers when they book via SMS.
              </Text>
              <View style={styles.card}>
                {bookingSlots.map((slot: string, idx: number) => (
                  <View key={`slot-${idx}`}>
                    {idx > 0 && <View style={styles.serviceDivider} />}
                    {editingSlotIdx === idx ? (
                      <View style={styles.serviceEditRow}>
                        <View style={styles.serviceNum}>
                          <Text style={styles.serviceNumText}>{idx + 1}</Text>
                        </View>
                        <TextInput
                          style={styles.serviceEditInput}
                          value={editingSlotText}
                          onChangeText={setEditingSlotText}
                          autoFocus
                          onSubmitEditing={handleSaveSlotEdit}
                          placeholder="e.g. 9:00 AM"
                          placeholderTextColor={Colors.textTertiary}
                        />
                        <Pressable onPress={handleSaveSlotEdit} hitSlop={8}>
                          <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                        </Pressable>
                        <Pressable onPress={() => { setEditingSlotIdx(null); setEditingSlotText(''); }} hitSlop={8}>
                          <Ionicons name="close-circle" size={22} color={Colors.textTertiary} />
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.serviceRow}>
                        <View style={styles.serviceNum}>
                          <Text style={styles.serviceNumText}>{idx + 1}</Text>
                        </View>
                        <Pressable style={styles.serviceTextWrap} onPress={() => { setEditingSlotIdx(idx); setEditingSlotText(slot); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                          <Text style={styles.serviceText}>{slot}</Text>
                        </Pressable>
                        <View style={styles.serviceActions}>
                          <Pressable onPress={() => { setEditingSlotIdx(idx); setEditingSlotText(slot); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} hitSlop={6}>
                            <Feather name="edit-2" size={14} color={Colors.textTertiary} />
                          </Pressable>
                          <Pressable onPress={() => handleDeleteSlot(idx)} hitSlop={6}>
                            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                ))}
                {addingSlot && (
                  <>
                    <View style={styles.serviceDivider} />
                    <View style={styles.serviceEditRow}>
                      <View style={[styles.serviceNum, { backgroundColor: Colors.accent + '20' }]}>
                        <Ionicons name="add" size={14} color={Colors.accent} />
                      </View>
                      <TextInput
                        style={styles.serviceEditInput}
                        value={newSlotText}
                        onChangeText={setNewSlotText}
                        autoFocus
                        onSubmitEditing={handleAddSlot}
                        placeholder="e.g. 5:00 PM"
                        placeholderTextColor={Colors.textTertiary}
                      />
                      <Pressable onPress={handleAddSlot} hitSlop={8}>
                        <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                      </Pressable>
                      <Pressable onPress={() => { setAddingSlot(false); setNewSlotText(''); }} hitSlop={8}>
                        <Ionicons name="close-circle" size={22} color={Colors.textTertiary} />
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            </>
          )}
          {settings.bookingCalendarEnabled && ((settings as any).bookingProvider || 'manual') === 'manual' && (
            <>
              <View style={[styles.sectionHeader, { marginTop: 12 }]}>
                <Text style={[styles.sectionHint, { fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary }]}>Available Dates</Text>
                <Pressable
                  style={styles.addButton}
                  onPress={() => { setAddingDate(true); setNewDateText(''); }}
                  hitSlop={8}
                >
                  <Ionicons name="add-circle" size={22} color={Colors.accent} />
                </Pressable>
              </View>
              <Text style={styles.sectionHint}>
                Add specific dates to offer customers. Leave empty to auto-generate the next 7 days.
              </Text>
              <View style={styles.card}>
                {bookingDates.length === 0 && !addingDate ? (
                  <View style={[styles.serviceRow, { paddingVertical: 14 }]}>
                    <Text style={[styles.settingDescription, { flex: 1, textAlign: 'center', fontStyle: 'italic' }]}>
                      Auto-generating next 7 days
                    </Text>
                  </View>
                ) : (
                  bookingDates.map((date: string, idx: number) => (
                    <View key={`date-${idx}`}>
                      {idx > 0 && <View style={styles.serviceDivider} />}
                      {editingDateIdx === idx ? (
                        <View style={styles.serviceEditRow}>
                          <View style={styles.serviceNum}>
                            <Text style={styles.serviceNumText}>{idx + 1}</Text>
                          </View>
                          <TextInput
                            style={styles.serviceEditInput}
                            value={editingDateText}
                            onChangeText={setEditingDateText}
                            autoFocus
                            onSubmitEditing={handleSaveDateEdit}
                            placeholder="e.g. Mon 21 Apr"
                            placeholderTextColor={Colors.textTertiary}
                          />
                          <Pressable onPress={handleSaveDateEdit} hitSlop={8}>
                            <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                          </Pressable>
                          <Pressable onPress={() => { setEditingDateIdx(null); setEditingDateText(''); }} hitSlop={8}>
                            <Ionicons name="close-circle" size={22} color={Colors.textTertiary} />
                          </Pressable>
                        </View>
                      ) : (
                        <View style={styles.serviceRow}>
                          <View style={styles.serviceNum}>
                            <Text style={styles.serviceNumText}>{idx + 1}</Text>
                          </View>
                          <Pressable style={styles.serviceTextWrap} onPress={() => { setEditingDateIdx(idx); setEditingDateText(date); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                            <Text style={styles.serviceText}>{date}</Text>
                          </Pressable>
                          <View style={styles.serviceActions}>
                            <Pressable onPress={() => { setEditingDateIdx(idx); setEditingDateText(date); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} hitSlop={6}>
                              <Feather name="edit-2" size={14} color={Colors.textTertiary} />
                            </Pressable>
                            <Pressable onPress={() => handleDeleteDate(idx)} hitSlop={6}>
                              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                            </Pressable>
                          </View>
                        </View>
                      )}
                    </View>
                  ))
                )}
                {addingDate && (
                  <>
                    {bookingDates.length > 0 && <View style={styles.serviceDivider} />}
                    <View style={styles.serviceEditRow}>
                      <View style={[styles.serviceNum, { backgroundColor: Colors.accent + '20' }]}>
                        <Ionicons name="add" size={14} color={Colors.accent} />
                      </View>
                      <TextInput
                        style={styles.serviceEditInput}
                        value={newDateText}
                        onChangeText={setNewDateText}
                        autoFocus
                        onSubmitEditing={handleAddDate}
                        placeholder="e.g. Thu 24 Apr"
                        placeholderTextColor={Colors.textTertiary}
                      />
                      <Pressable onPress={handleAddDate} hitSlop={8}>
                        <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                      </Pressable>
                      <Pressable onPress={() => { setAddingDate(false); setNewDateText(''); }} hitSlop={8}>
                        <Ionicons name="close-circle" size={22} color={Colors.textTertiary} />
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Call Diversion Setup</Text>
          <View style={styles.card}>
            <View style={styles.webhookIntro}>
              <Ionicons name="call-outline" size={20} color={Colors.primaryLight} />
              <Text style={styles.webhookIntroText}>
                Set up call forwarding on your mobile so unanswered calls go to your Twilio number. This triggers the auto-SMS flow.
              </Text>
            </View>

            <View style={styles.webhookStepsDivider} />

            <Text style={[styles.webhookStepTitle, { marginBottom: 8 }]}>iPhone</Text>
            <View style={styles.diversionStep}>
              <Text style={styles.diversionStepText}>1. Open your Phone app and go to <Text style={styles.diversionBold}>Settings {'>'} Phone {'>'} Call Forwarding</Text></Text>
            </View>
            <View style={styles.diversionStep}>
              <Text style={styles.diversionStepText}>2. Or dial from your phone:</Text>
            </View>
            <View style={styles.diversionCodeBox}>
              <Text style={styles.diversionCode}>**61*{settings.twilioPhoneNumber || '[your Twilio number]'}#</Text>
              <Text style={styles.diversionCodeLabel}>Forward when unanswered</Text>
            </View>
            <View style={styles.diversionCodeBox}>
              <Text style={styles.diversionCode}>**62*{settings.twilioPhoneNumber || '[your Twilio number]'}#</Text>
              <Text style={styles.diversionCodeLabel}>Forward when unreachable</Text>
            </View>
            <View style={styles.diversionCodeBox}>
              <Text style={styles.diversionCode}>**67*{settings.twilioPhoneNumber || '[your Twilio number]'}#</Text>
              <Text style={styles.diversionCodeLabel}>Forward when busy</Text>
            </View>

            <View style={styles.webhookStepsDivider} />

            <Text style={[styles.webhookStepTitle, { marginBottom: 8 }]}>Android</Text>
            <View style={styles.diversionStep}>
              <Text style={styles.diversionStepText}>1. Open the <Text style={styles.diversionBold}>Phone app {'>'} Settings {'>'} Calls {'>'} Call forwarding</Text></Text>
            </View>
            <View style={styles.diversionStep}>
              <Text style={styles.diversionStepText}>2. Set "Forward when unanswered", "Forward when busy", and "Forward when unreachable" to your Twilio number:</Text>
            </View>
            <View style={styles.diversionCodeBox}>
              <Text style={styles.diversionCode}>{settings.twilioPhoneNumber || '[your Twilio number]'}</Text>
            </View>

            <View style={styles.webhookStepsDivider} />

            <View style={styles.webhookNote}>
              <Ionicons name="bulb-outline" size={16} color={Colors.warning} />
              <Text style={styles.webhookNoteText}>
                To undo call diversion, dial ##61#, ##62#, ##67# on iPhone, or turn off forwarding in Android settings. Codes may vary by carrier.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: '#E8F0FE' }]}>
                  <Ionicons name="person-outline" size={18} color={Colors.primary} />
                </View>
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>{user?.username || 'User'}</Text>
                  <Text style={styles.settingDescription}>{user?.email || ''}</Text>
                </View>
              </View>
            </View>
            {isAdmin && (
              <>
                <View style={styles.aboutDivider} />
                <Pressable
                  style={styles.logoutRow}
                  onPress={() => router.push('/admin-create-tradie')}
                  testID="admin-create-tradie-btn"
                >
                  <Ionicons name="person-add-outline" size={20} color={Colors.accent} />
                  <Text style={[styles.logoutText, { color: Colors.accent }]}>Create Tradie Account</Text>
                </Pressable>
              </>
            )}
            <View style={styles.aboutDivider} />
            <Pressable
              style={styles.logoutRow}
              onPress={() => {
                confirmAction(
                  'Sign Out',
                  'Are you sure you want to sign out?',
                  'Sign Out',
                  async () => { await logout(); },
                );
              }}
              testID="logout-btn"
            >
              <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
              <Text style={styles.logoutText}>Sign Out</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>CallCatch</Text>
              <Text style={styles.aboutValue}>v1.0.0</Text>
            </View>
            <View style={styles.aboutDivider} />
            <Text style={styles.aboutDescription}>
              Never lose a customer from a missed call. Auto-reply with SMS and book jobs on the spot.
            </Text>
            <View style={styles.aboutDivider} />
            <Pressable style={styles.privacyRow} onPress={() => router.push('/terms-of-service')}>
              <Ionicons name="document-text-outline" size={16} color={Colors.primaryLight} />
              <Text style={styles.privacyLink}>Terms of Service</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
            </Pressable>
            <Pressable style={styles.privacyRow} onPress={() => router.push('/privacy-policy')}>
              <Ionicons name="shield-checkmark-outline" size={16} color={Colors.primaryLight} />
              <Text style={styles.privacyLink}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showTwilioModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTwilioModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowTwilioModal(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalWrapper}
        >
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Twilio Details</Text>
              <Pressable onPress={() => setShowTwilioModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              Find these in your Twilio Console at twilio.com/console
            </Text>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Account SID</Text>
              <TextInput
                style={styles.modalInput}
                value={twilioSid}
                onChangeText={setTwilioSid}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Auth Token</Text>
              <TextInput
                style={styles.modalInput}
                value={twilioToken}
                onChangeText={setTwilioToken}
                placeholder="Your Twilio Auth Token"
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Phone Number</Text>
              <TextInput
                style={styles.modalInput}
                value={twilioPhone}
                onChangeText={setTwilioPhone}
                placeholder="+61400000000"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="phone-pad"
                autoCorrect={false}
              />
            </View>

            <Pressable
              style={[styles.modalSaveBtn, twilioSaving && { opacity: 0.6 }]}
              onPress={handleSaveTwilio}
              disabled={twilioSaving}
            >
              {twilioSaving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.modalSaveBtnText}>Save</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  scrollContent: {
    padding: 16,
    gap: 8,
  },
  section: {
    gap: 8,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingLeft: 4,
  },
  sectionHint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
    paddingLeft: 4,
    lineHeight: 18,
  },
  addButton: {
    padding: 2,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: {
    flex: 1,
    gap: 2,
  },
  settingLabel: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  settingValue: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  settingDescription: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  editInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent,
    paddingVertical: 4,
  },
  flowStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flowStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowStepNumberText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: Colors.accentText,
  },
  flowStepContent: {
    flex: 1,
    gap: 1,
  },
  flowStepTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  flowStepDesc: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  flowDivider: {
    width: 2,
    height: 16,
    backgroundColor: Colors.borderLight,
    marginLeft: 13,
    marginVertical: 2,
  },
  modeOption: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    backgroundColor: Colors.background,
  },
  modeOptionActive: {
    borderColor: Colors.accent,
    backgroundColor: '#FFF6EE',
  },
  modeOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  modeOptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
  },
  modeOptionDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  serviceEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  serviceNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceNumText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  serviceTextWrap: {
    flex: 1,
  },
  serviceText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
  },
  serviceEditInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent,
    paddingVertical: 4,
  },
  serviceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serviceDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 4,
  },
  webhookIntro: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  webhookIntroText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  webhookStepsDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 14,
  },
  webhookStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  webhookStepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  webhookStepNumText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: Colors.white,
  },
  webhookStepContent: {
    flex: 1,
    gap: 2,
  },
  webhookStepTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  webhookStepDesc: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  webhookStepConnector: {
    width: 2,
    height: 12,
    backgroundColor: Colors.borderLight,
    marginLeft: 11,
    marginVertical: 3,
  },
  webhookUrlLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
    marginBottom: 6,
  },
  webhookUrlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  webhookUrlText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.accent,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  copyButtonText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.accent,
  },
  webhookNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 12,
    backgroundColor: '#FFF8E8',
    padding: 10,
    borderRadius: 8,
  },
  webhookNoteText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  upgradeBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  upgradeBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.white,
  },
  diversionStep: {
    paddingLeft: 4,
    marginBottom: 6,
  },
  diversionStepText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  diversionBold: {
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  diversionCodeBox: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    marginLeft: 4,
  },
  diversionCode: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.accent,
    letterSpacing: 0.3,
  },
  diversionCodeLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
    marginTop: 3,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aboutLabel: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  aboutValue: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
  },
  aboutDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 12,
  },
  aboutDescription: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  privacyLink: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: Colors.primaryLight,
    flex: 1,
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  logoutText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.danger,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 4,
  },
  savedBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.success,
  },
  recordingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recordingStatusText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    flex: 1,
  },
  recordingTimer: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
    color: Colors.danger,
    textAlign: 'center',
    marginVertical: 8,
    letterSpacing: 2,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 14,
  },
  recordButtonActive: {
    backgroundColor: Colors.danger,
  },
  recordButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.white,
  },
  recordingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  recordingPlayBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 10,
  },
  recordingPlayBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.accent,
  },
  recordingSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 10,
  },
  recordingSaveBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.white,
  },
  recordingDiscardBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 4,
  },
  twilioDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  twilioDetailsBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.accent,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  modalField: {
    marginBottom: 14,
  },
  modalLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
  },
  modalSaveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  modalSaveBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.white,
  },
});
