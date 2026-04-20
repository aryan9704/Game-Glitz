param(
  [string]$OutputPath = (Join-Path (Join-Path $PSScriptRoot 'dist-release') 'gameglitz-release.zip')
)

$projectRoot = $PSScriptRoot
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("gameglitz-release-" + [guid]::NewGuid().ToString())
$stagingProject = Join-Path $stagingRoot 'Game Glitz'

$null = New-Item -ItemType Directory -Force -Path $stagingProject
$outputDir = Split-Path -Parent $OutputPath
if ($outputDir) {
  $null = New-Item -ItemType Directory -Force -Path $outputDir
}

$excludeDirs = @(
  (Join-Path $projectRoot 'server\node_modules'),
  (Join-Path $projectRoot 'dist-release'),
  (Join-Path $projectRoot '.git'),
  (Join-Path $projectRoot 'server\.mail-previews')
)

$excludeFiles = @(
  '.env',
  '.jwt-secret',
  '*.db',
  '*.db-shm',
  '*.db-wal',
  '*.log',
  '.tmp_*',
  '*.zip'
)

$robocopyArgs = @(
  $projectRoot,
  $stagingProject,
  '/E',
  '/R:1',
  '/W:1',
  '/NFL',
  '/NDL',
  '/NJH',
  '/NJS',
  '/NP'
)

if ($excludeDirs.Count -gt 0) {
  $robocopyArgs += '/XD'
  $robocopyArgs += $excludeDirs
}

if ($excludeFiles.Count -gt 0) {
  $robocopyArgs += '/XF'
  $robocopyArgs += $excludeFiles
}

& robocopy @robocopyArgs | Out-Null
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -ge 8) {
  throw "Release staging failed with robocopy exit code $robocopyExit."
}

if (Test-Path -LiteralPath $OutputPath) {
  Remove-Item -LiteralPath $OutputPath -Force
}

Compress-Archive -Path (Join-Path $stagingProject '*') -DestinationPath $OutputPath -Force
Remove-Item -LiteralPath $stagingRoot -Recurse -Force

Write-Host "Release archive created at $OutputPath"
