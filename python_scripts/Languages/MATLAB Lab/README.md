# MATLAB Lab

Dedicated `.m` examples — runnable AND formattable.

## Running them

The IDE's runtime registry probes the machine for **MATLAB**
(`matlab -batch`) and **GNU Octave** (`octave --no-gui`) before every
run. Whichever is found wins; when **neither is installed** the Run
button still works — it tells you exactly what to install:

> MATLAB was not detected on this machine. Install MATLAB (or GNU
> Octave, free) and reload to run `.m` files.

The detected runtimes (with versions) are listed in **Settings → Python → Other language runtimes**, refreshable.

## The files

| File             | What it does                                                                  |
|------------------|-------------------------------------------------------------------------------|
| `Mandelbrot.m`   | ASCII-renders a Mandelbrot slice — nested `for`/`while`, `...` continuations. |
| `SignalFilter.m` | Noisy sine + moving-average filter, SNR before/after, ASCII sparkline.        |
| `MatrixOps.m`    | Matrix product, eigenvalues, determinant, linear solve (`\`).                 |
| `ODESolver.m`    | Semi-implicit Euler integration of a damped spring — a stepped table.         |
| `PiMonteCarlo.m` | 200k-sample Monte Carlo pi with progress lines.                               |

## Formatting

Right-click ▸ **Auto-format MATLAB** (view or edit mode) re-indents
`function`/`if`/`for`/`switch`/`try` blocks and the `end` closers;
strings and the `'` transpose stay untouched. Per-language indent
width lives in **Settings → Formatting → MATLAB**.
