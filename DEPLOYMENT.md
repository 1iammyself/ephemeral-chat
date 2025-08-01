# Ephemeral Chat - Deployment Guide

This guide provides step-by-step instructions for deploying the Ephemeral Chat application to production.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Backend Deployment (Render.com)](#backend-deployment)
3. [Frontend Deployment (Vercel)](#frontend-deployment)
4. [Environment Variables](#environment-variables)
5. [Custom Domain Setup](#custom-domain)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

- GitHub account
- Render.com account (for backend)
- Vercel account (for frontend)
- Redis instance (you can use Redis Cloud or Upstash for a managed solution)
- Domain name (optional)

## Backend Deployment (Render.com)

1. **Push your code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Deploy to Render**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New" and select "Web Service"
   - Connect your GitHub repository
   - Configure the service:
     - Name: `ephemeral-chat-backend`
     - Region: Choose the one closest to your users
     - Branch: `main`
     - Build Command: `npm install && cd client && npm install && npm run build`
     - Start Command: `npm start`
     - Instance Type: Free
     - Auto-Deploy: Yes

3. **Set up environment variables** in the Render dashboard:
   ```
   NODE_ENV=production
   PORT=10000
   CLIENT_URL=https://your-vercel-app-url.vercel.app
   REDIS_URL=your_redis_connection_string
   ```

4. **Deploy** and note the URL (e.g., `https://ephemeral-chat-backend.onrender.com`)

## Frontend Deployment (Vercel)

1. **Deploy to Vercel**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New" → "Project"
   - Import your GitHub repository
   - Configure the project:
     - Framework Preset: Vite
     - Root Directory: `client`
     - Build Command: `npm run build`
     - Output Directory: `dist`
     - Install Command: `npm install`

2. **Set up environment variables** in Vercel:
   ```
   VITE_API_URL=https://your-render-backend-url.onrender.com
   VITE_ENV=production
   ```

3. **Deploy** and note the frontend URL

## Environment Variables

### Backend (.env)
```
NODE_ENV=production
PORT=3001
CLIENT_URL=https://your-vercel-app-url.vercel.app
REDIS_URL=your_redis_connection_string
```

### Frontend (.env.production)
```
VITE_API_URL=https://your-render-backend-url.onrender.com
VITE_ENV=production
```

## Custom Domain (Optional)

### Backend (Render)
1. Go to your Render dashboard
2. Navigate to your web service
3. Click "Settings" → "Custom Domains"
4. Add your domain and follow the DNS setup instructions

### Frontend (Vercel)
1. Go to your Vercel project settings
2. Click "Domains"
3. Add your domain and follow the DNS setup instructions

## Docker Deployment (Alternative)

If you prefer to use Docker:

1. Build the Docker image:
   ```bash
   docker build -t ephemeral-chat .
   ```

2. Run with Docker Compose:
   ```bash
   docker-compose up -d
   ```

3. The application will be available at `http://localhost:3001`

## Troubleshooting

### Backend Issues
- **WebSocket connection failed**: Ensure CORS is properly configured and your backend URL is accessible
- **Redis connection issues**: Verify your Redis URL and that the service is running
- **Port conflicts**: Check if another service is using the same port

### Frontend Issues
- **API connection errors**: Verify `VITE_API_URL` is correctly set
- **Build failures**: Check the build logs in Vercel for specific errors
- **PWA not working**: Ensure the service worker is registered and the site is served over HTTPS

### General
- Check logs in both Render and Vercel dashboards
- Ensure all environment variables are set correctly
- Verify CORS settings if you encounter cross-origin issues

## Support

For additional help, please open an issue in the [GitHub repository](https://github.com/yourusername/ephemeral-chat).
