# Praxis PowerShell demo
param(
    [string]$Target = "console"
)

Write-Host "Hello, $Target!"
$nums = @(3, 1, 4)
foreach ($n in $nums) {
    if ($n % 2 -eq 0) { Write-Host "even: $n" }
}
