Write-Host "🚀 Vercel Deployment Tester" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

Write-Host "Waiting 60 seconds for Vercel to deploy..." -ForegroundColor Yellow
for ($i = 60; $i -gt 0; $i--) {
    Write-Host "`rTime remaining: $i seconds..." -NoNewline -ForegroundColor Yellow
    Start-Sleep -Seconds 1
}
Write-Host "`n`nTesting deployment...`n" -ForegroundColor Green

# Test 1: OPTIONS (CORS preflight)
Write-Host "Test 1: CORS Preflight (OPTIONS)" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "https://praiseand-worship.vercel.app/api/forgot-password" -Method OPTIONS -UseBasicParsing
    Write-Host "✅ SUCCESS - Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "   CORS Origin: $($response.Headers['Access-Control-Allow-Origin'])" -ForegroundColor Gray
    Write-Host "   Methods: $($response.Headers['Access-Control-Allow-Methods'])" -ForegroundColor Gray
} catch {
    Write-Host "❌ FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: POST request
Write-Host "Test 2: POST Request (Forgot Password)" -ForegroundColor Cyan
try {
    $body = @{ identifier = 'test@example.com'; method = 'email' } | ConvertTo-Json
    $response = Invoke-WebRequest -Uri "https://praiseand-worship.vercel.app/api/forgot-password" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
    Write-Host "✅ SUCCESS - Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404) {
        Write-Host "⚠️  User not found (but API is working!) - Status: 404" -ForegroundColor Yellow
        Write-Host "   This means the API is functional, just no user exists with that email." -ForegroundColor Gray
    } elseif ($statusCode -eq 405) {
        Write-Host "❌ FAILED - 405 Method Not Allowed (Still deploying or config issue)" -ForegroundColor Red
    } elseif ($statusCode -eq 500) {
        Write-Host "❌ FAILED - 500 Server Error (Check env variables)" -ForegroundColor Red
    } else {
        Write-Host "❌ FAILED - Status: $statusCode - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. If tests pass, open your app and test password reset" -ForegroundColor White
Write-Host "2. Clear browser cache (Ctrl+Shift+Delete)" -ForegroundColor White
Write-Host "3. Try forgot password with a real registered email" -ForegroundColor White
Write-Host "`nApp URL: https://swareshpawar.github.io/PraiseandWorship/" -ForegroundColor Yellow
