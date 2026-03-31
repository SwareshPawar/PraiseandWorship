# VERCEL ENVIRONMENT VARIABLES SETUP
# Add these to your Vercel Dashboard → Project → Settings → Environment Variables

## Required for Password Reset Email Functionality:
EMAIL_SERVICE=gmail
EMAIL_USER=swarjrs@gmail.com
EMAIL_PASSWORD=rfjfzxxvthksvxlq

## Database and Authentication:
MONGODB_URI=mongodb+srv://genericuser:Swar%40123@cluster0.ovya99h.mongodb.net/OldNewSongs?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=4c4a437c06c4fe8a39a32eb5a3751f1dea2fc427deab76a830286e3dba98dce3

## Optional - SMS (Twilio):
TWILIO_ACCOUNT_SID=ACdf61bafe64f598c7f5a30c6b6548a16e
TWILIO_AUTH_TOKEN=dc53ebc05ef9e9ffad354a98b2581568
TWILIO_PHONE_NUMBER=+919970011855

## Steps to Add to Vercel:
1. Go to https://vercel.com/dashboard
2. Find your PraiseandWorship project
3. Click Settings → Environment Variables
4. Add each variable above (Key = Value format)
5. Select "Production", "Preview", and "Development" for all variables
6. Click "Save"
7. Redeploy your project

## Why Use Vercel for Password Reset:
- ✅ Vercel supports SMTP/Gmail better than Render
- ✅ Your local development already works perfectly
- ✅ Vercel serverless functions are more reliable for email
- ✅ Keep using Render for other API calls (your choice)