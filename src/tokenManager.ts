import { Logger, PlatformConfig } from 'homebridge';
import * as fs from 'fs';
import * as path from 'path';

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
}

export class TokenManager {
  private tokenPath: string;
  private tokenData: TokenData | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private readonly REFRESH_BEFORE_EXPIRY = 5 * 60 * 1000;
  private readonly REFRESH_CHECK_INTERVAL = 60 * 1000;
  private refreshCallback: (refreshToken: string) => Promise<Partial<TokenData>>;

  constructor(
    private readonly log: Logger,
    storagePath: string,
    refreshCallback: (refreshToken: string) => Promise<Partial<TokenData>>,
    private readonly config?: PlatformConfig,
  ) {
    this.tokenPath = path.join(storagePath, 'q990d_tokens.json');
    this.refreshCallback = refreshCallback;
    this.loadTokens();
    this.startRefreshMonitor();
  }

  private startRefreshMonitor(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.refreshTimer = setInterval(() => {
      this.checkAndRefresh();
    }, this.REFRESH_CHECK_INTERVAL);
  }

  private async checkAndRefresh(): Promise<void> {
    if (!this.tokenData?.refresh_token) return;

    const timeUntilExpiry = this.tokenData.expires_at - Date.now();
    if (timeUntilExpiry > this.REFRESH_BEFORE_EXPIRY) return;

    // If a refresh is already running, piggyback on it
    if (this.refreshInFlight) return this.refreshInFlight;

    const refreshToken = this.tokenData.refresh_token;
    this.refreshInFlight = (async () => {
      this.log.info('Access token expiring soon, refreshing...');
      try {
        const newData = await this.refreshCallback(refreshToken);
        await this.updateTokens(newData);
        this.log.info('Token refreshed successfully');
      } catch (e) {
        this.log.error('Token refresh failed:', e);
      } finally {
        this.refreshInFlight = null;
      }
    })();
    return this.refreshInFlight;
  }

  private loadTokens(): void {
    try {
      if (fs.existsSync(this.tokenPath)) {
        const data = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
        if (data.access_token && data.refresh_token) {
          this.tokenData = data;
          this.log.info('Loaded saved OAuth tokens');
          return;
        }
      }
    } catch (e) {
      this.log.warn('Could not load saved tokens');
    }

    // Fall back to config tokens (from OAuth wizard)
    if (this.config?.oauth_access_token && this.config?.oauth_refresh_token) {
      this.log.info('Loading tokens from config (OAuth wizard)');
      const expiresIn = this.config.oauth_expires_in || 86400;
      this.tokenData = {
        access_token: this.config.oauth_access_token,
        refresh_token: this.config.oauth_refresh_token,
        expires_in: expiresIn,
        expires_at: Date.now() + expiresIn * 1000,
      };
      this.saveTokens();
    }
  }

  private saveTokens(): void {
    if (!this.tokenData) return;
    try {
      fs.writeFileSync(this.tokenPath, JSON.stringify(this.tokenData, null, 2));
    } catch (e) {
      this.log.error('Failed to save tokens:', e);
    }
  }

  public async updateTokens(data: Partial<TokenData>): Promise<void> {
    this.tokenData = {
      ...this.tokenData,
      ...data,
      expires_at: Date.now() + (data.expires_in || 86400) * 1000,
    } as TokenData;
    this.saveTokens();
  }

  public getAccessToken(): string | null {
    return this.tokenData?.access_token || null;
  }

  public getRefreshToken(): string | null {
    return this.tokenData?.refresh_token || null;
  }

  public isTokenValid(): boolean {
    if (!this.tokenData) return false;
    return Date.now() < (this.tokenData.expires_at - this.REFRESH_BEFORE_EXPIRY);
  }
}
