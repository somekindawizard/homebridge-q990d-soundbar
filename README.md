# homebridge-q990d-soundbar

A Homebridge plugin for controlling the Samsung HW-Q990D soundbar via the SmartThings API.

## Features

- **Sound Mode Switching** — Adaptive, Standard, Surround, Game (mutex: only one active at a time)
- **Night Mode** — on/off toggle
- **Voice Enhance** — on/off toggle
- **Speaker Level** — volume control via Fan speed slider (0–100)
- **Woofer Level** — adjustable from −6 to +6 via Fan speed slider (0% = −6, 50% = 0, 100% = +6)
- **Power** — on/off with real-time status polling
- **OAuth Authentication** — automatic token refresh, setup wizard in Homebridge UI

## How It Works

This plugin uses the SmartThings `execute` capability to send OCF commands to the soundbar's internal `/sec/networkaudio/` endpoints. These are the same undocumented endpoints the SmartThings app uses to control sound modes and advanced audio settings.

The following endpoints are used:

| Feature | Endpoint | Property |
|---------|----------|----------|
| Sound Mode | `/sec/networkaudio/soundmode` | `x.com.samsung.networkaudio.soundmode` |
| Night Mode | `/sec/networkaudio/advancedaudio` | `x.com.samsung.networkaudio.nightmode` |
| Voice Enhance | `/sec/networkaudio/advancedaudio` | `x.com.samsung.networkaudio.voiceamplifier` |
| Woofer | `/sec/networkaudio/woofer` | `x.com.samsung.networkaudio.woofer` |
| Power | Standard `switch` capability | — |

## Installation

See [INSTALL.md](INSTALL.md) for full setup instructions.

## Configuration

```json
{
  "platform": "Q990DSoundbar",
  "name": "Q990D Soundbar",
  "clientId": "YOUR_SMARTTHINGS_OAUTH_CLIENT_ID",
  "clientSecret": "YOUR_SMARTTHINGS_OAUTH_CLIENT_SECRET",
  "deviceId": "YOUR_SOUNDBAR_DEVICE_ID"
}
```

## Limitations

- Sound mode state is tracked internally — if the mode is changed via the physical remote or SmartThings app, the HomeKit switches won't update until a mode is selected in HomeKit
- The Q990D does not expose the current audio codec via the SmartThings API
- This plugin is built specifically for the HW-Q990D; other Samsung soundbar models may use different mode strings

## Credits

- SmartThings OCF endpoint documentation: [YASSI](https://ha-samsung-soundbar.vercel.app/)
- OAuth pattern based on [homebridge-smartthings](https://github.com/aziz66/homebridge-smartthings) by aziz66
