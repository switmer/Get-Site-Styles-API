# Get-Site-Styles API

A production-ready REST API for extracting design tokens, colors, typography, and style properties from websites.

## 🚀 Features

- **🎨 Style Extraction**: Extract colors, typography, spacing, shadows, and more from any website
- **📱 Multiple Formats**: Output in JSON, Style Dictionary, shadcn/ui, Tailwind, or theme.json formats
- **🧠 Semantic Analysis**: Analyze HTML elements for semantic color importance (buttons, navigation, etc.)
- **🖼️ Image Analysis**: Extract brand colors from images (optional)
- **🔗 Multi-Source Analysis**: Combine analysis from multiple URLs for comprehensive design systems
- **🎯 Brand Color Detection**: Advanced algorithms to identify primary, secondary, and accent colors
- **🛡️ Framework Detection**: Automatically detect and filter out framework colors (Bootstrap, Material, etc.)
- **🔐 API Key Authentication**: Secure API access with usage tracking
- **⚡ Rate Limiting**: Tiered rate limiting (Basic/Premium/Enterprise)
- **📊 Usage Analytics**: Detailed usage statistics and monitoring
- **📖 OpenAPI Documentation**: Complete API documentation with Swagger UI

## 🏗️ Architecture

```
src/api/
├── server.ts              # Main Express server
├── types.ts               # TypeScript interfaces
├── openapi.yaml           # OpenAPI 3.0 specification
├── middleware/
│   └── auth.ts            # Authentication & rate limiting
└── services/
    ├── apiKeyService.ts   # API key management
    └── analysisService.ts # Website analysis logic
```

## 🚦 Quick Start

### Development

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start development server**:
   ```bash
   pnpm run api:dev
   ```

4. **Access the API**:
   - API: http://localhost:3000
   - Documentation: http://localhost:3000/api/docs
   - Health check: http://localhost:3000/api/v1/health

### Production Build

```bash
# Build TypeScript
pnpm run build

# Start production server
pnpm run api:start
```

## 🌐 Deployment

### Vercel

1. **Push to GitHub**
2. **Connect to Vercel**
3. **Set environment variables** in Vercel dashboard
4. **Deploy** - uses `vercel.json` configuration

### Render

1. **Connect GitHub repository**
2. **Use `render.yaml`** for configuration
3. **Set environment variables** in Render dashboard
4. **Deploy**

### Docker

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

## 🔐 Authentication

All endpoints (except health check) require an API key. Provide it via:

- **Header**: `X-API-Key: your_api_key`
- **Bearer token**: `Authorization: Bearer your_api_key`
- **Query parameter**: `?apiKey=your_api_key`

### Rate Limits

| Tier       | Requests/15min | Monthly Limit |
|------------|----------------|---------------|
| Basic      | 100            | 1,000         |
| Premium    | 500            | 10,000        |
| Enterprise | 2,000          | 100,000       |

## 📚 API Endpoints

### Main Endpoints

- `POST /api/v1/analyze` - Analyze website for design tokens
- `GET /api/v1/health` - Health check (no auth required)
- `GET /api/v1/usage` - Get usage statistics for your API key
- `GET /api/v1/status` - Get authenticated user status

### Admin Endpoints

- `GET /api/v1/admin/keys` - List all API keys
- `POST /api/v1/admin/keys` - Create new API key
- `PUT /api/v1/admin/keys/:key` - Update API key
- `DELETE /api/v1/admin/keys/:key` - Delete API key
- `GET /api/v1/admin/stats` - Get system statistics
- `GET /api/v1/admin/usage` - Get detailed usage logs

### Documentation

- `GET /api/docs` - Swagger UI documentation
- `GET /api/openapi.json` - OpenAPI specification

## 🎯 Usage Examples

### Basic Analysis

```bash
curl -X POST "http://localhost:3000/api/v1/analyze" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://github.com",
    "format": "json"
  }'
```

### Advanced Analysis with Semantic Features

```bash
curl -X POST "http://localhost:3000/api/v1/analyze" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://stripe.com",
    "format": "shadcn",
    "colorFormat": "hsl",
    "semanticAnalysis": true,
    "includeImages": true
  }'
```

### Multi-Source Analysis

```bash
curl -X POST "http://localhost:3000/api/v1/analyze" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://shopify.com",
    "urls": ["https://shopify.dev", "https://polaris.shopify.com"],
    "allFormats": true,
    "semanticAnalysis": true
  }'
```

### Authentication for Protected Sites

```bash
curl -X POST "http://localhost:3000/api/v1/analyze" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://protected-site.com",
    "format": "json",
    "auth": {
      "type": "basic",
      "username": "user",
      "password": "pass"
    }
  }'
```

## 📊 Response Examples

### JSON Format Response

```json
{
  "success": true,
  "data": {
    "tokens": {
      "colors": {
        "values": ["#0969da", "#24292f", "#ffffff"],
        "frequency": [
          { "value": "#0969da", "count": 15, "prevalence": 45.5 },
          { "value": "#24292f", "count": 12, "prevalence": 36.4 }
        ]
      },
      "fontSizes": {
        "values": ["14px", "16px", "20px"],
        "frequency": [
          { "value": "16px", "count": 8, "prevalence": 50.0 }
        ]
      }
    }
  },
  "meta": {
    "url": "https://github.com",
    "extractedAt": "2024-01-15T10:30:00Z",
    "format": "json",
    "processingTime": 2341
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### shadcn/ui Format Response

```json
{
  "success": true,
  "data": {
    "css": ":root {\n  --primary: 212 92% 45%;\n  --primary-foreground: 0 0% 100%;\n  --secondary: 210 40% 96%;\n  --secondary-foreground: 222 84% 5%;\n}\n.dark {\n  --primary: 212 92% 55%;\n  --primary-foreground: 222 84% 5%;\n}"
  },
  "meta": {
    "url": "https://github.com",
    "format": "shadcn",
    "processingTime": 1523
  }
}
```

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Security
API_SECRET_KEY=your-super-secret-jwt-key
API_RATE_LIMIT_WINDOW_MS=900000
API_RATE_LIMIT_MAX_REQUESTS=100

# Default API Keys (development only)
ADMIN_API_KEY=admin-key-123
DEFAULT_API_KEYS=demo-key-1,demo-key-2

# CORS
CORS_ORIGIN=*
```

### API Key Management

#### Create API Key (Admin)

```bash
curl -X POST "http://localhost:3000/api/v1/admin/keys" \
  -H "X-API-Key: admin-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Client",
    "tier": "premium"
  }'
```

#### List API Keys (Admin)

```bash
curl -X GET "http://localhost:3000/api/v1/admin/keys" \
  -H "X-API-Key: admin-key-123"
```

## 📈 Monitoring

### Health Check

```bash
curl http://localhost:3000/api/v1/health
```

### Usage Statistics

```bash
curl -X GET "http://localhost:3000/api/v1/usage" \
  -H "X-API-Key: your_api_key"
```

### Admin Statistics

```bash
curl -X GET "http://localhost:3000/api/v1/admin/stats" \
  -H "X-API-Key: admin-key-123"
```

## 🛡️ Security Features

- **API Key Authentication**: Secure token-based authentication
- **Rate Limiting**: Prevents abuse with configurable limits
- **CORS Protection**: Configurable cross-origin request handling
- **Helmet.js**: Security headers and protection
- **Input Validation**: Request validation and sanitization
- **Error Handling**: Secure error responses without information leakage

## 🚀 Performance

- **Connection Pooling**: Efficient HTTP client management
- **Request Caching**: Intelligent caching for repeated requests
- **Memory Management**: Efficient token extraction and processing
- **Streaming**: Large response handling
- **Timeouts**: Configurable request timeouts

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Load testing
pnpm test:load
```

## 📝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

ISC License - see LICENSE file for details

## 🆘 Support

- 📖 [Documentation](http://localhost:3000/api/docs)
- 🐛 [Issues](https://github.com/your-repo/issues)
- 💬 [Discussions](https://github.com/your-repo/discussions)

## 🗺️ Roadmap

- [ ] Database persistence for usage logs
- [ ] Webhook notifications
- [ ] Batch processing
- [ ] Real-time analysis
- [ ] Custom extraction rules
- [ ] Plugin system
- [ ] GraphQL API
- [ ] SDK libraries (Python, JavaScript, Go) 