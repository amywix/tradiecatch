# CallCatch

## Overview
CallCatch is a multi-tenant SaaS mobile application designed for tradespeople, specifically electricians, to streamline their business operations. It helps manage missed calls, automate SMS follow-ups, and book jobs efficiently. The platform aims to reduce administrative burden for tradies, improve customer communication, and ultimately increase job bookings and revenue. Each tradie operates with a dedicated, isolated account, managing their own Twilio credentials and customer interactions.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Functionality
CallCatch operates on a core workflow: tradies log in, missed calls are recorded and tied to their account, an automated SMS conversation with the caller is initiated via Twilio, and jobs are created from these completed conversations. Tradies can then manage these jobs through various statuses.

### Operator-Provisioned Accounts
There is **no public registration**. The operator (`admin@callcatch.com`, default password `admin123` / overridable via the `ADMIN_PASSWORD` env var) provisions every tradie account from inside the app via Settings → "Create Tradie Account" (`app/admin-create-tradie.tsx` → `POST /api/admin/create-tradie`, gated by the `requireAdmin` middleware in `server/auth.ts`). The form captures everything from the sales-form intake: business name, login email, temporary password, the dedicated business phone number assigned to them, base address (geocoded), service radius, services list, and optional Twilio credential overrides (otherwise env-fallback is used). New accounts are created with `mustChangePassword: true` so the tradie's only first-login task is choosing their own password on the forced `app/change-password.tsx` screen — the AuthGate in `app/_layout.tsx` blocks every other route until that's done. The tradie-facing Settings tab shows the dedicated phone number as a read-only "Your business phone number" card; the full Twilio editor is only rendered when `user.email === 'admin@callcatch.com'`. The Twilio webhook URLs are configured by the operator inside the Twilio console (not exposed in-app).

### Demo Account
A second login (`demo` / default password `123` / overridable via the `DEMO_PASSWORD` env var) exists for showing the app to prospects. On every backend startup the bootstrap mirrors the admin's settings (business name, services, Twilio number, voice greeting, base address/radius, etc.) into the demo account so the demo always reflects the live setup. The demo is **strictly read-only**: the Settings tab is hidden in `app/(tabs)/_layout.tsx` (and `app/(tabs)/settings.tsx` redirects to `/(tabs)` if a demo user lands on that route via deep link), and server-side every mutation endpoint that touches user state (`PATCH /api/settings`, `PUT /api/services`, `POST/DELETE /api/settings/voice-recording`) is wrapped in the `blockDemo` middleware in `server/auth.ts`, returning `403 { code: "DEMO_READONLY" }` for the `demo` account.

### Authentication & Multi-Tenancy
The system uses JWT-based authentication with bcrypt hashing. Each user's data is isolated via a `userId` column in all relevant tables. JWTs are stored in AsyncStorage for frontend authentication, and API requests include the token for verification. Twilio credentials are operator-managed, with per-account overrides supported in settings and an env-variable fallback used by default.

`requireAuth` in `server/auth.ts` enforces two gates server-side: (1) valid JWT, and (2) if `user.mustChangePassword === true`, every route is blocked with 403 `{ code: "MUST_CHANGE_PASSWORD" }` except a small allowlist (`/api/auth/me`, `/api/auth/change-password`, `/api/auth/accept-terms`, `/api/auth/logout`). `PATCH /api/settings` additionally blocks any tradie attempt to write `twilioAccountSid`/`twilioAuthToken`/`twilioPhoneNumber` (only `demo` may write Twilio fields). The frontend `AuthGate` redirect to `/change-password` is a UX layer — the server is the source of truth.

### Voicemail Access Control
Voicemail playback URLs are bound to a specific `callId` via an HMAC-SHA256 signature over `${callId}.${exp}` using `JWT_SECRET`. `GET /api/voicemail/:id` accepts either (a) a valid `?t=…&exp=…` signed token (no auth header needed — used in the SMS link to the tradie, TTL 14 days), or (b) a Bearer JWT whose `userId` matches the call's owner. The in-app "Play voicemail" button calls `GET /api/voicemail/:id/link` (auth + ownership) which returns a short-lived signed URL (10 min) that the client opens via `Linking.openURL`. There is no public-by-id access path.

### Frontend (Expo/React Native)
The mobile application is built with Expo SDK 54 and React Native 0.81, utilizing expo-router v6 for file-based routing and a tab-based navigation system (Calls, Jobs, Settings). State management is handled by React Context and TanStack React Query for data fetching and caching. The UI features a professional dark blue and orange accent color scheme, with Inter fonts, targeting iOS and Android with web compatibility.

### Backend (Express.js)
The backend is an Express v5 server, providing a RESTful JSON API. Authentication is enforced via `requireAuth` middleware. The server uses esbuild for production bundling and tsx for development. CORS is dynamically configured to support Replit and local development. Key API endpoints support CRUD operations for missed calls, jobs, SMS templates, user settings, and services, along with Twilio webhooks for SMS and voice.

### Database (PostgreSQL + Drizzle ORM)
PostgreSQL is the primary data store, managed with Drizzle ORM. The schema includes tables for `users`, `missed_calls`, `jobs`, `sms_templates`, and `settings`, all linked by `userId` for multi-tenancy. Migrations are managed via `drizzle-kit push`, and `drizzle-zod` is used for validation.

### Key Features

#### Voice Recording
Tradies can record a custom voicemail greeting via the app, which is uploaded and stored as base64 data. This recording is then served publicly for Twilio to use in voice calls, offering a personalized touch over text-to-speech.

#### Voicemail (On-Demand Streaming + IVR Gate)
Voicemail recordings are **not** stored on CallCatch servers. The voice flow is an IVR: after the greeting plays, the caller hears "To leave a voicemail, press 1. Otherwise, just hang up and we'll text you shortly." If they press 1, Twilio posts to `/api/twilio/voicemail-choice` which returns a `<Record>` TwiML; any other input (or timeout) returns `<Hangup/>` so no voicemail is recorded. The recording webhook also drops anything under 2 seconds, so empty/silent recordings never trigger an SMS. Real recordings save only the `recordingSid` to the `missed_calls` table — no audio bytes are persisted. When the tradie taps the voicemail link in the app, `/api/voicemail/:id` proxies the audio from Twilio's API on demand using the operator's Twilio basic-auth credentials, streaming the bytes back to the client. Legacy missed_calls that still have `voicemailData` populated continue to work via a fallback path.

#### SMS Conversation Engine
A state machine manages automated SMS conversations, guiding callers through service selection, urgency, address collection, and booking preferences. Services are dynamic and configurable by the user. The engine automatically creates jobs upon conversation completion.

#### Services Management
Tradies can customize their list of services, stored as a JSONB array within their settings. This allows for dynamic service offerings and tailored conversation flows.

#### Service Area (Base Location + Travel Radius)
Each tradie's base address and travel radius (km) are captured by the operator on the "Create Tradie Account" form and editable later by the tradie in Settings → Service Area. The backend geocodes the address via OpenStreetMap Nominatim (free, no API key) and stores `baseLat`/`baseLng` alongside `serviceRadiusKm` on the settings table. When a customer's address comes in via the SMS conversation flow (`awaiting_address`), the server geocodes it, computes the haversine distance to the tradie's base, and:
- If **within** radius (or no base configured / address can't be geocoded): conversation continues normally to email + booking.
- If **outside** radius: replies with an out-of-area message (including the actual distance), sets the conversation to `completed`, marks `selectedTime = "Out of service area — manual review"`, does NOT create a job, and pushes a notification ("⚠️ Out-of-area enquiry") to the tradie so they can review manually.
The geocoding endpoint is `POST /api/settings/geocode` (used by both the operator's "Create Tradie Account" screen and the tradie's Settings to validate addresses before saving).

#### Subscription System (Stripe)
The application integrates with Stripe for subscription management. Sales/payments are handled manually outside the app via Stripe payment links — the in-app paywall no longer displays prices or runs an in-app checkout. When a tradie signs up, the app gates access via the paywall screen until their Stripe subscription is active. The `/api/stripe/subscription-status` endpoint checks Stripe directly and, if the user has no `stripeCustomerId` linked yet, looks up Stripe customers by email and auto-links any active subscription to that account. This means: create a Stripe customer + subscription for the tradie's email (via a Stripe payment link or directly in Stripe), and as soon as they tap "I've Paid — Activate Account" on the paywall, the app finds the active subscription and unlocks. If the subscription becomes inactive (cancelled/past_due), the app re-checks on every foreground and redirects them back to the paywall. Customer portal is still available from Settings for subscribers.

#### Web Access (no app store required)
The Expo app is also served as a web app via the Express server, so tradies can sign up and use the full product (calls, jobs, settings, voice greeting, SMS flow) directly from a browser at the published URL. This removes the App Store / Play Store dependency for early SaaS sign-ups.

## External Dependencies

### Twilio
- **Purpose**: Sending and receiving SMS messages, automated conversations, and voice call handling.
- **Configuration**: Per-user credentials (Account SID, Auth Token, Phone Number) stored in settings, with environment variable fallbacks.

### PostgreSQL
- **Purpose**: Primary relational database for all application data.
- **Connection**: Via `DATABASE_URL` environment variable.

### Stripe
- **Purpose**: Payment processing, subscription management, and customer portal.
- **Integration**: `stripe` and `stripe-replit-sync` NPM packages, webhooks, and client-side integration for checkout and portal.

### NPM Dependencies (Key Examples)
- **expo**: Core framework for mobile development.
- **expo-router**: File-based routing for the frontend.
- **express**: Backend web application framework.
- **drizzle-orm**: Object-relational mapper for PostgreSQL.
- **@tanstack/react-query**: Data fetching and caching for the frontend.
- **twilio**: Official library for interacting with the Twilio API.
- **patch-package**: Utility for applying patches to npm dependencies.