#!/usr/bin/env node

/**
 * Get-Site-Styles API Client Example
 * 
 * This script demonstrates how to use the Get-Site-Styles API
 * to extract design tokens from websites.
 */

const https = require('https');
const http = require('http');

class GetSiteStylesClient {
  constructor(apiKey, baseUrl = 'http://localhost:3000') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'GetSiteStyles-Client/1.0.0'
        }
      };

      if (data) {
        const jsonData = JSON.stringify(data);
        options.headers['Content-Length'] = Buffer.byteLength(jsonData);
      }

      const req = lib.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`API Error ${res.statusCode}: ${parsed.error?.message || 'Unknown error'}`));
            }
          } catch (error) {
            reject(new Error(`Parse error: ${error.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`Request error: ${error.message}`));
      });
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }

  async analyzeWebsite(url, options = {}) {
    const payload = {
      url,
      ...options
    };
    
    return this.makeRequest('/api/v1/analyze', 'POST', payload);
  }

  async getUsageStats() {
    return this.makeRequest('/api/v1/usage');
  }

  async getHealth() {
    return this.makeRequest('/api/v1/health');
  }

  async getStatus() {
    return this.makeRequest('/api/v1/status');
  }

  // Admin methods
  async createApiKey(name, tier = 'basic') {
    return this.makeRequest('/api/v1/admin/keys', 'POST', { name, tier });
  }

  async listApiKeys() {
    return this.makeRequest('/api/v1/admin/keys');
  }

  async getAdminStats() {
    return this.makeRequest('/api/v1/admin/stats');
  }
}

// Example usage functions
async function basicExample() {
  console.log('\n🎯 Basic Website Analysis Example');
  console.log('================================');
  
  const client = new GetSiteStylesClient('demo-key-1');
  
  try {
    const result = await client.analyzeWebsite('https://github.com', {
      format: 'json'
    });
    
    console.log('✅ Analysis completed successfully!');
    console.log(`📊 Processing time: ${result.meta?.processingTime}ms`);
    console.log(`🎨 Format: ${result.meta?.format}`);
    console.log('📄 Response:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function advancedExample() {
  console.log('\n🚀 Advanced Analysis with Semantic Features');
  console.log('==========================================');
  
  const client = new GetSiteStylesClient('demo-key-1');
  
  try {
    const result = await client.analyzeWebsite('https://stripe.com', {
      format: 'shadcn',
      colorFormat: 'hsl',
      semanticAnalysis: true,
      includeImages: true,
      maxImages: 5
    });
    
    console.log('✅ Advanced analysis completed!');
    console.log(`⚡ Processing time: ${result.meta?.processingTime}ms`);
    
    if (result.data?.css) {
      console.log('\n🎨 Generated shadcn CSS:');
      console.log('```css');
      console.log(result.data.css);
      console.log('```');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function multiSourceExample() {
  console.log('\n🔗 Multi-Source Analysis Example');
  console.log('================================');
  
  const client = new GetSiteStylesClient('demo-key-1');
  
  try {
    const result = await client.analyzeWebsite('https://shopify.com', {
      urls: ['https://shopify.dev'],
      allFormats: true,
      semanticAnalysis: true
    });
    
    console.log('✅ Multi-source analysis completed!');
    console.log(`🔗 Sources analyzed: ${result.meta?.sources?.length || 1}`);
    console.log(`⚡ Total processing time: ${result.meta?.processingTime}ms`);
    
    if (result.meta?.sources) {
      console.log('\n📋 Analyzed sources:');
      result.meta.sources.forEach((source, i) => {
        console.log(`  ${i + 1}. ${source.url} (${source.type})`);
      });
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function usageStatsExample() {
  console.log('\n📊 Usage Statistics Example');
  console.log('===========================');
  
  const client = new GetSiteStylesClient('demo-key-1');
  
  try {
    const stats = await client.getUsageStats();
    
    console.log('✅ Usage stats retrieved!');
    console.log(`🔑 API Key: ${stats.data?.apiKey?.name} (${stats.data?.apiKey?.rateLimitTier})`);
    console.log(`📈 Monthly usage: ${stats.data?.apiKey?.monthlyUsage}/${stats.data?.apiKey?.monthlyLimit || '∞'}`);
    console.log(`📅 Last 24h requests: ${stats.data?.usage?.last24Hours}`);
    console.log(`📊 Last 7d requests: ${stats.data?.usage?.last7Days}`);
    
    if (stats.data?.endpoints?.length > 0) {
      console.log('\n🎯 Top endpoints:');
      stats.data.endpoints.slice(0, 3).forEach((endpoint, i) => {
        console.log(`  ${i + 1}. ${endpoint.endpoint} - ${endpoint.count} requests`);
      });
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function adminExample() {
  console.log('\n👑 Admin Operations Example');
  console.log('===========================');
  
  const adminClient = new GetSiteStylesClient('admin-key-123');
  
  try {
    // Get admin stats
    const stats = await adminClient.getAdminStats();
    console.log('✅ Admin stats retrieved!');
    console.log(`🔑 Total API keys: ${stats.data?.apiKeys?.total} (${stats.data?.apiKeys?.active} active)`);
    console.log(`📊 Total requests: ${stats.data?.requests?.total}`);
    console.log(`📅 Requests today: ${stats.data?.requests?.today}`);
    console.log(`🎯 Error rate: ${stats.data?.requests?.errorRate}%`);
    
    // List API keys
    const keys = await adminClient.listApiKeys();
    console.log(`\n🗝️ API Keys (${keys.data?.length || 0}):`);
    keys.data?.forEach((key, i) => {
      console.log(`  ${i + 1}. ${key.name} - ${key.key} (${key.rateLimitTier})`);
    });
    
    // Create a new API key
    const newKey = await adminClient.createApiKey('Demo Client', 'premium');
    console.log(`\n🆕 Created new API key: ${newKey.data?.key}`);
    
  } catch (error) {
    console.error('❌ Admin error:', error.message);
  }
}

async function healthCheckExample() {
  console.log('\n🏥 Health Check Example');
  console.log('=======================');
  
  const client = new GetSiteStylesClient('demo-key-1');
  
  try {
    const health = await client.getHealth();
    
    console.log(`✅ API Status: ${health.status}`);
    console.log(`⏱️ Uptime: ${Math.round(health.uptime / 60)} minutes`);
    console.log(`💾 Memory: ${health.memory?.percentage}% used`);
    console.log(`🔑 API Keys: ${health.apiKeys?.active}/${health.apiKeys?.total} active`);
    console.log(`🕐 Timestamp: ${health.timestamp}`);
  } catch (error) {
    console.error('❌ Health check error:', error.message);
  }
}

// Main execution
async function main() {
  console.log('🎨 Get-Site-Styles API Client Examples');
  console.log('======================================');
  
  const examples = [
    healthCheckExample,
    basicExample,
    advancedExample,
    usageStatsExample,
    adminExample
  ];
  
  for (const example of examples) {
    try {
      await example();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between examples
    } catch (error) {
      console.error(`Example failed: ${error.message}`);
    }
  }
  
  console.log('\n🎉 All examples completed!');
  console.log('\n📖 For more information, visit: http://localhost:3000/api/docs');
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Get-Site-Styles API Client Examples

Usage: node api-client.js [options]

Options:
  --help, -h     Show this help message
  --basic        Run only basic example
  --advanced     Run only advanced example
  --admin        Run only admin example
  --health       Run only health check

Examples:
  node api-client.js                    # Run all examples
  node api-client.js --basic            # Run basic example only
  node api-client.js --health           # Health check only
    `);
    process.exit(0);
  }
  
  if (args.includes('--basic')) {
    basicExample();
  } else if (args.includes('--advanced')) {
    advancedExample();
  } else if (args.includes('--admin')) {
    adminExample();
  } else if (args.includes('--health')) {
    healthCheckExample();
  } else {
    main();
  }
}

module.exports = { GetSiteStylesClient }; 