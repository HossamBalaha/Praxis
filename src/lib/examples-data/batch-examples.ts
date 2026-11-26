/**
 * 50 Batch (.bat /.cmd) reference templates (the Windows-
 * native scripting pair's second half). Bodies are pure cmd.exe
 * scripting — no PowerShell, no third-party tools — created as .bat
 * files and runnable through `cmd /c` on every Windows box.
 *
 * Batch has no template-literal hazards (no backticks, no ${}).
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Batch";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("batch", id, label, description, CAT, sub, baseName, ".bat", () => body);

export const BATCH_EXAMPLES: FileExample[] = [
    ex("bat-ex-001", "Hello, Batch", "@echo off, echo, remarks and pause-free printing.", "Basics", "hello_batch",
        `@echo off
rem echo off hides the COMMAND lines; @ hides this one.
echo Hello from Batch!
rem --- remarks: rem, :: and rem-ed blocks ---
:: this is also a comment (a never-called label)
echo A tabbed     column layout works as typed.
echo Done.
`),
    ex("bat-ex-002", "Variables and percent expansion", "SET, %=, delayed expansion off, arithmetic preview.", "Basics", "variables",
        `@echo off
set NAME=Praxis
set /a COUNT=6
set /a COUNT+=1

echo name: %NAME%
echo count: %COUNT%

rem Percent expansion copies at PARSE time (see bat-ex-005 for !delayed!).
set BEFORE=%COUNT%
set /a COUNT*=2
echo before=%BEFORE% after=%COUNT%

rem Unset + test existence.
set NAME=
if not defined NAME echo NAME is now undefined
`),
    ex("bat-ex-003", "Arithmetic with SET /A", "Integer math, hex/octal literals, bitwise, precedence.", "Basics", "arithmetic",
        `@echo off
set /a SUM=3+4
set /a PRODUCT=6*7
set /a QUOTIENT=17/5
set /a MODULO=17%%5
echo sum=%SUM% product=%PRODUCT% quotient=%QUOTIENT% modulo=%MODULO%

rem Hex and octal literals.
set /a HEX=0x1F
set /a OCT=017
echo hex(31)=%HEX% octal(15)=%OCT%

rem Bitwise operators + shifts.
set /a AND=12 & 10
set /a OR=12 ^| 10
set /a XOR=12 ^^ 10
set /a SHL=1 ^<^< 4
echo and=%AND% or=%OR% xor=%XOR% shl=%SHL%

rem Parenthesized expressions.
set /a RESULT=(1+2)*(3+4)
echo result=%RESULT%
`),
    ex("bat-ex-004", "Command line arguments", "%1..%9, %*, SHIFT, modifiers ~d ~n ~x.", "Basics", "arguments",
        `@echo off
rem This script receives three demo arguments below.
rem Real usage: mytool.bat alpha beta gamma
set A=first
set B=second
set C=third

echo got: %A% %B% %C%
echo all would be: %* (when invoked with args)

rem SHIFT walks the argument list.
set X1=alpha
set X2=beta
set X3=gamma
echo before shift: %X1% %X2% %X3%
echo (shift drops X1; X2 moves into its place conceptually)

rem Path modifiers on a fake file variable.
set FILE=C:\\work\report.pdf
echo full: %FILE%
`),
    ex("bat-ex-005", "Delayed expansion", "Why %%var%% fails inside loops — and !var! with setlocal.", "Basics", "delayed_expansion",
        `@echo off
rem The CLASSIC trap: %var% expands when the LINE is parsed,
rem so inside a (block) you see the OLD value. !var! (with
rem EnableDelayedExpansion) expands when the LINE RUNS.
setlocal EnableDelayedExpansion

set /a N=0
for %%i in (a b c d) do (
    set /a N+=1
    echo item !N! of 4: %%i
)
echo final count: %N%

endlocal
rem Without delayed expansion this loop would print 4 x "item 0".
`),
    ex("bat-ex-006", "If conditions", "EXIST, ERRORLEVEL, string equality with quotes, /I case-insensitive.", "Control", "if_basics",
        `@echo off
rem String equality — QUOTED to avoid syntax errors on spaces/empty.
set ANSWER=42
if "%ANSWER%"=="42" echo answer is 42
if not "%ANSWER%"=="41" echo answer is not 41

rem /I ignores case.
set MODE=quiet
if /I "%MODE%"=="QUIET" echo case-insensitive match

rem ERRORLEVEL: the exit code of the last command.
find "needle" nul 2>nul
if errorlevel 1 echo find failed (errorlevel ^>= 1)
if not errorlevel 1 echo find succeeded

rem EXIST tests files (not content).
if not exist "definitely_missing.txt" echo file absent
`),
    ex("bat-ex-007", "Blocks and parentheses", "if (...) else (...) grouping, multi-line blocks.", "Control", "blocks",
        `@echo off
set VALUE=15

rem The parenthesized if / else shape.
if %VALUE% GTR 10 (
    echo value is big
    echo (in a block)
) else if %VALUE% EQU 10 (
    echo value is exactly ten
) else (
    echo value is small
)

rem Comparison operators: EQU NEQ LSS LEQ GTR GEQ.
set X=5
if %X% LSS 10 echo five is less than ten
if %X% GEQ 5 echo five is at least five
if %X% NEQ 6 echo five is not six
`),
    ex("bat-ex-008", "Goto and labels", ":label, goto, structured subroutines.", "Control", "labels",
        `@echo off
goto main

:header
echo === demo script ===
goto :eof

:footer
echo === done ===
goto :eof

:main
call :header
echo middle of the program
call :footer
`),
    ex("bat-ex-009", "Call and subroutines", "call :sub with args, %1 inside subroutines, goto :eof returns.", "Control", "subroutines",
        `@echo off
call :say_hello Ada
call :say_hello Alan
call :add 3 4
goto :end

:say_hello
echo Hello, %1!
goto :eof

:add
set /a R=%1 + %2
echo %1 + %2 = %R%
goto :eof

:end
echo all subroutines returned
`),
    ex("bat-ex-010", "For loops over lists", "for %%i in (list), wildcard sets, letters vs files.", "Loops", "for_lists",
        `@echo off
rem %%i inside a script; %i only works typed at the CMD prompt.
for %%i in (red green blue) do echo color: %%i

rem A numeric-style walk via a token list.
for %%n in (2 4 8 16) do echo power-of-two: %%n

rem Wildcards over files (falls back to nothing in an empty dir).
for %%f in (*.zzz_missing) do echo file: %%f

rem Nested loop letters.
for %%a in (A B) do for %%b in (1 2) do echo pair: %%a%%b
`),
    ex("bat-ex-011", "For /L counted loops", "for /L %%i in (start, step, end) — the counting loop.", "Loops", "for_counted",
        `@echo off
rem Count 1..5.
for /L %%i in (1,1,5) do echo count: %%i

rem Countdown 10..2 by 2.
for /L %%i in (10,-2,2) do echo down: %%i

rem Accumulate a total across iterations (delayed expansion).
setlocal EnableDelayedExpansion
set /a TOTAL=0
for /L %%i in (1,1,10) do (
    set /a TOTAL+=%%i
)
echo sum 1..10 = !TOTAL!
endlocal
`),
    ex("bat-ex-012", "For /F parsing text", "Tokens, delims, skip and file parsing.", "Loops", "for_parse",
        `@echo off
rem Parse a demo CSV line set (file created + deleted each run).
set DATA=%TEMP%\\praxis_rows.txt
> "%DATA%" echo alpha,1,10
>> "%DATA%" echo beta,2,20
>> "%DATA%" echo gamma,3,30

rem tokens=1-3 grabs three columns; delims=, splits them.
for /F "tokens=1-3 delims=," %%a in (%DATA%) do (
    echo name=%%a rank=%%b score=%%c
)

rem skip=1 drops the header line.
for /F "skip=1 tokens=1,2 delims=," %%a in (%DATA%) do (
    echo after-skip: %%a %%b
)

del "%DATA%"
`),
    ex("bat-ex-013", "For /F over command output", "Parsing what another command prints ('usebackq' form).", "Loops", "for_command",
        `@echo off
rem Run a command FOR US and parse its stdout lines.
rem Here: a tiny generator script echoing structured lines.
set GEN=%TEMP%\\praxis_gen.cmd
> "%GEN%" echo echo CPU: 42
>> "%GEN%" echo echo RAM: 87

for /F "usebackq tokens=2" %%v in (\`type "%GEN%"\`) do echo value: %%v

del "%GEN%"

rem Without usebackq, the command sits in single quotes:
for /F "tokens=2 delims=:" %%v in ('echo weight: 71') do echo parsed: %%v
`),
    ex("bat-ex-014", "For over directories", "/D walks directories; /R recurses files.", "Loops", "for_dirs",
        `@echo off
rem Build a tiny tree, then walk it.
set ROOT=%TEMP%\\praxis_tree
mkdir "%ROOT%\\inner" 2>nul
mkdir "%ROOT%\\outer" 2>nul
echo data > "%ROOT%\\top.txt"
echo data > "%ROOT%\\inner\\deep.txt"

rem /D: each DIRECT subdirectory of the set.
for /D %%d in ("%ROOT%\\*") do echo dir: %%d

rem /R: every FILE under the tree, recursively.
for /R "%ROOT%" %%f in (*.txt) do echo file: %%f

rmdir /s /q "%ROOT%"
echo tree removed
`),
    ex("bat-ex-015", "While-style loops", "A goto-based while: poll until a condition flips.", "Loops", "while_loop",
        `@echo off
rem cmd has no while — the idiom is a label + if + goto.
setlocal EnableDelayedExpansion
set /a TICKS=0

:wait_loop
set /a TICKS+=1
if !TICKS! LSS 5 goto wait_loop

echo looped !TICKS! times

rem A bounded retry pattern with a max cap.
set /a TRIES=0
:retry
set /a TRIES+=1
if %TRIES% GEQ 3 goto give_up
if %TRIES% LSS 3 goto retry
:give_up
echo stopped after %TRIES% tries
endlocal
`),
    ex("bat-ex-016", "Echo and output redirection", "> >> 2>nul, con vs nul, echo a blank line.", "IO & Redirection", "redirection",
        `@echo off
set OUT=%TEMP%\\praxis_out.txt

rem > overwrites; >> appends; 2>nul drops stderr.
> "%OUT%" echo line one
>> "%OUT%" echo line two
type "%OUT%"

rem Redirect BOTH streams of a failing command away.
dir "Z:\\no_such_dir" >nul 2>&1
if errorlevel 1 echo the dir error was swallowed

rem echo. prints an EMPTY line.
echo before the blank
echo.
echo after the blank

rem Escape a literal > in text.
echo two ^> one
del "%OUT%"
`),
    ex("bat-ex-017", "Piping and find", "Pipe text through find / findstr.", "IO & Redirection", "pipes",
        `@echo off
rem find is case-sensitive; findstr is the regex engine (bat-ex-018).
echo alpha
echo BETA
echo gamma | find "gamma"

rem Count lines containing a string (the /c prefix on find).
set LINES=%TEMP%\\praxis_f.txt
> "%LINES%" echo one
>> "%LINES%" echo two
>> "%LINES%" echo two again
echo matches: 
type "%LINES%" | find /c "two"
del "%LINES%"

rem Suppress find's own banner with /i and nul input edge cases.
echo --- 
echo BETA appears below via case-insensitive echo | find /i "beta"
`),
    ex("bat-ex-018", "Findstr patterns", "findstr /i /r /c — the regex workhorse.", "IO & Redirection", "findstr",
        `@echo off
set SRC=%TEMP%\\praxis_log.txt
> "%SRC%" echo INFO boot ok
>> "%SRC%" echo WARN disk 91
>> "%SRC%" echo ERROR sync failed
>> "%SRC%" echo INFO done

rem /c:"..." = literal phrase; /i = ignore case.
type "%SRC%" | findstr /i "error warn"
echo ---

rem /r = regex; ^ anchors, [0-9] classes work.
type "%SRC%" | findstr /r "^WARN"
echo ---

rem /v = lines WITHOUT a match (inverse).
type "%SRC%" | findstr /v "INFO"
echo ---

rem /n numbers the matching lines.
type "%SRC%" | findstr /n "INFO"
del "%SRC%"
`),
    ex("bat-ex-019", "Type and more", "Reading files to the console one screen at a time.", "IO & Redirection", "type_more",
        `@echo off
set F=%TEMP%\\praxis_story.txt
> "%F%" echo chapter one
>> "%F%" echo chapter two
>> "%F%" echo chapter three

rem type dumps the whole file.
type "%F%"
echo ---

rem more paginates (single screen here, so it just prints).
type "%F%" | more
echo ---

rem Wildcard typing — every matching file in order.
type "%TEMP%\\praxis_story.txt"
del "%F%"
`),
    ex("bat-ex-020", "Files: create, copy, rename, delete", "copy /y, move, ren, del, attrib basics.", "Files", "file_ops",
        `@echo off
set D=%TEMP%\\praxis_files
mkdir "%D%" 2>nul

rem Create with redirection, then copy.
> "%D%\\a.txt" echo original
copy /y "%D%\\a.txt" "%D%\\b.txt" >nul
type "%D%\\b.txt"

rem Rename + move into a subfolder.
mkdir "%D%\\sub"
ren "%D%\\b.txt" "renamed.txt"
move "%D%\\renamed.txt" "%D%\\sub" >nul
dir /b "%D%\\sub"

rem Delete a single file and the tree.
del /q "%D%\\a.txt"
rmdir /s /q "%D%"
echo cleanup done
`),
    ex("bat-ex-021", "Directories", "mkdir, rmdir /s /q, dir switches /b /s /a:d.", "Files", "dir_ops",
        `@echo off
set R=%TEMP%\\praxis_dirs
mkdir "%R%\\one\\two" 2>nul

rem Nested creation in one call (2>nul = tolerate existing).
mkdir "%R%\\one\\two\\three" 2>nul

rem dir /b = bare names; /a:d = directories only; /s = recursive.
echo bare list:
dir /b /a:d "%R%"
echo recursive files:
dir /b /s "%R%\\*.txt" 2>nul

rem Verify the nesting landed.
if exist "%R%\\one\\two\\three" echo nested path created

rmdir /s /q "%R%"
echo tree removed
`),
    ex("bat-ex-022", "Wildcards and for-file work", "Batch-renaming every matching file with a for loop.", "Files", "wildcards",
        `@echo off
set W=%TEMP%\\praxis_wild
mkdir "%W%" 2>nul
> "%W%\\note1.txt" echo one
> "%W%\\note2.txt" echo two
> "%W%\\note3.txt" echo three

rem Rename every note*.txt to doc*.txt, all at once.
setlocal EnableDelayedExpansion
for %%f in ("%W%\\note*.txt") do (
    set BASE=%%~nf
    ren "%%f" "!BASE:note=doc!.txt"
)
endlocal

dir /b "%W%"
rmdir /s /q "%W%"
echo wildcard rename done
`),
    ex("bat-ex-023", "File existence and attributes", "if exist on files/folders, checking dirs needs a trailing \\*.", "Files", "existence",
        `@echo off
set P=%TEMP%\\praxis_exists
mkdir "%P%" 2>nul
> "%P%\\x.txt" echo content

rem Files: plain if exist.
if exist "%P%\\x.txt" echo x.txt exists
if not exist "%P%\\no.txt" echo no.txt absent

rem DIRECTORIES need the \\* trick (else empty folders read as absent).
if exist "%P%\\*" echo the folder exists
mkdir "%P%\\empty" 2>nul
if not exist "%P%\\empty\\*" echo the empty folder ALSO exists

rem Size check via a copy trick: findstr an empty file returns 1.
type nul > "%P%\\zero.txt"
copy /y "%P%\\zero.txt" "%P%\\zero2.txt" >nul
if exist "%P%\\zero2.txt" echo zero-byte copy ok

rmdir /s /q "%P%"
`),
    ex("bat-ex-024", "Date and time stamps", "%DATE% %TIME%, building a filename-safe stamp.", "Strings", "datetime",
        `@echo off
rem The raw values (format depends on the machine locale).
echo date: %DATE%
echo time: %TIME%

rem A locale-agnostic stamp from WMIC (dies on some new boxes — guarded).
for /F "tokens=*" %%t in ('wmic os get localdatetime 2^>nul ^| find "."') do set LD=%%t
if defined LD (
    echo wmic stamp: %LD:~0,4%-%LD:~4,2%-%LD:~6,2%_%LD:~8,6%
) else (
    echo wmic unavailable - using %%DATE%%
)

rem Filename-safe version of the time (colons are illegal in names).
set SAFE_TIME=%TIME::=%
echo safe time: %SAFE_TIME:~0,8%
set STAMP=backup_%DATE:/=-%_%TIME::=%
echo stamp var: %STAMP:~0,30%
`),
    ex("bat-ex-025", "String replacement and substrings", "The ~start,length and :old=new expansions.", "Strings", "string_ops",
        `@echo off
set MSG=Praxis IDE 

rem Substrings: ~offset,length.
echo first six: %MSG:~0,6%
echo last four: %MSG:~-4%
echo middle 2..9: %MSG:~2,8%

rem Replacement: :old=new.
echo lowered: %MSG:Praxis=PRAXIS%
echo spaced: %MSG: =_%

rem Chain them (rename in a variable).
set FILE=2024-06-report.txt
set STEM=%FILE:.txt=%
set RENAMED=%STEM%_final.txt
echo %FILE% becomes %RENAMED%

rem Uppercase-ish transform via substitution pairs.
set W=abc
set UP=%W:a=A%
set UP=%UP:b=B%
set UP=%UP:c=C%
echo upper: %UP%
`),
    ex("bat-ex-026", "String length", "Measuring a variable with a strlen subroutine.", "Strings", "length",
        `@echo off
set WORD=PowerShell
call :strlen WORD
echo length of "%WORD%" is %RESULT%
set LONGER=Praxis IDE multi-language
call :strlen LONGER
echo length of that is %RESULT%
goto :eof

rem Classic strlen: walk a temp copy, trimming one char per pass.
:strlen
setlocal EnableDelayedExpansion
set S=!%~1!
set /a L=0
:loop
if defined S (
    set S=!S:~1!
    set /a L+=1
    goto loop
)
endlocal & set RESULT=%L%
goto :eof
`),
    ex("bat-ex-027", "Parsing paths", "~f ~d ~p ~n ~x expansions in for loops.", "Strings", "path_parse",
        `@echo off
rem The ~ modifiers decompose a filename inside for /f or for loops.
for %%f in ("%TEMP%\\praxis_paths.txt") do (
    echo full:  %%~ff
    echo drive: %%~df
    echo path:  %%~pf
    echo name:  %%~nf
    echo ext:   %%~xf
)

rem Write a demo file first so the loop has a real target.
type nul > "%TEMP%\\praxis_paths.txt"
for %%f in ("%TEMP%\\praxis_paths.txt") do echo name+ext: %%~nxf
del "%TEMP%\\praxis_paths.txt"

rem Combine: rebuild a path from parts.
for %%f in ("C:\\work\\data.csv") do (
    echo rebuilt: %%~df%%~pf%%~nf%%~xf
)
`),
    ex("bat-ex-028", "Choice and interactive input", "set /p, choice /c with timeouts.", "Interaction", "input",
        `@echo off
rem set /p reads a typed line (canned answer for the demo).
set ANSWER=dark
echo (a set /p prompt would read: theme? [answer was: %ANSWER%])

rem choice /c defines keys, /t a default with /d after /n seconds.
choice /c YN /t 1 /d Y /n >nul 2>&1
if errorlevel 2 echo user chose N
if errorlevel 1 if not errorlevel 2 echo user chose Y
if not errorlevel 1 echo defaulted to Y

rem Errorlevel ordering: checks run HIGH first.
choice /c ABC /t 1 /d B /n >nul 2>&1
if errorlevel 3 echo chose C
if errorlevel 2 if not errorlevel 3 echo chose B
if not errorlevel 2 echo chose A
`),
    ex("bat-ex-029", "Confirmations and guards", "A reusable yes/no prompt guarding a destructive action.", "Interaction", "confirm",
        `@echo off
rem The guard: refuse to run without an explicit YES.
set CONFIRM=YES
echo This script would now clean a folder.
echo (confirm was: %CONFIRM%)

if /I not "%CONFIRM%"=="YES" (
    echo ABORTED - confirmation missing
    exit /b 1
)

echo proceeding with the (sandbox) cleanup...
set TARGET=%TEMP%\\praxis_guard
mkdir "%TARGET%" 2>nul
> "%TARGET%\\f.txt" echo junk
rmdir /s /q "%TARGET%"
echo cleaned: %TARGET%
exit /b 0
`),
    ex("bat-ex-030", "Colors and title", "color / title / prompt cosmetics.", "Interaction", "cosmetics",
        `@echo off
rem title names the console window.
title Praxis Batch Demo

rem color XY sets background + foreground (0F = black on white).
rem Kept to a safe scheme and restored at the end.
color 0A
echo green on black
color 0B
echo cyan on black

rem Restore a classic scheme.
color 07
echo back to normal

rem The %PROMPT% variable drives the prompt text.
echo current prompt: %PROMPT%
setlocal
set PROMPT=$G$d
echo (a custom prompt would look like: ^>)
endlocal
echo restored prompt
`),
    ex("bat-ex-031", "Exit codes and errorlevels", "exit /b N, errorlevel propagation, && || chaining.", "Errors", "exit_codes",
        `@echo off
rem A failing command sets errorlevel.
copy nul "Z:\\no\\such\\file" >nul 2>&1
if errorlevel 1 echo copy failed with level 1

rem exit /b N returns from a script WITHOUT killing the window.
call :fail_with 7
echo subroutine returned level %ERRORLEVEL%

rem && runs on success; || on failure.
type nul > nul && echo nul type succeeded
type "Z:\\missing" >nul 2>&1 || echo missing type failed

rem Explicit codes mean what YOU choose.
exit /b 0

:fail_with
exit /b %1
`),
    ex("bat-ex-032", "Try-catch style guards", "Structuring error paths with labels + errorlevel.", "Errors", "guards",
        `@echo off
setlocal
set STEP=1
call :step_one
if errorlevel 1 goto fail
set STEP=2
call :step_two
if errorlevel 1 goto fail
echo all steps passed
goto done

:fail
echo FAILED at step %STEP%
endlocal & exit /b 1

:done
endlocal & exit /b 0

:step_one
exit /b 0

:step_two
exit /b 0
`),
    ex("bat-ex-033", "Logging helper", "A :log subroutine stamping every line to a file.", "Errors", "logging",
        `@echo off
set LOG=%TEMP%\\praxis_batch.log
type nul > "%LOG%"

call :log "starting the batch"
call :log "step one done"
call :log "step two done"
call :log "finished"

echo --- log contents ---
type "%LOG%"
echo --- %ERRORLEVEL% was never set by :log ---
del "%LOG%"
goto :eof

:log
echo [%TIME:~0,8%] %~1
>> "%LOG%" echo [%TIME:~0,8%] %~1
goto :eof
`),
    ex("bat-ex-034", "Verifying environment", "Checking a tool exists before using it (the graceful check).", "Errors", "env_check",
        `@echo off
rem The where command probes PATH availability.
where findstr >nul 2>&1
if errorlevel 1 (
    echo findstr MISSING - cannot continue
    exit /b 1
)
echo findstr present

rem Same pattern for a domain tool (missing here, by design).
where praxis_nonexistent >nul 2>&1
if errorlevel 1 (
    echo praxis_nonexistent not installed - skipping that section
) else (
    echo praxis_nonexistent found
)

rem Version check with output capture.
for /f "tokens=*" %%v in ('ver 2^>nul') do set OSVER=%%v
echo os: %OSVER%
`),
    ex("bat-ex-035", "Environment variables deep dive", "set x / user vs system scope / setlocal isolation.", "Environment", "env_vars",
        `@echo off
rem setlocal walls changes off from the parent shell.
setlocal
set INNER=visible
echo inner (inside): %INNER%

rem End the scope — INNER disappears again.
endlocal
echo inner (after endlocal): %INNER%

rem Session-only variable vs a persistent user one.
rem (The persistent form is commented: it survives the script.)
set SESSION_ONLY=temporary
rem setx PERSISTENT "permanent"

echo session var: %SESSION_ONLY%
echo path entries:
echo %PATH:;= & echo   %
`),
    ex("bat-ex-036", "PATH inspection", "Splitting, grepping and counting PATH entries.", "Environment", "path_tour",
        `@echo off
rem Count entries: substitute ; with a rare marker and parse.
set P=%PATH%;
set /a COUNT=0
:count_loop
if not "%P%"=="" (
    set P=%P:~1%
    set /a COUNT+=1
    if "%P%"==";" set P=
    goto count_loop
)
echo PATH has about %COUNT% entries

rem findstr every entry containing a keyword.
echo entries with 'bin':
echo %PATH:;=^

% | findstr /i "bin"
`),
    ex("bat-ex-037", "Special variables", "%%CD%%, %%RANDOM%%, %%ERRORLEVEL%%, %%CMDEXTVERSION%%.", "Environment", "special_vars",
        `@echo off
echo current dir: %CD%
echo random value: %RANDOM%
echo cmd extensions: %CMDEXTVERSION%
echo errorlevel now: %ERRORLEVEL%

rem %RANDOM% in a range: modulo via set /a.
set /a DICE=%RANDOM% %% 6 + 1
echo dice roll (1-6): %DICE%

rem %CMDCMDLINE% holds how this interpreter was started.
echo cmdline head: %CMDCMDLINE:~0,40%

rem %HIGHESTERRORLEVEL% style dynamic ones reset per command.
type nul > nul
echo after type: %ERRORLEVEL%
`),
    ex("bat-ex-038", "Starting programs", "start (new window), start /wait (block until exit).", "Processes", "start_cmd",
        `@echo off
rem start "" "program" — the FIRST quoted arg is the window TITLE.
rem A title is REQUIRED whenever the path is quoted.

rem /min /max set the window state; /b shares this console.
rem Safe demo: start a cmd that instantly exits, and WAIT for it.
start /wait "" cmd /c "exit /b 3"
echo waited child exited with level %ERRORLEVEL%

rem Without /wait the script races on (the classic footgun).
start "" cmd /c "exit /b 0"
echo launched without waiting - errorlevel still: %ERRORLEVEL%
`),
    ex("bat-ex-039", "Tasklist and taskkill", "Inspecting processes, safe dry-run kills.", "Processes", "task_cmds",
        `@echo off
rem tasklist reports running processes (count a benign one).
tasklist /fi "IMAGENAME eq cmd.exe" 2>nul | find "cmd.exe" >nul
if not errorlevel 1 echo cmd.exe is running

rem A summary line for THIS console's interpreter.
tasklist /fi "IMAGENAME eq cmd.exe" 2>nul | find /c "cmd.exe"

rem taskkill /im NAME /f force-kills; /pid targets one.
rem Dry-run against something that cannot exist:
taskkill /im praxis_nonexistent.exe /f >nul 2>&1
if errorlevel 1 echo (refused to kill a nonexistent process - correct)

rem The safe order of checks: filter first, ask questions later.
tasklist /fi "STATUS eq NOT RESPONDING" 2>nul | findstr /v "^$|^Image|^====" || echo no hung processes listed
`),
    ex("bat-ex-040", "Waiting and sleeping", "timeout /t, the ping trick, wait loops.", "Processes", "sleeping",
        `@echo off
rem timeout waits N seconds, skippable with a keypress.
timeout /t 1 /nobreak >nul
echo one second elapsed

rem The classic ping sleep (sub-second resolution; 2 pings ~= 1s).
ping -n 2 127.0.0.1 >nul
echo ~one more second

rem A countdown echo pattern.
for /L %%i in (3,-1,1) do (
    <nul set /p =%%i... 
)
echo go!
`),
    ex("bat-ex-041", "Registry reads", "reg query in a for /f parse (read-only).", "System", "registry_read",
        `@echo off
rem READ-ONLY: reg query with for /f parsing.
rem The current-version key always exists on Windows.
set KEY=HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion
reg query "%KEY%" /v ProductName >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=2*" %%a in ('reg query "%KEY%" /v ProductName 2^>nul') do set OSNAME=%%b
    echo product: %OSNAME%
) else (
    echo registry read unavailable
)

rem Probe the OS type from a stable value.
if exist "%SystemRoot%\\explorer.exe" echo explorer present (desktop OS)
echo system root: %SystemRoot%
`),
    ex("bat-ex-042", "System info snapshots", "ver, systeminfo trimmed, drive free space.", "System", "sysinfo",
        `@echo off
rem ver prints the short OS version banner.
ver

rem systeminfo is huge — pull only the header lines.
echo --- selected system facts ---
systeminfo 2>nul | findstr /i "OS.Name: Total.Physical" 

rem Free space per fixed drive (fsutil-free alternative: dir's last line).
for %%d in (C:) do (
    echo drive %%d:
    dir %%d\\ 2>nul | findstr /c:"bytes free"
)
`),
    ex("bat-ex-043", "Network quick checks", "hostname, ipconfig filter, ping summary.", "System", "network",
        `@echo off
echo host: %COMPUTERNAME%

rem ipconfig filtered to adapters with IPv4 lines.
ipconfig 2>nul | findstr /i "IPv4" || echo no IPv4 reported

rem One fast ping to loopback to prove the stack is up.
ping -n 1 -w 500 127.0.0.1 >nul 2>&1
if not errorlevel 1 echo loopback reachable
if errorlevel 1 echo loopback FAILED

rem Resolve a name to its address line when DNS answers.
nslookup localhost 2>nul | findstr /i "Address" || echo nslookup trimmed
`),
    ex("bat-ex-044", "Scheduling and autorun awareness", "schtasks listing, a guarded dry-run example.", "System", "scheduled",
        `@echo off
rem schtasks lists the machine's scheduled jobs (first lines only).
echo --- scheduled tasks (sample) ---
schtasks /query /fo list 2>nul | findstr /i "TaskName" | findstr /n "." | findstr /r "^\\[1-5\\]:" || echo none listed

rem Creating one would be: schtasks /create /tn NAME /tr COMMAND /sc daily
rem (Intentionally NOT run here; deletion:)
echo (creation and deletion left as the documented commands)
schtasks /delete /tn praxis_nonexistent /f >nul 2>&1
if errorlevel 1 echo deleting a nonexistent task correctly failed
`),
    ex("bat-ex-045", "Robocopy mirror dry run", "The serious copy tool with /L (list-only) mode.", "Projects", "robocopy",
        `@echo off
set SRC=%TEMP%\\praxis_robo_src
set DST=%TEMP%\\praxis_robo_dst
mkdir "%SRC%" 2>nul
> "%SRC%\\one.txt" echo one
> "%SRC%\\two.txt" echo two

rem /L = LIST ONLY: robocopy tells you what it WOULD copy.
robocopy "%SRC%" "%DST%" /L /njh /njs /ndl /nfl /ns /nc 2>nul | findstr /i ".txt" || echo nothing listed

rem Real copy + verification (robocopy exit codes: 0-7 are fine).
robocopy "%SRC%" "%DST%" /njh /njs /ndl >nul
if %ERRORLEVEL% LEQ 7 (
    echo copied; destination files:
    dir /b "%DST%"
) else (
    echo robocopy failed with level %ERRORLEVEL%
)

rmdir /s /q "%SRC%" & rmdir /s /q "%DST%"
`),
    ex("bat-ex-046", "Backup rotation script", "A timestamped copy with oldest-pruning — the classic admin loop.", "Projects", "backup_rotate",
        `@echo off
setlocal
set ROOT=%TEMP%\\praxis_backups
mkdir "%ROOT%" 2>nul

rem Two fake historical backups + today's.
> "%ROOT%\\2024-06-13.txt" echo old
> "%ROOT%\\2024-06-14.txt" echo newer
type nul > "%ROOT%\\%RANDOM%.tmp"

rem Prune: keep only the TWO newest files.
set /a KEEP=0
for /f "delims=" %%f in ('dir /b /o-d "%ROOT%"') do (
    set /a KEEP+=1
    set F=%%f
    setlocal EnableDelayedExpansion
    if !KEEP! GTR 2 echo pruning: !F!
    endlocal
)

echo remaining files:
dir /b "%ROOT%"
rmdir /s /q "%ROOT%"
endlocal
`),
    ex("bat-ex-047", "Multi-step pipeline tool", "Args + subroutines + log + errorlevels in one small tool.", "Projects", "pipeline_tool",
        `@echo off
rem build_tool.bat — arg (or default), validate, stage, verify.
setlocal
set TARGET=%TEMP%\\praxis_build
set /a STEPS=0

call :stage prepare
call :stage compile
call :stage test
echo build ok: %STEPS% steps
endlocal & exit /b 0

:stage
set /a STEPS+=1
echo [step %STEPS%] %~1
if "%~1"=="test" echo     (tests: 3 passed)
goto :eof
`),
    ex("bat-ex-048", "Self-locating script", "%~dp0 — scripts that find their own folder.", "Projects", "self_locate",
        `@echo off
rem %~dp0 = THIS script's drive+path (with trailing backslash).
echo script dir: %~dp0
echo script name: %~n0
echo script full: %~f0

rem The idiom: read a sibling config relative to the script.
rem (demo: the script's own file acts as the "config").
if exist "%~dp0%~n0.bat" (
    echo sibling check: this script really is where it thinks
)

rem Write next to itself rather than the CALLER's cwd.
type nul > "%TEMP%\\praxis_selfloc_marker.txt"
echo wrote marker to TEMP (safe stand-in for the script folder)
del "%TEMP%\\praxis_selfloc_marker.txt"
`),
    ex("bat-ex-049", "Chained scripts and libraries", "call other .bat files as modules; exit /b vs exit.", "Projects", "call_chains",
        `@echo off
rem A library script (written + called + cleaned up this run).
set LIB=%TEMP%\\praxis_mathlib.bat
> "%LIB%" echo :double
>> "%LIB%" echo exit /b %%1*2

rem The parameterized library pattern.
> "%LIB%" (
    echo :double
    echo set /a RESULT=%%1*2
    echo exit /b 0
)

call "%LIB%"
call :use_lib

del "%LIB%"
echo library removed
goto :eof

:use_lib
echo (a real call to :double would print the doubled value)
goto :eof
`),
    ex("bat-ex-050", "A complete mini project", "file inventory: args, checks, loops, report, exit codes.", "Projects", "file_inventory",
        `@echo off
rem inventory.bat [folder] - report file types under a folder.
setlocal EnableDelayedExtensions 2>nul
setlocal
set ROOT=%~1
if "%ROOT%"=="" set ROOT=%TEMP%

if not exist "%ROOT%\\*" (
    echo usage: inventory.bat [folder]
    exit /b 1
)

echo inventory of: %ROOT%
set /a TOTAL=0
for /r "%ROOT%" %%f in (*.*) do set /a TOTAL+=1 2>nul
echo files walked (recursive): %TOTAL%

echo by extension (top level):
for %%e in (.txt .log .tmp .dat) do (
    set /a N=0
    for /r "%ROOT%" %%f in (*%%e) do set /a N+=1 2>nul
    call :report %%e !N!
)
endlocal & exit /b 0

:report
if %2 GTR 0 echo   %1: %2 files
goto :eof
`),
];
