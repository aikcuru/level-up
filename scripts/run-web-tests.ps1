[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PlaywrightArgs
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$playwrightPath = Join-Path $projectRoot "node_modules\.bin\playwright.cmd"
$server = $null
$playwrightExitCode = 1
$runnerExitCode = 1
$cleanupFailed = $false

try {
    if (-not (Test-Path -LiteralPath $playwrightPath -PathType Leaf)) {
        throw "Local Playwright executable was not found: $playwrightPath"
    }

    try {
        $existingListener = Get-NetTCPConnection `
            -LocalAddress "127.0.0.1" `
            -LocalPort 4173 `
            -State Listen `
            -ErrorAction Stop
    }
    catch {
        if ($_.FullyQualifiedErrorId -notlike "CmdletizationQuery_NotFound*") {
            throw "Unable to verify that 127.0.0.1:4173 is free: $($_.Exception.Message)"
        }

        $existingListener = $null
    }

    if ($null -ne $existingListener) {
        throw "Port 127.0.0.1:4173 is already in use. The existing process was not stopped."
    }

    $pythonCommand = Get-Command "python.exe" -CommandType Application -ErrorAction Stop |
        Select-Object -First 1
    $server = Start-Process `
        -FilePath $pythonCommand.Source `
        -ArgumentList "-m", "http.server", "4173", "--bind", "127.0.0.1" `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -PassThru

    Write-Output "SERVER_PID=$($server.Id)"

    $serverReady = $false
    $readinessDeadline = [DateTime]::UtcNow.AddSeconds(15)

    while ([DateTime]::UtcNow -lt $readinessDeadline) {
        $server.Refresh()

        if ($server.HasExited) {
            throw "Local server exited unexpectedly with code $($server.ExitCode)."
        }

        try {
            $response = Invoke-WebRequest `
                -Uri "http://127.0.0.1:4173/index.html" `
                -UseBasicParsing `
                -TimeoutSec 2

            if ($response.StatusCode -eq 200) {
                $serverReady = $true
                break
            }
        }
        catch {
            # The server may still be starting. Retry until the deadline.
        }

        Start-Sleep -Milliseconds 200
    }

    if (-not $serverReady) {
        throw "Local server did not return HTTP 200 within 15 seconds."
    }

    Write-Output "SERVER_READY"

    & $playwrightPath test @PlaywrightArgs
    $playwrightExitCode = $LASTEXITCODE
    $runnerExitCode = $playwrightExitCode

    Write-Output "PLAYWRIGHT_EXIT_CODE=$playwrightExitCode"
}
catch {
    [Console]::Error.WriteLine("Web test runner failed: $($_.Exception.Message)")
    $runnerExitCode = 1
}
finally {
    if ($null -ne $server) {
        try {
            $server.Refresh()

            if (-not $server.HasExited) {
                Stop-Process -Id $server.Id -ErrorAction Stop

                if (-not $server.WaitForExit(10000)) {
                    throw "Server process $($server.Id) did not exit within 10 seconds."
                }
            }

            if ($null -ne (Get-Process -Id $server.Id -ErrorAction SilentlyContinue)) {
                throw "Server process $($server.Id) is still running after cleanup."
            }

            Write-Output "SERVER_STOPPED_PID=$($server.Id)"
        }
        catch {
            [Console]::Error.WriteLine(
                "Failed to stop local server process $($server.Id): $($_.Exception.Message)"
            )
            $cleanupFailed = $true
        }
    }
}

if ($cleanupFailed) {
    exit 1
}

exit $runnerExitCode
