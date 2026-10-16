# Lanzador sencillo de desarrollo (solo Windows, PowerShell 5.1+).
#
# Uso:
#   - Doble-clic en Iniciar-Juego.cmd (raiz del repo), o
#   - npm run dev:simple
#   - Para no abrir el navegador: $env:SKIP_BROWSER_OPEN="true"; npm run dev:simple
#
# Lo que hace, en 4 pasos visibles:
#   1/4 Comprueba la toolchain (Node/npm segun "engines" de package.json). Si no
#       cumple, aborta ANTES de instalar nada, mostrando version actual,
#       version requerida y el comando exacto de correccion.
#   2/4 Si falta la carpeta node_modules, ejecuta "npm run inst"
#       (= npm ci --ignore-scripts). Nunca usa "npm install". Si falla, aborta
#       sin arrancar nada.
#   3/4 Comprueba que los puertos del dev (cliente + master + workers, leidos de
#       vite.config.ts) esten libres. Si alguno esta ocupado, aborta sin dejar
#       procesos a medias e indica el puerto y como inspeccionarlo con netstat.
#       Nunca cambia de puertos automaticamente.
#   4/4 Arranca "npm run dev" en primer plano (delega GAME_ENV=dev y todas las
#       vars dev en los scripts existentes) y abre http://localhost:9000/ en el
#       navegador cuando el cliente responde, salvo SKIP_BROWSER_OPEN=true.
#       Para detener: Ctrl+C en esta consola.
#
# No modifica ningun script existente, ni vite.config, ni el servidor, ni
# paquetes/dependencias, ni variables globales de ExecutionPolicy.

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "== $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
  Write-Host "   OK: $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
  Write-Host "   AVISO: $Message" -ForegroundColor Yellow
}

function Fail([string]$Cause, [string]$Fix) {
  Write-Host ""
  Write-Host "ERROR: $Cause" -ForegroundColor Red
  Write-Host "Accion: $Fix" -ForegroundColor Yellow
  Write-Host ""
  # Pausa solo en fallo para que la ventana de doble-clic no se cierre sola.
  Read-Host "Pulsa Enter para cerrar"
  exit 1
}

function Test-PortFree([string]$Host, [int]$Port) {
  $client = $null
  try {
    $client = New-Object Net.Sockets.TcpClient
    $iar = $client.BeginConnect($Host, $Port, $null, $null)
    # localhost responde de inmediato; 500 ms bastan y no ralentizan el arranque.
    $connected = $iar.AsyncWaitHandle.WaitOne(500)
    if ($connected -and $client.Connected) {
      return $false
    }
    return $true
  } catch {
    return $true
  } finally {
    if ($client -ne $null) {
      $client.Close()
    }
  }
}

function Parse-EnginesBound([string]$Range, [string]$Field) {
  $min = $null
  $max = $null
  $m = [regex]::Match($Range, ">=\s*([0-9]+(?:\.[0-9]+){0,2})")
  if ($m.Success) {
    $min = New-Object System.Version(($m.Groups[1].Value + ".0.0").Split(".")[0..2] -join ".")
  }
  $m = [regex]::Match($Range, "<\s*([0-9]+(?:\.[0-9]+){0,2})")
  if ($m.Success) {
    $max = New-Object System.Version(($m.Groups[1].Value + ".0.0").Split(".")[0..2] -join ".")
  }
  if ($min -eq $null -or $max -eq $null) {
    Fail "No se pudo interpretar engines.$Field ($Range) en package.json." "Revisa el campo engines en package.json (formato esperado: '>=X.Y.Z <A.B.C')."
  }
  return @{ Min = $min; Max = $max; Text = $Range.Trim() }
}

function Test-VersionInRange([System.Version]$Actual, [System.Version]$Min, [System.Version]$Max) {
  return ($Actual.CompareTo($Min) -ge 0) -and ($Actual.CompareTo($Max) -lt 0)
}

# --- Raiz del repo (esta script vive en <repo>\scripts\) ---------------------
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

$PackageJsonPath = Join-Path $RepoRoot "package.json"
$ViteConfigPath = Join-Path $RepoRoot "vite.config.ts"

# --- 1/4 Toolchain -----------------------------------------------------------
Write-Step "1/4 Comprobando toolchain (Node/npm)..."

if ($PSVersionTable.PSVersion.Major -lt 5) {
  Fail "Windows PowerShell 5.1 o superior es necesario (actual: $($PSVersionTable.PSVersion))." "Usa el PowerShell que trae Windows 10/11; no necesitas instalar nada."
}

$engines = $null
try {
  $engines = (Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json).engines
} catch {
  Fail "No se pudo leer package.json ($PackageJsonPath): $($_.Exception.Message)" "Clona de nuevo el repo o restaura package.json y reintenta."
}
if (($engines -eq $null) -or ($engines.node -eq $null) -or ($engines.npm -eq $null)) {
  Fail "package.json no declara engines.node/engines.npm." "Restaura package.json del repo y reintenta."
}
$nodeRange = Parse-EnginesBound ([string]$engines.node) "node"
$npmRange = Parse-EnginesBound ([string]$engines.npm) "npm"

try {
  $nodeRaw = (& node --version) | Select-Object -First 1
} catch {
  Fail "Node.js no esta instalado o no esta en el PATH." "Instala Node $($nodeRange.Text) desde https://nodejs.org/ (rama LTS 24) y reintenta."
}
$nodeVersion = $null
if (-not [System.Version]::TryParse($nodeRaw.TrimStart("v", " ", "`t"), [ref]$nodeVersion)) {
  Fail "No se pudo interpretar la version de Node (salida: $nodeRaw)." "Reinstala Node $($nodeRange.Text) desde https://nodejs.org/ y reintenta."
}
if (-not (Test-VersionInRange $nodeVersion $nodeRange.Min $nodeRange.Max)) {
  Fail "Node $nodeVersion no cumple el requisito (requerido: $($nodeRange.Text), actual: $nodeVersion)." "Instala Node $($nodeRange.Text) desde https://nodejs.org/ (rama LTS 24) y reintenta. Este lanzador no actualiza Node por ti."
}
Write-Ok "Node $nodeVersion cumple ($($nodeRange.Text))."

try {
  $npmRaw = (& npm --version) | Select-Object -First 1
} catch {
  Fail "npm no esta instalado o no esta en el PATH (Node $nodeVersion detectado)." "Reinstala Node $($nodeRange.Text) desde https://nodejs.org/ y reintenta."
}
$npmVersion = $null
if (-not [System.Version]::TryParse($npmRaw.Trim(), [ref]$npmVersion)) {
  Fail "No se pudo interpretar la version de npm (salida: $npmRaw)." "Actualiza npm con el comando del README y reintenta."
}
if (-not (Test-VersionInRange $npmVersion $npmRange.Min $npmRange.Max)) {
  Fail "npm $npmVersion no cumple el requisito (requerido: $($npmRange.Text), actual: $npmVersion)." "Ejecuta 'npm install --global --ignore-scripts npm@12.1.0' (comando del README) y reintenta. Este lanzador no actualiza npm por ti."
}
Write-Ok "npm $npmVersion cumple ($($npmRange.Text))."

# --- 2/4 Dependencias ---------------------------------------------------------
Write-Step "2/4 Comprobando dependencias..."

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "node_modules"))) {
  Write-Host "   node_modules no existe. Instalando con 'npm run inst' (npm ci --ignore-scripts)..." -ForegroundColor Yellow
  & npm run inst
  if ($LASTEXITCODE -ne 0) {
    Fail "'npm run inst' fallo (codigo $LASTEXITCODE)." "Lee el error de arriba (suele ser red o caché de npm), corrigelo y reintenta. No uses 'npm install'."
  }
  Write-Ok "Dependencias instaladas."
} else {
  Write-Ok "node_modules ya existe; no se instala nada."
}

# --- 3/4 Puertos --------------------------------------------------------------
Write-Step "3/4 Comprobando puertos..."

# Fuente de verdad: vite.config.ts (server.port del cliente + destinos
# localhost:<puerto> de los proxies /api, /lobbies y /wN). Asi el lanzador se
# adapta solo si la config cambia; solo si no se puede leer, se usan los
# valores por defecto conocidos con un aviso.
# D1: el puerto del cliente (URL/sonda) es SIEMPRE server.port explicito
# (9000 en vite.config.ts), nunca $Ports[0] tras Sort-Object -Unique (que
# ordena [3000,3001,3002,9000] y dejaba 3000). $Ports solo se usa para el
# chequeo de puertos libres, sin auto-cambio.
$Ports = @()
$ClientPort = 9000
try {
  $viteText = Get-Content -LiteralPath $ViteConfigPath -Raw
  $found = @()
  $serverPortMatch = [regex]::Match($viteText, "server\s*:\s*\{[^}]*?port\s*:\s*(\d+)")
  if ($serverPortMatch.Success) {
    $ClientPort = [int]$serverPortMatch.Groups[1].Value
  } else {
    $firstPortMatch = [regex]::Match($viteText, "port\s*:\s*(\d+)")
    if ($firstPortMatch.Success) {
      $ClientPort = [int]$firstPortMatch.Groups[1].Value
    }
  }
  foreach ($m in [regex]::Matches($viteText, "port\s*:\s*(\d+)")) {
    $found += [int]$m.Groups[1].Value
  }
  foreach ($m in [regex]::Matches($viteText, "localhost\s*:\s*(\d+)")) {
    $found += [int]$m.Groups[1].Value
  }
  $Ports = @($found | Sort-Object -Unique)
} catch {
  $Ports = @()
}
if ($Ports.Count -eq 0) {
  Write-Warn "No se pudieron leer los puertos de vite.config.ts; usando 9000/3000/3001/3002."
  $Ports = @(9000, 3000, 3001, 3002)
  $ClientPort = 9000
} else {
  Write-Host ("   Puertos detectados en vite.config.ts: " + ($Ports -join ", "))
  Write-Host ("   Puerto del cliente (server.port): $ClientPort")
}

foreach ($port in $Ports) {
  if (-not (Test-PortFree "127.0.0.1" $port)) {
    Fail "El puerto $port esta ocupado; no se arranca nada para no dejar procesos a medias." "Libera el puerto $port (inspecciona con 'netstat -ano | findstr :$port') y reintenta. Este lanzador nunca cambia de puertos solo."
  }
}
Write-Ok ("Puertos libres: " + ($Ports -join ", ") + ".")

# --- 4/4 Arranque --------------------------------------------------------------
Write-Step "4/4 Arrancando cliente+servidor (npm run dev)..."

# D1: $ClientPort ya viene de server.port explicito (bloque 3/4); no usar
# $Ports[0] porque tras Sort-Object -Unique vale 3000 (master) en vez de 9000.
$AppUrl = "http://localhost:$ClientPort/"
$ShouldOpenBrowser = ($env:SKIP_BROWSER_OPEN -ne "true")

# El navegador lo abre este lanzador cuando el cliente ya responde. Para no
# abrir dos pestanas, el proceso hijo de vite arranca con su auto-apertura
# desactivada (solo afecta a este arranque, no cambia nada global).
$BrowserJob = $null
if ($ShouldOpenBrowser) {
  $env:SKIP_BROWSER_OPEN = "true"
  $BrowserJob = Start-Job -ScriptBlock {
    param($Port, $Url)
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
      $probe = $null
      try {
        $probe = New-Object Net.Sockets.TcpClient
        $iar = $probe.BeginConnect("127.0.0.1", $Port, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne(500) -and $probe.Connected) {
          Start-Process $Url
          return
        }
      } catch {
        # Servidor aun no listo; reintentar.
      } finally {
        if ($probe -ne $null) { $probe.Close() }
      }
      Start-Sleep -Seconds 1
    }
    # R5: si el navegador no se pudo abrir, no es un fallo global; el juego
    # sigue levantado y la URL queda impresa abajo.
    Write-Warning "No se pudo abrir el navegador automaticamente; abre $Url a mano."
  } -ArgumentList $ClientPort, $AppUrl
} else {
  Write-Host "   SKIP_BROWSER_OPEN=true: no se abrira el navegador." -ForegroundColor Yellow
}

Write-Host "   Abre $AppUrl cuando el cliente este listo. Para detener: Ctrl+C." -ForegroundColor Green
Write-Host ""

try {
  # Primer plano: los logs de concurrently se ven aqui y Ctrl+C detiene todo.
  # GAME_ENV=dev y el resto de vars dev las aporta "npm run dev" (R4: no se
  # duplican aqui).
  & npm run dev
  $DevExit = $LASTEXITCODE
} finally {
  if ($BrowserJob -ne $null) {
    Receive-Job -Job $BrowserJob -ErrorAction SilentlyContinue | Out-Null
    Remove-Job -Job $BrowserJob -Force -ErrorAction SilentlyContinue | Out-Null
  }
}

if ($DevExit -ne 0) {
  Fail "'npm run dev' termino con codigo $DevExit." "Lee el error de arriba (suele ser un fallo de compilacion o un puerto ocupado a ultima hora) y reintenta. Si el puerto se ocupo, inspecciona con 'netstat -ano | findstr :<puerto>'."
}

exit $DevExit
