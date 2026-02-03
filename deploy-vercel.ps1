# Vercel Deployment Script
# This script helps deploy and test the Vercel serverless functions

Write-Host "`n=== VERCEL DEPLOYMENT HELPER ===" -ForegroundColor Cyan

# Check if Vercel CLI is installed
Write-Host "`n1. Checking Vercel CLI..." -ForegroundColor Yellow
try {
    $vercelVersion = vercel --version 2>&1
    Write-Host "   Vercel CLI found: $vercelVersion" -ForegroundColor Green
} catch {
    Write-Host "   Vercel CLI not found. Installing..." -ForegroundColor Yellow
    Write-Host "   Run: npm install -g vercel" -ForegroundColor Cyan
    $install = Read-Host "   Install now? (y/n)"
    if ($install -eq 'y') {
        npm install -g vercel
    } else {
        Write-Host "   Please install Vercel CLI manually and run this script again" -ForegroundColor Red
        exit
    }
}

# Show current git status
Write-Host "`n2. Git Status:" -ForegroundColor Yellow
git status --short

# Prompt to commit changes
Write-Host "`n3. Commit Changes?" -ForegroundColor Yellow
$commit = Read-Host "   Commit all changes before deploying? (y/n)"
if ($commit -eq 'y') {
    $message = Read-Host "   Enter commit message"
    git add .
    git commit -m "$message"
    Write-Host "   Changes committed" -ForegroundColor Green
}

# Deploy to Vercel
Write-Host "`n4. Deploying to Vercel..." -ForegroundColor Yellow
Write-Host "   This will deploy to production" -ForegroundColor Cyan
$deploy = Read-Host "   Continue? (y/n)"

if ($deploy -eq 'y') {
    Write-Host "   Running: vercel --prod" -ForegroundColor Gray
    vercel --prod
    
    Write-Host "`n   Deployment initiated!" -ForegroundColor Green
    Write-Host "   Check status at: https://vercel.com/dashboard" -ForegroundColor Cyan
} else {
    Write-Host "   Deployment cancelled" -ForegroundColor Yellow
}

# Test endpoints
Write-Host "`n5. Test Endpoints?" -ForegroundColor Yellow
$test = Read-Host "   Run endpoint tests? (y/n)"

if ($test -eq 'y') {
    $vercelUrl = 'https://praiseand-worship.vercel.app'
    
    Write-Host "`n   Testing Health Endpoint..." -ForegroundColor Cyan
    try {
        $health = Invoke-WebRequest -Uri "$vercelUrl/api/health" -Method GET -UseBasicParsing
        $healthData = $health.Content | ConvertFrom-Json
        Write-Host "   Status: $($healthData.status)" -ForegroundColor Green
        Write-Host "   Database: $($healthData.database)" -ForegroundColor Green
    } catch {
        Write-Host "   FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host "`n   Testing Songs Endpoint..." -ForegroundColor Cyan
    try {
        $songs = Invoke-WebRequest -Uri "$vercelUrl/api/songs" -Method GET -UseBasicParsing
        $songsData = $songs.Content | ConvertFrom-Json
        Write-Host "   Total Songs: $($songsData.Count)" -ForegroundColor Green
    } catch {
        Write-Host "   FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host "`n   Testing Global Setlists Endpoint..." -ForegroundColor Cyan
    try {
        $setlists = Invoke-WebRequest -Uri "$vercelUrl/api/global-setlists" -Method GET -UseBasicParsing
        $setlistsData = $setlists.Content | ConvertFrom-Json
        Write-Host "   Total Setlists: $($setlistsData.Count)" -ForegroundColor Green
    } catch {
        Write-Host "   FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== DEPLOYMENT COMPLETE ===" -ForegroundColor Cyan
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Check Vercel dashboard for deployment status" -ForegroundColor Gray
Write-Host "2. Verify environment variables are set" -ForegroundColor Gray
Write-Host "3. Test in browser: $vercelUrl" -ForegroundColor Gray
Write-Host "4. Switch to Vercel backend in Admin Panel" -ForegroundColor Gray
Write-Host "`nEnvironment Variables Needed:" -ForegroundColor Yellow
Write-Host "- MONGODB_URI" -ForegroundColor Gray
Write-Host "- JWT_SECRET" -ForegroundColor Gray
Write-Host "- EMAIL_USER" -ForegroundColor Gray
Write-Host "- EMAIL_PASSWORD" -ForegroundColor Gray
