# Builds the SendGrid email task extension into a .vsix package.
# Prerequisites: Node.js LTS on PATH. Installs tfx-cli globally if missing.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is not installed or not on PATH. Install it from https://nodejs.org and retry.'
}

Write-Host "Restoring task dependencies..." -ForegroundColor Cyan
Push-Location (Join-Path $root 'sendgrid-task')
try {
    npm install --omit=dev
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
}
finally {
    Pop-Location
}

if (-not (Get-Command tfx -ErrorAction SilentlyContinue)) {
    Write-Host "Installing tfx-cli..." -ForegroundColor Cyan
    npm install -g tfx-cli
    if ($LASTEXITCODE -ne 0) { throw 'tfx-cli installation failed.' }
}

Write-Host "Packaging extension..." -ForegroundColor Cyan
Push-Location $root
try {
    tfx extension create --manifest-globs vss-extension.json --output-path $root
    if ($LASTEXITCODE -ne 0) { throw 'tfx extension create failed.' }
}
finally {
    Pop-Location
}

Write-Host "Done. The .vsix package is in $root" -ForegroundColor Green
