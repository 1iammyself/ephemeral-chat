# Ephemeral Chat - Deployment Guide

This guide provides step-by-step instructions for deploying the Ephemeral Chat application to production.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Option 1: Vercel Deployment (Recommended)](#option-1-vercel-deployment-recommended)
4. [Option 2: Render Deployment](#option-2-render-deployment)
5. [PWA Configuration](#pwa-configuration)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js (v16 or higher)
- npm (v8 or higher)
- Git
- MongoDB Atlas account (for database)
- Redis account (for caching)
- Vercel account (recommended) or Render account

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server
PORT=3001
NODE_ENV=production

# MongoDB
MONGODB_URI=your_mongodb_connection_string

# Redis
REDIS_URL=your_redis_connection_string

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

# Frontend URL (update after deployment)
VITE_API_URL=https://your-api-url.com
VITE_BASE_URL=/

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# Room settings
ROOM_EXPIRY_MINUTES=10
MAX_MESSAGES_PER_MINUTE=30
```

## Option 1: Vercel Deployment (Recommended)

### Backend (Serverless Functions)
1. **Deploy to Vercel**
   - Push your code to a GitHub/GitLab/Bitbucket repository
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New" → "Project"
   - Import your repository
   - Configure the project:
     - Framework Preset: Other
     - Root Directory: (leave as is)
     - Build Command: `npm install`
     - Output Directory: (leave empty)
     - Install Command: `npm install`
   - Add environment variables from your `.env` file
   - Click "Deploy"

### Frontend (Static Deployment)
1. **Update Environment Variables**
   - In your Vercel project settings, update:
     ```
     VITE_API_URL=https://your-vercel-app.vercel.app/api
     VITE_BASE_URL=/
     ```
2. **Enable PWA**
   - The PWA is automatically configured in `vite.config.js`
   - Ensure all required PWA assets exist in `client/public/`:
     - `pwa-192x192.png`
     - `pwa-512x512.png`
     - `maskable-icon.png`
     - `favicon.ico`

## Option 2: Render Deployment

### Backend (Web Service)
1. **Deploy to Render**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New" and select "Web Service"
   - Connect your repository
   - Configure the service:
     - Name: `ephemeral-chat`
     - Region: Choose the one closest to your users
     - Branch: `main` or your production branch
     - Build Command: `npm install && cd client && npm install && npm run build`
     - Start Command: `npm start`
     - Environment: Node
     - Node Version: 16 or higher
   - Add environment variables from your `.env` file
   - Click "Create Web Service"

### Frontend (Static Site)
1. **Update Environment Variables**
   - In your Render dashboard, update:
     ```
     VITE_API_URL=https://your-render-app.onrender.com
     VITE_BASE_URL=/
     ```
2. **Enable PWA**
   - The PWA is automatically configured in `vite.config.js`
   - Ensure all required PWA assets exist in `client/public/`

## PWA Configuration

The application is configured as a Progressive Web App with the following features:

### Key Features
- **Offline Support**: Caches static assets for offline use
- **Installable**: Can be installed on devices
- **Auto-update**: Automatically updates when new content is available
- **App-like Experience**: Full-screen, standalone mode

### Required Assets
Ensure these files exist in `client/public/`:
- `pwa-192x192.png` (192x192px)
- `pwa-512x512.png` (512x512px)
- `maskable-icon.png` (512x512px, maskable)
- `favicon.ico`

### Testing PWA
1. Build the app: `cd client && npm run build`
2. Serve the build: `npx serve -s dist`
3. Open Chrome DevTools → Application → Service Workers
4. Check "Offline" mode in DevTools → Network
5. Verify installation prompt in supported browsers

## Troubleshooting

### Common Issues

1. **PWA Not Installing**
   - Ensure you're using HTTPS in production
   - Verify all required icons exist in `public/`
   - Check browser console for service worker errors

2. **CORS Errors**
   - Verify `VITE_API_URL` matches your backend URL exactly
   - Check for trailing slashes in URLs

3. **Service Worker Not Registering**
   - Ensure the app is served over HTTPS in production
   - Check browser console for registration errors
   - Clear site data and hard refresh

4. **Build Failures**
   - Check logs in Vercel/Render for specific errors
   - Ensure all dependencies are properly installed
   - Verify Node.js version compatibility

### Getting Help

If you encounter issues:
1. Check the logs in your deployment platform
2. Verify all environment variables are set correctly
3. Open an issue with detailed error messages
4. Include steps to reproduce the issue

### Frontend Issues
- **API connection errors**: Verify `VITE_API_URL` is correctly set
- **Build failures**: Check the build logs in Vercel for specific errors
- **PWA not working**: Ensure the service worker is registered and the site is served over HTTPS

### Backend Issues
- **WebSocket connection failed**: Ensure CORS is properly configured and your backend URL is accessible
- **Redis connection issues**: Verify your Redis URL and that the service is running
- **Port conflicts**: Check if another service is using the same port
### General
- Check logs in both Render and Vercel dashboards
- Ensure all environment variables are set correctly
- Verify CORS settings if you encounter cross-origin issues

## Support

For additional help, please open an issue in the [GitHub repository](https://github.com/yourusername/ephemeral-chat).
