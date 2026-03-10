param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRepoPath,

    [Parameter(Mandatory = $true)]
    [string]$ManifestPath,

    [string]$OutputRoot = "migration"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SourceRepoPath)) {
    throw "SourceRepoPath does not exist: $SourceRepoPath"
}

if (-not (Test-Path -LiteralPath $ManifestPath)) {
    throw "ManifestPath does not exist: $ManifestPath"
}

$resolvedSource = (Resolve-Path -LiteralPath $SourceRepoPath).Path
$resolvedManifest = (Resolve-Path -LiteralPath $ManifestPath).Path
$repoName = Split-Path -Path $resolvedSource -Leaf
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

$bundleRoot = Join-Path $OutputRoot "bundle-$repoName-$timestamp"
$bundleSource = Join-Path $bundleRoot "source-files"
New-Item -ItemType Directory -Force -Path $bundleSource | Out-Null

$rawLines = Get-Content -LiteralPath $resolvedManifest
$requestedPaths = $rawLines |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and -not $_.StartsWith("#") }

if (-not $requestedPaths) {
    throw "Manifest contains no file paths. Add one relative source path per line."
}

$copied = New-Object System.Collections.Generic.List[string]
$missing = New-Object System.Collections.Generic.List[string]

foreach ($relativePath in $requestedPaths) {
    $sourceFile = Join-Path $resolvedSource $relativePath

    if (-not (Test-Path -LiteralPath $sourceFile)) {
        $missing.Add($relativePath)
        continue
    }

    $sourceItem = Get-Item -LiteralPath $sourceFile

    if ($sourceItem.PSIsContainer) {
        $childFiles = Get-ChildItem -LiteralPath $sourceFile -Recurse -File
        foreach ($child in $childFiles) {
            $childRelative = $child.FullName.Substring($resolvedSource.Length).TrimStart('\\')
            $targetFile = Join-Path $bundleSource $childRelative
            $targetDir = Split-Path -Path $targetFile -Parent
            New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
            Copy-Item -LiteralPath $child.FullName -Destination $targetFile -Force
            $copied.Add($childRelative)
        }
        continue
    }

    $targetFile = Join-Path $bundleSource $relativePath
    $targetDir = Split-Path -Path $targetFile -Parent
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

    Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
    $copied.Add($relativePath)
}

$reportPath = Join-Path $bundleRoot "copy-report.md"
$report = @()
$report += "# Migration Bundle Report"
$report += ""
$report += "- Source repo: $resolvedSource"
$report += "- Manifest: $resolvedManifest"
$report += "- Generated: $(Get-Date -Format s)"
$report += "- Copied files: $($copied.Count)"
$report += "- Missing entries: $($missing.Count)"
$report += ""
$report += "## Copied"
if ($copied.Count -eq 0) {
    $report += "- (none)"
} else {
    foreach ($item in ($copied | Sort-Object)) {
        $report += "- $item"
    }
}
$report += ""
$report += "## Missing"
if ($missing.Count -eq 0) {
    $report += "- (none)"
} else {
    foreach ($item in ($missing | Sort-Object)) {
        $report += "- $item"
    }
}

Set-Content -LiteralPath $reportPath -Value ($report -join [Environment]::NewLine) -Encoding UTF8

Write-Host "Bundle created at: $bundleRoot"
Write-Host "Copied files: $($copied.Count)"
if ($missing.Count -gt 0) {
    Write-Host "Missing entries: $($missing.Count)"
}
