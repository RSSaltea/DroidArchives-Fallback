# Publish website snapshots to both public repos, without local/private history.
# Commit website changes first, then run .\deploy.ps1 (or -CheckOnly to validate).
# origin keeps CNAME; fallback serves its github.io address without CNAME.
param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Invoke-Git {
  $result = git @args
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed (exit $LASTEXITCODE)" }
  return $result
}

if (Invoke-Git status --porcelain) {
  throw 'Commit or stash website changes before deploying. Ignored local app files can stay as they are.'
}

# Fail closed if app files were force-added. Never publish their source or assets.
$privatePaths = '^(desktop|release|research|references|conversation|scripts|\.agents|\.claude)(/|$)|^(build-companion\.bat|backup\.ps1|HANDOFF\.md|REBUILD_PROGRESS\.md)$|(^|/)[^/]*\.(traineddata|exe|msi|appx|pyd|dll|zip|blockmap)$|^assets/(test/|other/RebirthDroid\.png$)'
$files = @(Invoke-Git -c core.quotePath=false ls-tree -r --name-only HEAD)
if ($files | Where-Object { $_ -match $privatePaths }) {
  throw 'The committed tree contains private app or local-only files. Remove them from Git tracking (keep local copies) before deploying.'
}

$message = 'Website: ' + (Invoke-Git log -1 --format=%s)
$indexPath = Join-Path ([IO.Path]::GetTempPath()) ('da-deploy-index-' + [guid]::NewGuid().ToString('N'))
$previousIndex = $env:GIT_INDEX_FILE
$snapshots = @()
try {
  $env:GIT_INDEX_FILE = $indexPath
  foreach ($remote in @('origin', 'fallback')) {
    # A snapshot inherits ONLY the public branch, never local HEAD's app history.
    Invoke-Git fetch --no-tags $remote "+refs/heads/main:refs/remotes/$remote/main" | Out-Null
    $parent = Invoke-Git rev-parse "refs/remotes/$remote/main"
    Invoke-Git read-tree HEAD
    if ($remote -eq 'fallback') { Invoke-Git update-index --force-remove -- CNAME }
    $tree = Invoke-Git write-tree
    $parentTree = Invoke-Git rev-parse "$parent`^{tree}"
    if ($tree -eq $parentTree) {
      Write-Host "$remote already matches the website."
      continue
    }
    $commit = Invoke-Git commit-tree $tree -p $parent -m $message
    $snapshots += [pscustomobject]@{ Remote = $remote; Commit = $commit }
  }
} finally {
  $env:GIT_INDEX_FILE = $previousIndex
  if (Test-Path -LiteralPath $indexPath) { Remove-Item -LiteralPath $indexPath -Force }
}

foreach ($snapshot in $snapshots) {
  if ($CheckOnly) {
    Write-Host "Validated website snapshot for $($snapshot.Remote); nothing pushed."
  } else {
    # Normal fast-forward pushes: concurrent remote changes cause a safe failure.
    Invoke-Git push $snapshot.Remote "$($snapshot.Commit):refs/heads/main"
  }
}
if (-not $CheckOnly) { Write-Host 'Website deployed to origin and fallback. Local app history was excluded.' }
