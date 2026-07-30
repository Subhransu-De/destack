[CmdletBinding(SupportsShouldProcess)]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$targets = @(
    @{
        Source = Join-Path $PSScriptRoot '.bash_profile'
        Target = Join-Path $env:USERPROFILE '.bash_profile'
    },
    @{
        Source = Join-Path $PSScriptRoot '.bashrc'
        Target = Join-Path $env:USERPROFILE '.bashrc'
    }
)

$scriptSource = Join-Path $PSScriptRoot 'scripts'
$scriptTarget = Join-Path $env:USERPROFILE 'bash_scripts'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'

foreach ($item in $targets) {
    if (-not (Test-Path -LiteralPath $item.Source)) {
        throw "Setup file not found: $($item.Source)"
    }

    if ($PSCmdlet.ShouldProcess($item.Target, 'Install Bash startup file')) {
        if (Test-Path -LiteralPath $item.Target) {
            $backup = "$($item.Target).backup-$timestamp"
            Copy-Item -LiteralPath $item.Target -Destination $backup
            Write-Host "Existing file backed up to: $backup"
        }

        Copy-Item -LiteralPath $item.Source -Destination $item.Target -Force
        Write-Host "Installed: $($item.Target)"
    }
}

if (-not (Test-Path -LiteralPath $scriptSource)) {
    throw "Bash helper directory not found: $scriptSource"
}

if ($PSCmdlet.ShouldProcess($scriptTarget, 'Install Bash helper scripts')) {
    if (-not (Test-Path -LiteralPath $scriptTarget)) {
        New-Item -ItemType Directory -Path $scriptTarget | Out-Null
    }

    Get-ChildItem -LiteralPath $scriptSource -File -Filter '*.sh' | ForEach-Object {
        $target = Join-Path $scriptTarget $_.Name

        if (Test-Path -LiteralPath $target) {
            $backup = "$target.backup-$timestamp"
            Copy-Item -LiteralPath $target -Destination $backup
            Write-Host "Existing file backed up to: $backup"
        }

        Copy-Item -LiteralPath $_.FullName -Destination $target -Force
        Write-Host "Installed: $target"
    }
}

Write-Host 'Restart Git Bash or run: source ~/.bashrc'
