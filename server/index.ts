import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';
import { db } from './db';
import { users, settings, missedCalls, jobs, DEFAULT_SERVICES } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "25mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: "25mb" }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  // SEO meta tags injected into the Expo web index.html on the fly.
  // Expo's generated index.html has no <meta name="description"> or
  // social tags by default, which Lighthouse flags. Injecting here means
  // the next `expo export` doesn't wipe them.
  const SEO_DESCRIPTION = "CallCatch helps Aussie tradies — especially electricians — never miss a job. Auto-reply to missed calls, capture jobs over SMS, and book work straight into your calendar.";
  function safeHostUrl(proto: string, host: string): string {
    // Only allow hostname-safe chars + optional :port. Anything else → empty.
    const clean = (host || "").match(/^[a-zA-Z0-9.\-]+(:\d+)?$/) ? host : "";
    return clean ? `${proto}://${clean}` : "";
  }
  function injectSeoMeta(html: string, baseUrl: string): string {
    if (html.includes('name="description"')) return html;
    const safeUrl = baseUrl.replace(/[<>"']/g, "");
    const tags = [
      `<meta name="description" content="${SEO_DESCRIPTION}" />`,
      `<meta name="robots" content="index, follow" />`,
      `<meta property="og:title" content="CallCatch — Never miss a job" />`,
      `<meta property="og:description" content="${SEO_DESCRIPTION}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:url" content="${safeUrl}" />`,
      `<meta name="twitter:card" content="summary" />`,
      `<meta name="twitter:title" content="CallCatch — Never miss a job" />`,
      `<meta name="twitter:description" content="${SEO_DESCRIPTION}" />`,
    ].join("\n    ");
    return html.replace("<head>", `<head>\n    ${tags}`);
  }

  // Plain-text robots.txt served before the SPA catch-all so Lighthouse
  // (and crawlers) get a valid robots file instead of HTML.
  app.get("/robots.txt", (req: Request, res: Response) => {
    const base = safeHostUrl(req.protocol || "https", req.get("host") || "");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`);
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    const webBuildPath = path.resolve(process.cwd(), "web-build", "index.html");
    const hasWebBuild = fs.existsSync(webBuildPath);

    if (req.path === "/" && hasWebBuild) {
      try {
        const html = fs.readFileSync(webBuildPath, "utf-8");
        const baseUrl = safeHostUrl(req.protocol || "https", req.get("host") || "");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(injectSeoMeta(html, baseUrl));
      } catch {
        return res.sendFile(webBuildPath);
      }
    }

    if (req.path === "/") {
      try {
        return serveLandingPage({
          req,
          res,
          landingPageTemplate,
          appName,
        });
      } catch (err) {
        console.error("Landing page error:", err);
        return res.status(200).send("OK");
      }
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "web-build")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  app.get("/{*path}", (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) return next();
    const webIndex = path.resolve(process.cwd(), "web-build", "index.html");
    if (fs.existsSync(webIndex)) {
      try {
        const html = fs.readFileSync(webIndex, "utf-8");
        const baseUrl = safeHostUrl(req.protocol || "https", req.get("host") || "");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(injectSeoMeta(html, baseUrl));
      } catch {
        return res.sendFile(webIndex);
      }
    }
    next();
  });

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

async function bootstrapDefaultUser() {
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
  if (!twilioPhone) {
    log('No TWILIO_PHONE_NUMBER env var set, skipping bootstrap');
    return;
  }

  try {
    // One-shot: remove the demo@ account if it still exists (sales/demo flow has been retired)
    const demoToDelete = await db.select().from(users).where(eq(users.email, 'demo@callcatch.com'));
    if (demoToDelete.length > 0) {
      const demoId = demoToDelete[0].id;
      await db.delete(missedCalls).where(eq(missedCalls.userId, demoId));
      await db.delete(jobs).where(eq(jobs.userId, demoId));
      await db.delete(settings).where(eq(settings.userId, demoId));
      await db.delete(users).where(eq(users.id, demoId));
      log('Bootstrap: deleted demo@callcatch.com account and all associated data');
    }

    // One-shot rename: if a legacy 'demo' user exists that was actually being
    // used as the admin account (training period), rename it back to
    // admin@callcatch.com so the operator's data is preserved. The brand-new
    // demo account (read-only, for showing the guys) is created fresh below.
    const legacyDemo = await db.select().from(users).where(eq(users.email, 'demo'));
    const adminAlready = await db.select().from(users).where(eq(users.email, 'admin@callcatch.com'));
    if (legacyDemo.length > 0 && adminAlready.length === 0) {
      await db.update(users).set({ email: 'admin@callcatch.com' }).where(eq(users.id, legacyDemo[0].id));
      log("Bootstrap: renamed legacy 'demo' user back to admin@callcatch.com");
    }

    // Rebrand migration (TradieCatch → CallCatch): rename the legacy admin
    // record so the operator keeps all their data, settings, and history
    // under the new brand email. Runs once; the second lookup just no-ops.
    const legacyAdmin = await db.select().from(users).where(eq(users.email, 'admin@tradiecatch.com'));
    const newAdminExists = await db.select().from(users).where(eq(users.email, 'admin@callcatch.com'));
    if (legacyAdmin.length > 0 && newAdminExists.length === 0) {
      await db.update(users).set({ email: 'admin@callcatch.com' }).where(eq(users.id, legacyAdmin[0].id));
      log("Bootstrap: migrated admin@tradiecatch.com → admin@callcatch.com");
    } else if (legacyAdmin.length > 0 && newAdminExists.length > 0) {
      // Both exist (shouldn't happen, but be defensive): delete the stale
      // legacy record so the unique-email constraint isn't violated later.
      await db.delete(users).where(eq(users.id, legacyAdmin[0].id));
      log("Bootstrap: removed duplicate legacy admin@tradiecatch.com record");
    }

    // Ensure the admin account exists (creating it if this is a fresh DB) and
    // that its password is set to the env-configurable value (or 'admin123' by
    // default). On startup we always reset it so the operator can recover access
    // by editing the env var.
    let admin = (await db.select().from(users).where(eq(users.email, 'admin@callcatch.com')))[0];
    const adminPwd = process.env.ADMIN_PASSWORD || 'admin123';
    if (!admin) {
      const hash = await bcrypt.hash(adminPwd, 12);
      [admin] = await db.insert(users).values({
        email: 'admin@callcatch.com',
        username: 'CallCatch Admin',
        password: hash,
        mustChangePassword: false,
        acceptedTermsAt: new Date(),
      }).returning();
      log('Bootstrap: created admin@callcatch.com');
    } else {
      const newHash = await bcrypt.hash(adminPwd, 12);
      await db.update(users).set({ password: newHash, mustChangePassword: false }).where(eq(users.id, admin.id));
      log('Bootstrap: admin@callcatch.com password reset');
    }

    // Make sure the admin has a settings row with the operator's Twilio number.
    let adminSettings = (await db.select().from(settings).where(eq(settings.userId, admin.id)))[0];
    if (!adminSettings) {
      [adminSettings] = await db.insert(settings).values({
        userId: admin.id,
        businessName: 'CallCatch',
        autoReplyEnabled: true,
        bookingCalendarEnabled: true,
        bookingSlots: ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"],
        services: DEFAULT_SERVICES,
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
        twilioPhoneNumber: twilioPhone,
      }).returning();
      log('Bootstrap: created admin settings row');
    } else if (!adminSettings.twilioPhoneNumber) {
      await db.update(settings).set({
        twilioPhoneNumber: twilioPhone,
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
      }).where(eq(settings.userId, admin.id));
      adminSettings = (await db.select().from(settings).where(eq(settings.userId, admin.id)))[0];
      log('Bootstrap: backfilled Twilio details on admin settings');
    }

    // Ensure the demo account exists. It mirrors the admin's settings (so the
    // guys see a populated app) but is read-only — server-side blockDemo
    // middleware refuses any state-changing call, and the Settings tab is
    // hidden in the UI.
    let demo = (await db.select().from(users).where(eq(users.email, 'demo')))[0];
    const demoPwd = process.env.DEMO_PASSWORD || '123';
    if (!demo) {
      const hash = await bcrypt.hash(demoPwd, 12);
      [demo] = await db.insert(users).values({
        email: 'demo',
        username: 'CallCatch Demo',
        password: hash,
        mustChangePassword: false,
        acceptedTermsAt: new Date(),
      }).returning();
      log('Bootstrap: created demo user');
    } else {
      const newHash = await bcrypt.hash(demoPwd, 12);
      await db.update(users).set({ password: newHash, mustChangePassword: false }).where(eq(users.id, demo.id));
    }

    // Mirror admin's settings into the demo account so the demo screens look
    // populated and realistic. We refresh on every startup so the demo always
    // reflects the live config.
    const existingDemoSettings = (await db.select().from(settings).where(eq(settings.userId, demo.id)))[0];
    const mirroredFields = {
      businessName: adminSettings?.businessName ?? 'CallCatch',
      autoReplyEnabled: adminSettings?.autoReplyEnabled ?? true,
      bookingCalendarEnabled: adminSettings?.bookingCalendarEnabled ?? true,
      bookingSlots: adminSettings?.bookingSlots ?? ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"],
      services: adminSettings?.services ?? DEFAULT_SERVICES,
      // SECURITY: never mirror real Twilio credentials into the demo account.
      // The demo password (`demo`/`123`) is intentionally well-known so anyone
      // can poke around; copying the operator's SID + auth token in here would
      // hand those creds to anyone who logs in as demo.
      // ROUTING: also leave twilioPhoneNumber blank on demo. If demo holds the
      // same number as admin, inbound Twilio webhooks (which look up the owner
      // by `To` number) can resolve to demo instead of admin and then SMS
      // sends fail with Twilio "Authenticate" because demo has no creds. Demo
      // is read-only and never receives real inbound calls, so it doesn't
      // need a phone number on its settings row.
      twilioAccountSid: '',
      twilioAuthToken: '',
      twilioPhoneNumber: '',
      missedCallVoiceMessage: adminSettings?.missedCallVoiceMessage ?? null,
      voiceRecordingData: adminSettings?.voiceRecordingData ?? null,
      voiceRecordingMimeType: adminSettings?.voiceRecordingMimeType ?? null,
      baseAddress: adminSettings?.baseAddress ?? null,
      baseLat: adminSettings?.baseLat ?? null,
      baseLng: adminSettings?.baseLng ?? null,
      serviceRadiusKm: adminSettings?.serviceRadiusKm ?? 30,
    };
    if (!existingDemoSettings) {
      await db.insert(settings).values({ userId: demo.id, ...mirroredFields });
      log('Bootstrap: created demo settings (mirrored from admin)');
    } else {
      await db.update(settings).set(mirroredFields).where(eq(settings.userId, demo.id));
      log('Bootstrap: refreshed demo settings to mirror admin');
    }

    // Mirror admin's missed_calls + jobs into the demo account so the demo
    // screens always reflect the live activity. Refreshed on every startup:
    // wipe demo's existing rows, then re-copy admin's. Voicemail audio fields
    // are blanked out because demo doesn't have admin's Twilio creds and
    // cannot stream the recording back. Job-to-call links are re-mapped to
    // the new demo missed_call ids so "View Chat" still works.
    try {
      // One-shot rescue: any inbound calls/jobs that landed on demo by mistake
      // (back when demo's settings row also held the admin's twilio number)
      // get reassigned to admin BEFORE we wipe demo's mirror data. Without
      // this, the wipe below would permanently delete real customer calls.
      // Skip rows that already exist on admin at the same phone+timestamp so
      // we don't create duplicates if this runs more than once.
      const orphanCalls = await db.select().from(missedCalls).where(eq(missedCalls.userId, demo.id));
      let rescued = 0;
      for (const c of orphanCalls) {
        const dup = await db.select().from(missedCalls).where(and(
          eq(missedCalls.userId, admin.id),
          eq(missedCalls.phoneNumber, c.phoneNumber),
          eq(missedCalls.timestamp, c.timestamp),
        ));
        if (dup.length === 0) {
          await db.update(missedCalls).set({ userId: admin.id }).where(eq(missedCalls.id, c.id));
          rescued++;
        }
      }
      const orphanJobs = await db.select().from(jobs).where(eq(jobs.userId, demo.id));
      let jobsRescued = 0;
      for (const j of orphanJobs) {
        const dup = await db.select().from(jobs).where(and(
          eq(jobs.userId, admin.id),
          eq(jobs.phoneNumber, j.phoneNumber),
          eq(jobs.date, j.date),
          eq(jobs.time, j.time),
        ));
        if (dup.length === 0) {
          await db.update(jobs).set({ userId: admin.id }).where(eq(jobs.id, j.id));
          jobsRescued++;
        }
      }
      if (rescued > 0 || jobsRescued > 0) {
        log(`Bootstrap: rescued ${rescued} call(s) + ${jobsRescued} job(s) from demo back to admin`);
      }

      await db.delete(jobs).where(eq(jobs.userId, demo.id));
      await db.delete(missedCalls).where(eq(missedCalls.userId, demo.id));

      const adminCalls = await db.select().from(missedCalls).where(eq(missedCalls.userId, admin.id));
      const idMap = new Map<string, string>();
      for (const c of adminCalls) {
        const [inserted] = await db.insert(missedCalls).values({
          userId: demo.id,
          callerName: c.callerName,
          phoneNumber: c.phoneNumber,
          timestamp: c.timestamp,
          replied: c.replied,
          repliedAt: c.repliedAt,
          jobBooked: c.jobBooked,
          conversationState: c.conversationState,
          selectedService: c.selectedService,
          selectedSubOption: c.selectedSubOption,
          selectedTime: c.selectedTime,
          jobAddress: c.jobAddress,
          isUrgent: c.isUrgent,
          callerEmail: c.callerEmail,
          conversationLog: c.conversationLog,
          voicemailData: null,
          voicemailMimeType: null,
          voicemailDurationSeconds: c.voicemailDurationSeconds,
          recordingSid: null,
        }).returning({ id: missedCalls.id });
        idMap.set(c.id, inserted.id);
      }

      const adminJobs = await db.select().from(jobs).where(eq(jobs.userId, admin.id));
      for (const j of adminJobs) {
        await db.insert(jobs).values({
          userId: demo.id,
          callerName: j.callerName,
          phoneNumber: j.phoneNumber,
          jobType: j.jobType,
          date: j.date,
          time: j.time,
          address: j.address,
          notes: j.notes,
          email: j.email,
          status: j.status,
          createdAt: j.createdAt,
          missedCallId: j.missedCallId ? (idMap.get(j.missedCallId) ?? null) : null,
          isUrgent: j.isUrgent,
        });
      }
      log(`Bootstrap: mirrored ${adminCalls.length} call(s) + ${adminJobs.length} job(s) from admin into demo`);
    } catch (mirrorErr) {
      console.error('Bootstrap: failed to mirror admin calls/jobs into demo:', mirrorErr);
    }
  } catch (err) {
    console.error('Bootstrap error:', err);
  }
}

// Re-mirror admin's calls + jobs into the demo account. Used both at
// bootstrap and at runtime so brand-new missed calls show up in demo
// without waiting for a backend restart. Cheap (tiny tables) and
// debounced via syncDemoFromAdminSoon() so a burst of Twilio webhooks
// only triggers one resync.
async function syncDemoFromAdmin(): Promise<void> {
  try {
    const admin = (await db.select().from(users).where(eq(users.email, 'admin@callcatch.com')))[0];
    const demo = (await db.select().from(users).where(eq(users.email, 'demo')))[0];
    if (!admin || !demo) return;

    await db.delete(jobs).where(eq(jobs.userId, demo.id));
    await db.delete(missedCalls).where(eq(missedCalls.userId, demo.id));

    const adminCalls = await db.select().from(missedCalls).where(eq(missedCalls.userId, admin.id));
    const idMap = new Map<string, string>();
    for (const c of adminCalls) {
      const [inserted] = await db.insert(missedCalls).values({
        userId: demo.id,
        callerName: c.callerName,
        phoneNumber: c.phoneNumber,
        timestamp: c.timestamp,
        replied: c.replied,
        repliedAt: c.repliedAt,
        jobBooked: c.jobBooked,
        conversationState: c.conversationState,
        selectedService: c.selectedService,
        selectedSubOption: c.selectedSubOption,
        selectedTime: c.selectedTime,
        jobAddress: c.jobAddress,
        isUrgent: c.isUrgent,
        callerEmail: c.callerEmail,
        conversationLog: c.conversationLog,
        voicemailData: null,
        voicemailMimeType: null,
        voicemailDurationSeconds: c.voicemailDurationSeconds,
        recordingSid: null,
      }).returning({ id: missedCalls.id });
      idMap.set(c.id, inserted.id);
    }

    const adminJobs = await db.select().from(jobs).where(eq(jobs.userId, admin.id));
    for (const j of adminJobs) {
      await db.insert(jobs).values({
        userId: demo.id,
        callerName: j.callerName,
        phoneNumber: j.phoneNumber,
        jobType: j.jobType,
        date: j.date,
        time: j.time,
        address: j.address,
        notes: j.notes,
        email: j.email,
        status: j.status,
        createdAt: j.createdAt,
        missedCallId: j.missedCallId ? (idMap.get(j.missedCallId) ?? null) : null,
        isUrgent: j.isUrgent,
      });
    }
  } catch (err) {
    console.error('syncDemoFromAdmin failed:', err);
  }
}

// Debounced trigger: collapses bursts of Twilio webhooks (each SMS reply
// fires one) into a single resync ~2s later. Fire-and-forget.
let _demoSyncTimer: NodeJS.Timeout | null = null;
export function syncDemoFromAdminSoon(): void {
  if (_demoSyncTimer) clearTimeout(_demoSyncTimer);
  _demoSyncTimer = setTimeout(() => {
    _demoSyncTimer = null;
    void syncDemoFromAdmin();
  }, 2000);
}


async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL required for Stripe integration');
    return;
  }

  try {
    log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl, schema: 'stripe' });
    log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    const webhookResult = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`
    );
    log(`Stripe webhook configured: ${JSON.stringify(webhookResult?.webhook?.url || 'ok')}`);

    stripeSync.syncBackfill()
      .then(() => log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

(async () => {
  setupCors(app);

  app.get('/healthz', (_req, res) => {
    res.status(200).send('ok');
  });

  app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const signature = req.headers['stripe-signature'];
      if (!signature) {
        return res.status(400).json({ error: 'Missing stripe-signature' });
      }
      try {
        const sig = Array.isArray(signature) ? signature[0] : signature;
        if (!Buffer.isBuffer(req.body)) {
          console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
          return res.status(500).json({ error: 'Webhook processing error' });
        }
        await WebhookHandlers.processWebhook(req.body as Buffer, sig);

        res.status(200).json({ received: true });
      } catch (error: any) {
        console.error('Webhook error:', error.message);
        res.status(400).json({ error: 'Webhook processing error' });
      }
    }
  );

  setupBodyParsing(app);
  setupRequestLogging(app);

  // After any Twilio webhook OR any admin write to calls/jobs, schedule
  // a debounced re-mirror of admin → demo so new missed calls and SMS
  // replies show up in the demo account without needing a backend restart.
  app.use((req, res, next) => {
    const p = req.path;
    const isMutation = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    const shouldSync =
      p.startsWith('/api/twilio/') ||
      (isMutation && (p.startsWith('/api/missed-calls') || p.startsWith('/api/jobs')));
    if (shouldSync) {
      res.on('finish', () => {
        if (res.statusCode < 500) syncDemoFromAdminSoon();
      });
    }
    next();
  });

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || process.env.CLOUD_RUN_PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
      bootstrapDefaultUser()
        .then(() => initStripe())
        .catch(err => console.error('Startup init error (non-fatal):', err));
    },
  );
})();
