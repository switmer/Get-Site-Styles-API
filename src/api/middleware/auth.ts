import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ApiKeyService } from '../services/apiKeyService';
import { ApiErrorResponse } from '../types';

interface AuthenticatedRequest extends Request {
  apiKey?: any;
  requestId?: string;
  startTime?: number;
}

export class AuthMiddleware {
  constructor(private apiKeyService: ApiKeyService) {}

  // Add request ID and timing to all requests
  addRequestContext = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    req.requestId = uuidv4();
    req.startTime = Date.now();
    
    // Add request ID to response headers
    res.setHeader('X-Request-ID', req.requestId);
    
    next();
  };

  // Validate API key
  validateApiKey = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const apiKey = this.extractApiKey(req);
      
      if (!apiKey) {
        return this.sendError(res, 'MISSING_API_KEY', 'API key is required', 401, req.requestId!);
      }

      const keyData = await this.apiKeyService.validateApiKey(apiKey);
      
      if (!keyData) {
        return this.sendError(res, 'INVALID_API_KEY', 'Invalid or inactive API key', 401, req.requestId!);
      }

      // Check rate limits
      const rateLimitResult = await this.apiKeyService.checkRateLimit(keyData);
      
      if (!rateLimitResult.allowed) {
        const resetAt = rateLimitResult.resetAt?.toISOString();
        return this.sendError(res, 'RATE_LIMIT_EXCEEDED', 'Rate limit exceeded', 429, req.requestId!, {
          resetAt,
          retryAfter: Math.ceil((rateLimitResult.resetAt!.getTime() - Date.now()) / 1000)
        });
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining || 0);
      res.setHeader('X-RateLimit-Reset', rateLimitResult.resetAt?.toISOString() || '');

      req.apiKey = keyData;
      next();
    } catch (error) {
      return this.sendError(res, 'AUTH_ERROR', 'Authentication failed', 500, req.requestId!);
    }
  };

  // Log API usage
  logUsage = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(data: any) {
      // Log usage after response is sent
      const responseTime = Date.now() - (req.startTime || Date.now());
      
      if (req.apiKey) {
        // Don't await this - fire and forget
        const apiKeyService = (req as any).apiKeyService as ApiKeyService;
        if (apiKeyService) {
          apiKeyService.logUsage({
            apiKeyId: req.apiKey.key, // Use key as ID for now
            endpoint: req.path,
            method: req.method,
            responseTime,
            statusCode: res.statusCode,
            requestSize: JSON.stringify(req.body || {}).length,
            responseSize: typeof data === 'string' ? data.length : JSON.stringify(data).length,
            clientIp: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown',
            parameters: {
              ...req.query,
              ...req.params,
              body: req.body ? Object.keys(req.body) : []
            },
            error: res.statusCode >= 400 ? data : undefined
          }).catch(console.error);
        }
      }
      
      return originalSend.call(this, data);
    };

    // Make apiKeyService available to the logging function
    (req as any).apiKeyService = this.apiKeyService;
    
    next();
  };

  // Admin authentication (checks for admin-level API key)
  requireAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey || req.apiKey.rateLimitTier !== 'enterprise') {
      return this.sendError(res, 'ADMIN_REQUIRED', 'Admin access required', 403, req.requestId!);
    }
    next();
  };

  private extractApiKey(req: Request): string | null {
    // Try multiple sources for API key
    const authHeader = req.headers.authorization;
    
    // Bearer token format
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    // API key header
    const apiKeyHeader = req.headers['x-api-key'] as string;
    if (apiKeyHeader) {
      return apiKeyHeader;
    }
    
    // Query parameter
    const apiKeyQuery = req.query.apiKey as string;
    if (apiKeyQuery) {
      return apiKeyQuery;
    }
    
    return null;
  }

  private sendError(
    res: Response, 
    code: string, 
    message: string, 
    status: number, 
    requestId: string,
    details?: any
  ): void {
    const error: ApiErrorResponse = {
      success: false,
      error: {
        code,
        message,
        details
      },
      timestamp: new Date().toISOString(),
      requestId
    };
    
    res.status(status).json(error);
  }
} 