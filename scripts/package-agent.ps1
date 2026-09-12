[CmdletBinding()]
param(
  [string]$EnvironmentFile = (Join-Path $PSScriptRoot "..\env\.env.local"),
  [string]$OutputPath = (Join-Path $PSScriptRoot "..\appPackage\build\appPackage.local.zip")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvironmentFile -PathType Leaf)) {
  throw "Environment file not found: $EnvironmentFile. Copy env/.env.local.example to env/.env.local and fill in the values."
}

$values = @{}
foreach ($line in Get-Content -LiteralPath $EnvironmentFile) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
  $separator = $trimmed.IndexOf("=")
  if ($separator -lt 1) { continue }
  $values[$trimmed.Substring(0, $separator).Trim()] = $trimmed.Substring($separator + 1).Trim()
}

$sourceDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\appPackage"))
$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$stageDirectory = Join-Path $temporaryRoot ("parkassist-agent-" + [guid]::NewGuid().ToString("N"))
[System.IO.Directory]::CreateDirectory($stageDirectory) | Out-Null

try {
  Get-ChildItem -LiteralPath $sourceDirectory -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $stageDirectory
  }

  Get-ChildItem -LiteralPath $stageDirectory -File | Where-Object { $_.Extension -in ".json", ".txt" } | ForEach-Object {
    $content = Get-Content -LiteralPath $_.FullName -Raw
    foreach ($entry in $values.GetEnumerator()) {
      $content = $content.Replace('${{' + $entry.Key + '}}', [string]$entry.Value)
    }
    if ($content -match '\$\{\{[A-Z0-9_]+\}\}') {
      throw "Unresolved app-package token in $($_.Name): $($Matches[0])"
    }
    Set-Content -LiteralPath $_.FullName -Value $content -Encoding utf8
  }

  Get-ChildItem -LiteralPath $stageDirectory -Filter *.json | ForEach-Object {
    Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json | Out-Null
  }

  $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
  if (Test-Path -LiteralPath $resolvedOutput) { Remove-Item -LiteralPath $resolvedOutput }
  Compress-Archive -Path (Join-Path $stageDirectory "*") -DestinationPath $resolvedOutput -CompressionLevel Optimal
  Write-Host "Created $resolvedOutput"
} finally {
  $resolvedStage = [System.IO.Path]::GetFullPath($stageDirectory)
  if ($resolvedStage.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path -Leaf $resolvedStage).StartsWith("parkassist-agent-")) {
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force -ErrorAction SilentlyContinue
  }
}
