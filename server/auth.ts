import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { users, settings, DEFAULT_SERVICES, TERMS_VERSION } from "@shared/schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "tradiecatch-jwt-secret-change-in-production";
const JWT_EXPIRES_IN = "30d";

export interface AuthRequest extends Request {
  userId?: string;
}

function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Admin-only: create a fully pre-configured tradie account.
 * The operator collects business name, address, service radius, services, and the
 * Twilio number assigned to this tradie via a sales-form intake. We provision
 * everything here and hand the email + temp password to the tradie. On their
 * first login they will be forced to change the password (mustChangePassword is
 * true by default in the schema).
 */
export async function createTradie(req: AuthRequest, res: Response) {
  const {
    email,
    password,
    businessName,
    twilioPhoneNumber,
    twilioAccountSid,
    twilioAuthToken,
    baseAddress,
    serviceRadiusKm,
    services,
  } = req.body || {};

  if (!email || !password || !businessName) {
    return res.status(400).json({ error: "Email, business name, and temporary password are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Temporary password must be at least 6 characters" });
  }

  try {
    const existingEmail = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
    if (existingEmail.length > 0) {
      return res.status(400).json({ error: "An account with this email already exists" });
    }

    const existingUsername = await db.select().from(users).where(eq(users.username, businessName.trim()));
    if (existingUsername.length > 0) {
      return res.status(400).json({ error: "An account with this business name already exists" });
    }

    let baseLat: number | null = null;
    let baseLng: number | null = null;
    const trimmedAddress = (baseAddress || "").trim();
    if (trimmedAddress) {
      try {
        const { geocodeAddress } = await import("./geo");
        const geo = await geocodeAddress(trimmedAddress);
        if (geo) {
          baseLat = geo.lat;
          baseLng = geo.lng;
        }
      } catch (err) {
        console.error("createTradie geocode failed:", err);
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [user] = await db.insert(users).values({
      email: email.toLowerCase().trim(),
      username: businessName.trim(),
      password: hashedPassword,
      mustChangePassword: true,
    }).returning();

    await db.insert(settings).values({
      userId: user.id,
      businessName: businessName.trim(),
      autoReplyEnabled: true,
      bookingCalendarEnabled: true,
      bookingSlots: ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"],
      services: Array.isArray(services) && services.length > 0 ? services : DEFAULT_SERVICES,
      twilioAccountSid: (twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || "").trim(),
      twilioAuthToken: (twilioAuthToken || process.env.TWILIO_AUTH_TOKEN || "").trim(),
      twilioPhoneNumber: (twilioPhoneNumber || "").trim(),
      baseAddress: trimmedAddress,
      baseLat,
      baseLng,
      serviceRadiusKm: typeof serviceRadiusKm === "number" && serviceRadiusKm > 0 ? Math.floor(serviceRadiusKm) : 30,
    });

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      geocoded: baseLat != null && baseLng != null,
    });
  } catch (err: any) {
    console.error("createTradie error:", err);
    res.status(500).json({ error: "Could not create tradie account. Please try again." });
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const normalisedEmail = email.toLowerCase().trim();

  // Demo logon is disabled.
  if (normalisedEmail === "demo") {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.email, normalisedEmail));

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        mustChangePassword: user.mustChangePassword,
        acceptedTermsAt: user.acceptedTermsAt ? user.acceptedTermsAt.toISOString() : null,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!));
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      mustChangePassword: user.mustChangePassword,
      acceptedTermsAt: user.acceptedTermsAt ? user.acceptedTermsAt.toISOString() : null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
}

export async function changePassword(req: AuthRequest, res: Response) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!));
    if (!user) return res.status(404).json({ error: "User not found" });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(400).json({ error: "Current password is incorrect" });

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: "New password must be different from your current password" });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await db.update(users)
      .set({ password: newHash, mustChangePassword: false })
      .where(eq(users.id, user.id));

    res.json({ ok: true });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Could not change password. Please try again." });
  }
}

export async function acceptTerms(req: AuthRequest, res: Response) {
  try {
    await db.update(users)
      .set({
        acceptedTermsAt: new Date(),
        acceptedTermsVersion: TERMS_VERSION,
      })
      .where(eq(users.id, req.userId!));
    res.json({ ok: true, acceptedAt: new Date().toISOString(), version: TERMS_VERSION });
  } catch (err) {
    console.error("Accept terms error:", err);
    res.status(500).json({ error: "Could not record terms acceptance. Please try again." });
  }
}

/**
 * Endpoints that an authenticated user can hit even when their account still
 * has mustChangePassword=true (so they can finish first-login setup).
 */
const PASSWORD_GATE_ALLOWLIST: ReadonlyArray<string> = [
  "/api/auth/me",
  "/api/auth/change-password",
  "/api/auth/accept-terms",
  "/api/auth/logout",
];

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];

  let userId: string;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    userId = decoded.userId;
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.userId = userId;

  // Server-side first-login gate: block everything except the allow-list
  // until the user has chosen their own password.
  try {
    const path = req.originalUrl.split("?")[0];
    if (!PASSWORD_GATE_ALLOWLIST.includes(path)) {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(401).json({ error: "Authentication required" });
      if (user.mustChangePassword) {
        return res.status(403).json({
          error: "Password change required",
          code: "MUST_CHANGE_PASSWORD",
        });
      }
    }
  } catch (err) {
    console.error("requireAuth password-gate error:", err);
    return res.status(500).json({ error: "Authorization check failed" });
  }

  next();
}

export const ADMIN_EMAIL = "admin@callcatch.com";
export const DEMO_EMAIL = "demo";

/**
 * Operator-only middleware. Run AFTER requireAuth. Confirms the authenticated
 * user is the operator account (single admin email). Used to gate endpoints
 * like creating tradie accounts.
 */
export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.userId) return res.status(401).json({ error: "Authentication required" });
    const [user] = await db.select().from(users).where(eq(users.id, req.userId));
    if (!user) return res.status(401).json({ error: "Authentication required" });
    if (user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  } catch (err) {
    console.error("requireAdmin error:", err);
    return res.status(500).json({ error: "Authorization check failed" });
  }
}

/**
 * Demo lockdown middleware. Run AFTER requireAuth. Blocks the demo account
 * from making any state-changing call (settings updates, voice recording
 * uploads, services updates, etc.). The demo account is read-only — the guys
 * can browse the app to see how it works, but they can't accidentally edit
 * the live tradie's configuration.
 */
export async function blockDemo(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.userId) return res.status(401).json({ error: "Authentication required" });
    const [user] = await db.select().from(users).where(eq(users.id, req.userId));
    if (!user) return res.status(401).json({ error: "Authentication required" });
    if (user.email === DEMO_EMAIL) {
      return res.status(403).json({ error: "Demo account is read-only", code: "DEMO_READONLY" });
    }
    next();
  } catch (err) {
    console.error("blockDemo error:", err);
    return res.status(500).json({ error: "Authorization check failed" });
  }
}

