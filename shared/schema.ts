import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  pushToken: text("push_token"),
  mustChangePassword: boolean("must_change_password").default(true).notNull(),
  acceptedTermsAt: timestamp("accepted_terms_at"),
  acceptedTermsVersion: text("accepted_terms_version"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const TERMS_VERSION = "2026-05-01";

export const missedCalls = pgTable("missed_calls", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  callerName: text("caller_name").notNull().default("Unknown Caller"),
  phoneNumber: text("phone_number").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  replied: boolean("replied").default(false).notNull(),
  repliedAt: timestamp("replied_at"),
  jobBooked: boolean("job_booked").default(false).notNull(),
  conversationState: text("conversation_state").default("none").notNull(),
  selectedService: text("selected_service"),
  selectedSubOption: text("selected_sub_option"),
  selectedTime: text("selected_time"),
  jobAddress: text("job_address"),
  isUrgent: boolean("is_urgent").default(false),
  callerEmail: text("caller_email"),
  conversationLog: jsonb("conversation_log").$type<Array<{role: string; message: string; timestamp: string}>>().default([]),
  voicemailData: text("voicemail_data"),
  voicemailMimeType: text("voicemail_mime_type"),
  voicemailDurationSeconds: text("voicemail_duration_seconds"),
  recordingSid: text("recording_sid"),
});

export const jobs = pgTable("jobs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  callerName: text("caller_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  jobType: text("job_type").notNull(),
  date: text("date"),
  time: text("time"),
  address: text("address"),
  notes: text("notes"),
  email: text("email"),
  status: text("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  missedCallId: varchar("missed_call_id"),
  isUrgent: boolean("is_urgent").default(false),
});

export const DEFAULT_SERVICES = [
  "Power point install / repair",
  "Ceiling fan install",
  "Snap Chat Call",
  "Switchboard issue",
  "Power outage / urgent fault",
  "Smoke alarm install",
  "Other",
];

// Services that bypass the address/booking flow and instead send a Stripe
// payment link. After payment, the operator follows up out-of-band (e.g. via
// Snapchat). The matcher receives the lower-cased service name; first
// matching entry wins.
export const PAID_SERVICES: Array<{
  match: (serviceLower: string) => boolean;
  paymentLink: string;
  followUpNote: string;
}> = [
  {
    match: (s) => s.includes("snapchat") || s.includes("snap chat"),
    paymentLink: "https://buy.stripe.com/fZu6oHbhrgJZcRv9CPa7C04",
    followUpNote: "Once payment lands I'll call you on Snapchat.",
  },
];

export const DEFAULT_CONVERSATION_MESSAGES: Record<string, string> = {
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

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  businessName: text("business_name").default("").notNull(),
  autoReplyEnabled: boolean("auto_reply_enabled").default(true).notNull(),
  onboardingComplete: boolean("onboarding_complete").default(false).notNull(),
  twilioAccountSid: text("twilio_account_sid").default(""),
  twilioAuthToken: text("twilio_auth_token").default(""),
  twilioPhoneNumber: text("twilio_phone_number").default(""),
  missedCallVoiceMessage: text("missed_call_voice_message").default("Sorry we missed your call. We will SMS you now to follow up."),
  voiceRecordingData: text("voice_recording_data"),
  voiceRecordingMimeType: text("voice_recording_mime_type"),
  services: jsonb("services").$type<string[]>().default(DEFAULT_SERVICES),
  bookingCalendarEnabled: boolean("booking_calendar_enabled").default(false).notNull(),
  bookingSlots: jsonb("booking_slots").$type<string[]>().default([
    "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
    "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"
  ]),
  bookingDates: jsonb("booking_dates").$type<string[]>().default([]),
  bookingProvider: text("booking_provider").default("manual").notNull(),
  calendlyLink: text("calendly_link").default(""),
  googleCalendarLink: text("google_calendar_link").default(""),
  tradieMobileNumber: text("tradie_mobile_number").default(""),
  forwardingMode: text("forwarding_mode").default("carrier_forward").notNull(),
  voicemailEnabled: boolean("voicemail_enabled").default(true).notNull(),
  conversationMessages: jsonb("conversation_messages").$type<Record<string, string>>().default({}),
  baseAddress: text("base_address").default("").notNull(),
  baseLat: doublePrecision("base_lat"),
  baseLng: doublePrecision("base_lng"),
  serviceRadiusKm: integer("service_radius_km").default(30).notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type MissedCall = typeof missedCalls.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Settings = typeof settings.$inferSelect;
