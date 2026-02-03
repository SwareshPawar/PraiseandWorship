# Vercel Serverless Functions - Complete Setup Guide

## ✅ What Was Created

### Shared Modules
1. **api/_db.js** - Database connection with caching for serverless
2. **api/_auth.js** - Authentication middleware and JWT helpers

### API Endpoints (Serverless Functions)
1. **api/health.js** - Health check endpoint (GET)
2. **api/songs.js** - Songs CRUD (GET, POST, PUT, DELETE)
3. **api/userdata.js** - User data management (GET, PUT)
4. **api/register.js** - User registration (POST)
5. **api/login.js** - User authentication (POST)
6. **api/forgot-password.js** - Password reset OTP (POST) - Already existed
7. **api/reset-password.js** - Password reset completion (POST) - Already existed
8. **api/recommendation-weights.js** - Recommendation weights (GET, PUT)
9. **api/users.js** - User management, admin only (GET, PUT)
10. **api/global-setlists.js** - Global setlists (GET, POST, PUT, DELETE)
11. **api/my-setlists.js** - Personal setlists (GET, POST, PUT, DELETE)

### Updated Configuration
- **vercel.json** - Routing configuration updated to use serverless functions

## 🚀 Deployment Steps

### 1. Environment Variables Required

Set these in your Vercel dashboard (Settings → Environment Variables):

```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret-key-change-this
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
TWILIO_ACCOUNT_SID=your-twilio-sid (optional)
TWILIO_AUTH_TOKEN=your-twilio-token (optional)
TWILIO_PHONE_NUMBER=your-twilio-phone (optional)
```

### 2. Deploy to Vercel

#### Option A: Via Vercel CLI
```bash
# Install Vercel CLI if not already installed
npm install -g vercel

# Deploy from project root
cd C:\Users\SwaResH\Documents\REPOS\PraiseandWorship
vercel --prod
```

#### Option B: Via Git Push
```bash
# Commit changes
git add .
git commit -m "feat: Add Vercel serverless functions for all API endpoints"
git push origin main

# Vercel will auto-deploy if connected to GitHub
```

### 3. Verify Deployment

Test each endpoint after deployment:

```bash
# Health check
curl https://praiseand-worship.vercel.app/api/health

# Songs (public GET)
curl https://praiseand-worship.vercel.app/api/songs

# Register new user
curl -X POST https://praiseand-worship.vercel.app/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","firstName":"Test","lastName":"User"}'

# Login
curl -X POST https://praiseand-worship.vercel.app/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

## 📊 Architecture

### Before (Monolithic)
```
/api/* → server.js (single Express app)
```

### After (Serverless)
```
/api/health → api/health.js (independent function)
/api/songs → api/songs.js (independent function)
/api/userdata → api/userdata.js (independent function)
... (each endpoint is independent)
```

## 🔧 How It Works

### Database Connection
- Each serverless function imports `_db.js`
- Connection is cached across function invocations
- Automatic reconnection on cold starts

### Authentication
- JWT token validated by `_auth.js` middleware
- Token format: `Authorization: Bearer <token>`
- Admin-only endpoints check `isAdmin` flag

### CORS
- All endpoints include CORS headers via `getCorsHeaders()`
- Supports multiple origins including GitHub Pages

## 📝 Key Differences from Express

| Feature | Express (server.js) | Vercel Serverless |
|---------|-------------------|-------------------|
| Routing | `app.get('/api/songs')` | Export handler function |
| Middleware | `app.use(authMiddleware)` | Call middleware in handler |
| Request/Response | Express req/res objects | Standard Node req/res |
| Database | Persistent connection | Connection pooling/caching |
| URL Params | `req.params.id` | Parse from `req.url` |

## ⚠️ Important Notes

### Cold Starts
- First request after inactivity may be slower (connection setup)
- Subsequent requests use cached connections

### Request Limitations
- Max execution time: 10 seconds (Hobby plan)
- Max payload size: 4.5 MB
- Connection pooling handles concurrency

### Cost Considerations
- Vercel Hobby plan: 100 GB-hours/month free
- Each function invocation counts toward quota
- Monitor usage in Vercel dashboard

## 🧪 Testing Checklist

- [ ] Health endpoint responds
- [ ] Songs GET returns data
- [ ] Songs POST requires authentication
- [ ] Songs PUT updates existing songs
- [ ] Songs DELETE requires admin
- [ ] User registration works
- [ ] User login returns JWT
- [ ] Password reset sends OTP
- [ ] Global setlists CRUD works
- [ ] My setlists CRUD works
- [ ] Recommendation weights update (admin)
- [ ] User management works (admin)

## 🔄 Switching Between Backends

The frontend (main1.js) now supports both:
- **Render**: Full Express server (current primary)
- **Vercel**: Serverless functions (new, needs testing)

To switch:
1. Open browser console
2. Go to Admin Panel → Backend Management
3. Click "Switch to Vercel" or "Switch to Render"

## 📚 Additional Resources

- [Vercel Serverless Functions Docs](https://vercel.com/docs/functions)
- [MongoDB Atlas Connection Pooling](https://www.mongodb.com/docs/atlas/manage-connections/)
- [JWT Best Practices](https://jwt.io/introduction)

## 🐛 Troubleshooting

### "Database connection failed"
- Check MONGODB_URI is set in Vercel environment variables
- Verify MongoDB Atlas allows Vercel IP addresses (use 0.0.0.0/0 for testing)

### "Invalid or expired token"
- Check JWT_SECRET matches between environments
- Verify token is being sent in Authorization header

### "Method not allowed"
- Verify HTTP method matches endpoint implementation
- Check CORS preflight (OPTIONS) is handled

### Function timeout
- Check MongoDB query performance
- Add indexes to frequently queried fields
- Optimize data fetching (limit, projection)

## 📦 Dependencies

All serverless functions use:
- `mongodb` - Database driver
- `jsonwebtoken` - JWT authentication
- `bcryptjs` - Password hashing
- `nodemailer` - Email sending (password reset)
- `twilio` - SMS sending (password reset, optional)

These should be listed in package.json dependencies (not devDependencies).
