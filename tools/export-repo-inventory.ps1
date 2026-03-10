param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRepoPath,

    [string]$OutputRoot = "migration"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SourceRepoPath)) {
    throw "SourceRepoPath does not exist: $SourceRepoPath"
}

$resolvedSource = (Resolve-Path -LiteralPath $SourceRepoPath).Path
$repoName = Split-Path -Path $resolvedSource -Leaf
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

$outDir = Join-Path $OutputRoot "inventory-$repoName-$timestamp"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$excludeDirNames = @(
    ".git",
    "node_modules",
    ".next",
    ".vercel",
    "dist",
    "build",
    "coverage",
    "out"
)

function Should-ExcludePath {
    param([string]$FullPath)

    foreach ($dirName in $excludeDirNames) {
        if ($FullPath -match [regex]::Escape("\$dirName\")) {
            return $true
        }
    }

    return $false
}

function Get-LayerTag {
    param([string]$RelativePath)

    $path = $RelativePath.Replace("\\", "/").ToLowerInvariant()

    if ($path -match "^(api|server|backend|functions|lambda)/") { return "backend" }
    if ($path -match "^(src|public|app|pages|components|styles|assets)/") { return "frontend" }
    if ($path -match "(migrate|migration|seed|schema|sql)") { return "data" }
    if ($path -match "(dockerfile|render\.ya?ml|vercel\.json|\.github/workflows|deploy|pm2|nginx)") { return "deployment" }
    if ($path -match "(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|tsconfig\.json|vite\.config|next\.config)") { return "config" }

    return "other"
}

Write-Host "Scanning source repo: $resolvedSource"

$files = Get-ChildItem -LiteralPath $resolvedSource -Recurse -File |
    Where-Object { -not (Should-ExcludePath -FullPath $_.FullName) }

if (-not $files) {
    throw "No files found after exclusions in source repo: $resolvedSource"
}

$inventory = foreach ($file in $files) {
    $relative = $file.FullName.Substring($resolvedSource.Length).TrimStart('\\')
    [PSCustomObject]@{
        RelativePath = $relative
        Layer = Get-LayerTag -RelativePath $relative
        Extension = $file.Extension
        SizeBytes = $file.Length
        LastWriteTime = $file.LastWriteTimeUtc
    }
}

$csvPath = Join-Path $outDir "all-files.csv"
$inventory | Sort-Object RelativePath | Export-Csv -NoTypeInformation -Path $csvPath -Encoding UTF8

$layerSummaryPath = Join-Path $outDir "layer-summary.md"
$layerGroups = $inventory | Group-Object Layer | Sort-Object Name

$summaryLines = @()
$summaryLines += "# Source Repo Inventory Summary"
$summaryLines += ""
$summaryLines += "- Source: $resolvedSource"
$summaryLines += "- Generated: $(Get-Date -Format s)"
$summaryLines += "- Total files: $($inventory.Count)"
$summaryLines += ""

foreach ($group in $layerGroups) {
    $summaryLines += "## Layer: $($group.Name)"
    $summaryLines += "- File count: $($group.Count)"

    $top = $group.Group | Sort-Object RelativePath | Select-Object -First 40
    foreach ($entry in $top) {
        $summaryLines += "- $($entry.RelativePath)"
    }

    if ($group.Count -gt 40) {
        $summaryLines += "- ... ($($group.Count - 40) more)"
    }

    $summaryLines += ""
}

Set-Content -LiteralPath $layerSummaryPath -Value ($summaryLines -join [Environment]::NewLine) -Encoding UTF8

$envVarsPath = Join-Path $outDir "environment-variables.txt"
$envPattern = '(?<![A-Za-z0-9_])[A-Z][A-Z0-9_]{2,}(?![A-Za-z0-9_])'
$potentialEnv = New-Object System.Collections.Generic.HashSet[string]

foreach ($file in $files) {
    if ($file.Extension -in @('.js', '.ts', '.tsx', '.jsx', '.json', '.env', '.md', '.yml', '.yaml')) {
        $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($null -eq $content) { continue }

        $matches = [regex]::Matches($content, $envPattern)
        foreach ($match in $matches) {
            $value = $match.Value
            if ($value -match '^(API|URL|URI|KEY|TOKEN|SECRET|PASSWORD|USERNAME|EMAIL|PORT|MONGO|DB|TWILIO|SENDGRID|JWT|NODE_ENV|VERCEL|RENDER)') {
                $null = $potentialEnv.Add($value)
            }
        }
    }
}

$potentialEnv | Sort-Object | Set-Content -LiteralPath $envVarsPath -Encoding UTF8

$pkgJson = Join-Path $resolvedSource "package.json"
$depsOut = Join-Path $outDir "dependencies.json"

if (Test-Path -LiteralPath $pkgJson) {
    $pkg = Get-Content -LiteralPath $pkgJson -Raw | ConvertFrom-Json
    $depsPayload = [PSCustomObject]@{
        name = $pkg.name
        version = $pkg.version
        dependencies = $pkg.dependencies
        devDependencies = $pkg.devDependencies
        scripts = $pkg.scripts
    }
    $depsPayload | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $depsOut -Encoding UTF8
}

Write-Host "Inventory generated at: $outDir"
Write-Host "- all-files.csv"
Write-Host "- layer-summary.md"
Write-Host "- environment-variables.txt"
if (Test-Path -LiteralPath $depsOut) {
    Write-Host "- dependencies.json"
}
