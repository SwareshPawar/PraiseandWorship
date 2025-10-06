# Render Deployment Guide for Praise & Worship App

## Changes Made for Render Compatibility

✅ **Server Startup Fixed**: Updated server.js to start in production mode (Render sets NODE_ENV=production)
✅ **CORS Updated**: Added support for all Render domains (`*.onrender.com`)  
✅ **Better Error Logging**: Enhanced environment variable debugging

## Required Environment Variables in Render Dashboard

Go to your Render service → Settings → Environment and add these:

### 🔑 Essential Variables:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/PraiseAndWorship?retryWrites=true&w=majority
JWT_SECRET=your_secure_random_string_here
```

### 📧 Optional (Email Features):
```
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_specific_password
```

## Deployment Steps:

### 1. Push Your Updated Code
```bash
git add .
git commit -m "Fix server startup for Render deployment"
git push origin main
```

### 2. In Render Dashboard:
1. Go to your service settings
2. Click "Environment" tab
3. Add the environment variables above
4. Click "Manual Deploy" or wait for auto-deploy

### 3. Monitor Deployment:
- Watch the build logs for "Successfully connected to MongoDB"
- Look for "Server running on port [PORT]"
- The app should no longer exit early

## Troubleshooting:

### If you still see "Application exited early":
1. **Check Environment Variables**: Make sure MONGODB_URI is properly set
2. **Check MongoDB Access**: Ensure your MongoDB Atlas allows connections from anywhere (0.0.0.0/0)
3. **Check Logs**: Look for the enhanced error messages showing available environment variables

### Common Issues:
- **Missing MONGODB_URI**: Most common cause - set it in Render environment variables
- **MongoDB Network Access**: Make sure your MongoDB Atlas cluster allows connections from all IPs
- **Wrong Database Name**: Ensure your MongoDB URI points to the 'PraiseAndWorship' database

### Expected Success Logs:
```
Successfully connected to MongoDB
Server running on port 10000
Environment: production
```

## MongoDB Atlas Configuration:
1. Go to Network Access in MongoDB Atlas
2. Add IP Address: `0.0.0.0/0` (Allow access from anywhere)
3. Or add Render's IP ranges if you prefer more security

## Current Server Configuration:
- ✅ Starts in both development and production modes
- ✅ Handles missing environment variables gracefully  
- ✅ Supports Render's dynamic port assignment
- ✅ Enhanced logging for debugging
- ✅ CORS configured for Render domains

## After Successful Deployment:
Your Praise & Worship app will be available at:
`https://your-service-name.onrender.com`

Test these features:
- [ ] Song browsing (Praise/Worship categories)
- [ ] User registration/login
- [ ] Setlist management
- [ ] Admin panel functionality