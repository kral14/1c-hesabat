param (
    [string]$CommitMessage = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "GitHub-a Göndəriş - 1c-hesabat"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   1C-Hesabat: GitHub-a Avtomatik Göndəriş (PowerShell)" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

# 1. Status yoxla
$status = git status --porcelain
if (-not $status) {
    Write-Host "Heç bir yeni dəyişiklik tapılmadı. Hər şey yenidir." -ForegroundColor Yellow
    exit 0
}

# 2. Mesaj təyini
if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
    $inputMsg = Read-Host "Commit mesajını daxil edin (boş buraxsanız avtomatik tarix qoyulacaq)"
    if ([string]::IsNullOrWhiteSpace($inputMsg)) {
        $CommitMessage = "Yenilənmə: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    } else {
        $CommitMessage = $inputMsg
    }
}

Write-Host "`n[1/3] Dəyişikliklər əlavə olunur (git add .)..." -ForegroundColor Yellow
git add .

Write-Host "`n[2/3] Commit olunur: '$CommitMessage'..." -ForegroundColor Yellow
git commit -m "$CommitMessage"

Write-Host "`n[3/3] GitHub-a göndərilir (git push origin main)..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n======================================================" -ForegroundColor Green
    Write-Host " [UĞURLU] Dəyişikliklər GitHub-a uğurla göndərildi!" -ForegroundColor Green
    Write-Host "======================================================" -ForegroundColor Green
} else {
    Write-Host "`n======================================================" -ForegroundColor Red
    Write-Host " [XƏTA] Göndəriş zamanı xəta baş verdi. Zəhmət olmasa bağlantını yoxlayın." -ForegroundColor Red
    Write-Host "======================================================" -ForegroundColor Red
}
