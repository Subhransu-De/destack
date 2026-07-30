[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$Preview,
    [switch]$InstallGitBashIntegration
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$packageFamily = if ($Preview) {
    'Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe'
} else {
    'Microsoft.WindowsTerminal_8wekyb3d8bbwe'
}

$sourceSettings = Join-Path $PSScriptRoot 'settings.json'
$terminalState = Join-Path $env:LOCALAPPDATA "Packages\$packageFamily\LocalState"
$targetSettings = Join-Path $terminalState 'settings.json'

if (-not (Test-Path -LiteralPath $sourceSettings)) {
    throw "Setup file not found: $sourceSettings"
}

if (-not (Test-Path -LiteralPath $terminalState)) {
    throw "Windows Terminal data folder not found. Install and launch the requested Terminal edition first."
}

if ($PSCmdlet.ShouldProcess($targetSettings, 'Install Windows Terminal settings')) {
    if (Test-Path -LiteralPath $targetSettings) {
        $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backupSettings = "$targetSettings.backup-$timestamp"
        Copy-Item -LiteralPath $targetSettings -Destination $backupSettings
        Write-Host "Existing settings backed up to: $backupSettings"
    }

    Copy-Item -LiteralPath $sourceSettings -Destination $targetSettings -Force
    Write-Host "Windows Terminal settings installed to: $targetSettings"
}

if ($InstallGitBashIntegration) {
    $integrationSource = Join-Path $PSScriptRoot 'git-bash-integration.bash'
    $bashrc = Join-Path $env:USERPROFILE '.bashrc'
    $marker = '__WT_SHELL_INTEGRATION_LOADED'

    if (-not (Test-Path -LiteralPath $integrationSource)) {
        throw "Git Bash integration file not found: $integrationSource"
    }

    $alreadyInstalled = (Test-Path -LiteralPath $bashrc) -and
        (Select-String -LiteralPath $bashrc -SimpleMatch $marker -Quiet)

    if ($alreadyInstalled) {
        Write-Host 'Git Bash integration is already present; no change was made.'
    } elseif ($PSCmdlet.ShouldProcess($bashrc, 'Append Windows Terminal Git Bash integration')) {
        Add-Content -LiteralPath $bashrc -Value "`n"
        Get-Content -LiteralPath $integrationSource | Add-Content -LiteralPath $bashrc
        Write-Host "Git Bash integration appended to: $bashrc"
    }
}
