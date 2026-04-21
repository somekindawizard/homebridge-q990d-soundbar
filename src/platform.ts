import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
  CharacteristicValue,
} from 'homebridge';
import { SmartThingsClient } from './smartThingsClient';

const PLUGIN_NAME = 'homebridge-q990d-soundbar';
const PLATFORM_NAME = 'Q990DSoundbar';

const SOUND_MODES = ['adaptive sound', 'standard', 'surround', 'game'] as const;
type SoundMode = typeof SOUND_MODES[number];

const MODE_NAMES: Record<SoundMode, string> = {
  'adaptive sound': 'Adaptive',
  'standard': 'Standard',
  'surround': 'Surround',
  'game': 'Game',
};

export class Q990DPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  private readonly cachedAccessories: PlatformAccessory[] = [];
  private client!: SmartThingsClient;
  private deviceId = '';

  // Internal state tracking
  private currentMode: SoundMode = 'adaptive sound';
  private modeChangePending = false;
  private nightMode = false;
  private voiceEnhance = false;
  private wooferLevel = 0;
  private volume = 10;
  private powerOn = true;

  // References to services for mutex and power-sync updates
  private modeServices: Map<SoundMode, Service> = new Map();
  private nightModeService: Service | null = null;
  private voiceEnhanceService: Service | null = null;
  private volumeService: Service | null = null;
  private wooferService: Service | null = null;

  // Remembered levels to restore when fan is turned back on
  private lastVolume = 10;
  private lastWooferPercent = 60;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    if (!config.clientId || !config.clientSecret || !config.deviceId) {
      this.log.error('Missing required config: clientId, clientSecret, deviceId');
      return;
    }

    this.deviceId = config.deviceId;

    this.client = new SmartThingsClient(
      log,
      api.user.storagePath(),
      config.clientId,
      config.clientSecret,
      config,
    );

    this.api.on('didFinishLaunching', () => {
      this.log.info('Q990D Soundbar plugin loaded');
      this.setupAccessories();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading cached accessory:', accessory.displayName);
    this.cachedAccessories.push(accessory);
  }

  private getOrCreateAccessory(name: string, uuidSeed: string, newAccessories: PlatformAccessory[]): PlatformAccessory {
    const uuid = this.api.hap.uuid.generate(uuidSeed);
    let accessory = this.cachedAccessories.find(a => a.UUID === uuid);

    if (!accessory) {
      accessory = new this.api.platformAccessory(name, uuid);
      newAccessories.push(accessory);
    }

    accessory.getService(this.Service.AccessoryInformation)!
      .setCharacteristic(this.Characteristic.Manufacturer, 'Samsung')
      .setCharacteristic(this.Characteristic.Model, 'HW-Q990D')
      .setCharacteristic(this.Characteristic.SerialNumber, this.deviceId);

    return accessory;
  }

  // Clean up stale service types from previous versions
  private cleanupStaleServices(accessory: PlatformAccessory): void {
    const staleSpeaker = accessory.getService(this.Service.Speaker);
    if (staleSpeaker) {
      accessory.removeService(staleSpeaker);
      this.log.info(`Removed stale Speaker service from ${accessory.displayName}`);
    }
    const staleLightbulb = accessory.getService(this.Service.Lightbulb);
    if (staleLightbulb) {
      accessory.removeService(staleLightbulb);
      this.log.info(`Removed stale Lightbulb service from ${accessory.displayName}`);
    }
  }

  private setupAccessories(): void {
    const newAccessories: PlatformAccessory[] = [];

    // --- Sound Mode Switches (mutex group) ---
    for (const mode of SOUND_MODES) {
      const name = MODE_NAMES[mode];
      const accessory = this.getOrCreateAccessory(name, `q990d-mode-${mode}`, newAccessories);

      const service = accessory.getService(this.Service.Switch) ||
        accessory.addService(this.Service.Switch, name);

      service.setCharacteristic(this.Characteristic.Name, name);

      service.getCharacteristic(this.Characteristic.On)
        .onGet(() => this.powerOn && this.currentMode === mode)
        .onSet(async (value: CharacteristicValue) => {
          if (!value) {
            setTimeout(() => {
              service.updateCharacteristic(this.Characteristic.On, this.powerOn && this.currentMode === mode);
            }, 100);
            return;
          }
          if (this.currentMode === mode) return;
          if (this.modeChangePending) {
            // Another mode change is in flight — snap this switch back and bail
            setTimeout(() => {
              service.updateCharacteristic(this.Characteristic.On, false);
            }, 100);
            return;
          }
          this.modeChangePending = true;

          try {
            const success = await this.client.sendExecuteCommand(this.deviceId,
              '/sec/networkaudio/soundmode',
              { 'x.com.samsung.networkaudio.soundmode': mode });

            if (success) {
              const previousMode = this.currentMode;
              this.currentMode = mode;
              const prevService = this.modeServices.get(previousMode);
              if (prevService) {
                prevService.updateCharacteristic(this.Characteristic.On, false);
              }
              this.log.info(`Sound mode: ${MODE_NAMES[mode]}`);
            } else {
              setTimeout(() => {
                service.updateCharacteristic(this.Characteristic.On, false);
              }, 100);
            }
          } finally {
            this.modeChangePending = false;
          }
        });

      this.modeServices.set(mode, service);
    }

    // --- Night Mode ---
    {
      const name = 'Night Mode';
      const accessory = this.getOrCreateAccessory(name, 'q990d-night-mode', newAccessories);

      const service = accessory.getService(this.Service.Switch) ||
        accessory.addService(this.Service.Switch, name);

      service.setCharacteristic(this.Characteristic.Name, name);

      service.getCharacteristic(this.Characteristic.On)
        .onGet(() => this.powerOn && this.nightMode)
        .onSet(async (value: CharacteristicValue) => {
          const on = value as boolean;
          const success = await this.client.sendExecuteCommand(this.deviceId,
            '/sec/networkaudio/advancedaudio',
            { 'x.com.samsung.networkaudio.nightmode': on ? 1 : 0 });
          if (success) {
            this.nightMode = on;
            this.log.info(`Night mode: ${on ? 'on' : 'off'}`);
          }
        });

      this.nightModeService = service;
    }

    // --- Voice Enhance ---
    {
      const name = 'Voice Enhance';
      const accessory = this.getOrCreateAccessory(name, 'q990d-voice-enhance', newAccessories);

      const service = accessory.getService(this.Service.Switch) ||
        accessory.addService(this.Service.Switch, name);

      service.setCharacteristic(this.Characteristic.Name, name);

      service.getCharacteristic(this.Characteristic.On)
        .onGet(() => this.powerOn && this.voiceEnhance)
        .onSet(async (value: CharacteristicValue) => {
          const on = value as boolean;
          const success = await this.client.sendExecuteCommand(this.deviceId,
            '/sec/networkaudio/advancedaudio',
            { 'x.com.samsung.networkaudio.voiceamplifier': on ? 1 : 0 });
          if (success) {
            this.voiceEnhance = on;
            this.log.info(`Voice enhance: ${on ? 'on' : 'off'}`);
          }
        });

      this.voiceEnhanceService = service;
    }

    // --- Speaker Level (Fan rotation speed: 0-100) ---
    {
      const name = 'Speaker Level';
      const accessory = this.getOrCreateAccessory(name, 'q990d-volume', newAccessories);
      this.cleanupStaleServices(accessory);

      const service = accessory.getService(this.Service.Fan) ||
        accessory.addService(this.Service.Fan, name);

      service.setCharacteristic(this.Characteristic.Name, name);

      service.getCharacteristic(this.Characteristic.On)
        .onGet(() => this.powerOn && this.volume > 0)
        .onSet(async (value: CharacteristicValue) => {
          const on = value as boolean;
          if (!on) {
            // Turning fan off: mute (set volume to 0) but remember last
            if (this.volume > 0) this.lastVolume = this.volume;
            const success = await this.client.sendStandardCommand(this.deviceId, 'audioVolume', 'setVolume', [0]);
            if (success) {
              this.volume = 0;
              service.updateCharacteristic(this.Characteristic.RotationSpeed, 0);
              this.log.info('Speaker Level: off (volume 0)');
            }
          } else {
            // Turning on: restore last level, or default to 10
            const restore = this.lastVolume > 0 ? this.lastVolume : 10;
            const success = await this.client.sendStandardCommand(this.deviceId, 'audioVolume', 'setVolume', [restore]);
            if (success) {
              this.volume = restore;
              service.updateCharacteristic(this.Characteristic.RotationSpeed, restore);
              this.log.info(`Speaker Level: on (volume ${restore})`);
            }
          }
        });

      service.getCharacteristic(this.Characteristic.RotationSpeed)
        .onGet(async () => {
          const status = await this.client.getDeviceStatus(this.deviceId);
          if (status?.components?.main?.audioVolume?.volume?.value !== undefined) {
            this.volume = status.components.main.audioVolume.volume.value;
          }
          return this.volume;
        })
        .onSet(async (value: CharacteristicValue) => {
          const vol = value as number;
          const success = await this.client.sendStandardCommand(this.deviceId, 'audioVolume', 'setVolume', [vol]);
          if (success) {
            this.volume = vol;
            if (vol > 0) this.lastVolume = vol;
            this.log.info(`Speaker Level: ${vol}`);
          }
        });

      this.volumeService = service;
    }

    // --- Woofer (Fan rotation speed 0-100 mapped to -6 to +6) ---
    {
      const name = 'Woofer';
      const accessory = this.getOrCreateAccessory(name, 'q990d-woofer', newAccessories);
      this.cleanupStaleServices(accessory);

      const service = accessory.getService(this.Service.Fan) ||
        accessory.addService(this.Service.Fan, name);

      service.setCharacteristic(this.Characteristic.Name, name);

      service.getCharacteristic(this.Characteristic.On)
        .onGet(() => this.powerOn)
        .onSet(async (value: CharacteristicValue) => {
          const on = value as boolean;
          if (!on) {
            // Turning off: remember current, send -6 (minimum)
            this.lastWooferPercent = this.wooferToPercent(this.wooferLevel);
            const success = await this.client.sendExecuteCommand(this.deviceId,
              '/sec/networkaudio/woofer',
              { 'x.com.samsung.networkaudio.woofer': -6 });
            if (success) {
              this.wooferLevel = -6;
              service.updateCharacteristic(this.Characteristic.RotationSpeed, 0);
              this.log.info('Woofer: off (-6)');
            }
          } else {
            // Turning on: restore last percent, or default 60%
            const restorePercent = this.lastWooferPercent > 0 ? this.lastWooferPercent : 60;
            const level = this.percentToWoofer(restorePercent);
            const success = await this.client.sendExecuteCommand(this.deviceId,
              '/sec/networkaudio/woofer',
              { 'x.com.samsung.networkaudio.woofer': level });
            if (success) {
              this.wooferLevel = level;
              service.updateCharacteristic(this.Characteristic.RotationSpeed, restorePercent);
              this.log.info(`Woofer: on (level ${level}, ${restorePercent}%)`);
            }
          }
        });

      service.getCharacteristic(this.Characteristic.RotationSpeed)
        .onGet(() => this.wooferToPercent(this.wooferLevel))
        .onSet(async (value: CharacteristicValue) => {
          const percent = value as number;
          const level = this.percentToWoofer(percent);
          const success = await this.client.sendExecuteCommand(this.deviceId,
            '/sec/networkaudio/woofer',
            { 'x.com.samsung.networkaudio.woofer': level });
          if (success) {
            this.wooferLevel = level;
            if (percent > 0) this.lastWooferPercent = percent;
            this.log.info(`Woofer level: ${level} (${percent}%)`);
          }
        });

      this.wooferService = service;
    }

    // --- Power Switch ---
    {
      const name = 'Soundbar Power';
      const accessory = this.getOrCreateAccessory(name, 'q990d-power', newAccessories);

      const service = accessory.getService(this.Service.Switch) ||
        accessory.addService(this.Service.Switch, name);

      service.setCharacteristic(this.Characteristic.Name, name);

      service.getCharacteristic(this.Characteristic.On)
        .onGet(async () => {
          const status = await this.client.getDeviceStatus(this.deviceId);
          if (status?.components?.main?.switch?.switch?.value) {
            this.powerOn = status.components.main.switch.switch.value === 'on';
          }
          return this.powerOn;
        })
        .onSet(async (value: CharacteristicValue) => {
          const on = value as boolean;
          const success = await this.client.sendSwitchCommand(this.deviceId, on);
          if (success) {
            this.powerOn = on;
            this.log.info(`Power: ${on ? 'on' : 'off'}`);
            this.syncPowerState(on);
          }
        });
    }

    // Register new accessories
    if (newAccessories.length > 0) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, newAccessories);
    }

    this.log.info(`Registered ${SOUND_MODES.length} sound modes, night mode, voice enhance, speaker level, woofer, and power`);
  }

  // When power changes, update HomeKit tile states. Internal state for
  // night mode / voice enhance is NOT cleared — the soundbar preserves
  // those settings across power cycles, so next power-on reflects reality.
  private syncPowerState(on: boolean): void {
    for (const [mode, service] of this.modeServices) {
      service.updateCharacteristic(this.Characteristic.On, on && this.currentMode === mode);
    }
    if (this.volumeService) {
      this.volumeService.updateCharacteristic(this.Characteristic.On, on && this.volume > 0);
    }
    if (this.wooferService) {
      this.wooferService.updateCharacteristic(this.Characteristic.On, on);
    }
    if (this.nightModeService) {
      this.nightModeService.updateCharacteristic(this.Characteristic.On, on && this.nightMode);
    }
    if (this.voiceEnhanceService) {
      this.voiceEnhanceService.updateCharacteristic(this.Characteristic.On, on && this.voiceEnhance);
    }
  }

  // Map woofer level (-6 to +6) to HomeKit brightness (0-100)
  private wooferToPercent(level: number): number {
    return Math.round(((level + 6) / 12) * 100);
  }

  // Map HomeKit brightness (0-100) to woofer level (-6 to +6)
  private percentToWoofer(percent: number): number {
    return Math.round((percent / 100) * 12 - 6);
  }
}
