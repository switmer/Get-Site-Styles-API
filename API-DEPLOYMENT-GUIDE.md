# Get-Site-Styles API - Deployment Guide

## 🎉 What We Built

You now have a **production-ready REST API** that converts your CLI tool into a web service with:

- ✅ **Full API Conversion**: All CLI options are now API parameters
- ✅ **Authentication & Security**: API key management with rate limiting
- ✅ **Usage Tracking**: Comprehensive logging and analytics
- ✅ **OpenAPI Documentation**: Swagger UI with complete API docs
- ✅ **Multi-format Support**: JSON, Style Dictionary, shadcn, Tailwind, theme.json
- ✅ **Production Ready**: Error handling, validation, monitoring
- ✅ **Cloud Deployment**: Vercel & Render configurations included

## 📁 New File Structure

```
src/api/
├── server.ts                 # Express server (main entry point)
├── types.ts                  # API interfaces & types
├── openapi.yaml              # API documentation spec
├── middleware/
│   └── auth.ts              # Authentication & rate limiting
└── services/
    ├── apiKeyService.ts     # API key management
    └── analysisService.ts   # Website analysis (CLI adapter)

examples/
└── api-client.js            # JavaScript client example

# Deployment configs
vercel.json                  # Vercel deployment
render.yaml                  # Render deployment
.env.example                 # Environment variables template
API-README.md               # Complete API documentation
```

## 🚀 CLI Options → API Parameters Mapping

| CLI Option | API Parameter | Description |
|------------|---------------|-------------|
| `--url <url>` | `url` | Primary website URL (required) |
| `--urls <urls>` | `urls` | Additional URLs array |
| `--format <format>` | `format` | Output format (json/style-dictionary/shadcn/tailwind/theme-json) |
| `--all-formats` | `allFormats` | Generate all formats |
| `--color-format <format>` | `colorFormat` | Color format (hsl/oklch/hex) |
| `--compact` | `compact` | Compact output |
| `--include-images` | `includeImages` | Analyze images |
| `--max-images <number>` | `maxImages` | Max images to analyze |
| `--semantic-analysis` | `semanticAnalysis` | Enable semantic analysis |
| `--auth-type <type>` | `auth.type` | Authentication type |
| `--auth-username <user>` | `auth.username` | Basic auth username |
| `--auth-password <pass>` | `auth.password` | Basic auth password |
| `--auth-token <token>` | `auth.token` | Bearer token |
| `--auth-cookies <cookies>` | `auth.cookies` | Cookie string |
| `--auth-headers <headers>` | `auth.headers` | Custom headers |

## 🎯 API Endpoints Overview

### Public Endpoints
- `GET /` - API information
- `GET /api/v1/health` - Health check
- `GET /api/docs` - Swagger documentation

### Authenticated Endpoints (API key required)
- `POST /api/v1/analyze` - **Main analysis endpoint**
- `GET /api/v1/usage` - Usage statistics
- `GET /api/v1/status` - User status

### Admin Endpoints (admin API key required)
- `GET /api/v1/admin/keys` - List API keys
- `POST /api/v1/admin/keys` - Create API key
- `PUT /api/v1/admin/keys/:key` - Update API key
- `DELETE /api/v1/admin/keys/:key` - Delete API key
- `GET /api/v1/admin/stats` - System statistics

## 🔐 Authentication Methods

Provide API key via any of these methods:

```bash
# Header method (recommended)
curl -H "X-API-Key: your_key" ...

# Bearer token method
curl -H "Authorization: Bearer your_key" ...

# Query parameter method
curl "...?apiKey=your_key"
```

## 💳 Rate Limiting Tiers

| Tier | Requests/15min | Monthly Limit | Use Case |
|------|----------------|---------------|----------|
| **Basic** | 100 | 1,000 | Personal/Development |
| **Premium** | 500 | 10,000 | Small Business |
| **Enterprise** | 2,000 | 100,000 | Large Scale |

## 🌐 Deployment Options

### Option 1: Vercel (Recommended for Serverless)

1. **Push to GitHub**
2. **Connect to Vercel**
3. **Set environment variables:**
   ```
   API_SECRET_KEY=random-secret-key
   ADMIN_API_KEY=your-admin-key
   DEFAULT_API_KEYS=demo-key-1,demo-key-2
   CORS_ORIGIN=*
   ```
4. **Deploy** - uses `vercel.json` config

**Vercel Deployment URL**: `https://your-project.vercel.app`

### Option 2: Render (Recommended for Always-On)

1. **Connect GitHub repository**
2. **Use included `render.yaml`**
3. **Environment variables auto-configured**
4. **Deploy**

**Render Features**:
- Always-on service (not serverless)
- Built-in SSL
- Health checks
- Auto-scaling

### Option 3: Docker/Self-Hosted

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install
COPY . .
RUN pnpm run build
EXPOSE 3000
CMD ["pnpm", "run", "api:start"]
```

```bash
# Build and run
docker build -t get-site-styles-api .
docker run -p 3000:3000 \
  -e API_SECRET_KEY=your-secret \
  -e ADMIN_API_KEY=your-admin-key \
  get-site-styles-api
```

## 🔧 Environment Configuration

### Required Environment Variables

```bash
# Security (required in production)
API_SECRET_KEY=your-super-secret-jwt-key-256-bits
ADMIN_API_KEY=admin-access-key

# Default API keys (for development)
DEFAULT_API_KEYS=demo-key-1,demo-key-2,demo-key-3

# Server configuration
PORT=3000
NODE_ENV=production

# CORS (adjust for your frontend domains)
CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com

# Rate limiting (optional - has defaults)
API_RATE_LIMIT_WINDOW_MS=900000
API_RATE_LIMIT_MAX_REQUESTS=100
```

### Optional Environment Variables

```bash
# Database (for persistent usage logs)
DATABASE_URL=postgresql://user:pass@host:port/db

# Logging
LOG_LEVEL=info

# Custom timeouts
REQUEST_TIMEOUT=30000
ANALYSIS_TIMEOUT=60000
```

## 🧪 Testing Your Deployment

### 1. Health Check
```bash
curl https://your-api-domain.com/api/v1/health
```

### 2. Basic Analysis
```bash
curl -X POST "https://your-api-domain.com/api/v1/analyze" \
  -H "X-API-Key: demo-key-1" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com", "format": "json"}'
```

### 3. Advanced Analysis
```bash
curl -X POST "https://your-api-domain.com/api/v1/analyze" \
  -H "X-API-Key: demo-key-1" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://stripe.com",
    "format": "shadcn",
    "colorFormat": "hsl",
    "semanticAnalysis": true,
    "includeImages": true
  }'
```

### 4. Admin Operations
```bash
# Create new API key
curl -X POST "https://your-api-domain.com/api/v1/admin/keys" \
  -H "X-API-Key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "Production Client", "tier": "premium"}'

# Get system stats
curl -X GET "https://your-api-domain.com/api/v1/admin/stats" \
  -H "X-API-Key: your-admin-key"
```

## 📊 Monitoring & Analytics

### Built-in Monitoring
- **Health checks**: `/api/v1/health`
- **Usage statistics**: `/api/v1/usage`
- **Admin dashboard**: `/api/v1/admin/stats`
- **Request logging**: Automatic usage tracking

### Metrics Available
- Request counts by endpoint
- Response times
- Error rates
- API key usage
- Rate limit status
- Memory/CPU usage

### External Monitoring
Add these for production:

```bash
# Application monitoring
npm install @sentry/node @sentry/tracing

# Performance monitoring  
npm install newrelic

# Uptime monitoring
# Use services like UptimeRobot, Pingdom, or DataDog
```

## 🔒 Security Best Practices

### Production Security Checklist

- [ ] **Strong API keys**: Use cryptographically secure random keys
- [ ] **HTTPS only**: Ensure SSL/TLS is enabled
- [ ] **CORS configuration**: Restrict to your domains only
- [ ] **Rate limiting**: Configure appropriate limits
- [ ] **Input validation**: All inputs are validated
- [ ] **Error handling**: No sensitive data in error responses
- [ ] **Logging**: Log access but not sensitive data
- [ ] **Updates**: Keep dependencies updated

### API Key Management

```bash
# Generate secure API keys
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Rotate keys regularly
# Implement key expiration if needed
# Monitor for unusual usage patterns
```

## 🚀 Scaling Considerations

### For High Traffic

1. **Database**: Move from in-memory to PostgreSQL/Redis
2. **Caching**: Add Redis for analysis results
3. **Load Balancing**: Use multiple instances
4. **CDN**: Cache static responses
5. **Queue System**: For long-running analysis

### Performance Optimization

```javascript
// Add to your deployment
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {
  // Start your server
}
```

## 📈 Usage Examples

### JavaScript/Node.js Client

```javascript
const { GetSiteStylesClient } = require('./examples/api-client');

const client = new GetSiteStylesClient('your-api-key', 'https://your-api.com');

// Analyze website
const result = await client.analyzeWebsite('https://github.com', {
  format: 'shadcn',
  semanticAnalysis: true
});

console.log(result.data.css);
```

### Python Client

```python
import requests

def analyze_website(url, api_key, format='json'):
    response = requests.post(
        'https://your-api.com/api/v1/analyze',
        headers={'X-API-Key': api_key},
        json={'url': url, 'format': format}
    )
    return response.json()

result = analyze_website('https://github.com', 'your-api-key', 'shadcn')
print(result['data']['css'])
```

### cURL Examples

```bash
# Basic analysis
curl -X POST "https://your-api.com/api/v1/analyze" \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com", "format": "json"}'

# Multi-source analysis
curl -X POST "https://your-api.com/api/v1/analyze" \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://shopify.com",
    "urls": ["https://shopify.dev", "https://polaris.shopify.com"],
    "allFormats": true,
    "semanticAnalysis": true
  }'
```

## 🆘 Troubleshooting

### Common Issues

1. **API key not working**
   ```bash
   # Check if key exists
   curl -H "X-API-Key: your-key" https://your-api.com/api/v1/status
   ```

2. **Rate limit errors**
   ```bash
   # Check usage
   curl -H "X-API-Key: your-key" https://your-api.com/api/v1/usage
   ```

3. **Analysis fails**
   ```bash
   # Check logs and try simpler request
   curl -X POST "https://your-api.com/api/v1/analyze" \
     -H "X-API-Key: your-key" \
     -d '{"url": "https://example.com", "format": "json"}'
   ```

### Support

- 📖 **Documentation**: Visit `/api/docs` on your deployed API
- 🐛 **Issues**: Check server logs and error responses
- 💬 **Help**: API returns detailed error messages

## 🎉 You're Ready to Deploy!

Your Get-Site-Styles CLI tool is now a **production-ready API** with:

✅ **Complete API conversion**  
✅ **Authentication & security**  
✅ **Usage tracking & analytics**  
✅ **Professional documentation**  
✅ **Multiple deployment options**  
✅ **Client examples**  
✅ **Production configurations**  

**Next Steps:**
1. Choose your deployment platform (Vercel/Render recommended)
2. Set up environment variables
3. Deploy and test
4. Share your API with the world! 🌍

**Your API will be available at**: `https://your-domain.com/api/v1/analyze`

**Documentation will be at**: `https://your-domain.com/api/docs` 