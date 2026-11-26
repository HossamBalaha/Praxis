/**
 * 50 PowerShell reference templates (the Windows-native
 * scripting pair's first half: "Other language runtimes (add other
 * languages also) + add their examples to check" + "at least 50 like
 * others"). Bodies are idiomatic Windows PowerShell 5.1 / PowerShell 7
 * (no modules — pure built-in cmdlets), created as .ps1 files and
 * runnable through pwsh / powershell.exe the moment either is present.
 *
 * Bodies avoid backtick escapes (the PS escape char collides with the
 * TS template literal) — [Environment]::NewLine and explicit strings
 * carry the formatting instead.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "PowerShell";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("powershell", id, label, description, CAT, sub, baseName, ".ps1", () => body);

export const POWERSHELL_EXAMPLES: FileExample[] = [
    ex("ps-ex-001", "Hello, PowerShell", "Write-Host, Write-Output and string interpolation — the console basics.", "Basics", "hello_powershell",
        `# Hello, PowerShell — Write-Host vs Write-Output.
Write-Host "Hello from PowerShell!"        # formatting / UI stream
Write-Output "This line is pipeline output" # the success stream

$name = "Praxis"
Write-Host "Hello, $name!"                  # double quotes interpolate

# Backticks are avoided here (TS template literal collision) — use
# [Environment]::NewLine when a real newline is needed inside a string.
Write-Host ("multi" + [Environment]::NewLine + "line")

# Single quotes are VERBATIM — no interpolation.
Write-Host 'Hello, $name'                    # prints the literal text
`),
    ex("ps-ex-002", "Variables and types", "Typed variables, type inference, [math] and constants.", "Basics", "variables_types",
        `# Variables — untyped (inferred) or [type]-annotated.
$count = 42
[int]$total = $count * 2
[double]$ratio = 22 / 7
[string]$label = "answer"

Write-Host "count=$count total=$total ratio=$ratio label=$label"

# Type accelerators check what a variable really is.
Write-Host ("count is " + $count.GetType().Name)     # Int32
Write-Host ("ratio is " + $ratio.GetType().Name)     # Double

# [math] carries the classic constants + functions.
Write-Host ("pi = " + [math]::PI)
Write-Host ("sqrt 144 = " + [math]::Sqrt(144))
Write-Host (".567 -> " + [math]::Round(3.567, 2))
`),
    ex("ps-ex-003", "Strings and formatting", "Composite -f formatting, substring, split/join, replace and trim.", "Strings", "strings_tour",
        `# String formatting — the -f composite operator.
"{0} scored {1:N2} points ({2:P1})" -f "Ada", 1234.567, 0.834 | Write-Host

# Concatenation, repeat, and -join / -split.
Write-Host ("Say " * 3 + "Cheer")
Write-Host (("a", "b", "c") -join "-")
Write-Host ("one two three" -split " " | Select-Object -First 2)

# Substrings and character access.
$s = "PowerShell"
Write-Host $s.Substring(0, 5)      # Power
Write-Host $s[-4..-1] -join ""     # hell (negative indexing!)

# Replace, trim, casing.
Write-Host (" Praxis ".Trim() + "/" + "lower UP".ToLower() + "/" + "upper up".ToUpper())
Write-Host "a-b-c".Replace("-", "+")
`),
    ex("ps-ex-004", "String operators and comparison", "-like wildcards, -match regex, -eq -ne -gt and case-sensitive twins.", "Strings", "string_operators",
        `# Comparison operators live ON the left operand.
$answer = 42
if ($answer -eq 42) { Write-Host "equal" }
if ($answer -ne 41) { Write-Host "not equal" }
if ($answer -gt 40 -and $answer -lt 50) { Write-Host "in range" }

# -like = wildcard match; -match = regex match.
$file = "report_2024.pdf"
if ($file -like "*.pdf") { Write-Host "a PDF" }
if ($file -match "(\\d{4})") { Write-Host ("year: " + $Matches[1]) }

# Case-sensitive variants add a c: -ceq, -clike, -cmatch.
Write-Host ("Abc" -ceq "abc")   # False
Write-Host ("Abc" -ieq "abc")   # True (explicit insensitive)

# -in / -contains for membership.
Write-Host (5 -in 1..10)
@(1, 5, 9) -contains 5 | Write-Host
`),
    ex("ps-ex-005", "Arrays", "Fixed arrays, @() literals, indexing, slicing and foreach.", "Collections", "arrays",
        `# Arrays — @() literal or comma lists.
$nums = @(3, 1, 4, 1, 5, 9, 2, 6)
Write-Host ("count: " + $nums.Count)

# Indexing + negative + slicing.
Write-Host ("first: " + $nums[0])
Write-Host ("last: " + $nums[-1])
Write-Host ("slice: " + ($nums[2..5] -join ","))

# Sorting + reversing + unique.
Write-Host ("sorted: " + (($nums | Sort-Object) -join ","))
Write-Host ("unique: " + (($nums | Sort-Object -Unique) -join ","))
Write-Host ("desc: " + (($nums | Sort-Object -Descending)[0..3] -join ","))

# Loop shapes.
foreach ($n in $nums) { if ($n % 2 -eq 0) { Write-Host "even: $n" } }
$nums | ForEach-Object { $_ * 10 } | Select-Object -First 3 | ForEach-Object { Write-Host "x10: $_" }
`),
    ex("ps-ex-006", "ArrayList-style growth and generic lists", "@() += copies; [System.Collections.Generic.List] grows in place.", "Collections", "generic_lists",
        `# The += trap: arrays are FIXED — += copies the whole array each time.
$arr = @(1..5)
$arr += 6          # fine for tiny data; O(n) copy each time
Write-Host ("array: " + ($arr -join ","))

# The real growable list.
$list = [System.Collections.Generic.List[int]]::new()
foreach ($i in 1..5) { $list.Add($i * $i) }
$list.AddRange([int[]]@(100, 200))
$list.Remove(4) | Out-Null
Write-Host ("list: " + ($list -join ","))
Write-Host ("capacity: " + $list.Capacity + " count: " + $list.Count)

# HashSet for membership at O(1).
$set = [System.Collections.Generic.HashSet[string]]::new()
[void]$set.Add("a"); [void]$set.Add("b"); [void]$set.Add("a")
Write-Host ("set: " + ($set -join ",") + " count: " + $set.Count)  # a,b
`),
    ex("ps-ex-007", "Hashtables", "Literal tables, ordered dictionaries, nesting and enumeration.", "Collections", "hashtables",
        `# Hashtable literal @{ k = v } — unordered buckets.
$person = @{ Name = "Ada"; Age = 36; Lang = "PowerShell" }
Write-Host $person.Name            # dot access
Write-Host $person["Age"]          # indexer access

# Ordered keeps insertion order (OrderedDictionary).
$ordered = [ordered]@{ First = 1; Second = 2; Third = 3 }
Write-Host ((($ordered.Keys | ForEach-Object { $_ }) -join " -> "))

# Nested structures.
$config = @{
    app  = "Praxis"
    ports = @(8080, 8443)
    db   = @{ host = "localhost"; port = 5432 }
}
Write-Host "$($config.app) db is $($config.db.host):$($config.db.port)"

# Enumerate entries.
foreach ($key in $person.Keys) { Write-Host "$key = $($person[$key])" }
`),
    ex("ps-ex-008", "Pipeline fundamentals", "The object pipeline: measure, where, select, sort, group.", "Collections", "pipeline_tour",
        `# Everything in the pipeline is an OBJECT, not text.
$data = 1..20
Write-Host ("count: " + ($data | Measure-Object).Count)
Write-Host ("sum: " + ($data | Measure-Object -Sum).Sum)
Write-Host ("avg: " + ($data | Measure-Object -Average).Average)

# Where-Object filters; Select-Object projects + takes.
$data | Where-Object { $_ % 3 -eq 0 } | ForEach-Object { Write-Host "triple: $_" }
Write-Host ("top: " + (($data | Sort-Object -Descending | Select-Object -First 3) -join ","))

# Group-Object buckets a list.
$words = "apple", "apricot", "banana", "blueberry", "cherry"
$words | Group-Object { $_.Substring(0, 1) } | ForEach-Object {
    Write-Host ("{0}: {1}" -f $_.Name, ($_.Group -join " "))
}
`),
    ex("ps-ex-009", "Control flow", "if/elseif/else, switch (with wildcards + regex), for and while.", "Control & Logic", "control_flow",
        `# if / elseif / else.
$score = 87
if ($score -ge 90) { Write-Host "A" }
elseif ($score -ge 80) { Write-Host "B" }
else { Write-Host "C or below" }

# switch — with wildcard AND regex modes per clause.
$value = "report_2024.txt"
switch -Regex ($value) {
    "\\.txt$" { Write-Host "a text file" }
    "\\.pdf$" { Write-Host "a PDF" }
    default  { Write-Host "unknown" }
}

# Classic loops.
for ($i = 0; $i -lt 3; $i++) { Write-Host "for: $i" }
$j = 0
while ($j -lt 3) { Write-Host "while: $j"; $j++ }
do { Write-Host "do: $j"; $j-- } while ($j -gt 0)

# The range operator in foreach.
foreach ($k in 1..3) { Write-Host "range: $k" }
`),
    ex("ps-ex-010", "Functions and parameters", "param blocks, defaults, typed args, switch params, return values.", "Functions & Objects", "functions_params",
        `# A function with a typed param block + defaults + a switch.
function Get-Greeting {
    param(
        [string]$Name = "World",
        [int]$Times = 1,
        [switch]$Upper
    )
    $g = "Hello, $Name!"
    if ($Upper) { $g = $g.ToUpper() }
    for ($i = 0; $i -lt $Times; $i++) { Write-Output $g }
}

Get-Greeting
Get-Greeting -Name "Ada" -Times 2
Get-Greeting -Name "grace" -Upper

# Value RETURN (everything the pipeline emits is the return).
function Add-Numbers {
    param([int]$A, [int]$B)
    return $A + $B
}
Write-Host ("sum: " + (Add-Numbers -A 3 -B 4))

# SupportShouldProcess gives -WhatIf / -Confirm for free.
function Remove-Temp {
    [CmdletBinding(SupportsShouldProcess)]
    param([string]$Path)
    if ($PSCmdlet.ShouldProcess($Path, "Delete")) { Write-Host "would delete $Path" }
}
Remove-Temp -Path "x.tmp" -WhatIf
`),
    ex("ps-ex-011", "Advanced functions and pipelines input", "Process pipeline objects one at a time with begin/process/end.", "Functions & Objects", "pipeline_functions",
        `# An ADVANCED function: runs per pipeline object.
function Convert-Inches {
    param(
        [Parameter(ValueFromPipeline = $true)]
        [double]$Inches
    )
    begin { Write-Host "--- converting ---" }
    process { Write-Output ($Inches * 2.54) }
    end { Write-Host "--- done ---" }
}

1, 2.5, 10 | Convert-Inches | ForEach-Object { Write-Host ("cm: " + [math]::Round($_, 2)) }

# ValueFromPipelineByPropertyName binds from object fields.
function Show-Name {
    param([Parameter(ValueFromPipelineByPropertyName)] $Name)
    process { Write-Host "name: $Name" }
}
[pscustomobject]@{ Name = "Ada" }, [pscustomobject]@{ Name = "Alan" } | Show-Name
`),
    ex("ps-ex-012", "Objects and classes", "class syntax with properties, constructors, methods and static members.", "Functions & Objects", "classes",
        `# PowerShell 5+ class syntax.
class Counter {
    [int]$Value = 0
    static [int]$Instances = 0

    Counter([int]$start) {
        $this.Value = $start
        [Counter]::Instances++
    }

    [void]Bump() { $this.Value++ }
    [int]Add([int]$n) { $this.Value += $n; return $this.Value }
}

$c = [Counter]::new(10)
$c.Bump()
Write-Host ("value: " + $c.Add(5))            # 16
Write-Host ("instances: " + [Counter]::Instances)

# Enum types.
enum Flavor { Sweet; Salty; Sour }
[Flavor]"Sour" | ForEach-Object { Write-Host ("int value: " + [int]$_) }
`),
    ex("ps-ex-013", "PSObject construction", "[pscustomobject] rows, calculated properties and Export-Csv.", "Functions & Objects", "psobjects",
        `# Building result objects the cmdlets understand.
$rows = @(
    [pscustomobject]@{ City = "Cairo"; Temp = 34 }
    [pscustomobject]@{ City = "Oslo";  Temp = 12 }
    [pscustomobject]@{ City = "Sydney"; Temp = 26 }
)

# Calculated properties add derived columns.
$rows | Select-Object City, Temp, @{ n = "Comfort"; e = {
    if ($_.Temp -ge 30) { "hot" } elseif ($_.Temp -le 15) { "cold" } else { "mild" }
} } | ForEach-Object { Write-Host ("{0}: {1}C ({2})" -f $_.City, $_.Temp, $_.Comfort) }

# Sort + measure over the same objects.
Write-Host ("warmest: " + (($rows | Sort-Object Temp -Descending)[0].City))
Write-Host ("mean: " + [math]::Round(($rows | Measure-Object Temp -Average).Average, 1))
`),
    ex("ps-ex-014", "Error handling", "try/catch/finally, typed catches, $ErrorActionPreference, throwing.", "Control & Logic", "error_handling",
        `# try / catch / finally with TYPED catches.
try {
    $ErrorActionPreference = "Stop"   # turn non-terminating into catchable
    $null = Get-Item "Z:/definitely-not-here" -ErrorAction Stop
} catch [System.Management.Automation.ItemNotFoundException] {
    Write-Host "path not found (typed catch)"
} catch {
    Write-Host ("other error: " + $_.Exception.Message)
} finally {
    Write-Host "always runs"
}

# Throwing your own.
function Get-Sqrt {
    param([double]$x)
    if ($x -lt 0) { throw "Get-Sqrt: negative input ($x)" }
    return [math]::Sqrt($x)
}
try { Get-Sqrt -x -4 } catch { Write-Host ("caught: " + $_.Exception.Message) }

# -ErrorAction per call keeps the pipeline flowing.
foreach ($p in "a.txt", "missing.txt") {
    Get-Item $p -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "found: $p" }
}
`),
    ex("ps-ex-015", "Files and folders", "New/Set/Get-Item, Test-Path, Copy, Delete, recursion with -Recurse.", "System & Files", "files_tour",
        `# A sandboxed tour — this folder is created and REMOVED each run.
$root = Join-Path ([System.IO.Path]::GetTempPath()) "praxis_ps_demo"
New-Item -ItemType Directory -Path $root -Force | Out-Null

# Create nested structure.
New-Item -ItemType Directory -Path (Join-Path $root "data") -Force | Out-Null
Set-Content -Path (Join-Path $root "data" "a.txt") -Value "alpha"
Set-Content -Path (Join-Path $root "data" "b.txt") -Value "beta"

# Test + enumerate.
Write-Host ("exists: " + (Test-Path (Join-Path $root "data")))
Get-ChildItem $root -Recurse -File | ForEach-Object {
    Write-Host ("{0} ({1} bytes)" -f $_.FullName, $_.Length)
}

# Copy with recursion, then delete the whole tree.
Copy-Item (Join-Path $root "data") (Join-Path $root "backup") -Recurse
Write-Host ("copied files: " + (Get-ChildItem (Join-Path $root "backup")).Count)
Remove-Item $root -Recurse -Force
Write-Host ("still exists: " + (Test-Path $root))
`),
    ex("ps-ex-016", "Reading and writing text", "Get/Set-Content, Add-Content, encodings and line handling.", "System & Files", "text_io",
        `# A scratch file for this run.
$f = Join-Path ([System.IO.Path]::GetTempPath()) "praxis_lines.txt"

# Write, append, read back.
Set-Content -Path $f -Value "first line" -Encoding UTF8
Add-Content -Path $f -Value "second line"
Add-Content -Path $f -Value "third line"
$lines = Get-Content $f
Write-Host ("lines: " + $lines.Count)
Write-Host ("last: " + $lines[-1])

# Get-Content streams line OBJECTS into the pipeline.
Get-Content $f | Where-Object { $_ -match "second" } | ForEach-Object {
    Write-Host ("matched: " + $_)
}

# -Raw reads the whole file as ONE string.
Write-Host ("raw length: " + (Get-Content $f -Raw).Length)

# .NET when you need the bytes.
$bytes = [System.IO.File]::ReadAllBytes($f)
Write-Host ("byte count: " + $bytes.Length)
Remove-Item $f
`),
    ex("ps-ex-017", "CSV and structured data", "Import/Export-Csv round-trips objects.", "System & Files", "csv_data",
        `# CSV is the object exchange format in PowerShell.
$csv = Join-Path ([System.IO.Path]::GetTempPath()) "praxis_people.csv"

$people = @(
    [pscustomobject]@{ Name = "Ada"; Role = "engineer"; Pay = 100 }
    [pscustomobject]@{ Name = "Alan"; Role = "mathematician"; Pay = 90 }
    [pscustomobject]@{ Name = "Grace"; Role = "admiral"; Pay = 120 }
)
$people | Export-Csv -Path $csv -NoTypeInformation

# Import back into full objects with typed-ish access.
Import-Csv $csv | ForEach-Object {
    Write-Host ("{0,-10} {1,-14} pay={2}" -f $_.Name, $_.Role, $_.Pay)
}

# Same objects as JSON (ConvertTo/From-Json round-trip).
$json = $people | ConvertTo-Json -Depth 3
$roundTripped = $json | ConvertFrom-Json
Write-Host ("json rows: " + $roundTripped.Count + " first: " + $roundTripped[0].Name)
Remove-Item $csv
`),
    ex("ps-ex-018", "Environment and process info", "$env:, PATH inspection, machine + user context.", "System & Files", "environment",
        `# Environment variables via $env:.
Write-Host ("OS: " + $env:OS)
Write-Host ("processors: " + $env:NUMBER_OF_PROCESSORS)
Write-Host ("TEMP dir: " + $env:TEMP)

# Set one for THIS session / child processes only.
$env:PRAXIS_SESSION = "praxis-demo"
Write-Host ("set: " + $env:PRAXIS_SESSION)

# PATH entries (split the single string into a list).
$pathList = $env:PATH -split ";"
Write-Host ("path entries: " + $pathList.Count)
Write-Host ("first entry: " + $pathList[0])

# Machine + user scopes (read-only demo).
Write-Host ("PS version: " + $PSVersionTable.PSVersion)
Write-Host ("edition: " + $PSVersionTable.PSEdition)
Write-Host ("is 64-bit: " + [Environment]::Is64BitProcess)
Write-Host ("user: " + [Environment]::UserName)
`),
    ex("ps-ex-019", "Processes", "Get-Process filtering, CPU sorting and safe Stop-Process with -WhatIf.", "System & Files", "processes",
        `# Inspect running processes as rich objects.
$procs = Get-Process
Write-Host ("process count: " + $procs.Count)

# The top CPU consumers (WorkingSet for memory).
$procs |
    Sort-Object CPU -Descending |
    Select-Object -First 3 Name, Id, CPU |
    ForEach-Object { Write-Host ("{0,-12} pid={1} cpu={2:N1}s" -f $_.Name, $_.Id, $_.CPU) }

# Memory view (bytes -> MB via calculated property).
$procs |
    Sort-Object WorkingSet64 -Descending |
    Select-Object -First 3 Name, @{ n = "MemMB"; e = { [math]::Round($_.WorkingSet64 / 1MB, 1) } } |
    ForEach-Object { Write-Host ("{0} uses {1} MB" -f $_.Name, $_.MemMB) }

# A dry-run termination (never touches real processes here).
Get-Process | Where-Object { $_.Name -eq "definitely-not-a-real-process" } |
    Stop-Process -WhatIf
`),
    ex("ps-ex-020", "Services and registry reads", "Get-Service states; read-only registry queries.", "System & Files", "services_registry",
        `# Services — status as objects.
$svc = Get-Service
Write-Host ("service count: " + $svc.Count)
Write-Host ("running: " + ($svc | Where-Object Status -eq "Running").Count)
Write-Host ("stopped: " + ($svc | Where-Object Status -eq "Stopped").Count)

# Group by status for a summary.
$svc | Group-Object Status | ForEach-Object {
    Write-Host ("{0}: {1}" -f $_.Name, $_.Count)
}

# Registry — READ-ONLY queries.
$uninstall = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion"
if (Test-Path $uninstall) {
    Write-Host ("key exists: " + $uninstall)
}
$psHome = Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\PowerShell\\1" -ErrorAction SilentlyContinue
if ($psHome) { Write-Host ("install type: " + $psHome.InstallType) }
`),
    ex("ps-ex-021", "Date and time", "Get-Date formatting, TimeSpan arithmetic, .NET parsing.", "Numbers & Dates", "dates_times",
        `# Now, then, and formatting.
$now = Get-Date
Write-Host ("now: " + $now.ToString("yyyy-MM-dd HH:mm:ss"))
Write-Host ("short: " + $now.ToShortDateString())
Write-Host ("day: " + $now.DayOfWeek)

# DateTime arithmetic.
$start = Get-Date "2024-01-01"
$elapsed = $now - $start
Write-Host ("days since 2024 start: " + [int]$elapsed.TotalDays)

# Explicit construction + TimeSpan pieces.
$meeting = Get-Date -Year 2024 -Month 6 -Day 15 -Hour 9 -Minute 30
$span = New-TimeSpan -Start $start -End $meeting
Write-Host ("span: {0} days {1} hours" -f $span.Days, $span.Hours)

# Parsing with culture.
$parsed = [datetime]::ParseExact("15/06/2024", "dd/MM/yyyy", $null)
Write-Host ("parsed: " + $parsed.ToString("MMMM yyyy"))

# Stopwatch for timing code.
$watch = [System.Diagnostics.Stopwatch]::StartNew()
Start-Sleep -Milliseconds 50
$watch.Stop()
Write-Host ("slept ~" + $watch.ElapsedMilliseconds + " ms")
`),
    ex("ps-ex-022", "Numeric formatting and math", "Format strings N/F/P/X, bigint, rounding.", "Numbers & Dates", "number_formats",
        `# Format strings in -f and ToString().
"{0:N2}" -f 12345.678 | Write-Host      # 12,345.68
"{0:F1}" -f 0.25 | Write-Host           # 0.3
"{0:P2}" -f 0.075 | Write-Host          # 7.50 %
"{0:X}"  -f 255 | Write-Host            # FF
"{0:D8}" -f 42 | Write-Host             # 00000042
"{0,10}|{1,-10}|" -f "right", "left" | Write-Host

# [bigint] beyond Int64's range.
$big = [bigint]::Pow(3, 40)
Write-Host ("3^40 = " + $big)

# Rounding modes.
Write-Host ("banker: " + [math]::Round(2.5))
Write-Host ("ceiling: " + [math]::Ceiling(2.1))
Write-Host ("floor: " + [math]::Floor(2.9))
Write-Host ("truncate: " + [math]::Truncate(2.9))
`),
    ex("ps-ex-023", "Random and sequences", "Get-Random ranges, shuffling, reseeding.", "Numbers & Dates", "random",
        `# Get-Random — pick, sample, shuffle.
$die = Get-Random -Minimum 1 -Maximum 7      # 1..6 inclusive-exclusive
Write-Host ("die: " + $die)

$deck = 1..10
Write-Host ("pick one: " + (Get-Random -InputObject $deck))
Write-Host ("pick three: " + ((Get-Random -InputObject $deck -Count 3) -join ","))

# Shuffle = all items, random order.
Write-Host ("shuffled: " + ((Get-Random -InputObject $deck -Count $deck.Count) -join ","))

# The .NET generator with an explicit SEED (reproducible sequences).
$rng = [System.Random]::new(42)
Write-Host ("seeded next: " + $rng.Next(1, 100))
Write-Host ("seeded again: " + $rng.Next(1, 100))
$rng2 = [System.Random]::new(42)
Write-Host ("re-seeded matches: " + ($rng2.Next(1, 100) -eq $rng.Next(1, 100)))

# Random doubles.
$d = Get-Random -Minimum 0.0 -Maximum 1.0
Write-Host ("fraction: " + $d.ToString("F4"))
`),
    ex("ps-ex-024", "Regex operators", "-match -replace -split with capture groups.", "Text Processing", "regex",
        `# -match fills $Matches.
$log = "2024-06-15 ERROR disk usage 91%"
if ($log -match "^(?<date>\\S+)\\s+(?<level>ERROR|WARN|INFO)\\s+(?<msg>.*)$") {
    Write-Host ("date: " + $Matches.date)
    Write-Host ("level: " + $Matches.level)
    Write-Host ("msg: " + $Matches.msg)
}

# -replace with $1 group substitution.
Write-Host ("2024-06-15" -replace "(\\d+)-(\\d+)-(\\d+)", "$3/$2/$1")

# -split on a regex.
Write-Host (("a1b22c333" -split "\\d+") -join "|")

# [regex] static helpers.
$phones = "call +20-100-1234567 or +44-20-7654321"
foreach ($m in [regex]::Matches($phones, "\\+\\d{2}-\\d{2,3}-\\d{6,8}")) {
    Write-Host ("found: " + $m.Value)
}
Write-Host ("cleaned: " + [regex]::Replace("spaces   everywhere", "\\s+", " "))
`),
    ex("ps-ex-025", "String building and culture", "StringBuilder, culture-aware parsing, composite alignment.", "Text Processing", "string_building",
        `# StringBuilder — the efficient way to assemble big strings.
$sb = [System.Text.StringBuilder]::new()
for ($i = 1; $i -le 5; $i++) {
    [void]$sb.Append("line $i")
    [void]$sb.AppendLine()
}
Write-Host $sb.ToString()

# Culture-aware parsing (avoid locale surprises).
$de = [System.Globalization.CultureInfo]::new("de-DE")
$value = [double]::Parse("3,5", $de)     # comma decimal point
Write-Host ("de-DE 3,5 -> " + $value)
Write-Host ("invariant round trip: " + $value.ToString([System.Globalization.CultureInfo]::InvariantCulture))

# Column alignment with padding.
"{" + "0,-15}" -f "" | Out-Null
"{0,-15}{1,8}" -f "item", "qty" | Write-Host
"{0,-15}{1,8}" -f "pencils", 12 | Write-Host
"{0,-15}{1,8}" -f "staplers", 3 | Write-Host
`),
    ex("ps-ex-026", "XML and JSON documents", "Cast strings to [xml], navigate nodes.", "Text Processing", "xml_json",
        `# XML via the [xml] accelerator.
$xmlText = @"
<library>
  <book id="1"><title>Structure</title><year>1975</year></book>
  <book id="2"><title>Design</title><year>1977</year></book>
</library>
"@
$doc = [xml]$xmlText
foreach ($book in $doc.library.book) {
    Write-Host ("#{0} {1} ({2})" -f $book.id, $book.title, $book.year)
}
Write-Host ("first title: " + $doc.library.book[0].title)

# JSON via ConvertFrom-Json.
$jsonText = '{"team": "praxis", "members": [{"name": "a", "role": "ui"}, {"name": "b", "role": "api"}]}'
$team = $jsonText | ConvertFrom-Json
Write-Host ("team: " + $team.team)
Write-Host ("members: " + $team.members.Count)
$team.members | ForEach-Object { Write-Host ("{0} -> {1}" -f $_.name, $_.role) }
`),
    ex("ps-ex-027", "Modules and imports", "Manifest-free module loading, Export-ModuleMember.", "Scripting Patterns", "modules",
        `# A module written to a temp path and imported for this run.
$mod = Join-Path ([System.IO.Path]::GetTempPath()) "PraxisUtils.psm1"
@'
function Get-Double([int]$n) { return $n * 2 }
function Get-Triple([int]$n) { return $n * 3 }
Export-ModuleMember -Function Get-Double, Get-Triple
'@ | Set-Content $mod

Import-Module $mod -Force
Write-Host ("double 6 -> " + (Get-Double 6))
Write-Host ("triple 6 -> " + (Get-Triple 6))

# Imported commands are discoverable.
$cmds = Get-Command -Module PraxisUtils
Write-Host ("exported: " + (($cmds | ForEach-Object Name) -join ", "))

Remove-Module PraxisUtils
Remove-Item $mod
Write-Host ("after removal: " + ((Get-Command Get-Double -ErrorAction SilentlyContinue) -ne $null))
`),
    ex("ps-ex-028", "Script parameters and $PSScriptRoot", ".ps1 param blocks, $PSCommandPath, invocation info.", "Scripting Patterns", "script_params",
        `# A .ps1's own param block — Get-Help style metadata.
param(
    [string]$Target = "console",
    [int]$Repeat = 1
)

# $PSScriptRoot + $PSCommandPath describe THIS script file.
Write-Host ("script root: " + $PSScriptRoot)
Write-Host ("script path: " + $PSCommandPath)

# Invocation context.
$inv = $MyInvocation.MyCommand
Write-Host ("command: " + $inv.Name)
Write-Host ("target: " + $Target + " repeat: " + $Repeat)

for ($i = 1; $i -le $Repeat; $i++) {
    Write-Host ("run $i for $Target")
}
`),
    ex("ps-ex-029", "Validation and attributes", "[Validate*] attribute guards on parameters.", "Scripting Patterns", "validation",
        `# Parameter validation attributes — reject bad input BEFORE the body.
function Get-Slice {
    param(
        [ValidateRange(1, 10)]
        [int]$Count = 3,

        [ValidateSet("asc", "desc")]
        [string]$Order = "asc",

        [ValidatePattern("^\\d{3}$")]
        [string]$Code = "000"
    )
    $items = 1..$Count
    if ($Order -eq "desc") { $items = $items | Sort-Object -Descending }
    Write-Host ("code $Code -> " + ($items -join ","))
}

Get-Slice -Count 5
Get-Slice -Count 4 -Order desc

# Invalid values fail with clear messages (each caught here).
foreach ($bad in @(@{ Count = 99 }, @{ Order = "sideways" })) {
    try { Get-Slice @bad -ErrorAction Stop } catch {
        Write-Host ("rejected: " + $_.Exception.Message.Split([Environment]::NewLine)[0])
    }
}
`),
    ex("ps-ex-030", "Splats and argument passing", "@hash splatting, array splatting, PSBoundParameters.", "Scripting Patterns", "splatting",
        `# Splatting — pass MANY parameters with one variable.
function Format-Box {
    param([string]$Text, [int]$Width = 20, [string]$Fill = "*", [switch]$Center)
    $pad = $Width - $Text.Length
    if ($Center) {
        $left = [math]::Floor($pad / 2); $right = $pad - $left
    } else { $left = 0; $right = $pad }
    return ($Fill * $left) + $Text + ($Fill * $right)
}

# Hash splat: keys BECOME parameter names.
$opts = @{ Text = "splat"; Width = 16; Fill = "-"; Center = $true }
Write-Host (Format-Box @opts)

# Array splat: positional, in order.
$args2 = "positional", 18, "=", $false
Write-Host (Format-Box @args2)

# PSBoundParameters echoes what was actually BOUND.
function Show-Bound { param($A, $B, $C) Write-Host ("bound: " + (($PSBoundParameters.Keys | Sort-Object) -join ",")) }
Show-Bound -A 1 -C 3
`),
    ex("ps-ex-031", "Output streams and redirection", "Write-Verbose/Error/Warning, merging streams into one capture.", "Scripting Patterns", "streams",
        `# The six output streams — routed by type.
Write-Output   "success stream"
Write-Host     "host / display stream"
Write-Warning  "warning stream"
Write-Verbose  "verbose (shown with -Verbose)" -Verbose
try { Write-Error "error stream entry" -ErrorAction SilentlyContinue } catch {}

# Merge everything a command emits into ONE structured capture.
$all = & {
    Write-Output "one"
    Write-Warning "careful"
    Write-Error "oops" -ErrorAction SilentlyContinue
} 3>&1 2>&1 | ForEach-Object { "$($_.GetType().Name): $_" }
$all | ForEach-Object { Write-Host $_ }

# Tee-Object keeps a copy while forwarding.
1..3 | Tee-Object -Variable kept | ForEach-Object { Write-Host "saw $_" }
Write-Host ("kept: " + ($kept -join ","))
`),
    ex("ps-ex-032", "Jobs and parallelism basics", "Start-Job, Wait-Job, Receive-Job;ForEach -Parallel (pwsh 7).", "Scripting Patterns", "jobs",
        `# Background JOBS — separate PowerShell processes.
$job = Start-Job -ScriptBlock {
    Start-Sleep -Milliseconds 100
    "job finished at $(Get-Date -Format 'HH:mm:ss.fff')"
}
Write-Host ("state right after start: " + $job.State)
Wait-Job $job | Out-Null
Receive-Job $job | ForEach-Object { Write-Host $_ }
Remove-Job $job

# Thread-safe counting with a synchronized hash (classic pattern).
$shared = [hashtable]::Synchronized(@{ Total = 0 })
1..5 | ForEach-Object -Parallel {
    Start-Sleep -Milliseconds 20
    [void][System.Threading.Interlocked]::Add(
        [ref]$using:shared.Total, 1)
} -ThrottleLimit 5
Write-Host ("parallel count: " + $shared.Total)
`),
    ex("ps-ex-033", "Remoting-ready invoke", "Invoke-Command against localhost as a safe demo.", "Scripting Patterns", "invoke_command",
        `# Invoke-Command — the remoting workhorse (localhost here = harmless).
$out = Invoke-Command -ComputerName $env:COMPUTERNAME -ScriptBlock {
    [pscustomobject]@{
        Machine = $env:COMPUTERNAME
        User = [Environment]::UserName
        PS = $PSVersionTable.PSVersion.ToString()
    }
} -ErrorAction SilentlyContinue

if ($out) {
    Write-Host ("machine: " + $out.Machine)
    Write-Host ("user: " + $out.User)
    Write-Host ("ps: " + $out.PS)
} else {
    # No admin remoting on this box — show the local equivalent instead.
    Write-Host ("local machine: " + $env:COMPUTERNAME)
    Write-Host ("local user: " + [Environment]::UserName)
}
`),
    ex("ps-ex-034", "Script blocks and closures", "[scriptblock]::Create, GetNewClosure, delayed eval.", "Scripting Patterns", "scriptblocks",
        `# Script blocks are values — call them on demand.
$block = { param($x) $x * 2 }
Write-Host ("invoke: " + (& $block 21))

# Create from a STRING at runtime.
$multiply = [scriptblock]::Create("param(\`$a, \`$b) \`$a * \`$b")
Write-Host ("from string: " + (& $multiply 6 7))

# GetNewClosure snapshots variables NOW.
function New-Counter([int]$start) {
    $n = $start
    { $n++; return $n }.GetNewClosure()
}
$c = New-Counter 10
Write-Host ("tick: " + (& $c))
Write-Host ("tick: " + (& $c))

# Script blocks as reusable predicates.
$filter = { $_ -gt 3 }
1..6 | Where-Object $filter | ForEach-Object { Write-Host "kept: $_" }
`),
    ex("ps-ex-035", "Events and filesystem watcher", "Register-ObjectEvent with a FileSystemWatcher (stopped each run).", "Scripting Patterns", "watcher",
        `# A FileSystemWatcher wired through Register-ObjectEvent.
$dir = Join-Path ([System.IO.Path]::GetTempPath()) "praxis_watch"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$watcher = [System.IO.FileSystemWatcher]::new($dir)
$watcher.EnableRaisingEvents = $true

Register-ObjectEvent $watcher "Created" -SourceIdentifier PraxCreated -Action {
    Write-Host ("created: " + $EventArgs.Name)
} | Out-Null

# Generate one event and give the action a moment to run.
Set-Content (Join-Path $dir "ping.txt") "hello"
Start-Sleep -Milliseconds 300

Unregister-Event -SourceIdentifier PraxCreated -ErrorAction SilentlyContinue
$watcher.EnableRaisingEvents = $false
$watcher.Dispose()
Remove-Item $dir -Recurse -Force
Write-Host "watcher torn down"
`),
    ex("ps-ex-036", "Profiles and $PROFILE", "The profile scripts PowerShell runs at startup.", "Scripting Patterns", "profile",
        `# $PROFILE points at the current-user host profile.
Write-Host ("profile path: " + $PROFILE)

# The four profile layers, most-specific last.
$paths = @(
    $PROFILE.AllUsersAllHosts
    $PROFILE.AllUsersCurrentHost
    $PROFILE.CurrentUserAllHosts
    $PROFILE.CurrentUserCurrentHost
)
foreach ($p in $paths) { Write-Host ("layer: " + $p) }

# A safe alias + function typical of a tuned profile.
Set-Alias -Name ll -Value Get-ChildItem -Description "unix-style ls -l" -ErrorAction SilentlyContinue
ll $HOME | Select-Object -First 3 | ForEach-Object { Write-Host ("    " + $_.Name) }

# What the host actually runs now.
Write-Host ("host: " + $Host.Name)
Write-Host ("prompt fn: " + ($function:prompt -ne $null))
`),
    ex("ps-ex-037", "Ternary, coalescing and null handling", "PS 7 operators: ?:, ??, ??=, chained comparisons.", "Modern PowerShell", "modern_ops",
        `# The PS 7+ ternary (guarded for 5.1 with a fallback variable).
$version = $PSVersionTable.PSVersion.Major
$label = $version -ge 7 ? "modern" : "classic"
Write-Host ("running: $label ($version)")

# Null-coalescing — a default when the left side is null.
$config = $null
$timeout = $config ?? 30
Write-Host ("timeout: $timeout")

# ??= assigns only when missing.
$cache = $null
$cache ??= "seeded"
Write-Host ("cache: " + $cache)

# Null-conditional chain emulation (safe deep access).
function Safe-Index($hash, $key) { if ($null -ne $hash) { $hash[$key] } else { $null } }
$nested = $null
Write-Host ("safe lookup: " + (Safe-Index $nested "missing"))

# Null-safe output with -ErrorAction on a Get.
$item = Get-Item "Z:/nope" -ErrorAction Ignore
Write-Host ("is null: " + ($null -eq $item))
`),
    ex("ps-ex-038", "Pipeline chain operators", "&& and || conditional pipelines.", "Modern PowerShell", "chain_ops",
        `# && runs the NEXT command only on success.
$ok = $true
$ok && Write-Host "first succeeded" || Write-Host "first failed"

# A realistic guard chain.
$path = Join-Path ([System.IO.Path]::GetTempPath()) "praxis_chain.txt"
Set-Content $path "seed" &&
    Get-Content $path &&
        Remove-Item $path

# || as a fallback provider.
$preference = $null
$effective = $preference ?? "default-value"
Write-Host ("effective: " + $effective)

# Command-not-found flows into the fallback branch.
Get-Command praxis-nonexistent -ErrorAction Ignore || Write-Host "command missing (as expected)"
`),
    ex("ps-ex-039", "Concise pipeline syntax", "?: in pipeline position, simplified Where/ForEach (PS 7).", "Modern PowerShell", "concise_syntax",
        `# Simplified Where-Object (PS 7): property-only syntax.
$nums = 1..10
Write-Host ("evens: " + (($nums | Where-Object -Property Value -Even) -join ","))
Write-Host ("big: " + (($nums | Where-Object { $_ -gt 6 }) -join ","))

# Member enumeration over a COLLECTION of objects (no ForEach needed).
$files = Get-ChildItem $HOME -ErrorAction SilentlyContinue | Select-Object -First 5
Write-Host ("names: " + (($files.Name) -join ", "))

# Null conditional on method invocation — ?. (PS 7).
$maybe = $null
Write-Host ("null-safe length: " + ($maybe?.Count))

# Chain formatting right in the pipeline.
1..5 | ForEach-Object { $_ * $_ } |
    Where-Object { $_ -gt 5 } |
    ForEach-Object { Write-Host ("square kept: $_") }
`),
    ex("ps-ex-040", "Testing with Pester-style asserts", "A mini assert helper for script self-checks.", "Testing", "asserts",
        `# A tiny Pester-flavored assert (works without the module).
$script:Failures = 0
function Should-Be($Expected, $Actual, $Name) {
    if ($Expected -eq $Actual) {
        Write-Host ("  ok  " + $Name)
    } else {
        $script:Failures++
        Write-Host ("  FAIL " + $Name + " (expected '" + $Expected + "' got '" + $Actual + "')")
    }
}

Should-Be 4 (2 + 2) "addition"
Should-Be "POWER" ("PowerShell".Substring(0, 5).ToUpper()) "upper slice"
Should-Be 3 (@(1, 2, 3).Count) "count"
Should-Be $true ((5 -in 1..10)) "membership"

# Describe / Context labels, Pester style.
Write-Host "describe: arithmetic"
Should-Be 10 (2 * 5) "multiplication"

if ($script:Failures -eq 0) { Write-Host "ALL CHECKS PASSED" }
else { Write-Host ("failures: " + $script:Failures) }
`),
    ex("ps-ex-041", "Logging pattern", "A leveled logger with timestamps writing to stdout + a temp file.", "Testing", "logging_pattern",
        `# A reusable leveled logger.
$script:LogFile = Join-Path ([System.IO.Path]::GetTempPath()) "praxis_praxis.log"
function Write-Log {
    param([string]$Level = "INFO", [string]$Message)
    $line = "{0} [{1,-5}] {2}" -f (Get-Date -Format "HH:mm:ss"), $Level, $Message
    Write-Host $line
    Add-Content -Path $script:LogFile -Value $line
}

Write-Log "INFO"  "starting the batch"
Write-Log "DEBUG" "cache warm: $true"
Write-Log "WARN"  "disk usage at 91%"
Write-Log "ERROR" "mirror sync failed"

Write-Host ("log lines: " + (Get-Content $script:LogFile).Count)
Get-Content $script:LogFile | Select-Object -First 2 | ForEach-Object { Write-Host ("replay: " + $_) }
Remove-Item $script:LogFile
`),
    ex("ps-ex-042", "Configuration files", "A JSON config with defaults merge + validation.", "Testing", "config_pattern",
        `# Read a JSON config, merge defaults, validate.
$dir = Join-Path ([System.IO.Path]::GetTempPath()) "praxis_cfg"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$cfgPath = Join-Path $dir "settings.json"

@{ retries = 2; host = "127.0.0.1" } | ConvertTo-Json | Set-Content $cfgPath

$defaults = @{ retries = 1; host = "0.0.0.0"; port = 8080; path = "." }
$file = Get-Content $cfgPath -Raw | ConvertFrom-Json

# Merge: file keys WIN over defaults (property-by-property).
$merged = [ordered]@{}
foreach ($k in $defaults.Keys) { $merged[$k] = $defaults[$k] }
foreach ($k in $file.PSObject.Properties.Name) { $merged[$k] = $file.$k }

Write-Host ("merged: " + ($merged | ConvertTo-Json -Compress))

# Validation gate.
foreach ($rule in @(
    @{ k = "retries"; ok = ($merged.retries -ge 0) }
    @{ k = "port";     ok = ($merged.port -in 1..65535) }
)) {
    Write-Host ("{0}: {1}" -f $rule.k, $(if ($rule.ok) { "valid" } else { "INVALID" }))
}
Remove-Item $dir -Recurse -Force
`),
    ex("ps-ex-043", "HTML report generation", "Build a small styled HTML summary from objects.", "Reporting", "html_report",
        `# Objects -> a styled HTML fragment (no modules).
$rows = @(
    [pscustomobject]@{ Check = "disk"; Value = 91; Unit = "%" }
    [pscustomobject]@{ Check = "memory"; Value = 62; Unit = "%" }
    [pscustomobject]@{ Check = "cpu"; Value = 12; Unit = "%" }
)
$style = "body{font-family:monospace;background:#111;color:#eee}"
$table = $rows | ForEach-Object {
    "<tr><td>{0}</td><td>{1}{2}</td></tr>" -f $_.Check, $_.Value, $_.Unit
}
$html = "<html><head><style>$style</style></head><body><table border=1>" +
    ($table -join "") + "</table></body></html>"

$out = Join-Path ([System.IO.Path]::GetTempPath()) "praxis_report.html"
Set-Content $out $html
Write-Host ("report written: " + $out)
Write-Host ("size: " + (Get-Item $out).Length + " bytes")
Write-Host $table
Remove-Item $out
`),
    ex("ps-ex-044", "Console UI helpers", "Read-Host, colors, a pause, a simple menu loop.", "Reporting", "console_ui",
        `# Colored writes.
Write-Host "plain" -ForegroundColor Gray
Write-Host "success" -ForegroundColor Green
Write-Host "warning" -ForegroundColor Yellow
Write-Host "error" -ForegroundColor Red

# A simple arrowless menu loop (driven by a canned answer here).
$choices = "show", "stats", "quit"
Write-Host ("menu: " + ($choices -join " | "))
foreach ($pick in @("show", "quit")) {
    switch ($pick) {
        "show"  { Write-Host "  showing a fake panel" -ForegroundColor Cyan }
        "stats" { Write-Host "  42 rows, 7 cols" -ForegroundColor Cyan }
        "quit"  { Write-Host "  bye" -ForegroundColor Magenta }
    }
}

# Read-Host with a default (works interactively; canned demo value).
$answer = "demo"
Write-Host ("typed answer: " + $answer)

# Progress bar rendering with Write-Progress.
for ($i = 1; $i -le 3; $i++) {
    Write-Progress -Activity "Scanning" -Status "$i of 3" -PercentComplete ($i / 3 * 100)
    Start-Sleep -Milliseconds 30
}
Write-Progress -Activity "Scanning" -Completed
Write-Host "scan done"
`),
    ex("ps-ex-045", "Object inspection", "Get-Member, format lists, type catalogs.", "Reporting", "inspection",
        `# Get-Member = reflection for pipeline objects.
$now = Get-Date
Write-Host ("type: " + $now.GetType().FullName)
$members = $now | Get-Member
Write-Host ("member count: " + $members.Count)
$members | Where-Object MemberType -eq "Property" | Select-Object -First 5 |
    ForEach-Object { Write-Host ("  prop: " + $_.Name) }
$members | Where-Object MemberType -eq "Method" | Select-Object -First 5 |
    ForEach-Object { Write-Host ("  method: " + $_.Name + "()") }

# Format-List shows EVERYTHING (Format-Table truncates).
Get-Command Get-ChildItem | Format-List Name, CommandType, Version -ErrorAction SilentlyContinue |
    Out-String | ForEach-Object { $_.Trim() } | Where-Object { $_ } | ForEach-Object { Write-Host $_ }

# The type accelerators table.
$accel = [psobject].Assembly.GetType("System.Management.Automation.TypeAccelerators")::Get
Write-Host ("accelerators: " + $accel.Count)
foreach ($k in @("int", "double", "string", "xml")) {
    Write-Host ("  [$k] -> " + $accel[$k].FullName)
}
`),
    ex("ps-ex-046", "Performance measurement", "Measure-Command, hashtable lookup vs where scan.", "Reporting", "perf",
        `# Measure-Command times any script block.
$slow = Measure-Command { Start-Sleep -Milliseconds 40 }
Write-Host ("sleep took: " + [int]$slow.TotalMilliseconds + " ms")

# Hashtable lookup vs linear Where-Object scan.
$haystack = 1..2000
$map = @{}
foreach ($n in $haystack) { $map[$n] = $true }

$tHash = Measure-Command { for ($i = 0; $i -lt 500; $i++) { [void]$map[1999] } }
$tScan = Measure-Command {
    for ($i = 0; $i -lt 5; $i++) { [void]($haystack | Where-Object { $_ -eq 1999 }) }
}
Write-Host ("hashtable 500 hits: " + [int]$tHash.TotalMilliseconds + " ms")
Write-Host ("pipeline 5 scans : " + [int]$tScan.TotalMilliseconds + " ms")
Write-Host ("speedup: " + [math]::Round(($tScan.TotalMilliseconds * 100) / ($tHash.TotalMilliseconds + 0.0001) / 100, 1) + "x")
`),
    ex("ps-ex-047", "String to script safety", "Why Invoke-Expression is risky; the safe alternatives.", "Security", "safe_eval",
        `# NEVER do this with user input (shown only as the anti-pattern):
#   Invoke-Expression $userInput   # arbitrary code execution!

# SAFE alternative 1: script blocks from trusted strings.
$safe = [scriptblock]::Create("\`$true")   # literal constant
Write-Host ("trusted block: " + (& $safe))

# SAFE alternative 2: data-shaped evaluation via operators.
$expr = "5 -gt 3"
$parts = $expr -split " "
$result = switch ($parts[1]) {
    "-gt" { [int]$parts[0] -gt [int]$parts[2] }
    "-lt" { [int]$parts[0] -lt [int]$parts[2] }
    "-eq" { [int]$parts[0] -eq [int]$parts[2] }
}
Write-Host ("$expr -> $result")

# SAFE alternative 3: a whitelist command map.
$commands = @{
    "help"  = { Write-Host "commands: help, version" }
    "version" = { Write-Host ("PS " + $PSVersionTable.PSVersion) }
}
$asked = "version"
if ($commands.ContainsKey($asked)) { & $commands[$asked] }
else { Write-Host "unknown command" }
`),
    ex("ps-ex-048", "Credentials and secure strings", "SecureString round-trip without ever printing the secret.", "Security", "credentials",
        `# SecureString — encrypted in memory, no plaintext.
$secret = "hunter2" | ConvertTo-SecureString -AsPlainText -Force

# A credential object (never displayed).
$cred = [pscredential]::new("praxis-demo", $secret)
Write-Host ("user: " + $cred.UserName)
Write-Host ("password bytes: " + $cred.Password.Length + " (secured, not shown)")

# Marshal back ONLY inside a trusted scope — round-trip check.
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($cred.Password))
Write-Host ("round-trip ok: " + ($plain.Length -eq 6))
$plain = $null

# Export/import the ENCRYPTED form (DPAPI, user-scoped).
$key = "praxis-demo-key"
$enc = $secret | ConvertFrom-SecureString -Key (1..16)
$back = $enc | ConvertTo-SecureString -Key (1..16)
Write-Host ("restored length: " + $back.Length)
`),
    ex("ps-ex-049", "Hashing and encoding", "MD5/SHA-256 hashes, hex + base64 conversion.", "Security", "hashing",
        `# SHA-256 of a string (and the classic MD5).
$text = "praxis"
$sha = [System.Security.Cryptography.SHA256]::Create()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
$hash = $sha.ComputeHash($bytes)
$hex = ($hash | ForEach-Object { $_.ToString("x2") }) -join ""
Write-Host ("sha256: " + $hex.Substring(0, 32) + "...")

$md5 = [System.Security.Cryptography.MD5]::Create()
$md5hex = ($md5.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""
Write-Host ("md5: " + $md5hex)

# Base64 round trips.
$b64 = [Convert]::ToBase64String($bytes)
Write-Host ("base64: " + $b64)
$decoded = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
Write-Host ("decoded: " + $decoded)

# URL-safe compare (timing-constant-ish simple loop demo).
function Compare-Const([string]$a, [string]$b) {
    if ($a.Length -ne $b.Length) { return $false }
    $diff = 0
    for ($i = 0; $i -lt $a.Length; $i++) { $diff = $diff -bor ([int]($a[$i] - $b[$i])) }
    return $diff -eq 0
}
Write-Host ("constant compare: " + (Compare-Const $hex $hex))
`),
    ex("ps-ex-050", "A complete mini tool", "File inventory report: args, functions, error handling, output.", "Projects", "file_inventory",
        `# file_inventory.ps1 — a small but COMPLETE tool.
param(
    [string]$Path = $HOME,
    [int]$Top = 5
)

function Get-Inventory([string]$root) {
    if (-not (Test-Path $root)) { throw "Path not found: $root" }
    Get-ChildItem $root -Recurse -File -ErrorAction SilentlyContinue |
        Group-Object Extension |
        ForEach-Object {
            [pscustomobject]@{
                Ext   = if ($_.Name) { $_.Name } else { "(none)" }
                Count = $_.Count
                MB    = [math]::Round(($_.Group | Measure-Object Length -Sum).Sum / 1MB, 2)
            }
        }
}

try {
    $report = Get-Inventory $Path
    Write-Host ("root: " + $Path + "  types: " + $report.Count)
    $report | Sort-Object Count -Descending | Select-Object -First $Top |
        ForEach-Object { Write-Host ("{0,-8} {1,4} files  {2,8} MB" -f $_.Ext, $_.Count, $_.MB) }
    Write-Host ("total size: " + [math]::Round(($report | Measure-Object MB -Sum).Sum, 1) + " MB")
} catch {
    Write-Host ("failed: " + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
`),
];
