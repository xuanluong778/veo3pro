# Đợi máy chủ Veo3 Pro lắng nghe rồi mở trình duyệt (Windows).
param(
  [string] $BindHost = '127.0.0.1',
  [int] $Port = 8787,
  [int] $MaxWaitSeconds = 90
)

$url = "http://${BindHost}:${Port}/"
$deadline = (Get-Date).AddSeconds($MaxWaitSeconds)

while ((Get-Date) -lt $deadline) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.ReceiveTimeout = 800
    $c.SendTimeout = 800
    $iar = $c.BeginConnect($BindHost, $Port, $null, $null)
    $waitMs = 800
    if (-not $iar.AsyncWaitHandle.WaitOne($waitMs)) {
      $c.Close()
      Start-Sleep -Milliseconds 400
      continue
    }
    $c.EndConnect($iar)
    $c.Close()
    Start-Process $url
    exit 0
  }
  catch {
    Start-Sleep -Milliseconds 400
  }
}

exit 1
