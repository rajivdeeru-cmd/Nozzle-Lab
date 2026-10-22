$ErrorActionPreference = 'Stop'

$port = 4173
$url = "http://127.0.0.1:$port/index.html"
$expectedTitle = '<title>Supersonic Jet Flow | Experimental Investigation</title>'

function Test-ProjectServer {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $url
        return $response.StatusCode -eq 200 -and $response.Content.Contains($expectedTitle)
    }
    catch {
        return $false
    }
}

if (-not (Test-ProjectServer)) {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($null -eq $python) {
        $python = Get-Command py -ErrorAction SilentlyContinue
        if ($null -eq $python) {
            throw 'Python was not found. Install Python or use the VS Code Live Server extension.'
        }
        $pythonArguments = @('-3', '-m', 'http.server', "$port", '--bind', '127.0.0.1')
    }
    else {
        $pythonArguments = @('-m', 'http.server', "$port", '--bind', '127.0.0.1')
    }

    $server = Start-Process -FilePath $python.Source `
        -ArgumentList $pythonArguments `
        -WorkingDirectory $PSScriptRoot `
        -WindowStyle Hidden `
        -PassThru

    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if ($server.HasExited) {
            throw "The local server stopped before it was ready. Check whether port $port is already in use."
        }
        if (Test-ProjectServer) {
            $ready = $true
            break
        }
        Start-Sleep -Milliseconds 500
    }

    if (-not $ready) {
        Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
        throw "The project server did not become ready at $url."
    }
}

Write-Output "Project ready at $url"
Start-Process $url
