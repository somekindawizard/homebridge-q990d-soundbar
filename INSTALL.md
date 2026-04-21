# homebridge-q990d-soundbar — Installation Guide

## Prerequisites

- [Homebridge](https://homebridge.io) installed and running (via `hb-service` or Docker)
- Node.js 18+
- A Samsung HW-Q990D soundbar added to the SmartThings app
- The [SmartThings CLI](https://github.com/SmartThingsCommunity/smartthings-cli) (used once during setup to create an OAuth app and find your device ID)

---

## Step 1: Install the SmartThings CLI

The CLI is only needed during initial setup — it won't run alongside the plugin.

**macOS (Homebrew — recommended):**

```bash
brew install smartthingscommunity/smartthings/smartthings
```

> Requires macOS 13.5 or later.

**Any platform (npm — requires Node 24+):**

```bash
npm install -g @smartthings/cli
```

> Note: the npm package requires Node 24.8.0+, which is newer than what Homebridge typically runs on. If your system Node is older, use Homebrew on macOS or download a standalone binary from the [CLI releases page](https://github.com/SmartThingsCommunity/smartthings-cli/releases).

**Verify it installed:**

```bash
smartthings --version
```

The first time you run a command, the CLI will open a browser window and ask you to sign in with your Samsung account.

---

## Step 2: Find Your Soundbar's Device ID

Run:

```bash
smartthings devices
```

This lists all devices on your SmartThings account. Find your soundbar in the list and copy its **Device Id** (a UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

> **Tip:** If you have many devices, you can filter by name:
> ```bash
> smartthings devices | grep -i soundbar
> ```
> Or get the full details in JSON:
> ```bash
> smartthings devices -j
> ```

Save this Device ID — you'll need it in Step 5.

---

## Step 3: Create a SmartThings OAuth App

Run:

```bash
smartthings apps:create
```

When prompted:

- **App Name:** `Q990D Homebridge` (or anything you like)
- **Description:** `Homebridge soundbar control`
- **App Type:** Select `API_ONLY`
- **Target URL:** `https://httpbin.org/get`
- **Redirect URI:** `https://httpbin.org/get`
- **Scopes:** Select `r:devices:*`, `w:devices:*`, `x:devices:*`, `r:locations:*`

**Save the output.** You'll get a **Client ID** and a **Client Secret**. The secret is shown once and cannot be retrieved later — store it somewhere safe.

---

## Step 4: Install the Plugin

**From npm:**

```bash
npm install -g @prismwizard/homebridge-q990d-soundbar
```

**From source (for development):**

```bash
git clone https://github.com/somekindawizard/homebridge-q990d-soundbar.git
cd homebridge-q990d-soundbar
npm install
npm run build
sudo npm link
```

---

## Step 5: Add Platform Config to Homebridge

Open your Homebridge config — either through the Homebridge UI (Settings → config.json) or directly:

```bash
nano ~/.homebridge/config.json
```

Add this to the `platforms` array:

```json
{
  "platform": "Q990DSoundbar",
  "name": "Q990D Soundbar",
  "clientId": "YOUR_CLIENT_ID_FROM_STEP_3",
  "clientSecret": "YOUR_CLIENT_SECRET_FROM_STEP_3",
  "deviceId": "YOUR_DEVICE_ID_FROM_STEP_2"
}
```

Replace the placeholder values with your actual credentials and device ID.

---

## Step 6: Run the OAuth Wizard

1. Open the Homebridge UI in your browser (usually `http://localhost:8581`)
2. Go to **Plugins**
3. Find **Q990D Soundbar** and click **Settings**
4. The OAuth wizard will appear
5. Enter your **Client ID** and **Client Secret** from Step 3
6. Click **Authorize with SmartThings**
7. A new tab opens — sign in with your Samsung account and authorize the app
8. After authorizing, you'll be redirected to **httpbin.org**. The page will show a JSON response. Look at the **URL in your browser's address bar** — it will look something like:
   ```
   https://httpbin.org/get?code=XXXXXX&state=...
   ```
   Copy just the `code` value (everything between `code=` and the next `&`).
9. Paste the code into the wizard and click **Get Tokens**
10. You should see **"Authentication successful!"**

---

## Step 7: Restart Homebridge

```bash
sudo hb-service restart
```

Or restart from the Homebridge UI.

---

## Step 8: Organize Accessories in HomeKit

After Homebridge restarts, the following accessories will appear in the Home app:

| Accessory | Type | What It Does |
|-----------|------|-------------|
| **Adaptive** | Switch | Sound mode — Adaptive Sound |
| **Standard** | Switch | Sound mode — Standard |
| **Surround** | Switch | Sound mode — Surround Sound |
| **Game** | Switch | Sound mode — Game |
| **Night Mode** | Switch | Toggle night mode on/off |
| **Voice Enhance** | Switch | Toggle voice amplifier on/off |
| **Speaker Level** | Fan | Volume control (fan speed = volume 0–100) |
| **Woofer** | Fan | Bass level (fan speed maps to woofer −6 to +6) |
| **Soundbar Power** | Switch | Turn soundbar on/off |

Move them all to a room (e.g., "Living Room") and unfavorite any you don't want on the Home tab.

> **About the Fan controls:** HomeKit doesn't have a native "audio slider" service, so Speaker Level and Woofer use the Fan service as a workaround. The fan speed slider acts as the level control. For the Woofer, 0% = −6, 50% = 0 (neutral), 100% = +6.

---

## Siri Commands

- "Hey Siri, turn on Surround"
- "Hey Siri, turn on Game"
- "Hey Siri, turn on Night Mode"
- "Hey Siri, turn off Voice Enhance"
- "Hey Siri, turn off Soundbar Power"
- "Hey Siri, set Speaker Level to 30"

---

## How Sound Modes Work

Only one sound mode can be active at a time. Tapping a mode switch in HomeKit turns it on and automatically turns off the previously active mode. Tapping the already-active mode does nothing. Turning off the active mode is prevented — you can't leave the soundbar with no mode selected; tap a different mode instead.

---

## Troubleshooting

**Plugin not appearing in Homebridge UI:**
If you installed from source, make sure `npm link` ran successfully. Check with `npm ls -g @prismwizard/homebridge-q990d-soundbar`.

**OAuth errors:**
Clear tokens via the wizard's "Clear Saved Tokens" button and re-authorize. Double-check that your Client ID and Secret match what the CLI gave you in Step 3.

**Commands not working:**
Check Homebridge logs for errors. The SmartThings API requires internet access. Verify the soundbar shows as online in the SmartThings mobile app.

**Token refresh failing:**
The plugin auto-refreshes OAuth tokens before they expire. If the refresh chain breaks, clear tokens via the wizard and re-authorize.

**Stale switch states after using the remote or SmartThings app:**
Sound mode, night mode, and voice enhance are tracked internally by the plugin. If someone changes a setting via the physical remote or the SmartThings app, the HomeKit switches won't update until a mode is changed from HomeKit. Power and volume do poll the device for current state.
