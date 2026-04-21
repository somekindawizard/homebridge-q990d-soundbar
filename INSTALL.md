# homebridge-q990d-soundbar — Installation Guide

## Prerequisites
- Homebridge running via hb-service on your Mac mini
- Node.js 18+ (already installed if Homebridge is running)
- SmartThings CLI installed (`npm install -g @smartthings/cli`)
- Your Q990D device ID: `2714121a-4076-7b3e-3b06-b9110d2d369f`

---

## Step 1: Install the SmartThings CLI (if not already installed)

```bash
npm install -g @smartthings/cli
```

Verify it works:

```bash
smartthings --version
```

---

## Step 2: Create a SmartThings OAuth App

Run:

```bash
smartthings apps:create
```

When prompted:
- **App Name:** `Q990D Homebridge`
- **Description:** `Homebridge soundbar control`
- **App Type:** Select `API_ONLY`
- **Target URL:** `https://httpbin.org/get`
- **Redirect URI:** `https://httpbin.org/get`
- **Scopes:** Select `r:devices:*`, `w:devices:*`, `x:devices:*`, `r:locations:*`

**Save the output.** You'll get:
- `Client ID` — you need this
- `Client Secret` — you need this (shown once, cannot be retrieved later)

---

## Step 3: Extract and Install the Plugin

Download the tarball from Claude, then:

```bash
mkdir -p ~/homebridge-q990d-soundbar
cd ~/homebridge-q990d-soundbar
tar xzf /path/to/homebridge-q990d-soundbar.tar.gz
npm install
npm run build
```

Link it so Homebridge can find it:

```bash
sudo npm link
```

---

## Step 4: Add Platform Config to Homebridge

Open your Homebridge config. Either edit via the Homebridge UI (Settings > config.json) or directly:

```bash
nano ~/.homebridge/config.json
```

Add this to the `platforms` array:

```json
{
  "platform": "Q990DSoundbar",
  "name": "Q990D Soundbar",
  "clientId": "YOUR_CLIENT_ID_FROM_STEP_2",
  "clientSecret": "YOUR_CLIENT_SECRET_FROM_STEP_2",
  "deviceId": "2714121a-4076-7b3e-3b06-b9110d2d369f",
  "wooferDefault": 0
}
```

Replace `YOUR_CLIENT_ID_FROM_STEP_2` and `YOUR_CLIENT_SECRET_FROM_STEP_2` with the values from Step 2.

Save the file.

---

## Step 5: Run the OAuth Wizard

1. Open the Homebridge UI in Safari: `http://localhost:8581`
2. Go to **Plugins**
3. Find **Q990D Soundbar** and click **Settings**
4. The OAuth wizard should appear
5. Enter your **Client ID** and **Client Secret**
6. Click **Authorize with SmartThings**
7. A new tab opens — sign in with your Samsung account and authorize
8. You'll be redirected to httpbin.org — look at the URL for `?code=XXXXXX`
9. Copy the code value
10. Paste it into the wizard and click **Get Tokens**
11. You should see "Authentication successful!"

---

## Step 6: Restart Homebridge

```bash
sudo hb-service restart
```

Or restart from the Homebridge UI.

---

## Step 7: Add Accessories to HomeKit

After Homebridge restarts, open the **Home** app on your iPhone.

The following accessories should appear automatically (or you may need to add the Homebridge bridge if this is a new setup):

- **Adaptive** — sound mode switch
- **Standard** — sound mode switch
- **Surround** — sound mode switch
- **Game** — sound mode switch
- **Night Mode** — toggle switch
- **Voice Enhance** — toggle switch
- **Woofer** — brightness slider (0% = -6, 50% = 0, 100% = +6)
- **Soundbar Power** — on/off switch

Move them all to a room (e.g., "Living Room") and unfavorite any you don't want on the Home app main screen.

---

## Usage

**Siri commands:**
- "Hey Siri, turn on Adaptive"
- "Hey Siri, turn on Game"
- "Hey Siri, turn on Night Mode"
- "Hey Siri, turn off Voice Enhance"
- "Hey Siri, turn off Soundbar Power"

**Sound mode behavior:**
- Tapping a mode turns off the previously active mode automatically
- Tapping the already-active mode does nothing
- Turning off the active mode switch does nothing (prevents leaving no mode selected)

**Woofer slider:**
- Shows as a lightbulb brightness control (HomeKit limitation)
- 0% = -6, 50% = 0 (default), 100% = +6
- Drag to adjust bass level

---

## Troubleshooting

**Plugin not appearing in Homebridge UI:**
Make sure `npm link` ran successfully. Check `npm ls -g homebridge-q990d-soundbar`.

**OAuth errors:**
Clear tokens via the wizard and re-authorize. Make sure your Client ID and Secret are correct.

**Commands not working:**
Check Homebridge logs for errors. The SmartThings API requires internet access. Verify the soundbar is connected to SmartThings by checking the SmartThings app.

**Token refresh failing:**
The plugin auto-refreshes tokens every 24 hours. If the refresh chain breaks, clear tokens and re-authorize via the wizard.

**Stale switch states:**
Since the Q990D doesn't report sound mode via the status API, the plugin tracks state internally. If someone changes the mode via the remote or SmartThings app, the switches won't update until someone taps one in HomeKit. Power state does sync since that uses the standard status endpoint.
