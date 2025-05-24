import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import yaml from 'yamljs';
import path from 'path';
import dotenv from 'dotenv';

import { ApiKeyService } from './services/apiKeyService';
import { AnalysisService } from './services/analysisService';
import { AuthMiddleware } from './middleware/auth';
import { API_ENDPOINTS } from './types';
import type { ApiSuccessResponse, ApiErrorResponse, AnalyzeRequest } from './types';

// Load environment variables
dotenv.config();

class GetSiteStylesServer {
  private app: express.Application;
  private apiKeyService: ApiKeyService;
  private analysisService: AnalysisService;
  private authMiddleware: AuthMiddleware;

  constructor() {
    this.app = express();
    this.apiKeyService = new ApiKeyService();
    this.analysisService = new AnalysisService();
    this.authMiddleware = new AuthMiddleware(this.apiKeyService);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS
    const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['*'];
    this.app.use(cors({
      origin: corsOrigins.includes('*') ? true : corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    }));

    // Logging - exclude health checks from verbose logs
    this.app.use(morgan('combined', {
      skip: (req: Request) => {
        // Skip logging for health checks to reduce log noise
        return req.url === '/api/v1/health' || req.url === '/';
      }
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request context (request ID, timing)
    this.app.use(this.authMiddleware.addRequestContext);
  }

  private setupRoutes(): void {
    // Public routes (no auth required)
    this.setupPublicRoutes();
    
    // Protected routes (require API key)
    this.setupProtectedRoutes();
    
    // Admin routes (require admin API key)
    this.setupAdminRoutes();
    
    // Documentation routes
    this.setupDocumentationRoutes();
  }

  private setupPublicRoutes(): void {
    // Health check
    this.app.get(API_ENDPOINTS.HEALTH, this.healthCheck.bind(this));
    
    // Root endpoint with API info
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'Get-Site-Styles API',
        version: '1.0.0',
        description: 'Extract design tokens from websites',
        documentation: `${req.protocol}://${req.get('host')}/api/docs`,
        endpoints: {
          analyze: `${req.protocol}://${req.get('host')}${API_ENDPOINTS.ANALYZE}`,
          health: `${req.protocol}://${req.get('host')}${API_ENDPOINTS.HEALTH}`,
          docs: `${req.protocol}://${req.get('host')}${API_ENDPOINTS.DOCS}`
        }
      });
    });
  }

  private setupProtectedRoutes(): void {
    // Apply authentication and usage logging to all protected routes
    this.app.use('/api/v1', 
      this.authMiddleware.validateApiKey,
      this.authMiddleware.logUsage
    );

    // Main analysis endpoint
    this.app.post(API_ENDPOINTS.ANALYZE, this.analyzeWebsite.bind(this));
    
    // Usage statistics
    this.app.get(API_ENDPOINTS.USAGE, this.getUsageStats.bind(this));
    
    // Status endpoint (similar to health but with user-specific info)
    this.app.get(API_ENDPOINTS.STATUS, this.getStatus.bind(this));
  }

  private setupAdminRoutes(): void {
    // Admin routes require additional admin check
    this.app.use('/api/v1/admin', this.authMiddleware.requireAdmin);
    
    // API key management
    this.app.get(API_ENDPOINTS.ADMIN_KEYS, this.listApiKeys.bind(this));
    this.app.post(API_ENDPOINTS.ADMIN_KEYS, this.createApiKey.bind(this));
    this.app.put('/api/v1/admin/keys/:key', this.updateApiKey.bind(this));
    this.app.delete('/api/v1/admin/keys/:key', this.deleteApiKey.bind(this));
    
    // Admin statistics
    this.app.get(API_ENDPOINTS.ADMIN_STATS, this.getAdminStats.bind(this));
    this.app.get(API_ENDPOINTS.ADMIN_USAGE, this.getAdminUsage.bind(this));
  }

  private setupDocumentationRoutes(): void {
    try {
      // Load OpenAPI spec
      const swaggerDocument = yaml.load(path.join(__dirname, 'openapi.yaml'));
      
      // Swagger UI
      this.app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Get-Site-Styles API Documentation'
      }));
      
      // Raw OpenAPI JSON
      this.app.get('/api/openapi.json', (req: Request, res: Response) => {
        res.json(swaggerDocument);
      });
    } catch (error) {
      console.warn('Failed to load OpenAPI documentation:', error);
    }
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      const error: ApiErrorResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Endpoint ${req.originalUrl} not found`,
          details: {
            method: req.method,
            url: req.originalUrl,
            availableEndpoints: Object.values(API_ENDPOINTS)
          }
        },
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId || 'unknown'
      };
      res.status(404).json(error);
    });

    // Global error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Global error handler:', err);
      
      const error: ApiErrorResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        },
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId || 'unknown'
      };
      
      res.status(500).json(error);
    });
  }

  // Route handlers
  private async healthCheck(req: Request, res: Response): Promise<void> {
    const memoryUsage = process.memoryUsage();
    const apiKeys = await this.apiKeyService.getAllApiKeys();
    
    const health = {
      status: 'healthy' as const,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
      },
      apiKeys: {
        total: apiKeys.length,
        active: apiKeys.filter(k => k.isActive).length
      }
    };
    
    // Only log health check requests in development or if they fail
    if (process.env.NODE_ENV === 'development' && health.status !== 'healthy') {
      console.log('Health check requested:', health);
    }
    
    res.json(health);
  }

  private async analyzeWebsite(req: Request, res: Response): Promise<void> {
    try {
      const request: AnalyzeRequest = req.body;
      
      // Basic validation
      if (!request.url) {
        res.status(400).json(this.createError('MISSING_URL', 'URL is required', req));
        return;
      }

      // Use real analysis service
      const analysisResult = await this.analysisService.analyzeWebsite(request);

      if (analysisResult.success) {
        const response: ApiSuccessResponse = {
          success: true,
          data: analysisResult.data,
          meta: analysisResult.meta,
          timestamp: new Date().toISOString(),
          requestId: (req as any).requestId
        };
        res.json(response);
      } else {
        const errorResponse = this.createError(
          analysisResult.error?.code || 'ANALYSIS_FAILED',
          analysisResult.error?.message || 'Analysis failed',
          req,
          analysisResult.error?.details
        );
        res.status(500).json(errorResponse);
      }
    } catch (error) {
      const errorResponse = this.createError(
        'ANALYSIS_FAILED',
        error instanceof Error ? error.message : 'Analysis failed',
        req,
        error instanceof Error ? error.stack : undefined
      );
      res.status(500).json(errorResponse);
    }
  }

  private async getUsageStats(req: Request, res: Response): Promise<void> {
    try {
      const apiKey = (req as any).apiKey;
      const stats = await this.apiKeyService.getApiKeyStats(apiKey.id);
      
      const response: ApiSuccessResponse = {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId
      };
      
      res.json(response);
    } catch (error) {
      const errorResponse = this.createError(
        'STATS_FAILED',
        error instanceof Error ? error.message : 'Failed to get usage stats',
        req
      );
      res.status(500).json(errorResponse);
    }
  }

  private async getStatus(req: Request, res: Response): Promise<void> {
    const apiKey = (req as any).apiKey;
    
    const status = {
      status: 'authenticated',
      timestamp: new Date().toISOString(),
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        tier: apiKey.rateLimitTier,
        monthlyUsage: apiKey.monthlyUsage,
        monthlyLimit: apiKey.monthlyLimit
      }
    };
    
    res.json(status);
  }

  // Admin endpoints
  private async listApiKeys(req: Request, res: Response): Promise<void> {
    try {
      const apiKeys = await this.apiKeyService.getAllApiKeys();
      
      // Don't expose the actual keys in the list
      const safeKeys = apiKeys.map(k => ({
        ...k,
        key: k.key.substring(0, 8) + '...' + k.key.substring(k.key.length - 4)
      }));
      
      const response: ApiSuccessResponse = {
        success: true,
        data: safeKeys,
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId
      };
      
      res.json(response);
    } catch (error) {
      const errorResponse = this.createError(
        'LIST_KEYS_FAILED',
        error instanceof Error ? error.message : 'Failed to list API keys',
        req
      );
      res.status(500).json(errorResponse);
    }
  }

  private async createApiKey(req: Request, res: Response): Promise<void> {
    try {
      const { name, tier = 'basic' } = req.body;
      
      if (!name) {
        res.status(400).json(this.createError('MISSING_NAME', 'Name is required', req));
        return;
      }
      
      const apiKey = await this.apiKeyService.createApiKey(name, tier);
      
      const response: ApiSuccessResponse = {
        success: true,
        data: apiKey,
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId
      };
      
      res.status(201).json(response);
    } catch (error) {
      const errorResponse = this.createError(
        'CREATE_KEY_FAILED',
        error instanceof Error ? error.message : 'Failed to create API key',
        req
      );
      res.status(500).json(errorResponse);
    }
  }

  private async updateApiKey(req: Request, res: Response): Promise<void> {
    try {
      const { key } = req.params;
      const updates = req.body;
      
      const updatedKey = await this.apiKeyService.updateApiKey(key, updates);
      
      if (!updatedKey) {
        res.status(404).json(this.createError('KEY_NOT_FOUND', 'API key not found', req));
        return;
      }
      
      const response: ApiSuccessResponse = {
        success: true,
        data: updatedKey,
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId
      };
      
      res.json(response);
    } catch (error) {
      const errorResponse = this.createError(
        'UPDATE_KEY_FAILED',
        error instanceof Error ? error.message : 'Failed to update API key',
        req
      );
      res.status(500).json(errorResponse);
    }
  }

  private async deleteApiKey(req: Request, res: Response): Promise<void> {
    try {
      const { key } = req.params;
      
      const deleted = await this.apiKeyService.deleteApiKey(key);
      
      if (!deleted) {
        res.status(404).json(this.createError('KEY_NOT_FOUND', 'API key not found', req));
        return;
      }
      
      const response: ApiSuccessResponse = {
        success: true,
        data: { deleted: true },
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId
      };
      
      res.json(response);
    } catch (error) {
      const errorResponse = this.createError(
        'DELETE_KEY_FAILED',
        error instanceof Error ? error.message : 'Failed to delete API key',
        req
      );
      res.status(500).json(errorResponse);
    }
  }

  private async getAdminStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.apiKeyService.getAdminStats();
      
      const response: ApiSuccessResponse = {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId
      };
      
      res.json(response);
    } catch (error) {
      const errorResponse = this.createError(
        'ADMIN_STATS_FAILED',
        error instanceof Error ? error.message : 'Failed to get admin stats',
        req
      );
      res.status(500).json(errorResponse);
    }
  }

  private async getAdminUsage(req: Request, res: Response): Promise<void> {
    try {
      const { apiKeyId, limit = 100 } = req.query;
      const logs = await this.apiKeyService.getUsageLogs(
        apiKeyId as string, 
        parseInt(limit as string)
      );
      
      const response: ApiSuccessResponse = {
        success: true,
        data: { logs },
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId
      };
      
      res.json(response);
    } catch (error) {
      const errorResponse = this.createError(
        'ADMIN_USAGE_FAILED',
        error instanceof Error ? error.message : 'Failed to get admin usage',
        req
      );
      res.status(500).json(errorResponse);
    }
  }

  private createError(code: string, message: string, req: Request, details?: any): ApiErrorResponse {
    return {
      success: false,
      error: {
        code,
        message,
        details
      },
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || 'unknown'
    };
  }

  public start(port: number = 3000): void {
    this.app.listen(port, () => {
      console.log(`🚀 Get-Site-Styles API server running on port ${port}`);
      console.log(`📖 Documentation: http://localhost:${port}/api/docs`);
      console.log(`🏥 Health check: http://localhost:${port}/api/v1/health`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000');
  const server = new GetSiteStylesServer();
  server.start(port);
}

export { GetSiteStylesServer }; 