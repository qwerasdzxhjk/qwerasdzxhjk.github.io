param([int]$Port = 8001)

$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    node tools/build.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Site build failed.' }
    python tools/serve.py --port $Port
} finally {
    Pop-Location
}
