# CallCatch — Complete User Manual

_Last updated: May 2026_

---

## Table of Contents

1. [What is CallCatch?](#1-what-is-callcatch)
2. [Getting Started](#2-getting-started)
3. [Privacy & Terms](#3-privacy--terms)
4. [What's Already Set Up For You](#4-whats-already-set-up-for-you)
5. [First Login](#5-first-login)
6. [The Calls Tab](#6-the-calls-tab)
7. [How the Automated SMS Bot Works](#7-how-the-automated-sms-bot-works)
8. [Service Area & Travel Radius](#8-service-area--travel-radius)
9. [The Jobs Tab](#9-the-jobs-tab)
10. [The Settings Tab](#10-the-settings-tab)
11. [Managing Your Services](#11-managing-your-services)
12. [Booking Calendar Options](#12-booking-calendar-options)
13. [Voice Greeting & Voicemail](#13-voice-greeting--voicemail)
14. [Subscription & Billing](#14-subscription--billing)
15. [Using CallCatch on the Web](#15-using-callcatch-on-the-web)
16. [Frequently Asked Questions](#16-frequently-asked-questions)

---

## 1. What is CallCatch?

CallCatch is an app for tradespeople (electricians, plumbers, etc.) that automatically handles missed calls so you never lose a job lead again.

**Here's what happens when someone calls and you can't answer:**

1. Your dedicated CallCatch business number picks up and plays your greeting
2. The caller is offered a choice — "press 1 to leave a voicemail, otherwise just hang up and we'll text you shortly". Voicemail is opt-in: anyone who doesn't press 1 is hung up on without recording. If they do press 1, the recording lives on the phone-system side and is streamed to you on demand when you tap the link in the app, so nothing audio sits on our servers
3. CallCatch instantly sends them an SMS to follow up
4. An automated conversation gathers their name, the job, the address, their email, and a preferred time
5. If the address is inside your travel area, the bot books the job and you get notified
6. If the address is outside your travel area, the bot politely tells the customer and flags it for you to review manually

You don't have to do anything while you're on the tools — the bot handles it all.

---

## 2. Getting Started

### How accounts are created

CallCatch is fully managed. You don't sign yourself up inside the app — once you've spoken with us and your subscription is sorted, we set up your account for you and email you a temporary password. There is no public signup form.

### Logging in for the first time

1. Open the CallCatch app (or open the web version in a browser)
2. Tap **Sign In**
3. Enter the email address we used to create your account, and the temporary password we sent you
4. The app will immediately ask you to set a new password of your own — this is a one-time step. After that, you're in.

Your login is saved — you won't need to sign in again each time you open the app unless you tap Sign Out from Settings.

### What Happens Next

Once your password is set, the app checks your subscription. If it isn't active yet, you'll land on the paywall screen — see [Subscription & Billing](#14-subscription--billing).

Once your subscription is active, the app drops you straight into the **Calls** tab. There's no setup wizard to sit through — your phone number, business name, service area and services list have all been configured for you in advance.

---

## 3. Privacy & Terms

When your account is provisioned, you're bound by two documents:

- **Terms of Service** — the rules for using CallCatch (subscription, billing, lawful use, your obligations under the Spam Act, etc.)
- **Privacy Policy** — what data we collect, how it's stored, and your rights

You can read both anytime from **Settings → About → Terms of Service / Privacy Policy**.

If we ever update the terms in a meaningful way, we'll let you know in the app.

A few things worth knowing in plain language:

- **You own your customer data.** Customer phone numbers, addresses, emails, and job details collected via the SMS bot live in your account only. We don't sell or share that data.
- **Your phone number, SMS and voice minutes are included** in your CallCatch subscription, up to a fair-use cap (1,000 SMS per month and 500 voice minutes per month). You won't get a separate Twilio bill. If your usage consistently goes over the cap we'll talk to you about a higher tier first — we won't silently bill you extra.
- **You're responsible for your messaging** under Australia's Spam Act 2003. Because the bot only replies to people who already called or texted you, you have inferred consent — but it's still your business and your responsibility.
- **Voicemail audio is not stored on our servers.** Recordings live on the phone-system side and are streamed to you on demand when you tap the link in the app.
- **Your password** is stored as a one-way encrypted hash. Even we can't see it. The temporary password we email you is replaced with one only you know on your first login.

---

## 4. What's Already Set Up For You

When your account is provisioned, the following is done for you up-front — there is nothing to configure on day one:

| What | Done by us |
|---|---|
| Your dedicated business phone number | Provisioned and connected |
| SMS and voice routing (webhooks) | Configured |
| Your business name (used in SMS to customers) | Set from your sign-up details |
| Your base address + travel radius | Set from your sign-up details |
| Your default services list | Pre-loaded — you can edit anytime in Settings |
| Voicemail-on-demand streaming | Connected |

Everything above can still be changed by you later from the **Settings** tab if your business details change (new address, larger service area, new services, etc.) — except the phone number itself, which is managed by us. Just contact us if you need that changed.

---

## 5. First Login

Your first login is the only setup step on your side, and it takes about 30 seconds:

1. Open the app and tap **Sign In**
2. Enter the email + temporary password we sent you
3. You'll be taken to the **Set your password** screen — type a new password (at least 6 characters) and confirm it
4. Tap **Save** — you're now in the **Calls** tab and the app is live

That's it. The app is already set up for you and ready to handle missed calls from this point on.

---

## 6. The Calls Tab

This is your main dashboard. Every call that comes in through your dedicated business number appears here.

### What You See on Each Call Card

- **Caller name** (collected by the bot once they reply)
- **Phone number**
- **Time** the call came in
- **Status badges:**
  - **Unreplied** — no SMS sent yet
  - **SMS Sent** — bot has contacted the caller
  - **Job Booked** — a job was created from this call
  - **URGENT** — caller indicated it's an emergency

### Conversation Status

Under each call you can see exactly where the automated conversation is up to:

- "Awaiting reply"
- "Awaiting service selection"
- "Awaiting address"
- "Awaiting email"
- "Booking complete"
- "Out of service area — manual review" _(see [Service Area](#8-service-area--travel-radius))_

### Actions Available

| Button | What it does |
|---|---|
| **Send SMS** | Manually triggers the automated bot for this call |
| **View Chat** | Opens the full SMS conversation history |
| **Book** | Manually create a job for this caller |
| **Delete** | Remove the call from the list |

### Manually Adding a Missed Call

If someone called your personal number instead of your CallCatch business number, you can log it manually:

1. Tap the **+** button in the top right
2. Enter the caller's name and phone number
3. Tap **Add Call**
4. Then tap **Send SMS** to start the automated conversation

### Signing Out

Tap the small log-out icon at the top right of the Calls header (just to the right of the **+** button). You'll get a confirm dialog before being signed out and returned to the login screen. The same log-out icon is also on the Jobs header for convenience.

---

## 7. How the Automated SMS Bot Works

When a missed call comes in, the bot sends a series of SMS messages to the caller to gather what you need to book a job. Here's the flow:

1. **Greeting** — "Hi! Sorry we missed your call! [Business Name]. Can we grab your name to get started?"
2. **Service selection** — "Thanks [Name]! What can we help you with today?" followed by your numbered list of services
3. **Urgency** _(only for service types you've flagged as urgent, like power outages)_ — "Is this an emergency?"
4. **Address** — "What's the address for the job?"
5. **Service-area check** _(automatic, behind the scenes)_:
   - Inside your radius → continues to email
   - Outside your radius → polite "out of service area" message + you get a notification (no job is booked)
6. **Email** — "Almost done! What's the best email address to send confirmation and updates to?"
7. **Booking** — depends on your booking setting (manual time slots, Calendly, or Google Calendar — see [Booking Calendar Options](#12-booking-calendar-options))
8. **Confirmation** — the bot confirms the booking, a job is created in your Jobs tab, and you get a push notification

### What Happens if They Don't Reply?

The conversation stays open. You can pick it up manually from the Calls tab — view the chat, type a reply, or book the job yourself.

---

## 8. Service Area & Travel Radius

This is one of the smartest features in CallCatch — it stops the bot from booking jobs that are too far away to be worth your time.

### How It Works

- Your service area is set up for you during account provisioning. You can change it anytime in **Settings → Service Area**, where you can update:
  - Your **base address** (e.g. "12 Smith St, Parramatta NSW 2150")
  - Your **travel radius** in kilometres (e.g. 30)
- When a customer gives an address in the SMS conversation, the app converts it to a location and measures the distance from your base.
- **If the customer is within your radius**, the conversation continues normally → email → booking → job created.
- **If the customer is outside your radius**, the bot sends them a polite message like:
  > "Thanks for the address (about 703km away). That's outside our usual service area, so we can't auto-book this one. We've passed your details to the electrician — they'll review and get back to you directly."
- No job is created in the Jobs tab. The missed call gets the status "Out of service area — manual review" so you can find it easily.
- You get a **push notification** so you know to take a look.

### Editing Your Service Area Later

1. Go to **Settings → Service Area**
2. Tap the edit icon
3. Update the address or radius
4. Tap **Save**

The app re-checks the address when you save. If the address can't be located, you'll see a warning (and the service-area check is automatically disabled until you fix it — so you don't accidentally lose jobs).

### What if I leave the service area blank?

Then the service-area check is off and the bot books every job regardless of distance. That's fine if you travel anywhere — just leave the address empty.

---

## 9. The Jobs Tab

All confirmed bookings appear here, whether they came from the automated bot or you created them manually.

### Filtering Jobs

Tap the filter buttons at the top to view:

- **All** — every job
- **Pending** — waiting to be confirmed
- **Confirmed** — locked in
- **Done** — completed jobs

### What You See on Each Job Card

- Customer name and phone number
- Job type (e.g., "Ceiling fan install")
- Date and time (if collected)
- Address
- Notes
- Email
- Urgent flag if the caller flagged it as an emergency

### Job Actions

| Button | What it does |
|---|---|
| **Change Status** | Cycle through Pending → Confirmed → Completed → Cancelled |
| **Add to Calendar** | Adds the job to your phone's calendar (or Google Calendar on web) |
| **Delete** | Remove the job |

### Manually Creating a Job

1. From the Calls tab, find the missed call
2. Tap **Book**
3. Fill in the job details (type, date, time, address, notes)
4. Tap **Book Job**

---

## 10. The Settings Tab

This is where you configure everything about how CallCatch works. Sections are listed in the order they appear in the app:

### Business

- **Business name** — shown in SMS messages to customers
- **Tradie mobile number** — your personal number (used for forwarding setup)

### Service Area

- **Base address** + **travel radius (km)** — see [Service Area](#8-service-area--travel-radius)

### Subscription

- Shows your current plan status (Pro / No Active Subscription)
- Tap **Manage** to open the Stripe Customer Portal — update your card, view invoices, or cancel

### Auto-Reply

- **Auto-Reply SMS toggle** — turn the bot on or off

### Your Business Phone Number

A read-only display showing the dedicated business phone number CallCatch is running on your behalf. There's nothing to configure here — if you ever need the number changed, contact us.

### Voice Greeting

Customise the message callers hear before they leave a voicemail (text-to-speech, or record your own voice).

### Booking Calendar

Choose how the bot offers time slots — manual, Calendly, or Google Calendar.

### Services

The list of services the bot offers callers — fully editable.

### Account

- Change password
- Sign out (you can also sign out without coming here — just tap the log-out icon at the top right of the Calls or Jobs header)

### About

- App version
- **Terms of Service** and **Privacy Policy** links

---

## 11. Managing Your Services

The services list is what the bot presents to callers when asking what they need. Customise it to match exactly what you offer.

### Default Services (Electrician example)

1. Power point install / repair
2. Ceiling fan install
3. Lights not working
4. Switchboard issue
5. Power outage / urgent fault
6. Smoke alarm install
7. Other

### Adding a Service

1. Go to **Settings → Services**
2. Tap **Add Service**
3. Type the service name
4. Tap **Save**

### Editing or Deleting

- Tap a service to edit the name
- Use the delete icon to remove

> **Tip:** Keep your most common jobs at the top so callers find them quickly.

---

## 12. Booking Calendar Options

CallCatch gives you three ways to handle booking times in the SMS conversation.

### Option 1: Manual Time Slots (Default)

The bot asks the caller to choose from time slots you've set (e.g., "Morning", "Afternoon", "ASAP" or specific times).

**To set up:**
1. Settings → Booking Calendar → **Manual**
2. Add your available time slots
3. Optionally add specific available dates

### Option 2: Calendly

The bot sends the caller a link to your Calendly page so they can self-book.

**To set up:**
1. Create a Calendly account (free)
2. Settings → Booking Calendar → **Calendly**
3. Paste your Calendly link

### Option 3: Google Calendar

The bot sends a pre-filled Google Calendar link.

**To set up:**
1. Settings → Booking Calendar → **Google Calendar**
2. Paste your Google Calendar booking link

---

## 13. Voice Greeting & Voicemail

When someone calls your CallCatch business number, they hear a greeting first, followed by a short prompt: _"To leave a voicemail, press 1. Otherwise, just hang up and we'll text you shortly."_

- If they **press 1**, they're recorded and the recording stays on the phone-system side. When you tap the voicemail link in the Calls tab, the audio is streamed to you on demand — nothing audio is stored on CallCatch's servers.
- If they **don't press 1** (or just hang up), no voicemail is recorded. The SMS bot still kicks in and follows up with them.
- Anything under 2 seconds (silent recordings, accidental presses) is dropped — you won't get a notification for empty voicemails.

### Option A: Text-to-Speech Greeting (Default)

The app speaks your written message using an automated voice.

1. Settings → Voice Greeting
2. Edit the **Voice Message** field
3. Save

Default message:
> "Sorry we missed your call. We will SMS you now to follow up."

### Option B: Record Your Own Greeting

1. Settings → Voice Greeting
2. Tap **Record Greeting**
3. Speak your message
4. Tap **Stop**, then **Play** to listen back
5. Tap **Save Recording** if you're happy

> Your recorded greeting replaces the text-to-speech. To go back to text-to-speech, delete the recording.

### Listening to a Voicemail

When a caller has left a voicemail, the missed call card in the Calls tab shows a **Play voicemail** button. Tap it — the audio is fetched from the phone-system side just for you and opens in your phone's audio player. There's also a link in the SMS notification you receive.

---

## 14. Subscription & Billing

CallCatch uses Stripe for secure payment processing. The flow is intentionally simple:

### How Activation Works

1. We arrange your subscription with you and create your account
2. We send you a secure Stripe payment link (via email) tied to your email address
3. Pay through Stripe — takes about a minute
4. We email you your login email and temporary password
5. Sign in, change your password, and you're in
6. If you've already paid by the time you sign in, you go straight to the Calls tab. Otherwise tap **I've Paid — Activate Account** on the Subscription Required screen and the app finds your active Stripe subscription and unlocks immediately.

### Managing Your Subscription

1. **Settings → Subscription**
2. Tap **Manage**
3. The Stripe Customer Portal opens in your browser, where you can:
   - Update your payment method
   - Download invoices
   - **Cancel your subscription** — takes effect at the end of the current billing period

### What Happens if Your Subscription Lapses

If a payment fails or you cancel, the app re-checks your subscription status every time you open it. Once Stripe reports the subscription as inactive, the app sends you back to the Subscription Required screen and the automated features stop working until you resubscribe.

### Cancelling vs. Pausing

There's no "pause" — only cancel. If you cancel, you keep access until the period you've paid for ends, then you're locked out until you subscribe again.

---

## 15. Using CallCatch on the Web

You don't need to download anything from an app store to get started. CallCatch runs in any modern browser:

1. Visit your CallCatch URL on your phone, tablet, or computer
2. Sign in with the email and temporary password we sent you
3. Use all the same features (calls, jobs, settings, voice greeting, SMS flow)

This means you can be up and running immediately without waiting for App Store approval. When the iOS app is published, your account and data work the same in both.

---

## 16. Frequently Asked Questions

**Q: Do customers know they're talking to a bot?**
A: The messages are written to sound natural. Most customers simply reply and get booked in without giving it a second thought. If you want to be transparent you can edit the greeting in Settings to mention it's an automated reply.

**Q: What if a customer replies with something unexpected?**
A: The bot handles common variations (e.g., "yes", "yeah", "yep" are all treated the same). If it can't understand a reply, it'll ask the question again. You can always step in manually by viewing the chat and sending your own message.

**Q: Can I use my existing phone number?**
A: CallCatch needs to receive your calls on the dedicated business number we provision for you, because that's the number wired into our SMS and voice automation. The usual approach is to set up call forwarding from your existing number to your CallCatch number, so customers can keep calling your normal number and the diverted calls hit our system.

**Q: What if the bot is halfway through a conversation when I want to take over?**
A: Open the chat in the Calls tab and start typing — your manual messages go through alongside the bot. You can also book the job yourself using the Book button.

**Q: Will I get notified when a job is booked?**
A: Yes — push notification when the bot books a job, and another one when an out-of-area enquiry comes in.

**Q: Can I have more than one business number?**
A: Each CallCatch account is linked to one dedicated business number. If you need multiple numbers (e.g. separate for two trades), contact us and we'll sort a multi-number arrangement.

**Q: What does "URGENT" mean on a call?**
A: If the caller picked an urgent service type (e.g., "Power outage") and confirmed it's an emergency, the call is flagged so you can prioritise it.

**Q: What happens for customers outside my service area?**
A: The bot tells them politely that the address is outside your usual area and that you'll review and get back to them directly. It doesn't book the job. You get a push notification and the call shows up with a "Out of service area — manual review" status. See [Service Area](#8-service-area--travel-radius).

**Q: Calls aren't coming through — what do I check?**
A: Run through this short checklist:
1. Your subscription is active (Settings → Subscription)
2. Auto-Reply is turned ON in Settings
3. Call forwarding from your normal mobile is pointing at the CallCatch business number shown in Settings

If those three are good and calls are still missing, contact us — the routing on our side is something we manage and we can check it for you.

**Q: Can I cancel my subscription anytime?**
A: Yes — Settings → Subscription → Manage → Cancel. You keep access until the end of the period you've already paid for.

**Q: Where can I read the Terms of Service and Privacy Policy?**
A: From the Sign In screen (tappable links at the bottom), or anytime from Settings → About.

**Q: Can I use this on Android and iPhone?**
A: Yes — CallCatch runs in a web browser on any device, and is being prepared for the iOS App Store. Android via the App Store is not currently supported on Replit, but the web app works perfectly on Android phones.
