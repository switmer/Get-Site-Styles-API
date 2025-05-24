export interface ApiKeyData {
  id: string;
  key: string;
  name: string;
  createdAt: Date;
  lastUsedAt?: Date;
  usageCount: number;
  isActive: boolean;
  rateLimitTier: 'basic' | 'premium' | 'enterprise';
  monthlyLimit?: number;
  monthlyUsage: number;
  monthlyResetAt: Date;
}

export interface UsageLogEntry {
  id: string;
  apiKeyId: string;
  endpoint: string;
  method: string;
  timestamp: Date;
  responseTime: number;
  statusCode: number;
  requestSize: number;
  responseSize: number;
  clientIp: string;
  userAgent: string;
  parameters: Record<string, any>;
  error?: string;
}

export interface AnalyzeRequest {
  url: string;
  urls?: string[];
  format?: 'json' | 'style-dictionary' | 'shadcn' | 'tailwind' | 'theme-json';
  allFormats?: boolean;
  colorFormat?: 'hsl' | 'oklch' | 'hex';
  compact?: boolean;
  includeImages?: boolean;
  maxImages?: number;
  semanticAnalysis?: boolean;
  auth?: {
    type?: 'basic' | 'bearer' | 'cookie' | 'custom';
    username?: string;
    password?: string;
    token?: string;
    cookies?: string;
    headers?: Record<string, string>;
  };
}

export interface AnalyzeResponse {
  success: boolean;
  data?: any;
  meta?: {
    url: string;
    urls?: string[];
    extractedAt: string;
    format: string;
    processingTime: number;
    totalTokens?: Record<string, number>;
    semanticAnalysis?: {
      totalElements: number;
      buttonColors: number;
      brandColors: number;
    };
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
  requestId: string;
}

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: Record<string, any>;
  timestamp: string;
  requestId: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  apiKeys: {
    total: number;
    active: number;
  };
}

export interface UsageStatsResponse {
  apiKey: {
    id: string;
    name: string;
    usageCount: number;
    monthlyUsage: number;
    monthlyLimit?: number;
    rateLimitTier: string;
  };
  usage: {
    last24Hours: number;
    last7Days: number;
    last30Days: number;
    thisMonth: number;
  };
  endpoints: Array<{
    endpoint: string;
    count: number;
    avgResponseTime: number;
    errorRate: number;
  }>;
  rateLimits: {
    tier: string;
    windowMs: number;
    maxRequests: number;
    currentCount: number;
    resetsAt: string;
  };
}

// Rate limiting tiers
export const RATE_LIMIT_TIERS = {
  basic: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    monthlyLimit: 1000
  },
  premium: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 500,
    monthlyLimit: 10000
  },
  enterprise: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 2000,
    monthlyLimit: 100000
  }
} as const;

// API endpoints
export const API_ENDPOINTS = {
  // Main functionality
  ANALYZE: '/api/v1/analyze',
  ANALYZE_MULTI: '/api/v1/analyze/multi',
  
  // Utility endpoints
  HEALTH: '/api/v1/health',
  STATUS: '/api/v1/status',
  USAGE: '/api/v1/usage',
  
  // Admin endpoints
  ADMIN_KEYS: '/api/v1/admin/keys',
  ADMIN_USAGE: '/api/v1/admin/usage',
  ADMIN_STATS: '/api/v1/admin/stats',
  
  // Documentation
  DOCS: '/api/docs',
  OPENAPI: '/api/openapi.json'
} as const; 