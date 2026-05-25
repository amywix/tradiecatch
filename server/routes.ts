import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { db } from "./db";
import { sql as rawSql } from "drizzle-orm";
import { missedCalls, jobs, settings, users, DEFAULT_SERVICES } from "@shared/schema";
import { eq, desc, and, not, SQL } from "drizzle-orm";
import { sendInitialMissedCallSms, handleIncomingReply } from "./sms-conversation";
import { createTradie, login, getMe, changePassword, acceptTerms, requireAuth, requireAdmin, blockDemo, ADMIN_EMAIL, type AuthRequest } from "./auth";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";

function paramId(req: Request | AuthRequest): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

function voicemailSigningSecret(): string {
  return process.env.JWT_SECRET || "tradiecatch-jwt-secret-change-in-production";
}

function signVoicemailToken(callId: string, expEpochMs: number): string {
  const h = crypto.createHmac("sha256", voicemailSigningSecret());
  h.update(`${callId}.${expEpochMs}`);
  return h.digest("base64url");
}

function verifyVoicemailToken(callId: string, token: string, expEpochMs: number): boolean {
  if (!token || !expEpochMs) return false;
  if (Date.now() > expEpochMs) return false;
  const expected = signVoicemailToken(callId, expEpochMs);
  if (expected.length !== token.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

function buildVoicemailUrl(baseUrl: string, callId: string, ttlMs = 14 * 24 * 60 * 60 * 1000): string {
  const exp = Date.now() + ttlMs;
  const t = signVoicemailToken(callId, exp);
  return `${baseUrl}/api/voicemail/${callId}?t=${t}&exp=${exp}`;
}

export async function registerRoutes(app: Express): Promise<Server> {

  // Public registration is disabled — operator (admin) provisions every tradie
  // account via /api/admin/create-tradie after collecting their details on the
  // sales-form intake.
  app.post("/api/auth/login", login);
  app.get("/api/auth/me", requireAuth, getMe as any);
  app.patch("/api/auth/change-password", requireAuth, changePassword as any);
  app.patch("/api/auth/accept-terms", requireAuth, acceptTerms as any);
  app.post("/api/admin/create-tradie", requireAuth, requireAdmin, createTradie as any);

  app.post("/api/push-token", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { token } = req.body || {};
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Missing token" });
      }
      await db.update(users).set({ pushToken: token }).where(eq(users.id, req.userId!));
      res.json({ success: true });
    } catch (err: any) {
      console.error("push-token error", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/push-token", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      await db.update(users).set({ pushToken: null }).where(eq(users.id, req.userId!));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/debug/twilio-numbers", requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const allSettings = await db.select({
        userId: settings.userId,
        twilioPhoneNumber: settings.twilioPhoneNumber,
        businessName: settings.businessName,
      }).from(settings);
      const dbUrl = process.env.DATABASE_URL || "";
      const maskedUrl = dbUrl.replace(/\/\/.*@/, "//***@");
      res.json({
        dbConnection: maskedUrl,
        settingsCount: allSettings.length,
        configuredNumbers: allSettings.map(s => ({
          userId: s.userId?.slice(0, 8) + "...",
          number: s.twilioPhoneNumber || "(empty)",
          name: s.businessName || "(unnamed)",
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/config", async (req: Request, res: Response) => {
    const domains = process.env.REPLIT_DOMAINS || "";
    const domainList = domains.split(",").map(d => d.trim()).filter(Boolean);
    const deploymentDomain = process.env.DEPLOYMENT_DOMAIN
      || domainList.find(d => d.endsWith('.replit.app'))
      || "";
    const protocol = req.protocol || "https";
    const hostFromHeader = req.get("host") || "";
    const appUrl = deploymentDomain
      ? `https://${deploymentDomain}`
      : hostFromHeader
        ? `${protocol}://${hostFromHeader}`
        : "";

    let stripePublishableKey = "";
    try {
      stripePublishableKey = await getStripePublishableKey();
    } catch (e) {
      console.log("Stripe publishable key not available:", (e as Error).message);
    }

    res.json({
      revenueCatApiKey: process.env.REVENUECAT_API_KEY || "",
      stripePublishableKey,
      webhookUrl: appUrl ? `${appUrl}/api/twilio/webhook` : "",
      voiceWebhookUrl: appUrl ? `${appUrl}/api/twilio/voice` : "",
      appUrl,
    });
  });

  app.get("/api/missed-calls", requireAuth, async (req: AuthRequest, res: Response) => {
    const rows = await db.select().from(missedCalls)
      .where(eq(missedCalls.userId, req.userId!))
      .orderBy(desc(missedCalls.timestamp));
    res.json(rows);
  });

  app.post("/api/missed-calls", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { callerName, phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ error: "phoneNumber is required" });
      }
      const [call] = await db.insert(missedCalls).values({
        userId: req.userId!,
        callerName: callerName || "Unknown Caller",
        phoneNumber,
        timestamp: new Date(),
      }).returning();
      res.json(call);
    } catch (err: any) {
      console.error("Error adding missed call:", err);
      res.status(500).json({ error: err?.message || "Failed to add call" });
    }
  });

  app.delete("/api/missed-calls/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    const id = paramId(req);
    await db.delete(missedCalls).where(
      and(eq(missedCalls.id, id), eq(missedCalls.userId, req.userId!))
    );
    res.json({ ok: true });
  });

  app.post("/api/missed-calls/:id/send-sms", requireAuth, async (req: AuthRequest, res: Response) => {
    const id = paramId(req);
    try {
      const [call] = await db.select().from(missedCalls).where(
        and(eq(missedCalls.id, id), eq(missedCalls.userId, req.userId!))
      );
      if (!call) return res.status(404).json({ error: "Call not found" });

      await sendInitialMissedCallSms(id, req.userId!);
      const [updated] = await db.select().from(missedCalls).where(eq(missedCalls.id, id));
      res.json(updated);
    } catch (err: any) {
      console.error("Send SMS error:", err);
      res.status(500).json({ error: err.message || "Failed to send SMS" });
    }
  });

  app.get("/api/missed-calls/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    const id = paramId(req);
    const [call] = await db.select().from(missedCalls).where(
      and(eq(missedCalls.id, id), eq(missedCalls.userId, req.userId!))
    );
    if (!call) return res.status(404).json({ error: "Not found" });
    res.json(call);
  });

  // Calendly webhook removed — sales/demo lead flow has been retired.
  // Kept as a no-op for any stale subscriptions still posting here.
  app.post("/api/calendly/webhook-disabled", async (req: Request, res: Response) => {
    try {
      const { sendSms } = await import("./sms-conversation");
      const event = req.body?.event || "";
      const payload = req.body?.payload || {};
      console.log(`Calendly webhook event: ${event}`);

      if (event !== "invitee.created") {
        return res.status(200).json({ ok: true, ignored: event });
      }

      const inviteeName: string = payload?.name || payload?.invitee?.name || "there";
      const startTimeRaw: string = payload?.scheduled_event?.start_time || payload?.event?.start_time || "";
      const eventName: string = payload?.scheduled_event?.name || payload?.event_type?.name || "your CallCatch call";

      // Try to extract a phone number from invitee SMS reminder, custom answers, or text reminder
      let invPhone: string =
        payload?.text_reminder_number ||
        payload?.invitee?.text_reminder_number ||
        "";
      const qa: any[] = payload?.questions_and_answers || payload?.invitee?.questions_and_answers || [];
      if (!invPhone && Array.isArray(qa)) {
        for (const item of qa) {
          const ans = String(item?.answer || "");
          const m = ans.match(/\+?\d[\d\s\-().]{6,}/);
          if (m) { invPhone = m[0]; break; }
        }
      }

      // Format the booked time for the SMS
      let timeLabel = "";
      if (startTimeRaw) {
        try {
          const d = new Date(startTimeRaw);
          timeLabel = d.toLocaleString("en-AU", {
            weekday: "short", day: "numeric", month: "short",
            hour: "numeric", minute: "2-digit", hour12: true,
            timeZone: "Australia/Sydney",
          });
        } catch { timeLabel = startTimeRaw; }
      }

      // Find the most recent demo conversation awaiting Calendly booking
      const candidateStates = ["demo_awaiting_calendly", "demo_offer_sent"];
      let targetCall: any = null;

      if (invPhone) {
        const normalize = (p: string) => p.replace(/[^\d+]/g, "");
        const target = normalize(invPhone);
        const all = await db.select().from(missedCalls);
        const matched = all
          .filter(c => candidateStates.includes(c.conversationState as string))
          .filter(c => {
            const a = normalize(c.phoneNumber);
            return a.endsWith(target.slice(-9)) || target.endsWith(a.slice(-9));
          })
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        targetCall = matched[0] || null;
      }

      // Fallback: most recent awaiting-calendly conversation in the last 24h
      if (!targetCall) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const all = await db.select().from(missedCalls);
        const recent = all
          .filter(c => c.conversationState === "demo_awaiting_calendly")
          .filter(c => new Date(c.timestamp).getTime() > cutoff)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        targetCall = recent[0] || null;
      }

      if (!targetCall) {
        console.log("Calendly webhook: no matching demo conversation found");
        return res.status(200).json({ ok: true, matched: false });
      }

      const confirmation = `🎉 You're all booked, ${inviteeName.split(" ")[0]}!\n\n${timeLabel ? `📅 ${timeLabel}\n\n` : ""}I'll see you on the call. If anything changes you can reschedule from your Calendly confirmation email.\n\n— Amy, CallCatch`;

      await sendSms(targetCall.phoneNumber, confirmation, targetCall.userId);

      const log = (targetCall.conversationLog || []) as any[];
      log.push({ role: "business", message: confirmation, timestamp: new Date().toISOString() });
      await db.update(missedCalls).set({
        conversationState: "demo_completed",
        conversationLog: log as any,
      }).where(eq(missedCalls.id, targetCall.id));

      // Also create a job entry so it shows up in the Jobs list
      await db.insert(jobs).values({
        userId: targetCall.userId,
        callerName: inviteeName || targetCall.callerName || `Demo Lead (${targetCall.phoneNumber})`,
        phoneNumber: targetCall.phoneNumber,
        jobType: "CallCatch Setup Call (Calendly)",
        date: startTimeRaw ? startTimeRaw.slice(0, 10) : "",
        time: timeLabel,
        address: "",
        notes: `Booked via Calendly: ${eventName}`,
        email: payload?.email || payload?.invitee?.email || null,
        status: "confirmed",
        missedCallId: targetCall.id,
        isUrgent: false,
      });

      res.status(200).json({ ok: true, matched: true });
    } catch (err) {
      console.error("Calendly webhook error:", err);
      res.status(200).json({ ok: false });
    }
  });

  app.post("/api/twilio/webhook", async (req: Request, res: Response) => {
    const from = req.body.From || "";
    const to = req.body.To || "";
    const body = req.body.Body || "";
    const messageSid = req.body.MessageSid || req.body.SmsSid || null;

    console.log(`Incoming SMS from ${from} to ${to}: ${body}`);

    try {
      await handleIncomingReply(from, body, to);
    } catch (err) {
      console.error("Webhook handler error:", err);
    }

    res.set("Content-Type", "text/xml");
    res.send("<Response></Response>");
  });

  app.post("/api/twilio/voice", async (req: Request, res: Response) => {
    res.set("Content-Type", "text/xml");
    try {
      const from = req.body.From || req.body.Caller || "";
      const to = req.body.To || req.body.Called || "";
      const callStatus = req.body.CallStatus || "";
      const callerName = req.body.CallerName || "Unknown Caller";

      console.log(`Incoming call from ${from} to ${to} (status: ${callStatus}, name: ${callerName})`);

      const settingsRow: any = await resolveOwnerSettings(to, from);
      if (!settingsRow) {
        console.log(`No user found for Twilio number: ${to}`);
        res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Olivia-Neural">Sorry, this number is not configured.</Say><Hangup/></Response>`);
        return;
      }
      const userId = settingsRow.userId as string;
      console.log(`Resolved to user ${userId} for Twilio number ${to}`);

      const baseUrl = getPublicBaseUrl(req);
      const mode = (settingsRow.forwardingMode as string) || "carrier_forward";
      const tradieMobile = (settingsRow.tradieMobileNumber as string || "").trim();

      // Option A — Twilio is the front door. Try the tradie's mobile first; if no answer, voicemail/SMS flow runs in dial-result.
      if (mode === "twilio_dial" && tradieMobile) {
        const actionUrl = `${baseUrl}/api/twilio/dial-result?ownerUserId=${encodeURIComponent(userId)}&caller=${encodeURIComponent(from)}&callerName=${encodeURIComponent(callerName)}`;
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial action="${actionUrl}" method="POST" timeout="20" callerId="${to}">
    <Number>${tradieMobile}</Number>
  </Dial>
</Response>`);
        return;
      }

      // Option B (default) — call has already been forwarded by carrier (or direct), so go straight to voicemail flow
      await handleMissedCallAndRespond(req, res, userId, settingsRow, from, callerName, baseUrl);
    } catch (err) {
      console.error("Voice webhook error:", err);
      if (!res.headersSent) {
        res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Olivia-Neural">Sorry, we encountered an error. Please try again later.</Say><Hangup/></Response>`);
      }
    }
  });

  // Called when a Dial attempt to the tradie completes. If they answered, we hang up.
  // If they didn't, we run the missed-call/voicemail flow.
  app.post("/api/twilio/dial-result", async (req: Request, res: Response) => {
    const dialStatus = req.body.DialCallStatus || "";
    const ownerUserId = (req.query.ownerUserId as string) || "";
    const caller = (req.query.caller as string) || req.body.From || "";
    const callerName = (req.query.callerName as string) || "Unknown Caller";

    console.log(`Dial result: ${dialStatus} for owner ${ownerUserId}, caller ${caller}`);
    res.set("Content-Type", "text/xml");

    if (dialStatus === "completed" || dialStatus === "answered") {
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
      return;
    }

    const [settingsRow] = await db.select().from(settings).where(eq(settings.userId, ownerUserId));
    if (!settingsRow) {
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
      return;
    }
    const baseUrl = getPublicBaseUrl(req);
    await handleMissedCallAndRespond(req, res, ownerUserId, settingsRow, caller, callerName, baseUrl);
  });

  // Twilio posts here when a voicemail recording is finished. We store ONLY the
  // RecordingSid + duration. The actual audio stays in Twilio's storage and is
  // streamed on demand from /api/voicemail/:id — no customer audio is persisted
  // on CallCatch servers.
  app.post("/api/twilio/recording-callback", async (req: Request, res: Response) => {
    res.status(200).send("ok");
    try {
      const missedCallId = (req.query.missedCallId as string) || "";
      const recordingSid = req.body.RecordingSid || "";
      const recordingDuration = req.body.RecordingDuration || "0";
      console.log(`Recording callback: missedCallId=${missedCallId}, recordingSid=${recordingSid}, duration=${recordingDuration}s`);
      if (!missedCallId || !recordingSid) return;

      // Skip empty/silent recordings (caller pressed 1 then immediately hung up,
      // or the line was silent). Anything under 2 seconds is treated as no message.
      const durationSec = parseInt(String(recordingDuration), 10) || 0;
      if (durationSec < 2) {
        console.log(`Recording callback: skipping empty recording (${durationSec}s) for ${missedCallId}`);
        return;
      }

      const [call] = await db.select().from(missedCalls).where(eq(missedCalls.id, missedCallId));
      if (!call) { console.log("Recording callback: missed call not found"); return; }

      const [settingsRow] = await db.select().from(settings).where(eq(settings.userId, call.userId));
      if (!settingsRow) { console.log("Recording callback: settings not found"); return; }

      await db.update(missedCalls).set({
        recordingSid,
        voicemailMimeType: "audio/mpeg",
        voicemailDurationSeconds: String(recordingDuration),
      }).where(eq(missedCalls.id, missedCallId));
      console.log(`Voicemail SID saved for call ${missedCallId} (audio stays at Twilio)`);

      // SMS the tradie a link that proxies to Twilio on demand
      const tradieMobile = (settingsRow.tradieMobileNumber as string || "").trim();
      if (tradieMobile) {
        const baseUrl = getPublicBaseUrl(req);
        const playUrl = buildVoicemailUrl(baseUrl, missedCallId);
        const { sendSms } = await import("./sms-conversation");
        const callerLabel = call.callerName && call.callerName !== "Unknown Caller" ? call.callerName : call.phoneNumber;
        const msg = `New voicemail from ${callerLabel} (${recordingDuration}s).\n\nListen: ${playUrl}`;
        try {
          await sendSms(tradieMobile, msg, call.userId);
          console.log(`Voicemail SMS sent to tradie ${tradieMobile}`);
        } catch (smsErr) {
          console.error("Voicemail-to-tradie SMS failed:", smsErr);
        }
      } else {
        console.log("No tradie mobile configured — skipping voicemail SMS forward");
      }
    } catch (err) {
      console.error("Recording callback error:", err);
    }
  });

  // IVR result: caller pressed a key (or didn't) on the "press 1 for voicemail"
  // prompt. If they pressed 1, start recording. Anything else → hang up cleanly,
  // so nothing is recorded and the tradie isn't sent an empty voicemail SMS.
  app.post("/api/twilio/voicemail-choice", async (req: Request, res: Response) => {
    res.set("Content-Type", "text/xml");
    const digits = (req.body.Digits || "").trim();
    const missedCallId = (req.query.missedCallId as string) || "";
    console.log(`Voicemail choice: digits=${digits || "(none)"} for missedCallId=${missedCallId}`);
    if (digits !== "1" || !missedCallId) {
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
      return;
    }
    const baseUrl = getPublicBaseUrl(req);
    const recCb = `${baseUrl}/api/twilio/recording-callback?missedCallId=${encodeURIComponent(missedCallId)}`;
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Olivia-Neural">Please leave your message after the tone, then hang up.</Say>
  <Record action="${recCb}" method="POST" recordingStatusCallback="${recCb}" recordingStatusCallbackMethod="POST" maxLength="120" timeout="5" playBeep="true" finishOnKey="#" trim="trim-silence"/>
  <Say voice="Polly.Olivia-Neural">No message recorded. Goodbye.</Say>
  <Hangup/>
</Response>`);
  });

  // Public endpoint: streams a voicemail recording. New recordings live at
  // Twilio (we proxy on demand using the tradie's Twilio creds). Legacy
  // recordings stored as base64 in voicemail_data still play back from the DB.
  // Authenticated endpoint that issues a short-lived signed playback URL
  // (the browser/system audio player can't carry a Bearer token).
  app.get("/api/voicemail/:id/link", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      const [call] = await db.select().from(missedCalls).where(eq(missedCalls.id, id));
      if (!call) return res.status(404).json({ error: "Not found" });
      if (call.userId !== req.userId) return res.status(403).json({ error: "Forbidden" });
      const baseUrl = getPublicBaseUrl(req);
      const url = buildVoicemailUrl(baseUrl, id, 10 * 60 * 1000);
      res.json({ url });
    } catch (err: any) {
      console.error("Voicemail link error:", err);
      res.status(500).json({ error: "Could not generate link" });
    }
  });

  app.get("/api/voicemail/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const [call] = await db.select().from(missedCalls).where(eq(missedCalls.id, id));
      if (!call) return res.status(404).send("Voicemail not found");

      // Access control: caller must EITHER present a valid signed token (for SMS-link
      // playback by the tradie's mobile) OR be the authenticated owner of the call.
      const tokenOk = verifyVoicemailToken(id, String(req.query.t || ""), Number(req.query.exp || 0));
      let ownerOk = false;
      if (!tokenOk) {
        const auth = req.header("authorization");
        if (auth?.startsWith("Bearer ")) {
          try {
            const jwtMod = await import("jsonwebtoken");
            const decoded = jwtMod.default.verify(
              auth.slice(7),
              process.env.JWT_SECRET || "tradiecatch-jwt-secret-change-in-production"
            ) as { userId?: string };
            ownerOk = !!decoded.userId && decoded.userId === call.userId;
          } catch { /* fall through */ }
        }
      }
      if (!tokenOk && !ownerOk) {
        return res.status(403).send("Forbidden");
      }

      // New path: stream from Twilio
      if (call.recordingSid) {
        const [settingsRow] = await db.select().from(settings).where(eq(settings.userId, call.userId));
        if (!settingsRow) return res.status(404).send("Voicemail not available");
        const sid = settingsRow.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || "";
        const token = settingsRow.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN || "";
        if (!sid || !token) return res.status(503).send("Voicemail backend not configured");

        const recordingUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings/${call.recordingSid}.mp3`;
        const authHeader = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
        const upstream = await fetch(recordingUrl, { headers: { Authorization: authHeader } });
        if (!upstream.ok) {
          console.error(`Twilio recording fetch failed: ${upstream.status}`);
          return res.status(upstream.status).send("Voicemail unavailable");
        }
        res.set("Content-Type", "audio/mpeg");
        res.set("Cache-Control", "private, no-store");
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.set("Content-Length", buf.length.toString());
        return res.send(buf);
      }

      // Legacy path: base64 in DB (kept for old calls only)
      if (call.voicemailData) {
        const buf = Buffer.from(call.voicemailData, "base64");
        res.set("Content-Type", call.voicemailMimeType || "audio/mpeg");
        res.set("Content-Length", buf.length.toString());
        res.set("Cache-Control", "private, max-age=86400");
        return res.send(buf);
      }

      return res.status(404).send("Voicemail not found");
    } catch (err: any) {
      console.error("Serve voicemail error:", err);
      res.status(500).send("Error");
    }
  });

  // Public endpoint: Twilio fetches this to play the tradie's recorded voicemail
  app.get("/api/voice-recording/:userId", async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const [row] = await db.select({
        voiceRecordingData: settings.voiceRecordingData,
        voiceRecordingMimeType: settings.voiceRecordingMimeType,
      }).from(settings).where(eq(settings.userId, userId));

      if (!row?.voiceRecordingData) {
        return res.status(404).json({ error: "No recording found" });
      }

      const mimeType = row.voiceRecordingMimeType || "audio/mp4";
      const audioBuffer = Buffer.from(row.voiceRecordingData, "base64");
      res.set("Content-Type", mimeType);
      res.set("Content-Length", audioBuffer.length.toString());
      res.set("Cache-Control", "no-cache");
      res.send(audioBuffer);
    } catch (err: any) {
      console.error("Serve voice recording error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Upload voice recording (base64 encoded audio from the app)
  app.post("/api/settings/voice-recording", requireAuth, blockDemo, async (req: AuthRequest, res: Response) => {
    try {
      const { audioBase64, mimeType } = req.body;
      if (!audioBase64) {
        return res.status(400).json({ error: "audioBase64 is required" });
      }
      // Validate it's actual base64
      const buffer = Buffer.from(audioBase64, "base64");
      if (buffer.length === 0) {
        return res.status(400).json({ error: "Invalid audio data" });
      }

      const [row] = await db.update(settings)
        .set({
          voiceRecordingData: audioBase64,
          voiceRecordingMimeType: mimeType || "audio/mp4",
        })
        .where(eq(settings.userId, req.userId!))
        .returning();

      res.json({ ok: true, size: buffer.length });
    } catch (err: any) {
      console.error("Upload voice recording error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Delete voice recording
  app.delete("/api/settings/voice-recording", requireAuth, blockDemo, async (req: AuthRequest, res: Response) => {
    try {
      await db.update(settings)
        .set({ voiceRecordingData: null, voiceRecordingMimeType: null })
        .where(eq(settings.userId, req.userId!));
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Delete voice recording error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Test Twilio credentials — makes a lightweight API call to verify they work
  app.post("/api/settings/test-twilio", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const [row] = await db.select({
        twilioAccountSid: settings.twilioAccountSid,
        twilioAuthToken: settings.twilioAuthToken,
        twilioPhoneNumber: settings.twilioPhoneNumber,
      }).from(settings).where(eq(settings.userId, req.userId!));

      const sid = row?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || "";
      const token = row?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN || "";

      if (!sid || !token) {
        return res.json({ ok: false, error: "No credentials saved yet. Enter your Account SID and Auth Token first." });
      }

      const twilioClient = (await import("twilio")).default;
      const client = twilioClient(sid, token);
      const account = await client.api.v2010.accounts(sid).fetch();
      return res.json({ ok: true, accountName: account.friendlyName });
    } catch (err: any) {
      const msg = err.code === 20003
        ? "Authentication failed — your Account SID or Auth Token is wrong. Check your Twilio console."
        : err.message || "Could not connect to Twilio.";
      return res.json({ ok: false, error: msg });
    }
  });

  app.get("/api/jobs", requireAuth, async (req: AuthRequest, res: Response) => {
    const rows = await db.select().from(jobs)
      .where(eq(jobs.userId, req.userId!))
      .orderBy(desc(jobs.createdAt));
    res.json(rows);
  });

  app.post("/api/jobs", requireAuth, async (req: AuthRequest, res: Response) => {
    const { callerName, phoneNumber, jobType, date, time, address, notes, status, missedCallId, isUrgent } = req.body;
    const [job] = await db.insert(jobs).values({
      userId: req.userId!,
      callerName: callerName || "Unknown",
      phoneNumber: phoneNumber || "",
      jobType: jobType || "General",
      date, time, address, notes,
      status: status || "pending",
      missedCallId,
      isUrgent: isUrgent || false,
    }).returning();

    if (missedCallId) {
      await db.update(missedCalls).set({ jobBooked: true }).where(
        and(eq(missedCalls.id, missedCallId), eq(missedCalls.userId, req.userId!))
      );
    }

    res.json(job);
  });

  app.patch("/api/jobs/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    const id = paramId(req);
    const [job] = await db.update(jobs).set(req.body).where(
      and(eq(jobs.id, id), eq(jobs.userId, req.userId!))
    ).returning();
    res.json(job);
  });

  app.delete("/api/jobs/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    const id = paramId(req);
    await db.delete(jobs).where(
      and(eq(jobs.id, id), eq(jobs.userId, req.userId!))
    );
    res.json({ ok: true });
  });

  app.get("/api/services", requireAuth, async (req: AuthRequest, res: Response) => {
    const [row] = await db.select().from(settings).where(eq(settings.userId, req.userId!));
    const services = (row?.services as string[]) || DEFAULT_SERVICES;
    res.json(services);
  });

  app.put("/api/services", requireAuth, blockDemo, async (req: AuthRequest, res: Response) => {
    const { services: newServices } = req.body;
    if (!Array.isArray(newServices) || newServices.length === 0) {
      return res.status(400).json({ error: "Services must be a non-empty array" });
    }
    const cleaned = newServices.map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    const [row] = await db.update(settings).set({ services: cleaned }).where(eq(settings.userId, req.userId!)).returning();
    res.json((row.services as string[]) || cleaned);
  });

  app.get("/api/settings", requireAuth, async (req: AuthRequest, res: Response) => {
    const [row] = await db.select().from(settings).where(eq(settings.userId, req.userId!));
    if (!row) {
      return res.json({ id: "default", userId: req.userId!, businessName: "", autoReplyEnabled: true, services: DEFAULT_SERVICES });
    }
    // SECURITY: only the operator (admin) sees the raw Twilio credentials.
    // Tradies and the demo account get the auth token redacted — the SID is
    // semi-sensitive but useless without the token, so we blank both for
    // anyone who isn't the admin. The phone number is safe to expose because
    // it's already public on outbound SMS.
    const [me] = await db.select().from(users).where(eq(users.id, req.userId!));
    const isAdmin = me?.email === ADMIN_EMAIL;
    if (!isAdmin) {
      return res.json({ ...row, twilioAccountSid: "", twilioAuthToken: "" });
    }
    res.json(row);
  });

  app.patch("/api/settings", requireAuth, blockDemo, async (req: AuthRequest, res: Response) => {
    // Operator-managed credentials: only the admin (operator) account may write
    // Twilio fields. Tradies who try to PATCH these get 403 — even though the
    // UI hides the editor, we enforce it server-side too.
    const TWILIO_FIELDS = ["twilioAccountSid", "twilioAuthToken", "twilioPhoneNumber"] as const;
    const tryingToWriteTwilio = TWILIO_FIELDS.some(f => f in (req.body || {}));
    if (tryingToWriteTwilio) {
      const [me] = await db.select().from(users).where(eq(users.id, req.userId!));
      if (!me || me.email !== ADMIN_EMAIL) {
        return res.status(403).json({
          error: "Twilio credentials are managed by CallCatch operations. Contact support to change your business number.",
        });
      }
    }

    // If a Twilio phone number is being saved, remove it from every other account first
    if (req.body.twilioPhoneNumber && req.body.twilioPhoneNumber.trim()) {
      await db.update(settings)
        .set({ twilioPhoneNumber: "" })
        .where(and(
          eq(settings.twilioPhoneNumber, req.body.twilioPhoneNumber.trim()),
          not(eq(settings.userId, req.userId!))
        ));
    }

    const updates: Record<string, any> = { ...req.body };

    // If baseAddress is being set/changed and the caller didn't supply coords,
    // geocode it server-side and persist the lat/lng. If geocoding fails,
    // null the lat/lng so the service-area check stays disabled until a valid
    // address is provided.
    if (typeof updates.baseAddress === "string") {
      const trimmed = updates.baseAddress.trim();
      updates.baseAddress = trimmed;
      const coordsProvided = updates.baseLat != null && updates.baseLng != null;
      if (!coordsProvided) {
        if (!trimmed) {
          updates.baseLat = null;
          updates.baseLng = null;
        } else {
          try {
            const { geocodeAddress } = await import("./geo");
            const geo = await geocodeAddress(trimmed);
            if (geo) {
              updates.baseLat = geo.lat;
              updates.baseLng = geo.lng;
            } else {
              updates.baseLat = null;
              updates.baseLng = null;
            }
          } catch (err) {
            console.error("Settings PATCH geocode failed:", err);
            updates.baseLat = null;
            updates.baseLng = null;
          }
        }
      }
    }

    const existing = await db.select().from(settings).where(eq(settings.userId, req.userId!));
    if (existing.length === 0) {
      const [row] = await db.insert(settings).values({
        userId: req.userId!,
        businessName: updates.businessName || "",
        autoReplyEnabled: updates.autoReplyEnabled !== undefined ? updates.autoReplyEnabled : true,
        ...(updates.baseAddress !== undefined ? { baseAddress: updates.baseAddress } : {}),
        ...(updates.baseLat !== undefined ? { baseLat: updates.baseLat } : {}),
        ...(updates.baseLng !== undefined ? { baseLng: updates.baseLng } : {}),
        ...(updates.serviceRadiusKm !== undefined ? { serviceRadiusKm: updates.serviceRadiusKm } : {}),
      }).returning();
      return res.json(row);
    }
    const [row] = await db.update(settings).set(updates).where(eq(settings.userId, req.userId!)).returning();
    res.json(row);
  });

  app.post("/api/settings/geocode", requireAuth, async (req: AuthRequest, res: Response) => {
    const address = (req.body?.address || "").toString().trim();
    if (!address) {
      return res.status(400).json({ error: "address required" });
    }
    try {
      const { geocodeAddress } = await import("./geo");
      const r = await geocodeAddress(address);
      if (!r) return res.status(404).json({ error: "Could not find that address. Try adding the suburb and postcode." });
      res.json(r);
    } catch (err: any) {
      console.error("Geocode endpoint error:", err);
      res.status(500).json({ error: err?.message || "Lookup failed" });
    }
  });

  // Note: in-app Stripe checkout has been removed. Subscriptions are now created
  // manually outside the app (e.g. via a Stripe payment link sent to the tradie's
  // email). The /api/stripe/subscription-status endpoint auto-links by email.

  app.get("/api/stripe/subscription-status", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const [user] = await db.select().from(users).where(eq(users.id, userId));

      if (user?.email === ADMIN_EMAIL) {
        return res.json({
          active: true,
          subscription: {
            id: 'admin_pro',
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            cancelAtPeriodEnd: false,
          },
        });
      }

      const stripe = await getUncachableStripeClient();
      let stripeCustomerId = user?.stripeCustomerId || null;

      // If we don't have a Stripe customer linked yet, try to find one by email.
      // This lets you create a customer + subscription in Stripe (e.g. via a payment link)
      // and have the app auto-link as soon as the tradie checks status.
      if (!stripeCustomerId && user?.email) {
        try {
          const matches = await stripe.customers.list({ email: user.email, limit: 5 });
          if (matches.data.length > 0) {
            stripeCustomerId = matches.data[0].id;
            await db.update(users)
              .set({ stripeCustomerId })
              .where(eq(users.id, userId));
          }
        } catch (lookupErr) {
          console.error("Stripe customer lookup by email failed:", lookupErr);
        }
      }

      if (!stripeCustomerId) {
        return res.json({ active: false, subscription: null });
      }

      // Query Stripe API directly for up-to-date subscription status
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'all',
        limit: 5,
      });

      const activeSub = subscriptions.data.find(
        s => s.status === 'active' || s.status === 'trialing'
      );

      if (!activeSub) {
        return res.json({ active: false, subscription: null });
      }

      // Keep local DB in sync
      if (user.stripeSubscriptionId !== activeSub.id) {
        await db.update(users)
          .set({ stripeSubscriptionId: activeSub.id })
          .where(eq(users.id, userId));
      }

      return res.json({
        active: true,
        subscription: {
          id: activeSub.id,
          status: activeSub.status,
          currentPeriodEnd: new Date(activeSub.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: activeSub.cancel_at_period_end,
        },
      });
    } catch (err: any) {
      console.error("Subscription status error:", err);
      res.json({ active: false, subscription: null });
    }
  });

  app.post("/api/stripe/customer-portal", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const [user] = await db.select().from(users).where(eq(users.id, userId));

      if (!user?.stripeCustomerId) {
        return res.status(400).json({ error: "No Stripe customer found" });
      }

      const stripe = await getUncachableStripeClient();
      const domains = process.env.REPLIT_DOMAINS || "";
      const primaryDomain = domains.split(",")[0]?.trim() || "";
      const baseUrl = primaryDomain ? `https://${primaryDomain}` : `${req.protocol}://${req.get("host")}`;

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: baseUrl,
      });

      res.json({ url: portalSession.url });
    } catch (err: any) {
      console.error("Customer portal error:", err);
      res.status(500).json({ error: "Failed to create portal session" });
    }
  });




  const httpServer = createServer(app);
  return httpServer;
}

function getPublicBaseUrl(req: Request): string {
  const domains = process.env.REPLIT_DOMAINS || "";
  const deploymentDomain = process.env.DEPLOYMENT_DOMAIN || domains.split(",").find((d: string) => d.trim().endsWith('.replit.app'))?.trim() || "";
  return deploymentDomain ? `https://${deploymentDomain}` : `${req.protocol}://${req.get("host")}`;
}

async function resolveOwnerSettings(toNumber: string, fromNumber: string): Promise<any | null> {
  const allSettings = await db.select().from(settings);
  const matching = allSettings.filter(s => {
    const t = s.twilioPhoneNumber || "";
    return t && phonesMatchSimple(t, toNumber);
  });
  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0];

  const scored = matching.map(s => {
    let score = 0;
    if (s.businessName && (s.businessName as string).trim()) score += 2;
    const svcList = s.services as string[] | null;
    if (Array.isArray(svcList) && svcList.length > 0) score += 1;
    return { s, score };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0].score;
  const candidates = scored.filter(x => x.score === top).map(x => x.s);
  if (candidates.length === 1) return candidates[0];

  const recent = await db.select().from(missedCalls)
    .where(eq(missedCalls.phoneNumber, fromNumber))
    .orderBy(desc(missedCalls.timestamp))
    .limit(1);
  if (recent.length > 0) {
    const m = candidates.find(s => s.userId === recent[0].userId);
    if (m) return m;
  }
  return candidates[0];
}

async function handleMissedCallAndRespond(
  req: Request,
  res: Response,
  userId: string,
  settingsRow: any,
  from: string,
  callerName: string,
  baseUrl: string,
): Promise<void> {
  let missedCallId: string | null = null;
  try {
    const existing = await db.select().from(missedCalls)
      .where(and(eq(missedCalls.userId, userId), eq(missedCalls.phoneNumber, from)))
      .orderBy(desc(missedCalls.timestamp))
      .limit(1);
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const isDuplicate = existing.length > 0 && new Date(existing[0].timestamp) > fiveMinAgo;

    if (isDuplicate) {
      missedCallId = existing[0].id;
      console.log(`Duplicate call from ${from} within 5 minutes — reusing call ${missedCallId}`);
    } else {
      const [newCall] = await db.insert(missedCalls).values({
        userId,
        callerName: callerName || "Unknown Caller",
        phoneNumber: from,
        timestamp: new Date(),
      }).returning();
      missedCallId = newCall.id;
      console.log(`Missed call logged for user ${userId}: ${from} (id: ${missedCallId})`);

      if (settingsRow?.autoReplyEnabled) {
        try {
          await sendInitialMissedCallSms(missedCallId, userId);
          console.log(`Auto-reply SMS sent for call ${missedCallId}`);
        } catch (smsErr) {
          console.error("Auto-reply SMS failed:", smsErr);
        }
      }
    }
  } catch (err) {
    console.error("handleMissedCallAndRespond DB error:", err);
  }

  const businessName = xmlEscape(settingsRow?.businessName || "us");
  const rawVoiceMsg = (settingsRow?.missedCallVoiceMessage || "Sorry we missed your call. Please leave a message after the tone and we will get back to you.").trim();
  const voiceMessage = xmlEscape(rawVoiceMsg);
  const hasRecording = !!(settingsRow?.voiceRecordingData && settingsRow?.voiceRecordingMimeType);
  const recordingUrl = hasRecording && settingsRow?.userId ? `${baseUrl}/api/voice-recording/${settingsRow.userId}` : null;
  const voicemailEnabled = settingsRow?.voicemailEnabled !== false;

  // Polly.Olivia-Neural is Australian English — natural and clear.
  // Falls back automatically to text-to-speech if no custom recording is stored.
  const greetingTwiml = recordingUrl
    ? `<Play>${recordingUrl}</Play>`
    : `<Say voice="Polly.Olivia-Neural">${voiceMessage} Thanks for calling ${businessName}.</Say>`;

  if (voicemailEnabled && missedCallId) {
    // IVR: caller hears the greeting, then is prompted to press 1 if they
    // want to leave a voicemail. If they don't press anything, the Gather
    // times out and we just hang up — no empty/silent voicemail recorded.
    const choiceUrl = `${baseUrl}/api/twilio/voicemail-choice?missedCallId=${encodeURIComponent(missedCallId)}`;
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingTwiml}
  <Gather numDigits="1" timeout="6" action="${choiceUrl}" method="POST">
    <Say voice="Polly.Olivia-Neural">To leave a voicemail, press 1. Otherwise, just hang up and we'll text you shortly.</Say>
  </Gather>
  <Hangup/>
</Response>`);
  } else {
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingTwiml}
  <Hangup/>
</Response>`);
  }
}

/** Escape characters that would break TwiML XML */
function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function phonesMatchSimple(a: string, b: string): boolean {
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
