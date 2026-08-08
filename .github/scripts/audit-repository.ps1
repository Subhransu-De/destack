[CmdletBinding()]
param(
    [switch]$Staged
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-GitObjectBytes {
    param(
        [Parameter(Mandatory)]
        [string]$RepoRoot,

        [Parameter(Mandatory)]
        [string]$ObjectId
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new('git')
    $startInfo.WorkingDirectory = $RepoRoot
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.UseShellExecute = $false
    $startInfo.ArgumentList.Add('cat-file')
    $startInfo.ArgumentList.Add('blob')
    $startInfo.ArgumentList.Add($ObjectId)

    $process = [System.Diagnostics.Process]::Start($startInfo)
    $stream = [System.IO.MemoryStream]::new()
    $process.StandardOutput.BaseStream.CopyTo($stream)
    $standardError = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if ($process.ExitCode -ne 0) {
        throw "Unable to read Git blob '$ObjectId': $standardError"
    }

    return $stream.ToArray()
}

function Get-ShannonEntropy {
    param(
        [Parameter(Mandatory)]
        [string]$Value
    )

    $counts = @{}
    foreach ($character in $Value.ToCharArray()) {
        $key = [string]$character
        $counts[$key] = 1 + $(if ($counts.ContainsKey($key)) { $counts[$key] } else { 0 })
    }

    $entropy = 0.0
    foreach ($count in $counts.Values) {
        $probability = $count / $Value.Length
        $entropy -= $probability * [Math]::Log($probability, 2)
    }

    return $entropy
}

function Add-Finding {
    param(
        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [System.Collections.Generic.List[object]]$Findings,

        [Parameter(Mandatory)]
        [string]$Category,

        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [string]$Line
    )

    $Findings.Add([pscustomobject]@{
            Category = $Category
            Path     = $Path
            Line     = $Line
        })
}

$repoRoot = (& git rev-parse --show-toplevel 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
    throw 'Repository audit must run inside a Git repository.'
}

Push-Location -LiteralPath $repoRoot
try {
    $findings = [System.Collections.Generic.List[object]]::new()
    $blobPaths = @{}

    if ($Staged) {
        $changedPaths = @(
            & git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMRD
        )
        $stagedPaths = @(
            & git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR
        )

        if ($changedPaths.Count -eq 0) {
            throw 'No staged changes were found.'
        }

        Write-Host "Auditing $($stagedPaths.Count) exact staged blobs..."

        foreach ($path in $changedPaths) {
            if (
                $path -notin @('AGENTS.md', 'CLAUDE.md') -and
                $path -notmatch '^(\.github|bash_setup|claude|windows_terminal)/'
            ) {
                Add-Finding $findings 'Top-level scope violation' $path '-'
            }

            if ($path -notmatch '^[A-Za-z0-9._/-]+$') {
                Add-Finding $findings 'Unsafe or ambiguous filename' $path '-'
            }
        }

        foreach ($path in $stagedPaths) {
            $entry = & git ls-files --stage -- $path
            if ($entry -notmatch '^(\d+) ([0-9a-f]{40}) \d+\t(.+)$') {
                Add-Finding $findings 'Malformed staged Git entry' $path '-'
                continue
            }

            $mode = $Matches[1]
            $blobId = $Matches[2]

            if ($mode -ne '100644') {
                Add-Finding $findings "Disallowed Git mode $mode" $path '-'
            }

            if (-not $blobPaths.ContainsKey($blobId)) {
                $blobPaths[$blobId] = [System.Collections.Generic.HashSet[string]]::new()
            }
            $null = $blobPaths[$blobId].Add($path)
        }
    } else {
        $commitIds = @(& git rev-list --all | Sort-Object -Unique)

        if ($commitIds.Count -eq 0) {
            throw 'No reachable commits were found.'
        }

        Write-Host "Auditing $($commitIds.Count) reachable commits..."

        # GitHub checks out a synthetic merge commit for pull requests. Its
        # generated metadata is not part of the repository history being
        # audited, so exclude that one CI-only commit from the history scan.
        if (
            $env:GITHUB_REF -match '^refs/pull/\d+/merge$' -and
            -not [string]::IsNullOrWhiteSpace($env:GITHUB_SHA)
        ) {
            $commitIds = @($commitIds | Where-Object { $_ -ne $env:GITHUB_SHA })
            Write-Host "Excluded the synthetic pull-request merge commit from the audit."
        }

        $allowedEmailPatterns = @(
            '^[0-9]+\+[^@]+@users\.noreply\.github\.com$',
            '^[^@]+@users\.noreply\.github\.com$',
            '^noreply@github\.com$'
        )

        foreach ($commitId in $commitIds) {
            $rawCommit = & git cat-file commit $commitId | Out-String
            if ($LASTEXITCODE -ne 0) {
                throw "Unable to read commit '$commitId'."
            }

            if ($rawCommit -match '(?m)^gpgsig ') {
                Add-Finding $findings 'Embedded commit signature' $commitId.Substring(0, 12) '-'
            }

            foreach ($headerName in @('author', 'committer')) {
                $header = [regex]::Match(
                    $rawCommit,
                    "(?m)^$headerName .+ <([^>]+)> \d+ ([+-]\d{4})\r?$"
                )

                if (-not $header.Success) {
                    Add-Finding $findings "Malformed $headerName metadata" $commitId.Substring(0, 12) '-'
                    continue
                }

                $email = $header.Groups[1].Value
                $timezone = $header.Groups[2].Value
                $emailAllowed = $false

                foreach ($pattern in $allowedEmailPatterns) {
                    if ($email -match $pattern) {
                        $emailAllowed = $true
                        break
                    }
                }

                if (-not $emailAllowed) {
                    Add-Finding $findings "Non-noreply $headerName email" $commitId.Substring(0, 12) '-'
                }

                if ($timezone -ne '+0000') {
                    Add-Finding $findings "Non-UTC $headerName timezone" $commitId.Substring(0, 12) '-'
                }
            }

            foreach ($entry in @(& git ls-tree -r $commitId)) {
                if ($entry -notmatch '^(\d+) blob ([0-9a-f]{40})\t(.+)$') {
                    Add-Finding $findings 'Non-regular Git tree entry' $commitId.Substring(0, 12) '-'
                    continue
                }

                $mode = $Matches[1]
                $blobId = $Matches[2]
                $path = $Matches[3]

                if ($mode -ne '100644') {
                    Add-Finding $findings "Disallowed Git mode $mode" $path '-'
                }

                if (
                    $path -notin @('AGENTS.md', 'CLAUDE.md') -and
                    $path -notmatch '^(\.github|bash_setup|claude|windows_terminal)/'
                ) {
                    Add-Finding $findings 'Top-level scope violation' $path '-'
                }

                if ($path -notmatch '^[A-Za-z0-9._/-]+$') {
                    Add-Finding $findings 'Unsafe or ambiguous filename' $path '-'
                }

                if (-not $blobPaths.ContainsKey($blobId)) {
                    $blobPaths[$blobId] = [System.Collections.Generic.HashSet[string]]::new()
                }
                $null = $blobPaths[$blobId].Add($path)
            }
        }
    }

    Write-Host "Auditing $($blobPaths.Count) unique historical blobs..."

    $patterns = @(
        @{
            Category = 'Email address'
            Pattern  = '(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b'
        },
        @{
            Category = 'Windows absolute path'
            Pattern  = '(?i)\b[A-Z]:[\\/][^\s"''`]+'
        },
        @{
            Category = 'Unix user path'
            Pattern  = '(?i)(?:^|[\s"''])/(?:home|Users)/[^/\s"'']+'
        },
        @{
            Category = 'IPv4 address'
            Pattern  = '(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])'
        },
        @{
            Category = 'MAC address'
            Pattern  = '(?i)\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b'
        },
        @{
            Category = 'Windows SID'
            Pattern  = '\bS-1-(?:\d+-){1,14}\d+\b'
        },
        @{
            Category = 'UUID or GUID'
            Pattern  = '(?i)\{?\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b\}?'
        },
        @{
            Category = 'Private key'
            Pattern  = '-----BEGIN [A-Z ]*PRIVATE KEY-----'
        },
        @{
            Category = 'SSH public key'
            Pattern  = '\b(?:ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp\d+)\s+[A-Za-z0-9+/=]{40,}'
        },
        @{
            Category = 'GitHub token'
            Pattern  = '\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b'
        },
        @{
            Category = 'AWS access key'
            Pattern  = '\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'
        },
        @{
            Category = 'JWT'
            Pattern  = '\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b'
        },
        @{
            Category = 'Credential in URL'
            Pattern  = '(?i)\b[a-z][a-z0-9+.-]*://[^\s/:]+:[^\s/@]+@'
        }
    )

    $allowedGuids = @(
        '2ece5bfe-50ed-5f3a-ab87-5cd4baafed2b',
        '574e775e-4f2a-5b96-ac1e-a2962a402336'
    )

    $exactValueCandidates = @(
        $env:GITHUB_REPOSITORY_OWNER,
        $env:GITHUB_ACTOR,
        $env:GITHUB_TRIGGERING_ACTOR,
        $env:GITHUB_REPOSITORY
    )

    if ($env:GITHUB_ACTIONS -ne 'true') {
        $exactValueCandidates += @(
            $env:USERNAME,
            $env:USER,
            $env:COMPUTERNAME,
            $env:HOSTNAME,
            $env:USERDOMAIN,
            $env:USERDNSDOMAIN,
            $env:USERPROFILE,
            $env:HOME,
            $env:LOCALAPPDATA,
            $env:APPDATA,
            $env:OneDrive,
            (& git config --global --get user.name),
            (& git config --global --get user.email)
        )

        try {
            $exactValueCandidates += [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        } catch {
            Write-Verbose "Windows SID probe unavailable: $_"
        }

        try {
            $system = Get-CimInstance Win32_ComputerSystemProduct -ErrorAction Stop
            $exactValueCandidates += $system.UUID
            $exactValueCandidates += $system.IdentifyingNumber
        } catch {
            Write-Verbose "System identity probes unavailable: $_"
        }

        try {
            $bios = Get-CimInstance Win32_BIOS -ErrorAction Stop
            $exactValueCandidates += $bios.SerialNumber
        } catch {
            Write-Verbose "BIOS serial probe unavailable: $_"
        }

        try {
            $exactValueCandidates += Get-ItemPropertyValue `
                -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' `
                -Name MachineGuid `
                -ErrorAction Stop
        } catch {
            Write-Verbose "MachineGuid probe unavailable: $_"
        }

        try {
            $exactValueCandidates += @(
                Get-NetAdapter -Physical -ErrorAction Stop |
                    ForEach-Object MacAddress
            )
        } catch {
            Write-Verbose "MAC address probes unavailable: $_"
        }

        try {
            $exactValueCandidates += @(
                Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
                    Where-Object IPAddress -NotMatch '^(127\.|169\.254\.)' |
                    ForEach-Object IPAddress
            )
        } catch {
            Write-Verbose "IPv4 probes unavailable: $_"
        }
    }

    $ignoredExactValues = @(
        'default string',
        'none',
        'system serial number',
        'to be filled by o.e.m.',
        'unknown',
        'workgroup'
    )

    $exactValues = $exactValueCandidates |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and $_.Length -ge 4 } |
        Where-Object { $_.ToLowerInvariant() -notin $ignoredExactValues } |
        Sort-Object -Unique

    $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)

    foreach ($blobId in $blobPaths.Keys) {
        $bytes = Get-GitObjectBytes -RepoRoot $repoRoot -ObjectId $blobId
        $paths = @($blobPaths[$blobId] | Sort-Object)
        $displayPath = $paths -join ','
        $allPathsAreDependabotConfig = (
            $paths.Count -gt 0 -and
            @(
                $paths |
                    Where-Object { $_ -match '^\.github/dependabot\.ya?ml$' }
            ).Count -eq $paths.Count
        )

        if ($bytes -contains 0) {
            Add-Finding $findings 'Binary historical blob' $displayPath '-'
            continue
        }

        try {
            $content = $strictUtf8.GetString($bytes)
        } catch {
            Add-Finding $findings 'Non-UTF-8 historical blob' $displayPath '-'
            continue
        }

        $lines = @($content -split "`r?`n")
        $configIdentityValues = @()
        if ($allPathsAreDependabotConfig) {
            $inAssignmentList = $false
            foreach ($configLine in $lines) {
                if ($configLine -match '^\s*(assignees|reviewers):\s*$') {
                    $inAssignmentList = $true
                    continue
                }

                if ($inAssignmentList) {
                    if (
                        $configLine -match '^\s*-\s*["'']?([A-Za-z0-9][A-Za-z0-9-]*)["'']?\s*$'
                    ) {
                        $configIdentityValues += $Matches[1]
                        continue
                    }

                    if (
                        $configLine -notmatch '^\s*$' -and
                        $configLine -notmatch '^\s*-\s*'
                    ) {
                        $inAssignmentList = $false
                    }
                }
            }

            $configIdentityValues = $configIdentityValues | Sort-Object -Unique
        }

        foreach ($value in $exactValues) {
            if (
                $allPathsAreDependabotConfig -and
                $value -in $configIdentityValues
            ) {
                continue
            }

            if (
                $displayPath.IndexOf(
                    $value,
                    [System.StringComparison]::OrdinalIgnoreCase
                ) -ge 0 -or
                $content.IndexOf(
                    $value,
                    [System.StringComparison]::OrdinalIgnoreCase
                ) -ge 0
            ) {
                Add-Finding $findings 'Repository account identifier' $displayPath '-'
            }
        }

        for ($lineIndex = 0; $lineIndex -lt $lines.Count; $lineIndex++) {
            $line = $lines[$lineIndex]

            foreach ($definition in $patterns) {
                foreach ($match in [regex]::Matches($line, $definition.Pattern)) {
                    if ($definition.Category -eq 'UUID or GUID') {
                        $normalizedGuid = $match.Value.Trim('{}').ToLowerInvariant()
                        if ($normalizedGuid -in $allowedGuids) {
                            continue
                        }
                    }

                    Add-Finding `
                        $findings `
                        $definition.Category `
                        $displayPath `
                        ([string]($lineIndex + 1))
                }
            }

            foreach (
                $match in [regex]::Matches(
                    $line,
                    '(?<![A-Za-z0-9+/_=-])[A-Za-z0-9+/_=-]{40,}(?![A-Za-z0-9+/_=-])'
                )
            ) {
                $candidate = $match.Value
                if (
                    $candidate -match '_8wekyb3d8bbwe$' -or
                    $candidate.Trim('{}').ToLowerInvariant() -in $allowedGuids
                ) {
                    continue
                }

                if ((Get-ShannonEntropy $candidate) -ge 4.3) {
                    Add-Finding `
                        $findings `
                        'High-entropy value' `
                        $displayPath `
                        ([string]($lineIndex + 1))
                }
            }
        }
    }

    $uniqueFindings = @(
        $findings |
            Sort-Object Category, Path, Line -Unique
    )

    if ($uniqueFindings.Count -gt 0) {
        Write-Host 'Repository sensitive-information audit failed.' -ForegroundColor Red
        $uniqueFindings |
            Format-Table Category, Path, Line -AutoSize |
            Out-Host
        exit 1
    }

    Write-Host 'Repository sensitive-information audit passed.'
    Write-Host 'No external scanning service was called.'
} finally {
    Pop-Location
}
