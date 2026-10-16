# Lanzador sencillo de desarrollo (solo Windows, PowerShell 5.1+).
#
# Uso:
#   - Doble-clic en Iniciar-Juego.cmd (raiz del repo), o
#   - npm run dev:simple
#   - Para no abrir el navegador: $env:SKIP_BROWSER_OPEN="true"; npm run dev:simple
#
# Lo que hace, en 4 pasos visibles (spec lanzador v1.3):
#   1/4 Comprueba la toolchain (Node/npm segun "engines" de package.json).
#       Node: AUTO-ASISTIDO; si falta o no cumple, pregunta [S/n] (defecto
#       SI): con SI descarga el ultimo MSI Node 24 LTS x64 resolviendo la
#       version en https://nodejs.org/dist (index.json, sin hardcodear
#       version/URL/hash), verifica su SHA256 contra SHASUMS256.txt, lo
#       instala con "msiexec /i <msi> /qn /norestart /log <TEMP>" (1 sola
#       confirmacion UAC), refresca el PATH de la sesion, lista where.exe
#       (coexistencia) y re-comprueba; con NO o ante cualquier fallo,
#       aborta ANTES de instalar nada mas, mostrando version actual,
#       version requerida y guia manual (fallback). winget: solo Propuesta
#       (fuera de alcance, ver comentario en Install-NodeAuto).
#       npm: SI se auto-corrige con "npm install --global --ignore-scripts
#       npm@12.1.0" y re-comprueba; solo si sigue sin cumplir, aborta con guia.
#   2/4 Verifica dependencias y ejecuta "npm run inst" (= npm ci
#       --ignore-scripts, nunca "npm install") si falta node_modules, si
#       package-lock.json es mas nuevo que node_modules, si falta
#       node_modules/.package-lock.json o si los symlinks del workspace
#       (node_modules/@zombie-defense/*) estan rotos. Si falla, aborta
#       sin arrancar nada.
#   3/4 Comprueba que los puertos del dev (leidos de vite.config.ts) esten
#       libres. El puerto del cliente (URL/sonda) es SIEMPRE server.port
#       explicito (9000 en vite.config.ts), nunca $Ports[0]. Si alguno esta
#       ocupado, aborta sin dejar procesos a medias e indica el puerto y como
#       inspeccionarlo con netstat. Nunca cambia de puertos automaticamente.
#   4/4 Arranca "npm run dev" en primer plano (delega GAME_ENV=dev y todas las
#       vars dev en los scripts existentes) y abre http://localhost:<server.port>/
#       en el navegador cuando el cliente responde, salvo SKIP_BROWSER_OPEN=true.
#       Para detener: Ctrl+C en esta consola. Contrato pausa+exit: pausa
#       (Read-Host) solo en fallo para que la ventana de doble-clic no se
#       cierre sola; en exito sale con el codigo de "npm run dev" sin pausa
#       (Iniciar-Juego.cmd solo pausa si EXITCODE != 0).
#
# No modifica vite.config, ni el servidor, ni paquetes/dependencias mas alla de
# "npm run inst", ni variables globales de ExecutionPolicy (Bypass de un solo
# proceso en Iniciar-Juego.cmd / dev:simple). Rutas con espacios: siempre
# -LiteralPath + Join-Path. Compatible con Windows PowerShell 5.1.

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

function Test-PortFree([string]$TargetHost, [int]$Port) {
  $client = $null
  try {
    $client = New-Object Net.Sockets.TcpClient
    $iar = $client.BeginConnect($TargetHost, $Port, $null, $null)
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

function Update-SessionPath {
  # Tras instalar Node con MSI, la consola actual no ve el PATH nuevo hasta
  # reabrirla: se refresca la sesion con los valores de registro (Machine+User).
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ([string]::IsNullOrEmpty($machinePath)) { $machinePath = "" }
  if ([string]::IsNullOrEmpty($userPath)) { $userPath = "" }
  if (($machinePath -ne "") -and ($userPath -ne "")) {
    $env:Path = "$machinePath;$userPath"
  } elseif ($machinePath -ne "") {
    $env:Path = $machinePath
  } elseif ($userPath -ne "") {
    $env:Path = $userPath
  }
}

function Get-NodeCandidates {
  # Coexistencia: lista TODAS las instalaciones visibles, no solo la primera
  # del PATH, para avisar si hay varias.
  $found = @()
  try {
    $lines = (& where.exe node 2>$null)
    foreach ($one in @($lines)) {
      $trimmed = ([string]$one).Trim()
      if ($trimmed -ne "") { $found += $trimmed }
    }
  } catch {
    # where.exe sale con codigo != 0 si no hay coincidencias; no es un error.
  }
  return $found
}

function Resolve-LatestNode24 {
  # Resolucion DINAMICA de la ultima version v24.x LTS: se lee el indice
  # oficial (https://nodejs.org/dist, fichero index.json) y se elige la mayor
  # v24 con LTS. Prohibido hardcodear versiones, URLs de MSI o hashes: la URL
  # del MSI y SHASUMS256.txt se construyen desde la version resuelta.
  # Devuelve "v24.<minor>.<patch>" o $null si el indice no es accesible.
  $indexUrl = "https://nodejs.org/dist/index.json"
  try {
    $entries = Invoke-RestMethod -Uri $indexUrl -UseBasicParsing
  } catch {
    return $null
  }
  $best = $null
  $bestName = ""
  foreach ($entry in @($entries)) {
    $v = [string]$entry.version
    if (-not ($v -like "v24.*")) { continue }
    if (-not $entry.lts) { continue }
    $parsed = $null
    if (-not [System.Version]::TryParse($v.TrimStart("v"), [ref]$parsed)) { continue }
    if (($best -eq $null) -or ($parsed.CompareTo($best) -gt 0)) {
      $best = $parsed
      $bestName = $v
    }
  }
  if ($best -eq $null) { return $null }
  return $bestName
}

function Install-NodeAuto([string]$RequiredText) {
  # Node auto-asistido (spec v1.3): pregunta S/N con defecto SI; con SI
  # descarga el MSI, verifica hash SHA256 contra SHASUMS256.txt, instala con
  # 1 sola confirmacion UAC (la del msiexec), refresca PATH y deja el
  # re-check al llamador. Ante cualquier fallo o respuesta NO: fallback a la
  # guia manual (Fail con ERROR+Accion+pausa+exit 1), sin reintentar solo.
  # Propuesta (fuera de alcance v1.3): alternativa via winget
  # (winget install OpenJS.NodeJS.LTS --silent); no se usa porque requiere
  # winget preinstalado y su UAC/UX varia por edicion de Windows.
  $answer = Read-Host "Node no cumple ($RequiredText). ¿Descargar e instalar automaticamente el ultimo Node 24 LTS desde nodejs.org? [S/n]"
  $normalized = $answer.Trim().ToLowerInvariant()
  if (($normalized -eq "n") -or ($normalized -eq "no")) {
    Fail "Instalacion automatica de Node rechazada por el usuario." "Instala Node $RequiredText a mano desde https://nodejs.org/ (rama LTS 24) y reintenta."
  }
  # Defecto SI: Enter vacio o cualquier respuesta distinta de N/No continua.
  Write-Host "   Resolviendo la ultima version Node 24 LTS..." -ForegroundColor Yellow
  $latest = Resolve-LatestNode24
  if (($latest -eq $null) -or ($latest -eq "")) {
    Fail "No se pudo resolver la ultima version Node 24 (indice https://nodejs.org/dist no accesible)." "Instala Node $RequiredText a mano desde https://nodejs.org/ (rama LTS 24) y reintenta."
  }
  $distBase = "https://nodejs.org/dist"
  $msiName = "node-$latest-x64.msi"
  $msiUrl = "$distBase/$latest/$msiName"
  $shasumsUrl = "$distBase/$latest/SHASUMS256.txt"
  $msiPath = Join-Path $env:TEMP $msiName
  $logPath = Join-Path $env:TEMP "node-install.log"
  Write-Host "   Descargando $msiUrl ..." -ForegroundColor Yellow
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
  } catch {
    Fail "No se pudo descargar $msiName." "Comprueba tu conexion e instala Node $RequiredText a mano desde https://nodejs.org/ (rama LTS 24). Log: $logPath."
  }
  Write-Host "   Verificando hash SHA256 contra SHASUMS256.txt ..." -ForegroundColor Yellow
  try {
    $shasums = (Invoke-WebRequest -Uri $shasumsUrl -UseBasicParsing).Content
  } catch {
    Remove-Item -LiteralPath $msiPath -Force -ErrorAction SilentlyContinue
    Fail "No se pudo obtener SHASUMS256.txt para $latest." "Instala Node $RequiredText a mano desde https://nodejs.org/ (rama LTS 24) y reintenta."
  }
  $expected = $null
  foreach ($line in ([string]$shasums -split "`r?`n")) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "") { continue }
    $parts = @($trimmed -split "\s+")
    if ((@($parts).Count -ge 2) -and ($parts[1] -eq $msiName)) { $expected = $parts[0]; break }
  }
  if (($expected -eq $null) -or ($expected -eq "")) {
    Remove-Item -LiteralPath $msiPath -Force -ErrorAction SilentlyContinue
    Fail "SHASUMS256.txt no incluye $msiName." "Instala Node $RequiredText a mano desde https://nodejs.org/ (rama LTS 24) y reintenta."
  }
  $actual = (Get-FileHash -LiteralPath $msiPath -Algorithm SHA256).Hash
  if ($actual.ToLowerInvariant() -ne ([string]$expected).Trim().ToLowerInvariant()) {
    Remove-Item -LiteralPath $msiPath -Force -ErrorAction SilentlyContinue
    Fail "El hash SHA256 del MSI no coincide con SHASUMS256.txt (descarga corrupta o manipulada)." "Instala Node $RequiredText a mano desde https://nodejs.org/ (rama LTS 24) y reintenta."
  }
  Write-Ok "Hash SHA256 verificado para $msiName."
  Write-Host "   Instalando $msiName (una confirmacion UAC)..." -ForegroundColor Yellow
  # Plantilla MSI: msiexec /i <msi> /qn /norestart /log <TEMP>. Unico UAC.
  & msiexec /i "$msiPath" /qn /norestart /log "$logPath"
  if ($LASTEXITCODE -ne 0) {
    Fail "El instalador MSI termino con codigo $LASTEXITCODE (log: $logPath)." "Instala Node $RequiredText a mano desde https://nodejs.org/ (rama LTS 24) y reintenta."
  }
  Update-SessionPath
  $candidates = @(Get-NodeCandidates)
  if ($candidates.Count -gt 1) {
    Write-Warn ("Varias instalaciones de Node en el PATH (coexistencia): " + ($candidates -join "; ") + ". Se usa la primera del PATH.")
  }
  Write-Ok "Instalacion MSI completada (log: $logPath). Re-comprobando version..."
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

# v1.3: Node AUTO-ASISTIDO (pregunta [S/n], defecto SI) + re-check tras
# instalar. Orden del paso 1/4: Node auto -> re-check -> npm auto.
$nodeVersion = $null
$nodeRaw = $null
$nodeOk = $false
try {
  $nodeRaw = (& node --version) | Select-Object -First 1
  $parsedNode = $null
  if ([System.Version]::TryParse(([string]$nodeRaw).TrimStart("v", " ", "`t"), [ref]$parsedNode)) {
    $nodeVersion = $parsedNode
    $nodeOk = Test-VersionInRange $nodeVersion $nodeRange.Min $nodeRange.Max
  }
} catch {
  $nodeOk = $false
}
if (-not $nodeOk) {
  if (($nodeRaw -eq $null) -or (([string]$nodeRaw).Trim() -eq "")) {
    Write-Warn "Node.js no esta instalado o no esta en el PATH."
  } else {
    Write-Warn "Node $nodeRaw no cumple (requerido: $($nodeRange.Text))."
  }
  Install-NodeAuto $nodeRange.Text
  # Re-check tras el auto-instalador (PATH de sesion ya refrescado dentro).
  try {
    $nodeRaw = (& node --version) | Select-Object -First 1
  } catch {
    Fail "Node sigue sin responder tras la instalacion automatica." "Cierra y reabre la consola (aplica el PATH nuevo) y reintenta; si persiste, instala Node $($nodeRange.Text) a mano desde https://nodejs.org/."
  }
  $nodeVersion = $null
  if (-not [System.Version]::TryParse(([string]$nodeRaw).TrimStart("v", " ", "`t"), [ref]$nodeVersion)) {
    Fail "No se pudo interpretar la version de Node tras instalar (salida: $nodeRaw)." "Cierra y reabre la consola y reintenta; si persiste, instala Node $($nodeRange.Text) a mano desde https://nodejs.org/."
  }
  if (-not (Test-VersionInRange $nodeVersion $nodeRange.Min $nodeRange.Max)) {
    Fail "Node $nodeVersion sigue sin cumplir el requisito (requerido: $($nodeRange.Text))." "Cierra y reabre la consola para aplicar el PATH; si persiste, instala Node $($nodeRange.Text) a mano desde https://nodejs.org/ (rama LTS 24)."
  }
  Write-Ok "Node $nodeVersion cumple ($($nodeRange.Text)) tras instalacion automatica."
} else {
  Write-Ok "Node $nodeVersion cumple ($($nodeRange.Text))."
}

try {
  $npmRaw = (& npm --version) | Select-Object -First 1
} catch {
  Fail "npm no esta instalado o no esta en el PATH (Node $nodeVersion detectado)." "Reinstala Node $($nodeRange.Text) desde https://nodejs.org/ y reintenta."
}
$npmVersion = $null
if (-not [System.Version]::TryParse($npmRaw.Trim(), [ref]$npmVersion)) {
  Fail "No se pudo interpretar la version de npm (salida: $npmRaw)." "Actualiza npm con 'npm install --global --ignore-scripts npm@12.1.0' (comando del README) y reintenta."
}
# v1.2 decision R1: npm SI se auto-corrige (Node NO). Re-check tras el intento.
if (-not (Test-VersionInRange $npmVersion $npmRange.Min $npmRange.Max)) {
  Write-Warn "npm $npmVersion no cumple (requerido: $($npmRange.Text)). Intentando auto-correccion..."
  Write-Host "   Ejecutando: npm install --global --ignore-scripts npm@12.1.0" -ForegroundColor Yellow
  & npm install --global --ignore-scripts npm@12.1.0
  if ($LASTEXITCODE -ne 0) {
    Fail "La auto-actualizacion de npm fallo (codigo $LASTEXITCODE)." "Ejecuta a mano 'npm install --global --ignore-scripts npm@12.1.0' (comando del README) y reintenta."
  }
  try {
    $npmRaw = (& npm --version) | Select-Object -First 1
  } catch {
    Fail "npm no responde tras la auto-actualizacion." "Ejecuta a mano 'npm install --global --ignore-scripts npm@12.1.0' y reintenta."
  }
  $npmVersion = $null
  if (-not [System.Version]::TryParse($npmRaw.Trim(), [ref]$npmVersion)) {
    Fail "No se pudo interpretar la version de npm tras actualizar (salida: $npmRaw)." "Ejecuta a mano 'npm install --global --ignore-scripts npm@12.1.0' y reintenta."
  }
  if (-not (Test-VersionInRange $npmVersion $npmRange.Min $npmRange.Max)) {
    Fail "npm $npmVersion sigue sin cumplir el requisito (requerido: $($npmRange.Text))." "Ejecuta a mano 'npm install --global --ignore-scripts npm@12.1.0' (comando del README) y reintenta."
  }
  Write-Ok "npm actualizado a $npmVersion (requerido: $($npmRange.Text))."
} else {
  Write-Ok "npm $npmVersion cumple ($($npmRange.Text))."
}

# --- 2/4 Dependencias (v1.2: auto "npm run inst" si falta/lock nuevo/symlinks rotos)
Write-Step "2/4 Comprobando dependencias..."

$NodeModulesPath = Join-Path $RepoRoot "node_modules"
$LockPath = Join-Path $RepoRoot "package-lock.json"
$NeedInst = $false
$NeedReason = ""
if (-not (Test-Path -LiteralPath $NodeModulesPath)) {
  $NeedInst = $true
  $NeedReason = "node_modules no existe"
} elseif (-not (Test-Path -LiteralPath $LockPath)) {
  Fail "Falta package-lock.json ($LockPath)." "Restaura package-lock.json del repo y reintenta. No uses 'npm install'."
} else {
  $lockTime = (Get-Item -LiteralPath $LockPath).LastWriteTimeUtc
  $modulesTime = (Get-Item -LiteralPath $NodeModulesPath).LastWriteTimeUtc
  if ($lockTime -gt $modulesTime) {
    $NeedInst = $true
    $NeedReason = "package-lock.json es mas nuevo que node_modules"
  } elseif (-not (Test-Path -LiteralPath (Join-Path $NodeModulesPath ".package-lock.json"))) {
    $NeedInst = $true
    $NeedReason = "falta node_modules/.package-lock.json (instalacion incompleta)"
  } else {
    # Verificacion de symlinks del workspace (junctions en Windows).
    # Roto = el enlace existe pero su destino (packages/...) ya no existe.
    $ScopePath = Join-Path $NodeModulesPath "@zombie-defense"
    if (-not (Test-Path -LiteralPath $ScopePath)) {
      $NeedInst = $true
      $NeedReason = "falta node_modules/@zombie-defense (workspace sin enlazar)"
    } else {
      $links = Get-ChildItem -LiteralPath $ScopePath -ErrorAction SilentlyContinue
      if (($links -eq $null) -or (@($links).Count -eq 0)) {
        $NeedInst = $true
        $NeedReason = "node_modules/@zombie-defense vacio (workspace sin enlazar)"
      } else {
        foreach ($link in @($links)) {
          $targetOk = $true
          try {
            $t = $link.Target
            if (($t -eq $null) -or (@($t).Count -eq 0)) {
              if (-not (Test-Path -LiteralPath $link.FullName)) { $targetOk = $false }
            } else {
              foreach ($one in @($t)) {
                if (-not (Test-Path -LiteralPath ([string]$one))) { $targetOk = $false; break }
              }
            }
          } catch {
            $targetOk = $false
          }
          if (-not $targetOk) {
            $NeedInst = $true
            $NeedReason = "symlink roto: node_modules/@zombie-defense/$($link.Name)"
            break
          }
        }
      }
    }
  }
}

if ($NeedInst) {
  Write-Host "   $NeedReason. Instalando con 'npm run inst' (npm ci --ignore-scripts)..." -ForegroundColor Yellow
  & npm run inst
  if ($LASTEXITCODE -ne 0) {
    Fail "'npm run inst' fallo (codigo $LASTEXITCODE)." "Lee el error de arriba (suele ser red o caché de npm), corrigelo y reintenta. No uses 'npm install'."
  }
  Write-Ok "Dependencias instaladas ($NeedReason)."
} else {
  Write-Ok "Dependencias al dia (node_modules, lock y symlinks verificados); no se instala nada."
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
