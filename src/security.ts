import { URL } from 'url';
import type { SecurityConfig, ValidationError } from './types';

// Default security configuration
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  allowedHosts: [], // Empty means all hosts allowed (for backwards compatibility)
  blockedHosts: [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '169.254.0.0/16', // AWS metadata
    '10.0.0.0/8',     // Private networks
    '172.16.0.0/12',
    '192.168.0.0/16'
  ],
  maxCssSize: 10 * 1024 * 1024, // 10MB
  maxConcurrentRequests: 5
};

export class SecurityValidator {
  private config: SecurityConfig;
  private activeRequests = 0;

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = { ...DEFAULT_SECURITY_CONFIG, ...config };
  }

  validateUrl(urlString: string): URL {
    try {
      const url = new URL(urlString);
      
      // Check protocol
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw this.createValidationError('INVALID_PROTOCOL', `Protocol ${url.protocol} not allowed`);
      }

      // Check for blocked hosts
      const hostname = url.hostname.toLowerCase();
      for (const blocked of this.config.blockedHosts) {
        if (this.isHostBlocked(hostname, blocked)) {
          throw this.createValidationError('BLOCKED_HOST', `Host ${hostname} is blocked`);
        }
      }

      // Check allowed hosts (if specified)
      if (this.config.allowedHosts.length > 0) {
        const allowed = this.config.allowedHosts.some(host => 
          hostname === host.toLowerCase() || hostname.endsWith('.' + host.toLowerCase())
        );
        if (!allowed) {
          throw this.createValidationError('HOST_NOT_ALLOWED', `Host ${hostname} is not in allowlist`);
        }
      }

      return url;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw this.createValidationError('INVALID_URL', `Invalid URL: ${message}`);
    }
  }

  async checkConcurrentRequests(): Promise<void> {
    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      throw this.createValidationError(
        'TOO_MANY_REQUESTS', 
        `Maximum ${this.config.maxConcurrentRequests} concurrent requests exceeded`
      );
    }
  }

  acquireRequest(): void {
    this.activeRequests++;
  }

  releaseRequest(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  validateContentSize(size: number): void {
    if (size > this.config.maxCssSize) {
      throw this.createValidationError(
        'CONTENT_TOO_LARGE',
        `Content size ${size} bytes exceeds limit of ${this.config.maxCssSize} bytes`
      );
    }
  }

  private isHostBlocked(hostname: string, blockedPattern: string): boolean {
    // Handle CIDR notation for IP ranges
    if (blockedPattern.includes('/')) {
      return this.isIpInCidr(hostname, blockedPattern);
    }
    
    // Exact match or subdomain match
    return hostname === blockedPattern || hostname.endsWith('.' + blockedPattern);
  }

  private isIpInCidr(ip: string, cidr: string): boolean {
    // Simple CIDR check - for production, use a proper IP library
    const [network, prefixLength] = cidr.split('/');
    if (!prefixLength) return ip === network;
    
    // Basic IPv4 check for common private ranges
    if (cidr === '10.0.0.0/8') return ip.startsWith('10.');
    if (cidr === '172.16.0.0/12') return !!ip.match(/^172\.(1[6-9]|2[0-9]|3[01])\./);
    if (cidr === '192.168.0.0/16') return ip.startsWith('192.168.');
    if (cidr === '169.254.0.0/16') return ip.startsWith('169.254.');
    
    return false;
  }

  private createValidationError(code: string, message: string): ValidationError {
    const error = new Error(message) as ValidationError;
    error.name = 'ValidationError';
    error.code = code;
    return error;
  }
} 