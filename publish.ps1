# Publishes the extension to the Visual Studio Marketplace.
# Self-contained: installs tfx-cli into .\tools on first run, then calls it
# via node.exe directly. No PATH, no global installs, no .cmd shims.
# Run:  powershell -ExecutionPolicy Bypass -File E:\AzureDevOpsSendGridTask\publish.ps1
# You will be prompted for your Personal Access Token (Marketplace > Manage scope).

$ErrorActionPreference = 'Stop'

$node = "C:\Program Files\nodejs\node.exe"
$npm  = "C:\Program Files\nodejs\npm.cmd"
if (-not (Test-Path $node)) { throw "Node.js not found at $node" }

$tfxJs = Join-Path $PSScriptRoot 'tools\node_modules\tfx-cli\_build\tfx-cli.js'
if (-not (Test-Path $tfxJs)) {
    Write-Host "Installing tfx-cli into $PSScriptRoot\tools (one-time, ~1 min)..." -ForegroundColor Cyan
    & $npm install --prefix (Join-Path $PSScriptRoot 'tools') tfx-cli --no-fund --no-audit
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tfxJs)) { throw "tfx-cli installation failed." }
}

$vsix = Get-ChildItem "$PSScriptRoot\*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $vsix) { throw "No .vsix found in $PSScriptRoot. Run buildAndPackage.ps1 first." }

Write-Host "Publishing $($vsix.Name) ..." -ForegroundColor Cyan
& $node $tfxJs extension publish --vsix $vsix.FullName
