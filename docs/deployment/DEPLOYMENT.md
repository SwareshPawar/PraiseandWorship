# Vercel Deployment Guide for Praise & Worship App

## Current Status
✅ Vercel CLI installed
✅ vercel.json configured properly
✅ Code is ready for deployment

## Next Steps (After Vercel Limit Reset)

### 1. Deploy to Vercel
```bash
vercel --prod
```

### 2. Configure Environment Variables
After deployment, set these environment variables in your Vercel dashboard:

1. Go to https://vercel.com/dashboard
2. Select your "praiseandworship" project
3. Go to Settings → Environment Variables
4. Add the following variables:

**Required Environment Variables:**
- `MONGODB_URI`: Your MongoDB connection string
- `JWT_SECRET`: A secure random string for JWT tokens
- `PORT`: 3001 (though Vercel will override this)

**Optional Email Configuration:**
- `EMAIL_SERVICE`: gmail
- `EMAIL_USER`: your_email@gmail.com
- `EMAIL_PASSWORD`: your_app_specific_password

### 3. Domain Configuration
Your app will be available at:
- Production: `https://your-project-name.vercel.app`
- Or your custom domain if configured

### 4. Test Your Deployment
After deployment, test these features:
- [ ] Song browsing (Praise/Worship categories)
- [ ] User authentication/login
- [ ] Setlist creation and management
- [ ] Admin panel functionality

## Troubleshooting

### Common Issues:
1. **Environment Variables**: Make sure MONGODB_URI is properly set
2. **CORS**: The API is configured to accept requests from any domain
3. **Database Connection**: Verify your MongoDB Atlas allows connections from anywhere (0.0.0.0/0)

### Vercel Limits (Free Tier):
- 100 deployments per day
- 100GB bandwidth per month
- 10 second function execution limit

## Files Modified for Deployment:
- ✅ `vercel.json`: Configured for API routing and static file serving
- ✅ `api/index.js`: Already configured for Vercel serverless functions

## Alternative Deployment Options:
If you continue hitting limits, consider:
1. Upgrading to Vercel Pro ($20/month)
2. Using Netlify (similar free tier)
3. Using Railway (generous free tier)
4. Using Render (free tier available)

## Current Configuration:
```json
{
  "version": 2,
  "functions": {
    "api/*.js": {
      "includeFiles": "utils/**"
    }
  },
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/index.js"
    }
  ]
}
```

This configuration:
- Routes all API calls to `/api/index.js`
- Includes utility files for the serverless function
- Serves static files automatically