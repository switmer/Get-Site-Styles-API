# 🎨 Get-Site-Styles API Demo

An interactive demo showcasing the [Get-Site-Styles API](https://get-site-styles-api.onrender.com) - extract design tokens from any website and convert them to your preferred format.

## ✨ Features

- **🔍 Real-time Analysis**: Enter any website URL and see design tokens extracted instantly
- **🎨 Multiple Formats**: Choose from shadcn/ui, Tailwind CSS, JSON, Style Dictionary, or Theme JSON
- **🎭 Color Previews**: Visual color palette display for extracted themes
- **📋 Copy to Clipboard**: One-click copying of generated code
- **🔗 Live API Integration**: Connected to the production API
- **📱 Responsive Design**: Works beautifully on all devices

## 🚀 Live Demo

**Visit the live demo**: https://get-site-styles-demo-h962suk2l-switmers-projects.vercel.app

## 🛠️ Tech Stack

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Deployment**: Vercel

## 🏃‍♂️ Running Locally

```bash
# Clone the repository
git clone https://github.com/switmer/Get-Site-Styles-Demo.git
cd Get-Site-Styles-Demo

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
pnpm start
```

## 🔗 API Integration

This demo connects to the production Get-Site-Styles API:
- **Base URL**: `https://get-site-styles-api.onrender.com`
- **Documentation**: [API Docs](https://get-site-styles-api.onrender.com/api/docs)
- **GitHub**: [Get-Site-Styles-API](https://github.com/switmer/Get-Site-Styles-API)

## 📊 Supported Output Formats

### 🎯 shadcn/ui Theme
Ready-to-use CSS variables for shadcn/ui projects:
```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  /* ... */
}
```

### 🎨 Tailwind Config
Complete Tailwind CSS configuration:
```javascript
module.exports = {
  theme: {
    colors: {
      primary: 'hsl(221.2 83.2% 53.3%)',
      secondary: 'hsl(210 40% 98%)',
      // ...
    }
  }
}
```

### 📦 Raw JSON
Complete token data with metadata:
```json
{
  "colors": {
    "primary": "#3b82f6",
    "secondary": "#f8fafc"
  },
  "typography": {
    "fontFamily": ["Inter", "sans-serif"]
  }
}
```

## 🎮 How to Use

1. **Enter URL**: Type any website URL in the input field
2. **Choose Format**: Select your preferred output format
3. **Set Options**: Configure color format and other settings
4. **Extract**: Click "Extract Design Tokens" to analyze
5. **Copy & Use**: Copy the generated code to your project

## 🌟 Example Websites to Try

- `stripe.com` - Clean, modern design system
- `github.com` - Developer-focused interface
- `vercel.com` - Minimal, elegant styling
- `discord.com` - Gaming-inspired colors
- `netflix.com` - Bold, entertainment branding

## 🔑 API Authentication

The demo uses a public demo API key. For production use:

1. Get your API key from the [API documentation](https://get-site-styles-api.onrender.com/api/docs)
2. Replace the demo key in your integration
3. Enjoy unlimited access to design token extraction

## 🚀 Deploy Your Own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/switmer/Get-Site-Styles-Demo)

## 📝 License

MIT License - feel free to use this demo as a starting point for your own projects!

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines and submit a pull request.

---

**Built with ❤️ by the Get-Site-Styles team**
