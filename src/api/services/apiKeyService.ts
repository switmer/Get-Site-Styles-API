import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { ApiKeyData, UsageLogEntry, RATE_LIMIT_TIERS } from '../types';

export class ApiKeyService {
  private apiKeys = new Map<string, ApiKeyData>();
  private usageLogs: UsageLogEntry[] = [];
  private rateLimitStore = new Map<string, { count: number; resetAt: Date }>();

  constructor() {
    this.initializeDefaultKeys();
  }

  private initializeDefaultKeys(): void {
    console.log('Initializing default API keys...');
    console.log('DEFAULT_API_KEYS env:', process.env.DEFAULT_API_KEYS);
    
    const defaultKeys = process.env.DEFAULT_API_KEYS?.split(',') || [];
    
    defaultKeys.forEach((key, index) => {
      if (key.trim()) {
        console.log(`Adding default key: ${key.trim()}`);
        const apiKey: ApiKeyData = {
          id: uuidv4(),
          key: key.trim(),
          name: `Default Key ${index + 1}`,
          createdAt: new Date(),
          usageCount: 0,
          isActive: true,
          rateLimitTier: 'basic',
          monthlyUsage: 0,
          monthlyResetAt: this.getNextMonthReset()
        };
        this.apiKeys.set(key.trim(), apiKey);
      }
    });

    // Add admin key if provided
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey) {
      const apiKey: ApiKeyData = {
        id: uuidv4(),
        key: adminKey,
        name: 'Admin Key',
        createdAt: new Date(),
        usageCount: 0,
        isActive: true,
        rateLimitTier: 'enterprise',
        monthlyUsage: 0,
        monthlyResetAt: this.getNextMonthReset()
      };
      this.apiKeys.set(adminKey, apiKey);
    }
  }

  private getNextMonthReset(): Date {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  async createApiKey(name: string, tier: 'basic' | 'premium' | 'enterprise' = 'basic'): Promise<ApiKeyData> {
    const key = this.generateApiKey();
    const apiKey: ApiKeyData = {
      id: uuidv4(),
      key,
      name,
      createdAt: new Date(),
      usageCount: 0,
      isActive: true,
      rateLimitTier: tier,
      monthlyLimit: RATE_LIMIT_TIERS[tier].monthlyLimit,
      monthlyUsage: 0,
      monthlyResetAt: this.getNextMonthReset()
    };

    this.apiKeys.set(key, apiKey);
    return apiKey;
  }

  private generateApiKey(): string {
    const prefix = 'gss'; // Get-Site-Styles
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `${prefix}_${timestamp}_${random}`;
  }

  async validateApiKey(key: string): Promise<ApiKeyData | null> {
    const apiKey = this.apiKeys.get(key);
    if (!apiKey || !apiKey.isActive) {
      return null;
    }

    // Check monthly limits
    if (apiKey.monthlyLimit && apiKey.monthlyUsage >= apiKey.monthlyLimit) {
      return null;
    }

    // Reset monthly usage if needed
    if (new Date() >= apiKey.monthlyResetAt) {
      apiKey.monthlyUsage = 0;
      apiKey.monthlyResetAt = this.getNextMonthReset();
    }

    return apiKey;
  }

  async checkRateLimit(apiKey: ApiKeyData): Promise<{ allowed: boolean; resetAt?: Date; remaining?: number }> {
    const tier = RATE_LIMIT_TIERS[apiKey.rateLimitTier];
    const key = `${apiKey.id}:ratelimit`;
    const now = new Date();
    
    let rateLimitData = this.rateLimitStore.get(key);
    
    // Initialize or reset if window expired
    if (!rateLimitData || now >= rateLimitData.resetAt) {
      rateLimitData = {
        count: 0,
        resetAt: new Date(now.getTime() + tier.windowMs)
      };
    }

    if (rateLimitData.count >= tier.maxRequests) {
      return {
        allowed: false,
        resetAt: rateLimitData.resetAt,
        remaining: 0
      };
    }

    rateLimitData.count++;
    this.rateLimitStore.set(key, rateLimitData);

    return {
      allowed: true,
      resetAt: rateLimitData.resetAt,
      remaining: tier.maxRequests - rateLimitData.count
    };
  }

  async logUsage(entry: Omit<UsageLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const logEntry: UsageLogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      ...entry
    };

    this.usageLogs.push(logEntry);

    // Update API key usage
    const apiKey = this.apiKeys.get(entry.apiKeyId);
    if (apiKey) {
      apiKey.usageCount++;
      apiKey.monthlyUsage++;
      apiKey.lastUsedAt = new Date();
    }

    // Keep only last 10,000 logs in memory
    if (this.usageLogs.length > 10000) {
      this.usageLogs = this.usageLogs.slice(-10000);
    }
  }

  async getApiKeyStats(keyId: string): Promise<any> {
    const apiKey = Array.from(this.apiKeys.values()).find(k => k.id === keyId);
    if (!apiKey) {
      throw new Error('API key not found');
    }

    const logs = this.usageLogs.filter(log => log.apiKeyId === keyId);
    const now = new Date();
    
    const last24Hours = logs.filter(log => 
      now.getTime() - log.timestamp.getTime() < 24 * 60 * 60 * 1000
    ).length;

    const last7Days = logs.filter(log => 
      now.getTime() - log.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000
    ).length;

    const last30Days = logs.filter(log => 
      now.getTime() - log.timestamp.getTime() < 30 * 24 * 60 * 60 * 1000
    ).length;

    const thisMonth = logs.filter(log => 
      log.timestamp.getMonth() === now.getMonth() && 
      log.timestamp.getFullYear() === now.getFullYear()
    ).length;

    // Endpoint statistics
    const endpointStats = new Map<string, { count: number; totalTime: number; errors: number }>();
    logs.forEach(log => {
      const key = `${log.method} ${log.endpoint}`;
      const stats = endpointStats.get(key) || { count: 0, totalTime: 0, errors: 0 };
      stats.count++;
      stats.totalTime += log.responseTime;
      if (log.statusCode >= 400) stats.errors++;
      endpointStats.set(key, stats);
    });

    const endpoints = Array.from(endpointStats.entries()).map(([endpoint, stats]) => ({
      endpoint,
      count: stats.count,
      avgResponseTime: Math.round(stats.totalTime / stats.count),
      errorRate: Math.round((stats.errors / stats.count) * 100)
    })).sort((a, b) => b.count - a.count);

    // Rate limit info
    const tier = RATE_LIMIT_TIERS[apiKey.rateLimitTier];
    const rateLimitKey = `${apiKey.id}:ratelimit`;
    const rateLimitData = this.rateLimitStore.get(rateLimitKey);

    return {
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        usageCount: apiKey.usageCount,
        monthlyUsage: apiKey.monthlyUsage,
        monthlyLimit: apiKey.monthlyLimit,
        rateLimitTier: apiKey.rateLimitTier
      },
      usage: {
        last24Hours,
        last7Days,
        last30Days,
        thisMonth
      },
      endpoints,
      rateLimits: {
        tier: apiKey.rateLimitTier,
        windowMs: tier.windowMs,
        maxRequests: tier.maxRequests,
        currentCount: rateLimitData?.count || 0,
        resetsAt: rateLimitData?.resetAt?.toISOString() || new Date(Date.now() + tier.windowMs).toISOString()
      }
    };
  }

  async getAllApiKeys(): Promise<ApiKeyData[]> {
    return Array.from(this.apiKeys.values());
  }

  async updateApiKey(key: string, updates: Partial<Pick<ApiKeyData, 'name' | 'isActive' | 'rateLimitTier' | 'monthlyLimit'>>): Promise<ApiKeyData | null> {
    const apiKey = this.apiKeys.get(key);
    if (!apiKey) {
      return null;
    }

    Object.assign(apiKey, updates);
    return apiKey;
  }

  async deleteApiKey(key: string): Promise<boolean> {
    return this.apiKeys.delete(key);
  }

  async getUsageLogs(apiKeyId?: string, limit: number = 100): Promise<UsageLogEntry[]> {
    let logs = this.usageLogs;
    
    if (apiKeyId) {
      logs = logs.filter(log => log.apiKeyId === apiKeyId);
    }

    return logs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getAdminStats(): Promise<any> {
    const totalKeys = this.apiKeys.size;
    const activeKeys = Array.from(this.apiKeys.values()).filter(k => k.isActive).length;
    
    const now = new Date();
    const totalRequests = this.usageLogs.length;
    const requestsToday = this.usageLogs.filter(log => 
      now.toDateString() === log.timestamp.toDateString()
    ).length;
    
    const errors = this.usageLogs.filter(log => log.statusCode >= 400).length;
    const errorRate = totalRequests > 0 ? Math.round((errors / totalRequests) * 100) : 0;
    
    const avgResponseTime = totalRequests > 0 
      ? Math.round(this.usageLogs.reduce((sum, log) => sum + log.responseTime, 0) / totalRequests)
      : 0;

    // Top API keys by usage
    const keyUsage = new Map<string, number>();
    this.usageLogs.forEach(log => {
      keyUsage.set(log.apiKeyId, (keyUsage.get(log.apiKeyId) || 0) + 1);
    });

    const topApiKeys = Array.from(keyUsage.entries())
      .map(([id, count]) => {
        const apiKey = Array.from(this.apiKeys.values()).find(k => k.id === id);
        return {
          id,
          name: apiKey?.name || 'Unknown',
          requests: count
        };
      })
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    return {
      apiKeys: {
        total: totalKeys,
        active: activeKeys
      },
      requests: {
        total: totalRequests,
        today: requestsToday,
        errorRate,
        avgResponseTime
      },
      topApiKeys,
      systemHealth: {
        memory: process.memoryUsage(),
        uptime: process.uptime()
      }
    };
  }
} 