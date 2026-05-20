import twilio from "twilio";
import { db } from "./db";
import { missedCalls, jobs, settings, DEFAULT_SERVICES, DEFAULT_CONVERSATION_MESSAGES } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { sendPushToUser } from "./push";

// Update this URL to point to your actual demo video
const DEMO_VIDEO_URL = "https://canva.link/v768gnwipa4gcig";

// Calendly booking link for the 10-minute setup call
const CALENDLY_BOOKING_URL = "https://calendly.com/amywickham-dgbh/video-session-1hr-apple-devices";

// Time slots offered for the 10-minute setup call (legacy fallback)
const DEMO_CALL_TIMES = ["9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"];

/** Load the tradie's custom conversation messages, falling back to defaults for any missing key */
async function getConversationMessages(userId: string): Promise<Record<string, string>> {
  const s = await getSettingsForUser(userId);
  const stored = ((s as any)?.conversationMessages as Record<string, string>) || {};
  return { ...DEFAULT_CONVERSATION_MESSAGES, ...stored };
}

/** Replace {variable} placeholders in a template string */
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : `{${key}}`));
}

async function getSettingsForUser(userId: string) {
  const rows = await db.select().from(settings).where(eq(settings.userId, userId));
  return rows[0];
}

async function getServices(userId: string): Promise<string[]> {
  const s = await getSettingsForUser(userId);
  return (s?.services as string[]) || DEFAULT_SERVICES;
}

type BookingProvider = "manual" | "calendly" | "google";

async function getBookingConfig(userId: string): Promise<{
  enabled: boolean;
  provider: BookingProvider;
  externalLink: string;
  slots: string[];
  dates: string[];
}> {
  const s = await getSettingsForUser(userId);
  const rawProvider = ((s as any)?.bookingProvider as string) || "manual";
  const provider: BookingProvider = (rawProvider === "calendly" || rawProvider === "google") ? rawProvider : "manual";
  const calendlyLink = ((s as any)?.calendlyLink as string) || "";
  const googleCalendarLink = ((s as any)?.googleCalendarLink as string) || "";
  let externalLink = "";
  if (provider === "calendly" && calendlyLink.trim()) externalLink = calendlyLink.trim();
  else if (provider === "google" && googleCalendarLink.trim()) externalLink = googleCalendarLink.trim();
  return {
    enabled: s?.bookingCalendarEnabled ?? false,
    provider,
    externalLink,
    slots: (s?.bookingSlots as string[]) || ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"],
    dates: (s?.bookingDates as string[]) || [],
  };
}

function resolveBookingDates(customDates: string[]): { label: string; dateStr: string }[] {
  if (customDates.length > 0) {
    return customDates.map(label => ({ label, dateStr: "" }));
  }
  return getNextAvailableDates(7);
}

function getNextAvailableDates(count: number = 7): { label: string; dateStr: string }[] {
  const dates: { label: string; dateStr: string }[] = [];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  let d = new Date(now);
  d.setDate(d.getDate() + 1);
  while (dates.length < count) {
    dates.push({
      label: `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`,
      dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    });
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function buildServicesMap(servicesList: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  servicesList.forEach((s, i) => {
    map[String(i + 1)] = s;
  });
  return map;
}

function buildServicesMenuText(servicesList: string[]): string {
  return servicesList.map((s, i) => {
    const label = s.toLowerCase() === "other" ? `${i + 1}. Other (type your issue)` : `${i + 1}. ${s}`;
    return label;
  }).join("\n");
}

async function getTwilioConfig(userId: string) {
  const s = await getSettingsForUser(userId);
  const sid = s?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || "";
  const token = s?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN || "";
  const phone = normalizePhone(s?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || "");
  return { sid, token, phone, businessName: s?.businessName || "" };
}

function addLogEntry(log: Array<{role: string; message: string; timestamp: string}>, role: string, message: string) {
  log.push({ role, message, timestamp: new Date().toISOString() });
  return log;
}

export async function sendSms(to: string, body: string, userId: string): Promise<void> {
  const { sid, token, phone } = await getTwilioConfig(userId);
  if (!sid || !token || !phone) {
    throw new Error("Twilio credentials not configured. Please set them up in Settings.");
  }
  const client = twilio(sid, token);
  const toNormalized = normalizePhone(to);
  try {
    await client.messages.create({
      body,
      from: phone,
      to: toNormalized,
    });
    console.log(`SMS sent to ${to}: ${body.substring(0, 50)}...`);
  } catch (err) {
    console.error("Failed to send SMS:", err);
    throw err;
  }
}

export async function sendInitialMissedCallSms(
  callId: string,
  userId: string,
  source: 'missed_call' | 'demo' = 'missed_call'
): Promise<void> {
  const rows = await db.select().from(missedCalls).where(eq(missedCalls.id, callId));
  const call = rows[0];
  if (!call) throw new Error("Call not found");

  const { businessName } = await getTwilioConfig(userId);
  const msgs = await getConversationMessages(userId);
  const businessLine = businessName ? `\nThis is ${businessName}.` : "";

  const templateKey = source === 'demo' ? 'greeting_demo' : 'greeting_missed_call';
  const message = fillTemplate(msgs[templateKey], { businessLine, businessName });

  await sendSms(call.phoneNumber, message, userId);

  let log = (call.conversationLog || []) as Array<{role: string; message: string; timestamp: string}>;
  addLogEntry(log, "business", message);

  await db.update(missedCalls).set({
    replied: true,
    repliedAt: new Date(),
    conversationState: "awaiting_name",
    conversationLog: log,
  }).where(eq(missedCalls.id, callId));
}

async function findUsersByTwilioNumber(toPhone: string): Promise<string[]> {
  const allSettings = await db.select().from(settings);
  const userIds: string[] = [];
  for (const s of allSettings) {
    const twilioNum = s.twilioPhoneNumber || "";
    if (twilioNum && phonesMatch(twilioNum, toPhone)) {
      userIds.push(s.userId);
    }
  }
  return userIds;
}

async function handleDemoTrigger(fromPhone: string, userId: string): Promise<string> {
  const { businessName } = await getTwilioConfig(userId);
  const bizLine = businessName ? `from ${businessName}` : "";

  const message = `Thanks for your interest! 🙌\n\nThis is the same kind of experience your customers will have when they miss a call from you.\n\n🎬 Watch the quick demo: ${DEMO_VIDEO_URL}\n\nThen reply YES if you'd like to book a 10-minute call to answer any questions and get you set up.`;

  await sendSms(fromPhone, message, userId);

  const log = [{ role: "business", message, timestamp: new Date().toISOString() }];

  await db.insert(missedCalls).values({
    userId,
    callerName: "Demo Lead",
    phoneNumber: normalizePhone(fromPhone),
    replied: true,
    repliedAt: new Date(),
    conversationState: "demo_offer_sent",
    conversationLog: log as any,
    selectedService: "TradieCatch Setup",
  });

  return message;
}

export async function handleIncomingReply(fromPhone: string, body: string, toPhone: string): Promise<string | null> {
  const normalizedPhone = normalizePhone(fromPhone);

  // Find all users whose Twilio number matches the destination phone
  let userIds: string[] = [];
  if (toPhone) {
    userIds = await findUsersByTwilioNumber(toPhone);
  }

  let rows: any[] = [];

  if (userIds.length > 0) {
    // Search for active conversations across ALL matching users
    for (const uid of userIds) {
      const userRows = await db.select().from(missedCalls)
        .where(and(eq(missedCalls.userId, uid), eq(missedCalls.phoneNumber, normalizedPhone)))
        .orderBy(desc(missedCalls.timestamp));
      rows = rows.concat(userRows);
    }

    // Fallback: phone number normalisation difference — try broader match
    if (rows.length === 0) {
      for (const uid of userIds) {
        const allCalls = await db.select().from(missedCalls).where(eq(missedCalls.userId, uid));
        const matched = allCalls.filter(c => phonesMatch(c.phoneNumber, normalizedPhone));
        rows = rows.concat(matched);
      }
    }
  }

  // Last resort: search all calls by phone number regardless of user
  if (rows.length === 0) {
    const allCalls = await db.select().from(missedCalls);
    rows = allCalls.filter(c => phonesMatch(c.phoneNumber, normalizedPhone));
  }

  // Sort by timestamp descending
  rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const TERMINAL_STATES = new Set(["none", "completed", "demo_completed"]);
  const activeCalls = rows.filter(c => !TERMINAL_STATES.has(c.conversationState));
  let call = activeCalls.length > 0 ? activeCalls[0] : null;

  if (!call) {
    const allByPhone = rows.filter(c => c.replied);
    if (allByPhone.length > 0) {
      call = allByPhone[0];
    }
  }

  if (!call) {
    console.log(`No matching call found for phone: "${fromPhone}" (normalized: "${normalizedPhone}")`);
    return null;
  }

  const callUserId = call.userId;

  const reply = body.trim();
  let log = (call.conversationLog || []) as Array<{role: string; message: string; timestamp: string}>;
  addLogEntry(log, "customer", reply);

  const state = call.conversationState;
  let response = "";
  let newState = state;
  let updates: Record<string, any> = {};

  const servicesList = await getServices(callUserId);
  const SERVICES = buildServicesMap(servicesList);
  const maxChoice = servicesList.length;
  const choiceRegex = new RegExp(`[^1-${maxChoice}]`, "g");
  const msgs = await getConversationMessages(callUserId);

  switch (state) {
    case "awaiting_name": {
      updates.callerName = reply;
      const menuText = buildServicesMenuText(servicesList);
      response = fillTemplate(msgs.service_intro, { name: reply, menu: menuText });
      newState = "awaiting_service";
      break;
    }

    case "awaiting_service": {
      const choice = reply.replace(choiceRegex, "");
      if (choice && SERVICES[choice]) {
        const service = SERVICES[choice];
        updates.selectedService = service;
        const serviceLower = service.toLowerCase();

        if (serviceLower.includes("urgent") || serviceLower.includes("emergency") || serviceLower.includes("power outage")) {
          response = `Thanks for letting us know.\nIs this an emergency right now?\n\nReply YES if urgent or NO if it can wait.\n\nIf urgent, we'll prioritise your job immediately.`;
          newState = "awaiting_urgency";
        } else if (serviceLower === "other") {
          response = `No worries! Please type a brief description of what you need help with and we'll get back to you.`;
          newState = "awaiting_other_description";
        } else {
          response = fillTemplate(msgs.address_request, { service });
          newState = "awaiting_address";
        }
      } else {
        const menuText = buildServicesMenuText(servicesList);
        response = `Sorry, I didn't catch that. Please reply with a number from 1-${maxChoice}:\n\n${menuText}`;
        newState = "awaiting_service";
      }
      break;
    }

    case "awaiting_sub_option": {
      const option = reply.toUpperCase().replace(/[^AB]/g, "");
      if (option === "A" || option === "B") {
        const subDesc = option === "A" ? "New install (no existing fan)" : "Replacement of old fan";
        updates.selectedSubOption = subDesc;
        response = fillTemplate(msgs.address_request, { service: subDesc });
        newState = "awaiting_address";
      } else {
        response = `Please reply A or B:\n\nA) New install (no existing fan)\nB) Replacement of old fan`;
        newState = "awaiting_sub_option";
      }
      break;
    }

    case "awaiting_urgency": {
      const upper = reply.toUpperCase();
      if (upper.includes("YES") || upper.includes("URGENT") || upper.includes("ASAP")) {
        updates.isUrgent = true;
        response = `We're treating this as urgent. Our team will call you ASAP.\n\nWhat's the address so we can head your way?`;
        newState = "awaiting_address";
      } else if (upper.includes("NO") || upper.includes("WAIT") || upper.includes("LATER")) {
        updates.isUrgent = false;
        response = fillTemplate(msgs.address_request, { service: call.selectedService || "your job" });
        newState = "awaiting_address";
      } else {
        response = `Please reply YES if this is urgent, or NO if it can wait.`;
        newState = "awaiting_urgency";
      }
      break;
    }

    case "awaiting_other_description": {
      updates.selectedService = `Other: ${reply}`;
      response = fillTemplate(msgs.address_request, { service: `Other: ${reply}` });
      newState = "awaiting_address";
      break;
    }

    case "awaiting_address": {
      updates.jobAddress = reply;

      // Service-area check: if the tradie has set a base location + radius,
      // geocode the customer's address and decide whether to keep auto-booking.
      try {
        const { checkServiceArea } = await import("./geo");
        const area = await checkServiceArea(callUserId, reply);
        if (area.configured && area.geocoded && !area.within) {
          const { businessName } = await getTwilioConfig(callUserId);
          const distanceLabel = area.distanceKm != null ? ` (about ${Math.round(area.distanceKm)}km away)` : "";
          response =
            `Thanks for the address${distanceLabel}. That's outside our usual service area, ` +
            `so we can't auto-book this one. We've passed your details to the electrician — ` +
            `they'll review and get back to you directly.\n\n- ${businessName || "The team"}`;
          newState = "completed";
          updates.jobBooked = false;
          updates.selectedTime = "Out of service area — manual review";

          try {
            const callerLabel = call.callerName || updates.callerName || "New enquiry";
            const service = call.selectedService || updates.selectedService || "Job";
            sendPushToUser(
              callUserId,
              "⚠️ Out-of-area enquiry",
              `${callerLabel} — ${service} at ${reply} (${area.distanceKm != null ? Math.round(area.distanceKm) + "km" : "unknown distance"}, radius ${area.radiusKm}km). Needs manual review.`,
              { type: "out_of_area", missedCallId: call.id }
            );
          } catch (notifErr) {
            console.error("Out-of-area push notify failed:", notifErr);
          }

          break;
        }
      } catch (err) {
        console.error("Service-area check failed (continuing booking flow):", err);
      }

      response = fillTemplate(msgs.email_request, {});
      newState = "awaiting_email";
      break;
    }

    case "awaiting_email": {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(reply)) {
        updates.callerEmail = reply.toLowerCase();
        const booking = await getBookingConfig(callUserId);
        if (booking.enabled && booking.externalLink) {
          const { businessName } = await getTwilioConfig(callUserId);
          const providerName = booking.provider === "calendly" ? "Calendly" : "Google Calendar";
          const urgentNote = (call.isUrgent || updates.isUrgent) ? "\n\nMarked as urgent — we'll prioritise this." : "";
          response = fillTemplate(msgs.booked_link, { link: booking.externalLink, urgentNote, businessName });
          newState = "completed";
          updates.selectedTime = `Booking link sent (${providerName})`;
          updates.jobBooked = false;
        } else if (booking.enabled) {
          const dates = resolveBookingDates(booking.dates);
          const dateMenu = dates.map((d, i) => `${i + 1}. ${d.label}`).join("\n");
          response = `Thanks! What day works best for you?\n\n${dateMenu}`;
          newState = "awaiting_booking_date";
        } else {
          response = fillTemplate(msgs.time_preference, {});
          newState = "awaiting_time";
        }
      } else {
        response = `That doesn't look like a valid email. Could you double-check and send it again?`;
        newState = "awaiting_email";
      }
      break;
    }

    case "awaiting_booking_date": {
      const booking = await getBookingConfig(callUserId);
      const dates = resolveBookingDates(booking.dates);
      const maxDate = dates.length;
      const dateChoice = reply.replace(new RegExp(`[^1-${maxDate}]`, "g"), "");
      const idx = parseInt(dateChoice, 10) - 1;
      if (idx >= 0 && idx < dates.length) {
        updates.selectedTime = dates[idx].label;
        const slotMenu = booking.slots.map((s, i) => `${i + 1}. ${s}`).join("\n");
        response = `Great, ${dates[idx].label}!\n\nWhat time suits you?\n\n${slotMenu}`;
        newState = "awaiting_booking_slot";
      } else {
        const dateMenu = dates.map((d, i) => `${i + 1}. ${d.label}`).join("\n");
        response = `Please reply with a number from 1-${dates.length}:\n\n${dateMenu}`;
        newState = "awaiting_booking_date";
      }
      break;
    }

    case "awaiting_booking_slot": {
      const booking = await getBookingConfig(callUserId);
      const slotIdx = parseInt(reply.replace(/[^0-9]/g, ""), 10) - 1;
      if (slotIdx >= 0 && slotIdx < booking.slots.length) {
        const timeSlot = booking.slots[slotIdx];
        const dateLabel = call.selectedTime || updates.selectedTime || "";
        const dates = resolveBookingDates(booking.dates);
        const matchedDate = dates.find(d => d.label === dateLabel);
        const dateStr = matchedDate?.dateStr || new Date().toISOString().split("T")[0];

        updates.selectedTime = `${dateLabel} ${timeSlot}`;

        const { businessName } = await getTwilioConfig(callUserId);
        const urgentNote = (call.isUrgent || updates.isUrgent) ? "\n\nMarked as urgent - we'll prioritise this." : "";
        response = fillTemplate(msgs.booked_manual, { dateTime: `${dateLabel} at ${timeSlot}`, urgentNote, businessName });
        newState = "completed";

        await db.insert(jobs).values({
          userId: callUserId,
          callerName: call.callerName || updates.callerName,
          phoneNumber: call.phoneNumber,
          jobType: call.selectedService || updates.selectedService || "General",
          date: dateStr,
          time: timeSlot,
          address: call.jobAddress || updates.jobAddress || "",
          notes: call.selectedSubOption || updates.selectedSubOption || "",
          email: call.callerEmail || updates.callerEmail || null,
          status: "confirmed",
          missedCallId: call.id,
          isUrgent: call.isUrgent || updates.isUrgent || false,
        });

        const jobName = call.callerName || updates.callerName || "New customer";
        const jobService = call.selectedService || updates.selectedService || "Job";
        sendPushToUser(
          callUserId,
          `${call.isUrgent || updates.isUrgent ? "🚨 Urgent: " : "📅 "}New job booked`,
          `${jobName} — ${jobService} on ${dateLabel} at ${timeSlot}`,
          { type: "job_booked", missedCallId: call.id }
        );

        updates.jobBooked = true;
      } else {
        const slotMenu = booking.slots.map((s, i) => `${i + 1}. ${s}`).join("\n");
        response = `Please reply with a number from 1-${booking.slots.length}:\n\n${slotMenu}`;
        newState = "awaiting_booking_slot";
      }
      break;
    }

    case "awaiting_time": {
      const timeChoice = reply.replace(/[^1-3]/g, "");
      let timeLabel = "";
      if (timeChoice === "1") timeLabel = "Morning";
      else if (timeChoice === "2") timeLabel = "Afternoon";
      else if (timeChoice === "3" || reply.toUpperCase().includes("ASAP")) timeLabel = "ASAP";
      else if (reply.toUpperCase().includes("MORN")) timeLabel = "Morning";
      else if (reply.toUpperCase().includes("AFTER")) timeLabel = "Afternoon";
      else timeLabel = reply;

      updates.selectedTime = timeLabel;

      const { businessName } = await getTwilioConfig(callUserId);
      const urgentNote2 = (call.isUrgent || updates.isUrgent) ? "\n\nIf urgent, we'll call you ASAP." : "";
      response = fillTemplate(msgs.booked_manual, { dateTime: timeLabel, urgentNote: urgentNote2, businessName });
      newState = "completed";

      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      await db.insert(jobs).values({
        userId: callUserId,
        callerName: call.callerName || updates.callerName,
        phoneNumber: call.phoneNumber,
        jobType: call.selectedService || updates.selectedService || "General",
        date: dateStr,
        time: timeLabel,
        address: call.jobAddress || updates.jobAddress || "",
        notes: call.selectedSubOption || updates.selectedSubOption || "",
        email: call.callerEmail || updates.callerEmail || null,
        status: (call.isUrgent || updates.isUrgent) ? "confirmed" : "pending",
        missedCallId: call.id,
        isUrgent: call.isUrgent || updates.isUrgent || false,
      });

      const jobName2 = call.callerName || updates.callerName || "New customer";
      const jobService2 = call.selectedService || updates.selectedService || "Job";
      sendPushToUser(
        callUserId,
        `${call.isUrgent || updates.isUrgent ? "🚨 Urgent: " : "📅 "}New job booked`,
        `${jobName2} — ${jobService2} (${timeLabel})`,
        { type: "job_booked", missedCallId: call.id }
      );

      updates.jobBooked = true;
      break;
    }

    case "completed": {
      const { businessName } = await getTwilioConfig(callUserId);
      response = fillTemplate(msgs.followup_complete, { businessName });
      newState = "completed";
      break;
    }

    // ── Demo / lead generation flow ──────────────────────────────────────────

    case "demo_offer_sent": {
      const upper = reply.toUpperCase();
      if (upper.includes("YES")) {
        response = `Awesome! 🎉\n\nGrab a 10-minute slot that suits you here:\n\n📅 ${CALENDLY_BOOKING_URL}\n\nOnce you've booked I'll send you a confirmation. Talk soon!`;
        newState = "demo_awaiting_calendly";
      } else if (body.trim().toLowerCase().includes("tradie")) {
        // They sent the trigger word again — re-send the offer
        response = `Here's the demo again 🎬\n${DEMO_VIDEO_URL}\n\nReply YES to grab a 10-minute call and I'll send you the booking link.`;
        newState = "demo_offer_sent";
      } else {
        response = `No worries at all! If you change your mind, just reply YES anytime and I'll send through the booking link. 😊`;
        newState = "demo_completed";
      }
      break;
    }

    case "demo_awaiting_calendly": {
      const upper = reply.toUpperCase();
      if (upper.includes("YES") || body.trim().toLowerCase().includes("link")) {
        response = `Here's the booking link again:\n\n📅 ${CALENDLY_BOOKING_URL}`;
        newState = "demo_awaiting_calendly";
      } else if (body.trim().toLowerCase().includes("tradie")) {
        response = `Here's the demo again 🎬\n${DEMO_VIDEO_URL}\n\nAnd the booking link: 📅 ${CALENDLY_BOOKING_URL}`;
        newState = "demo_awaiting_calendly";
      } else {
        response = `No problem! When you're ready, here's the link to book your 10-minute call:\n\n📅 ${CALENDLY_BOOKING_URL}`;
        newState = "demo_awaiting_calendly";
      }
      break;
    }

    case "demo_awaiting_date": {
      const bookingCfg = await getBookingConfig(callUserId);
      const dates = resolveBookingDates(bookingCfg.dates);
      const maxIdx = dates.length;
      const dateChoice = reply.replace(new RegExp(`[^1-${maxIdx}]`, "g"), "");
      const idx = parseInt(dateChoice, 10) - 1;
      if (idx >= 0 && idx < dates.length) {
        updates.selectedTime = dates[idx].label;
        const timeMenu = DEMO_CALL_TIMES.map((t, i) => `${i + 1}. ${t}`).join("\n");
        response = `${dates[idx].label} works great!\n\nWhat time suits you for the 10-minute call?\n\n${timeMenu}`;
        newState = "demo_awaiting_time";
      } else {
        const dateMenu = dates.map((d, i) => `${i + 1}. ${d.label}`).join("\n");
        response = `Please reply with a number:\n\n${dateMenu}`;
        newState = "demo_awaiting_date";
      }
      break;
    }

    case "demo_awaiting_time": {
      const timeIdx = parseInt(reply.replace(/[^0-9]/g, ""), 10) - 1;
      if (timeIdx >= 0 && timeIdx < DEMO_CALL_TIMES.length) {
        const timeSlot = DEMO_CALL_TIMES[timeIdx];
        const dateLabel = call.selectedTime || updates.selectedTime || "";
        updates.selectedTime = `${dateLabel} ${timeSlot}`;
        const { businessName } = await getTwilioConfig(callUserId);
        response = `All booked! 🎉\n\nYour free 10-minute TradieCatch setup call is confirmed for:\n📅 ${dateLabel} at ${timeSlot}\n\nWe'll walk you through everything and get you set up. See you then!\n\n- ${businessName || "TradieCatch"}`;
        newState = "demo_completed";
        updates.jobBooked = true;

        // Push the demo setup call into the jobs list
        const bookingCfgJob = await getBookingConfig(callUserId);
        const allDates = resolveBookingDates(bookingCfgJob.dates);
        const matchedDate = allDates.find(d => d.label === dateLabel);
        const dateStr = matchedDate?.dateStr || dateLabel;
        await db.insert(jobs).values({
          userId: callUserId,
          callerName: call.callerName || `Demo Lead (${call.phoneNumber})`,
          phoneNumber: call.phoneNumber,
          jobType: "TradieCatch Setup Call (Demo)",
          date: dateStr,
          time: timeSlot,
          address: "",
          notes: "10-min onboarding call booked via SMS demo flow",
          email: null,
          status: "confirmed",
          missedCallId: call.id,
          isUrgent: false,
        });

        sendPushToUser(
          callUserId,
          "🎬 New demo lead booked",
          `${call.phoneNumber} booked a setup call on ${dateLabel} at ${timeSlot}`,
          { type: "demo_booked", missedCallId: call.id }
        );
      } else {
        const timeMenu = DEMO_CALL_TIMES.map((t, i) => `${i + 1}. ${t}`).join("\n");
        response = `Please reply with a number:\n\n${timeMenu}`;
        newState = "demo_awaiting_time";
      }
      break;
    }

    case "demo_completed": {
      if (body.trim().toLowerCase().includes("tradie")) {
        // Re-engage — send the offer again
        response = `Great to hear from you again! 😊\n\n🎬 TradieCatch demo: ${DEMO_VIDEO_URL}\n\nReply YES to book a free 10-minute setup call.`;
        newState = "demo_offer_sent";
      } else {
        const { businessName } = await getTwilioConfig(callUserId);
        response = `Your setup call is already booked — we'll be in touch! 🙌\n\n- ${businessName || "TradieCatch"}`;
        newState = "demo_completed";
      }
      break;
    }

    default: {
      response = null as any;
    }
  }

  if (response) {
    addLogEntry(log, "business", response);
    await sendSms(call.phoneNumber, response, callUserId);
  }

  await db.update(missedCalls).set({
    ...updates,
    conversationState: newState,
    conversationLog: log,
  }).where(eq(missedCalls.id, call.id));

  return response;
}

/**
 * Dedicated handler for the TradieCatch sales/demo number.
 * Every inbound SMS on that number runs through the demo booking flow,
 * regardless of message content.  Normal tradie missed-call logic is
 * never triggered here.
 */
export async function handleDemoSmsFlow(fromPhone: string, body: string, toPhone: string): Promise<string | null> {
  const normalizedFrom = normalizePhone(fromPhone);

  // Resolve the userId that owns this Twilio number
  const userIds = await findUsersByTwilioNumber(toPhone);
  if (userIds.length === 0) {
    console.log(`Demo flow: no user found for toPhone ${toPhone}`);
    return null;
  }
  const userId = userIds[0];

  // Find any existing demo conversation for this caller
  const allCalls = await db.select().from(missedCalls)
    .where(eq(missedCalls.userId, userId))
    .orderBy(desc(missedCalls.timestamp));

  const callerCalls = allCalls.filter(c => phonesMatch(c.phoneNumber, normalizedFrom));

  const DEMO_ACTIVE_STATES = new Set(["demo_offer_sent", "demo_awaiting_date", "demo_awaiting_time"]);
  const activeDemo = callerCalls.find(c => DEMO_ACTIVE_STATES.has(c.conversationState)) || null;
  const completedDemo = callerCalls.find(c => c.conversationState === "demo_completed") || null;

  // ── No existing conversation ──────────────────────────────────────────────
  if (!activeDemo && !completedDemo) {
    if (body.trim().toLowerCase().includes("tradie")) {
      console.log(`Demo flow: new contact from ${fromPhone} — sending offer`);
      return await handleDemoTrigger(fromPhone, userId);
    }
    // Non-trigger first message — nudge them to the right word
    const { businessName } = await getTwilioConfig(userId);
    const nudge = `Hi! 👋 Text the word TRADIE to see how TradieCatch works and book a free 10-minute setup call.\n\n- ${businessName || "TradieCatch"}`;
    await sendSms(fromPhone, nudge, userId);
    return nudge;
  }

  const call = activeDemo || completedDemo!;
  const reply = body.trim();
  let log = (call.conversationLog || []) as Array<{role: string; message: string; timestamp: string}>;
  addLogEntry(log, "customer", reply);

  let response = "";
  let newState = call.conversationState;
  let updates: Record<string, any> = {};

  switch (call.conversationState) {
    case "demo_offer_sent": {
      const upper = reply.toUpperCase();
      if (upper.includes("YES")) {
        const bookingCfgOffer = await getBookingConfig(userId);
        const dates = resolveBookingDates(bookingCfgOffer.dates);
        const dateMenu = dates.map((d, i) => `${i + 1}. ${d.label}`).join("\n");
        response = `Awesome! Let's get you booked in for a free 10-minute setup call.\n\nWhat day works best for you?\n\n${dateMenu}`;
        newState = "demo_awaiting_date";
      } else {
        // Any other reply — re-send the offer
        response = `Here's the TradieCatch demo 🎬\n${DEMO_VIDEO_URL}\n\nReply YES to book your free 10-minute setup call.`;
        newState = "demo_offer_sent";
      }
      break;
    }

    case "demo_awaiting_date": {
      const bookingCfg = await getBookingConfig(userId);
      const dates = resolveBookingDates(bookingCfg.dates);
      const maxIdx = dates.length;
      const dateChoice = reply.replace(new RegExp(`[^1-${maxIdx}]`, "g"), "");
      const idx = parseInt(dateChoice, 10) - 1;
      if (idx >= 0 && idx < dates.length) {
        updates.selectedTime = dates[idx].label;
        const timeMenu = DEMO_CALL_TIMES.map((t, i) => `${i + 1}. ${t}`).join("\n");
        response = `${dates[idx].label} works great!\n\nWhat time suits you for the 10-minute call?\n\n${timeMenu}`;
        newState = "demo_awaiting_time";
      } else {
        const dateMenu = dates.map((d, i) => `${i + 1}. ${d.label}`).join("\n");
        response = `Please reply with a number:\n\n${dateMenu}`;
        newState = "demo_awaiting_date";
      }
      break;
    }

    case "demo_awaiting_time": {
      const timeIdx = parseInt(reply.replace(/[^0-9]/g, ""), 10) - 1;
      if (timeIdx >= 0 && timeIdx < DEMO_CALL_TIMES.length) {
        const timeSlot = DEMO_CALL_TIMES[timeIdx];
        const dateLabel = call.selectedTime || updates.selectedTime || "";
        updates.selectedTime = `${dateLabel} ${timeSlot}`;
        const { businessName } = await getTwilioConfig(userId);
        response = `All booked! 🎉\n\nYour free 10-minute TradieCatch setup call is confirmed for:\n📅 ${dateLabel} at ${timeSlot}\n\nWe'll walk you through everything and get you set up. See you then!\n\n- ${businessName || "TradieCatch"}`;
        newState = "demo_completed";
        updates.jobBooked = true;

        // Push the demo setup call into the jobs list
        const bookingCfgJob = await getBookingConfig(userId);
        const allDates = resolveBookingDates(bookingCfgJob.dates);
        const matchedDate = allDates.find(d => d.label === dateLabel);
        const dateStr = matchedDate?.dateStr || dateLabel;
        await db.insert(jobs).values({
          userId,
          callerName: call.callerName || `Demo Lead (${call.phoneNumber})`,
          phoneNumber: call.phoneNumber,
          jobType: "TradieCatch Setup Call (Demo)",
          date: dateStr,
          time: timeSlot,
          address: "",
          notes: "10-min onboarding call booked via SMS demo flow",
          email: null,
          status: "confirmed",
          missedCallId: call.id,
          isUrgent: false,
        });

        sendPushToUser(
          userId,
          "🎬 New demo lead booked",
          `${call.phoneNumber} booked a setup call on ${dateLabel} at ${timeSlot}`,
          { type: "demo_booked", missedCallId: call.id }
        );
      } else {
        const timeMenu = DEMO_CALL_TIMES.map((t, i) => `${i + 1}. ${t}`).join("\n");
        response = `Please reply with a number:\n\n${timeMenu}`;
        newState = "demo_awaiting_time";
      }
      break;
    }

    case "demo_completed":
    default: {
      // Re-engage anyone who messages the line again after booking
      response = `Great to hear from you! 😊\n\n🎬 TradieCatch demo: ${DEMO_VIDEO_URL}\n\nReply YES to book a new free 10-minute setup call.`;
      newState = "demo_offer_sent";
      break;
    }
  }

  if (response) {
    addLogEntry(log, "business", response);
    await sendSms(fromPhone, response, userId);
  }

  await db.update(missedCalls).set({
    ...updates,
    conversationState: newState,
    conversationLog: log,
  }).where(eq(missedCalls.id, call.id));

  return response;
}

/**
 * Called when someone texts "TRADIE" with no existing active conversation.
 * Creates a missed call record and fires the full automated customer-experience
 * bot at them — so they see exactly what their own customers would experience.
 */
export async function triggerCustomerExperienceDemo(fromPhone: string, toPhone: string): Promise<boolean> {
  // Find which tradie owns this Twilio number
  const userIds = await findUsersByTwilioNumber(toPhone);
  if (userIds.length === 0) {
    console.log(`DEMO trigger: no tradie found for toPhone ${toPhone}`);
    return false;
  }
  const userId = userIds[0];

  // Don't create a duplicate if there's already an active conversation
  const existing = await db.select().from(missedCalls)
    .where(and(eq(missedCalls.userId, userId), eq(missedCalls.phoneNumber, normalizePhone(fromPhone))))
    .orderBy(desc(missedCalls.timestamp));

  const TERMINAL_STATES = new Set(["none", "completed", "demo_completed"]);
  const hasActive = existing.some(c => !TERMINAL_STATES.has(c.conversationState));
  if (hasActive) {
    console.log(`DEMO trigger: active conversation already exists for ${fromPhone}`);
    return false;
  }

  // Create the missed call record
  const [newCall] = await db.insert(missedCalls).values({
    userId,
    callerName: "Demo Visitor",
    phoneNumber: normalizePhone(fromPhone),
    timestamp: new Date(),
  }).returning();

  // Fire the full automated customer-experience bot with the demo-specific greeting
  await sendInitialMissedCallSms(newCall.id, userId, 'demo');
  console.log(`DEMO trigger: started customer experience for ${fromPhone} under user ${userId}`);
  return true;
}

/** Convert any phone number to E.164 format (assumes AU +61 when no country code present) */
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("61")) return "+" + cleaned;
  if (cleaned.startsWith("0")) return "+61" + cleaned.slice(1);
  return cleaned;
}

function phonesMatch(a: string, b: string): boolean {
  const cleanA = a.replace(/[\s\-()]/g, "");
  const cleanB = b.replace(/[\s\-()]/g, "");
  if (cleanA === cleanB) return true;
  const digitsA = cleanA.replace(/\D/g, "");
  const digitsB = cleanB.replace(/\D/g, "");
  if (digitsA === digitsB) return true;
  if (digitsA.length > 6 && digitsB.length > 6) {
    const suffixLen = Math.min(digitsA.length, digitsB.length) - 1;
    if (digitsA.slice(-suffixLen) === digitsB.slice(-suffixLen)) return true;
  }
  return false;
}
