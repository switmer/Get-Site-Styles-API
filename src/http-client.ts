import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import type { RequestConfig, ValidationError, AuthConfig } from './types';
import { SecurityValidator } from './security';

// Default request configuration
const DEFAULT_REQUEST_CONFIG: RequestConfig = {
  timeout: 30000, // 30 seconds
  maxContentLength: 50 * 1024 * 1024, // 50MB
  maxRedirects: 5,
  userAgent: 'Get-Site-Styles/1.0.0 (Design Token Extractor)'
};

export class HttpClient {
  private axiosInstance: AxiosInstance;
  private security: SecurityValidator;
  private config: RequestConfig;

  constructor(
    requestConfig: Partial<RequestConfig> = {},
    securityValidator?: SecurityValidator
  ) {
    this.config = { ...DEFAULT_REQUEST_CONFIG, ...requestConfig };
    this.security = securityValidator || new SecurityValidator();
    
    const axiosConfig: AxiosRequestConfig = {
      timeout: this.config.timeout,
      maxContentLength: this.config.maxContentLength,
      maxRedirects: this.config.maxRedirects,
      headers: {
        'User-Agent': this.config.userAgent,
        'Accept': 'text/html,application/xhtml+xml,text/css,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    };

    // Apply authentication if provided
    this.applyAuthentication(axiosConfig, this.config.auth);

    this.axiosInstance = axios.create(axiosConfig);

    // Add response interceptor for size validation
    this.axiosInstance.interceptors.response.use(
      (response) => {
        const contentLength = response.headers['content-length'];
        if (contentLength) {
          this.security.validateContentSize(parseInt(contentLength, 10));
        }
        return response;
      },
      (error) => Promise.reject(error)
    );
  }

  async fetchHtml(url: string): Promise<string> {
    const validatedUrl = this.security.validateUrl(url);
    
    try {
      await this.security.checkConcurrentRequests();
      this.security.acquireRequest();

      const response = await this.retryRequest(() => 
        this.axiosInstance.get(validatedUrl.toString(), {
          headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
        })
      );

      if (typeof response.data !== 'string') {
        throw this.createError('INVALID_CONTENT_TYPE', 'Response is not HTML text');
      }

      this.security.validateContentSize(Buffer.byteLength(response.data, 'utf8'));
      return response.data;
    } catch (error) {
      throw this.handleError(error, `Failed to fetch HTML from ${url}`);
    } finally {
      this.security.releaseRequest();
    }
  }

  async fetchCss(url: string): Promise<string> {
    const validatedUrl = this.security.validateUrl(url);
    
    try {
      await this.security.checkConcurrentRequests();
      this.security.acquireRequest();

      const response = await this.retryRequest(() =>
        this.axiosInstance.get(validatedUrl.toString(), {
          headers: { 'Accept': 'text/css,*/*;q=0.1' }
        })
      );

      if (typeof response.data !== 'string') {
        console.warn(`Non-text CSS response from ${url}, skipping`);
        return '';
      }

      this.security.validateContentSize(Buffer.byteLength(response.data, 'utf8'));
      return response.data;
    } catch (error) {
      const errorMessage = this.handleError(error, `Failed to fetch CSS from ${url}`);
      console.warn(errorMessage.message);
      return ''; // Return empty string for CSS failures to allow partial extraction
    } finally {
      this.security.releaseRequest();
    }
  }

  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    maxRetries: number = 3,
    backoffMs: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on validation errors or client errors (4xx)
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff
        const delay = backoffMs * Math.pow(2, attempt);
        console.warn(`Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  private isNonRetryableError(error: any): boolean {
    // Don't retry validation errors
    if (error && typeof error === 'object' && 'code' in error) {
      return true;
    }

    // Don't retry 4xx client errors (except 429 Too Many Requests)
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      return status >= 400 && status < 500 && status !== 429;
    }

    return false;
  }

  private handleError(error: any, context: string): ValidationError {
    // If it's already our validation error, preserve it
    if (error && typeof error === 'object' && 'code' in error) {
      return error as ValidationError;
    }

    // Handle Axios errors
    if (axios.isAxiosError(error)) {
      return this.createAxiosError(error, context);
    }

    // Handle generic errors
    const message = error instanceof Error ? error.message : String(error);
    return this.createError('UNKNOWN_ERROR', `${context}: ${message}`);
  }

  private createAxiosError(error: AxiosError, context: string): ValidationError {
    if (error.code === 'ECONNABORTED') {
      return this.createError('TIMEOUT', `${context}: Request timeout`);
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return this.createError('CONNECTION_ERROR', `${context}: Connection failed`);
    }

    if (error.response) {
      const status = error.response.status;
      if (status >= 400 && status < 500) {
        return this.createError('CLIENT_ERROR', `${context}: HTTP ${status}`);
      }
      if (status >= 500) {
        return this.createError('SERVER_ERROR', `${context}: HTTP ${status}`);
      }
    }

    return this.createError('NETWORK_ERROR', `${context}: ${error.message}`);
  }

  private createError(code: string, message: string): ValidationError {
    const error = new Error(message) as ValidationError;
    error.name = 'ValidationError';
    error.code = code;
    return error;
  }

  private applyAuthentication(axiosConfig: AxiosRequestConfig, auth?: AuthConfig): void {
    if (!auth) return;

    switch (auth.type) {
      case 'basic':
        if (auth.username && auth.password) {
          axiosConfig.auth = {
            username: auth.username,
            password: auth.password
          };
        }
        break;
      
      case 'bearer':
        if (auth.token) {
          axiosConfig.headers = {
            ...axiosConfig.headers,
            'Authorization': `Bearer ${auth.token}`
          };
        }
        break;
      
      case 'cookie':
        if (auth.cookies) {
          axiosConfig.headers = {
            ...axiosConfig.headers,
            'Cookie': auth.cookies
          };
        }
        break;
      
      case 'custom':
        if (auth.headers) {
          axiosConfig.headers = {
            ...axiosConfig.headers,
            ...auth.headers
          };
        }
        break;
    }
  }
} 