% tags: matlab, long-run
% Mandelbrot.m — a MATLAB script the IDE runs through `matlab -batch`
% (or GNU Octave when that is what is installed). Neither installed?
% Run still works — it tells you exactly what to install.
%
% ASCII-renders a slice of the Mandelbrot set at the terminal; on a
% MATLAB-free machine the run ends with the install hint instead.
%
% Try the Auto-format MATLAB entry too — the else/case alignment and
% the `...` continuations are exactly what it normalizes.

MAX_ITER = 48;
WIDTH = 96;
HEIGHT = 28;
XMIN = -2.1;
XMAX = 0.7;
YMIN = -1.2;
YMAX = 1.2;

chars = ' .:-=+*#%@';

for py = 1:HEIGHT
    for px = 1:WIDTH
        cx = XMIN + (XMAX - XMIN) * (px - 1) / (WIDTH - 1);
        cy = YMIN + (YMAX - YMIN) * (py - 1) / (HEIGHT - 1);
        zx = 0;
        zy = 0;
        iter = 0;
        while (zx * zx + zy * zy) < 4 && iter < MAX_ITER
            xtemp = zx * zx - ...
                    zy * zy + cx;
            zy = 2 * zx * zy + cy;
            zx = xtemp;
            iter = iter + 1;
        end
        idx = 1 + floor(iter / MAX_ITER * (length(chars) - 1));
        fprintf('%s', chars(idx));
    end
    fprintf('\n');
end
fprintf('done: %d x %d grid, %d iterations\n', WIDTH, HEIGHT, MAX_ITER);
