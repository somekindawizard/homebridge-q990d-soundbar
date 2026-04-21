import axios, { AxiosInstance } from 'axios';
import { Logger, PlatformConfig } from 'homebridge';
import { TokenManager, TokenData } from './tokenManager';

const ST_API_BASE = 'https://api.smartthings.com/v1';
const ST_TOKEN_URL = 'https://api.smartthings.com/oauth/token';

export class SmartThingsClient {
  private axiosInstance: AxiosInstance;
  public tokenManager: TokenManager;
  private clientId: string;
  private clientSecret: string;
  private log: Logger;

  constructor(
    log: Logger,
    storagePath: string,
    clientId: string,
    clientSecret: string,
    config?: PlatformConfig,
  ) {
    this.log = log;
    this.clientId = clientId;
    this.clientSecret = clientSecret;

    this.tokenManager = new TokenManager(
      log,
      storagePath,
      this.refreshTokens.bind(this),
      config,
    );

    this.axiosInstance = axios.create({
      baseURL: ST_API_BASE,
      headers: { 'Content-Type': 'application/json' },
    });

    // Attach token to every request
    this.axiosInstance.interceptors.request.use(async (reqConfig) => {
      const token = this.tokenManager.getAccessToken();
      if (token) {
        reqConfig.headers.Authorization = `Bearer ${token}`;
      }
      return reqConfig;
    });
  }

  private async refreshTokens(refreshToken: string): Promise<Partial<TokenData>> {
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    const response = await axios.post(ST_TOKEN_URL, params, {
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return response.data;
  }

  public isReady(): boolean {
    return this.tokenManager.isTokenValid();
  }

  async sendExecuteCommand(deviceId: string, href: string, payload: Record<string, unknown>): Promise<boolean> {
    try {
      const body = {
        commands: [{
          component: 'main',
          capability: 'execute',
          command: 'execute',
          arguments: [href, payload],
        }],
      };
      await this.axiosInstance.post(`/devices/${deviceId}/commands`, body);
      this.log.debug(`Execute: ${href} ${JSON.stringify(payload)}`);
      return true;
    } catch (e) {
      this.log.error(`Execute failed: ${href}`, e);
      return false;
    }
  }

  async sendExecuteCommands(deviceId: string, commands: Array<{ href: string; payload: Record<string, unknown> }>): Promise<boolean> {
    try {
      const body = {
        commands: commands.map(cmd => ({
          component: 'main',
          capability: 'execute',
          command: 'execute',
          arguments: [cmd.href, cmd.payload],
        })),
      };
      await this.axiosInstance.post(`/devices/${deviceId}/commands`, body);
      this.log.debug(`Execute commands: ${JSON.stringify(commands)}`);
      return true;
    } catch (e) {
      this.log.error('Execute commands failed:', e);
      return false;
    }
  }

  async sendStandardCommand(deviceId: string, capability: string, command: string, args?: unknown[]): Promise<boolean> {
    try {
      const cmd: Record<string, unknown> = {
        component: 'main',
        capability,
        command,
      };
      if (args && args.length > 0) {
        cmd.arguments = args;
      }
      const body = { commands: [cmd] };
      await this.axiosInstance.post(`/devices/${deviceId}/commands`, body);
      this.log.debug(`Standard command: ${capability}.${command}(${JSON.stringify(args)})`);
      return true;
    } catch (e) {
      this.log.error(`Standard command failed: ${capability}.${command}`, e);
      return false;
    }
  }

  async sendSwitchCommand(deviceId: string, on: boolean): Promise<boolean> {
    try {
      const body = {
        commands: [{
          component: 'main',
          capability: 'switch',
          command: on ? 'on' : 'off',
        }],
      };
      await this.axiosInstance.post(`/devices/${deviceId}/commands`, body);
      this.log.debug(`Switch: ${on ? 'on' : 'off'}`);
      return true;
    } catch (e) {
      this.log.error('Switch command failed:', e);
      return false;
    }
  }

  private statusCache: Map<string, { data: any; expiresAt: number }> = new Map();
  private statusInFlight: Map<string, Promise<any | null>> = new Map();
  private readonly STATUS_TTL_MS = 2000;

  async getDeviceStatus(deviceId: string): Promise<any | null> {
    const now = Date.now();
    const cached = this.statusCache.get(deviceId);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
    // Coalesce concurrent polls
    const inFlight = this.statusInFlight.get(deviceId);
    if (inFlight) return inFlight;

    const promise = (async () => {
      try {
        const response = await this.axiosInstance.get(`/devices/${deviceId}/status`);
        this.statusCache.set(deviceId, { data: response.data, expiresAt: Date.now() + this.STATUS_TTL_MS });
        return response.data;
      } catch (e) {
        this.log.error('Failed to get device status:', e);
        return null;
      } finally {
        this.statusInFlight.delete(deviceId);
      }
    })();
    this.statusInFlight.set(deviceId, promise);
    return promise;
  }
}
