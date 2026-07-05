$ProjectRoot = "C:\Sistema GSS"
$DistPath = Join-Path $ProjectRoot "dist\livro-remoto"
$Worktree = "C:\Users\diogo\AppData\Local\Temp\gss-deploy-livro"
$CommitMsg = if ($args[0]) { $args[0] } else { "Deploy Livro de Ocorrencias $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }

Write-Host "==============================================="
Write-Host " DEPLOY LIVRO DE OCORRENCIAS - Cloudflare Pages"
Write-Host "==============================================="

Set-Location $ProjectRoot

if (-not (Test-Path (Join-Path $DistPath "index.html"))) {
    Write-Host "ERRO: index.html nao encontrado" -ForegroundColor Red
    exit 1
}

try { Remove-Item -Recurse -Force $Worktree -ErrorAction SilentlyContinue } catch {}
git worktree prune 2>$null

git worktree add $Worktree deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Branch deploy nao existe" -ForegroundColor Red
    exit 1
}

Write-Host "Copiando arquivos..." -ForegroundColor Yellow
Get-ChildItem $Worktree -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $DistPath "*") -Destination $Worktree -Recurse -Force

Set-Location $Worktree

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "Sem alteracoes para deploy." -ForegroundColor Gray
    Set-Location $ProjectRoot
    try { Remove-Item -Recurse -Force $Worktree -ErrorAction SilentlyContinue } catch {}
    exit 0
}

git config user.name "Deploy Script"
git config user.email "deploy@gss.local"
git commit -m $CommitMsg
Write-Host "Enviando para GitHub..." -ForegroundColor Yellow
git push origin deploy --force

Set-Location $ProjectRoot
try { Remove-Item -Recurse -Force $Worktree -ErrorAction SilentlyContinue } catch {}

Write-Host ""
Write-Host "DEPLOY CONCLUIDO!" -ForegroundColor Green
Write-Host "Branch: deploy"
Write-Host "URL: https://gss-livro-ocorrencias.pages.dev/" -ForegroundColor Cyan
