param(
  [int]$Port = 4173,
  [string]$Root = (Resolve-Path ".").Path
)

$ErrorActionPreference = "Stop"

function Write-Response {
  param(
    [System.IO.Stream]$Stream,
    [int]$StatusCode,
    [string]$ContentType,
    [byte[]]$Body
  )

  $reason = switch ($StatusCode) {
    200 { "OK" }
    403 { "Forbidden" }
    404 { "Not Found" }
    405 { "Method Not Allowed" }
    default { "Server Error" }
  }
  $header = "HTTP/1.1 $StatusCode $reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($Body, 0, $Body.Length)
}

$rootFullPath = [System.IO.Path]::GetFullPath((Resolve-Path $Root).Path)
$address = [System.Net.IPAddress]::Parse("127.0.0.1")
$listener = [System.Net.Sockets.TcpListener]::new($address, $Port)
$listener.Start()

Write-Host "HySlides running at http://127.0.0.1:$Port/"
Write-Host "Serving $rootFullPath"

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg" = "image/svg+xml"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".pdf" = "application/pdf"
  ".pptx" = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $buffer = New-Object byte[] 8192
      $read = $stream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) {
        $client.Close()
        continue
      }

      $request = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $read)
      $firstLine = ($request -split "`r?`n")[0]
      $parts = $firstLine -split " "
      if ($parts.Length -lt 2 -or $parts[0] -ne "GET") {
        Write-Response $stream 405 "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Method not allowed"))
        $client.Close()
        continue
      }

      $requestPath = [Uri]::UnescapeDataString($parts[1].Split("?")[0].TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($requestPath)) {
        $requestPath = "index.html"
      }

      $candidate = Join-Path $rootFullPath $requestPath
      $resolved = [System.IO.Path]::GetFullPath($candidate)
      if (-not $resolved.StartsWith($rootFullPath)) {
        Write-Response $stream 403 "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Forbidden"))
        $client.Close()
        continue
      }

      if (-not [System.IO.File]::Exists($resolved)) {
        Write-Response $stream 404 "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Not found"))
        $client.Close()
        continue
      }

      $extension = [System.IO.Path]::GetExtension($resolved).ToLowerInvariant()
      $contentType = $mimeTypes[$extension]
      if (-not $contentType) {
        $contentType = "application/octet-stream"
      }
      Write-Response $stream 200 $contentType ([System.IO.File]::ReadAllBytes($resolved))
      $client.Close()
    }
    catch {
      try {
        Write-Response $stream 500 "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes($_.Exception.Message))
      }
      catch {}
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
