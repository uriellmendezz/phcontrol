# Genera apps-script/secreto.gs a partir del .env de la raiz (usuario y contrasena iniciales).
# Conserva el TOKEN_INICIAL que ya tenga secreto.gs. Despues: clasp push y ejecutar inicializar().
$root = Split-Path $PSScriptRoot -Parent
$env = @{}
Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*[^#=]+=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2; $env[$k.Trim()] = $v.Trim()
}
$destino = Join-Path $PSScriptRoot 'secreto.gs'
$token = ''
if (Test-Path $destino) { $m = [regex]::Match((Get-Content $destino -Raw), "TOKEN_INICIAL\s*=\s*'([^']*)'"); if ($m.Success) { $token = $m.Groups[1].Value } }
$q = { param($s) $s.Replace('\', '\').Replace("'", "\'") }
$texto = @"
/**
 * SECRETO - NO SUBIR AL REPO (esta en .gitignore). Generado por generar-secreto.ps1 desde .env.
 * inicializar() copia estos valores a las Propiedades del script la primera vez.
 * TOKEN_INICIAL es el mismo token que se pega en la app (Ajustes > Conexion).
 */
var TOKEN_INICIAL = '$(& $q $token)';
var USUARIO_INICIAL = '$(& $q $env['USUARIO'])';
var PASSWORD_INICIAL = '$(& $q $env['PASSWORD'])';
"@
[IO.File]::WriteAllText($destino, $texto, (New-Object Text.UTF8Encoding($false)))
Write-Host "secreto.gs actualizado."
