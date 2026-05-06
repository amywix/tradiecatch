import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, Platform, Alert, RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Calendar from 'expo-calendar';
import Colors from '@/constants/colors';
import { useData, Job } from '@/lib/data-context';
import { useAuth } from '@/lib/auth-context';
import { formatDate, getInitials, getAvatarColor, confirmAction } from '@/lib/helpers';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: Colors.warning, bg: '#FFF8E0' },
  confirmed: { label: 'Confirmed', color: Colors.success, bg: '#E8F8ED' },
  completed: { label: 'Completed', color: Colors.primaryLight, bg: '#E8EEF8' },
  cancelled: { label: 'Cancelled', color: Colors.textTertiary, bg: Colors.surfaceSecondary },
};

async function getDefaultCalendarId(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const defaultCal = calendars.find(
    (c) => c.allowsModifications && (c.isPrimary || c.source?.isLocalAccount)
  );
  return (defaultCal || calendars.find((c) => c.allowsModifications))?.id || null;
}

function parseJobDateTime(job: Job): { start: Date; end: Date } {
  const now = new Date();
  let startDate = now;

  if (job.date) {
    const parsed = new Date(job.date);
    if (!isNaN(parsed.getTime())) startDate = parsed;
  }

  if (job.time) {
    const timeLower = job.time.toLowerCase().trim();
    const match = timeLower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const ampm = match[3];
      if (ampm) {
        if (ampm.toLowerCase() === 'pm' && hours < 12) hours += 12;
        if (ampm.toLowerCase() === 'am' && hours === 12) hours = 0;
      }
      startDate.setHours(hours, minutes, 0, 0);
    } else if (/morning/i.test(timeLower)) {
      startDate.setHours(9, 0, 0, 0);
    } else if (/afternoon/i.test(timeLower)) {
      startDate.setHours(14, 0, 0, 0);
    } else if (/evening/i.test(timeLower)) {
      startDate.setHours(18, 0, 0, 0);
    }
  }

  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  return { start: startDate, end: endDate };
}

async function addJobToCalendar(job: Job) {
  const title = `${job.jobType} - ${job.callerName}`;
  const { start, end } = parseJobDateTime(job);
  const notes = [
    job.callerName ? `Customer: ${job.callerName}` : '',
    job.phoneNumber ? `Phone: ${job.phoneNumber}` : '',
    job.email ? `Email: ${job.email}` : '',
    job.isUrgent ? 'URGENT' : '',
    job.notes || '',
  ].filter(Boolean).join('\n');

  if (Platform.OS === 'web') {
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(notes)}&location=${encodeURIComponent(job.address || '')}`;
    Linking.openURL(url);
    return;
  }

  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission Needed', 'Calendar access is needed to add job events. Please enable it in your phone settings.');
    return;
  }

  const calendarId = await getDefaultCalendarId();
  if (!calendarId) {
    Alert.alert('No Calendar', 'Could not find a writable calendar on your device.');
    return;
  }

  await Calendar.createEventAsync(calendarId, {
    title,
    startDate: start,
    endDate: end,
    location: job.address || undefined,
    notes,
    alarms: [{ relativeOffset: -30 }],
  });

  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  Alert.alert('Added to Calendar', `"${title}" has been added to your calendar.`);
}

function JobItem({ item, onStatusChange, onDelete }: {
  item: Job;
  onStatusChange: (job: Job) => void;
  onDelete: (id: string) => void;
}) {
  const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;

  return (
    <View style={styles.jobCard}>
      <View style={styles.jobRow}>
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.callerName) }]}>
          <Text style={styles.avatarText}>{getInitials(item.callerName)}</Text>
        </View>
        <View style={styles.jobInfo}>
          <View style={styles.jobHeader}>
            <Text style={styles.jobName} numberOfLines={1}>{item.callerName}</Text>
            <Pressable
              onPress={() => onStatusChange(item)}
              style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}
            >
              <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
              <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
            </Pressable>
          </View>

          <View style={styles.jobDetail}>
            <Ionicons name="construct-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.jobDetailText}>{item.jobType}</Text>
          </View>

          {item.date && (
            <View style={styles.jobDetail}>
              <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.jobDetailText}>
                {formatDate(item.date)}{item.time ? ` - ${item.time}` : ''}
              </Text>
            </View>
          )}

          {!!item.address && (
            <View style={styles.jobDetail}>
              <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.jobDetailText} numberOfLines={1}>{item.address}</Text>
            </View>
          )}

          {!!item.email && (
            <View style={styles.jobDetail}>
              <Ionicons name="mail-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.jobDetailText} numberOfLines={1}>{item.email}</Text>
            </View>
          )}

          {!!item.notes && (
            <Text style={styles.jobNotes} numberOfLines={2}>{item.notes}</Text>
          )}

          {item.isUrgent && (
            <View style={styles.urgentBadge}>
              <Ionicons name="warning" size={12} color={Colors.danger} />
              <Text style={styles.urgentText}>URGENT</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.jobActions}>
        <View style={styles.jobActionsLeft}>
          <Pressable
            style={styles.jobActionBtn}
            onPress={() => onStatusChange(item)}
            hitSlop={8}
          >
            <Ionicons name="swap-horizontal-outline" size={16} color={Colors.primaryLight} />
            <Text style={styles.jobActionText}>Status</Text>
          </Pressable>
          <Pressable
            style={styles.calendarBtn}
            onPress={() => addJobToCalendar(item)}
            hitSlop={8}
          >
            <Ionicons name="calendar-outline" size={16} color={Colors.accent} />
            <Text style={styles.calendarBtnText}>Calendar</Text>
          </Pressable>
        </View>
        <Pressable
          style={styles.deleteBtn}
          onPress={() => onDelete(item.id)}
          hitSlop={8}
        >
          <Feather name="trash-2" size={16} color={Colors.textTertiary} />
        </Pressable>
      </View>
    </View>
  );
}

export default function JobsScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const signOut = useCallback(() => {
    confirmAction(
      'Sign Out',
      'Are you sure you want to sign out?',
      'Sign Out',
      async () => { await logout(); },
    );
  }, [logout]);
  const { jobs, updateExistingJob, removeJob, refreshAll, isLoading } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed'>('all');

  const filteredJobs = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  const [statusPickerJob, setStatusPickerJob] = useState<Job | null>(null);

  const handleStatusChange = useCallback((job: Job) => {
    if (Platform.OS === 'web') {
      setStatusPickerJob(job);
      return;
    }
    const statuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    const labels = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];

    Alert.alert('Update Status', `Current: ${STATUS_CONFIG[job.status]?.label || job.status}`, [
      ...labels.map((label, i) => ({
        text: label,
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          await updateExistingJob(job.id, { status: statuses[i] });
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [updateExistingJob]);

  const handleWebStatusSelect = useCallback(async (status: string) => {
    if (!statusPickerJob) return;
    await updateExistingJob(statusPickerJob.id, { status });
    setStatusPickerJob(null);
  }, [statusPickerJob, updateExistingJob]);

  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);

  const handleDelete = useCallback((id: string) => {
    if (Platform.OS === 'web') {
      setDeleteJobId(id);
      return;
    }
    Alert.alert('Delete Job', 'Remove this job?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await removeJob(id);
        },
      },
    ]);
  }, [removeJob]);

  const handleWebDeleteConfirm = useCallback(async () => {
    if (!deleteJobId) return;
    await removeJob(deleteJobId);
    setDeleteJobId(null);
  }, [deleteJobId, removeJob]);

  const renderItem = useCallback(({ item }: { item: Job }) => (
    <JobItem
      item={item}
      onStatusChange={handleStatusChange}
      onDelete={handleDelete}
    />
  ), [handleStatusChange, handleDelete]);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  const filters: Array<{ key: typeof filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'completed', label: 'Done' },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: (Platform.OS === 'web' ? webTopInset : insets.top) + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Jobs</Text>
          <Text style={styles.headerSubtitle}>{jobs.length} total</Text>
        </View>
        <Pressable onPress={signOut} style={styles.signOutBtn} hitSlop={8} testID="signout-btn">
          <Feather name="log-out" size={20} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {filters.map(f => (
          <Pressable
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setFilter(f.key);
            }}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredJobs}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: (Platform.OS === 'web' ? webBottomInset : 0) + 100 },
        ]}
        scrollEnabled={!!filteredJobs.length}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBadge}>
                <Ionicons name="construct-outline" size={36} color={Colors.accent} />
              </View>
              <Text style={styles.emptyTitle}>No jobs yet</Text>
              <Text style={styles.emptyText}>Jobs booked from SMS conversations will appear here automatically</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={Colors.accent} />
            </View>
          )
        }
      />

      {deleteJobId && (
        <Pressable style={styles.modalOverlay} onPress={() => setDeleteJobId(null)}>
          <Pressable style={styles.statusModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.statusModalTitle}>Delete Job</Text>
            <Text style={styles.statusModalSub}>This will permanently remove the job. This cannot be undone.</Text>
            <Pressable
              style={[styles.statusOption, { backgroundColor: '#FFF0F0' }]}
              onPress={handleWebDeleteConfirm}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.danger} />
              <Text style={[styles.statusOptionText, { color: Colors.danger }]}>Delete Job</Text>
            </Pressable>
            <Pressable style={styles.statusCancelBtn} onPress={() => setDeleteJobId(null)}>
              <Text style={styles.statusCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

      {statusPickerJob && (
        <Pressable style={styles.modalOverlay} onPress={() => setStatusPickerJob(null)}>
          <Pressable style={styles.statusModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.statusModalTitle}>Update Status</Text>
            <Text style={styles.statusModalSub}>{statusPickerJob.callerName} - {statusPickerJob.jobType}</Text>
            {(['pending', 'confirmed', 'completed', 'cancelled'] as const).map((status) => {
              const config = STATUS_CONFIG[status];
              const isActive = statusPickerJob.status === status;
              return (
                <Pressable
                  key={status}
                  style={[styles.statusOption, isActive && styles.statusOptionActive]}
                  onPress={() => handleWebStatusSelect(status)}
                >
                  <View style={[styles.statusDot, { backgroundColor: config.color }]} />
                  <Text style={[styles.statusOptionText, isActive && { fontWeight: '700' }]}>{config.label}</Text>
                  {isActive && <Ionicons name="checkmark" size={18} color={config.color} />}
                </Pressable>
              );
            })}
            <Pressable style={styles.statusCancelBtn} onPress={() => setStatusPickerJob(null)}>
              <Text style={styles.statusCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  signOutBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  filterBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.surfaceSecondary,
  },
  filterBtnActive: {
    backgroundColor: Colors.accent,
  },
  filterText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: Colors.white,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  jobCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  jobRow: {
    flexDirection: 'row',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: Colors.white,
  },
  jobInfo: {
    flex: 1,
    gap: 6,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  jobName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  jobDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  jobDetailText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    flex: 1,
  },
  jobNotes: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    backgroundColor: '#FFEEEE',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  urgentText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: Colors.danger,
  },
  jobActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  jobActionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jobActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSecondary,
  },
  jobActionText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.primaryLight,
  },
  calendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFF3E0',
  },
  calendarBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.accent,
  },
  deleteBtn: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: 14,
  },
  emptyIconBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  statusModal: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 340,
  },
  statusModalTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
    marginBottom: 4,
  },
  statusModalSub: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  statusOptionActive: {
    backgroundColor: Colors.surfaceSecondary,
  },
  statusOptionText: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    color: Colors.text,
    flex: 1,
  },
  statusCancelBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statusCancelText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
});
