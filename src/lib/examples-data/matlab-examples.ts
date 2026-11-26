/**
 * 50 MATLAB reference templates.
 *
 * The user's ask: "For the examples, add Examples related to MATLAB
 * also". Bodies are idiomatic base-MATLAB (also runnable under GNU
 * Octave — no toolbox functions; statistics / DSP classics are spelled
 * out by hand), created as .m files and runnable through
 * `matlab -batch` / Octave the moment either is installed.
 *
 * MATLAB identifiers keep their native camelCase (no naming tokens):
 * restyling MATLAB ids through the Python naming styles would fight
 * the language's own conventions.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "MATLAB";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("matlab", id, label, description, CAT, sub, baseName, ".m", () => body);

export const MATLAB_EXAMPLES: FileExample[] = [
    ex("matlab-ex-001", "Hello, MATLAB", "disp, fprintf and the format bank/compact styles — the three ways output reaches the console.", "Basics", "hello_matlab",
        `% Hello, MATLAB — three ways to talk to the console.
format compact                      % keep the output lean

disp("Hello from MATLAB!")          % disp: no formatting, adds newline
fprintf("Pi is roughly %.6f\\n", pi) % fprintf: C-style format strings

% format styles change how numbers DISPLAY (not their stored value)
a = 1000 / 7;
format short   -> % (display only)
format long
disp(a)
format short
disp(a)
`),

    ex("matlab-ex-002", "Vectors and ranges", "The colon operator, linspace, and vectorized arithmetic — MATLAB's bread and butter.", "Basics", "vectors_ranges",
        `% Vectors: the colon operator, linspace, vectorized math.
format compact

t = 0:0.25:1                        % 0 .. 1 in steps of 0.25
s = linspace(0, 1, 5)               % 5 evenly spaced points

v = [2 4 6 8]
w = v + 10                          % element-wise add (sizes match)
u = v .* 2                          % element-wise multiply
dot_vw = dot(v, w)                  % inner product
norm_v = norm(v)                    % Euclidean length

% Vectorized function application — NO loop needed:
x = linspace(0, pi, 9);
y = sin(x);
fprintf("sin over 0..pi: %s\\n", mat2str(round(y, 3)))
`),

    ex("matlab-ex-003", "Matrices", "Creating, transposing, reshaping and slicing matrices — size, numel and the trailing-comma tricks.", "Basics", "matrix_basics",
        `% Matrices: creation, shape, reshape.
format compact

A = [1 2 3; 4 5 6; 7 8 9]           % 3x3, rows separated by ';'
B = zeros(2, 4)                     % 2x4 of zeros
C = ones(3)                         % 3x3 of ones
I = eye(3)                          % identity

fprintf("size(A) = %s, numel(A) = %d\\n", mat2str(size(A)), numel(A))

At = A'                             % transpose (conjugate for complex)
R = reshape(1:12, 3, 4)             % column-major reshape -> 3x4
Diag = diag(A)                      % main diagonal as a vector

% Concatenation: horizontal | vertical
M = [A, I]                          % side by side (3x6)
N = [A; I]                          % stacked (6x3)
fprintf("M is %s, N is %s\\n", mat2str(size(M)), mat2str(size(N)))
`),

    ex("matlab-ex-004", "Indexing", "Subscripts, linear indices, logical masks and `end` — every way to pull values out of a matrix.", "Basics", "indexing",
        `% Indexing: subscripts, linear indices, logical masks.
format compact

A = magic(4)                        % 4x4 magic square
A(2, 3)                             % row 2, column 3
A(1, :)                             % first row (all columns)
A(:, end)                           % last column
A(1:2, 2:4)                         % block sub-matrix
A(5)                                % LINEAR index (column-major!)

% Logical mask: pick every element > 20
mask = A > 20
vals = A(A > 20)
count = nnz(A > 20)                 % number of nonzeros of the mask

% find() -> indices instead of values
[rows, cols] = find(A > 20)
fprintf("%d entries above 20, at rows %s\\n", count, mat2str(rows'))
`),

    ex("matlab-ex-005", "Element-wise vs matrix operations", "The single most important dot in MATLAB: .* ./ .^ versus * / ^.", "Basics", "elementwise_ops",
        `% The dot: element-wise vs matrix operations.
format compact

a = [1 2 3];
b = [4 5 6];

a .* b                              % [4 10 18]  element-wise
a * b'                              % 32         inner product (1x3 * 3x1)
a ./ b                              % element-wise divide
a .^ 2                              % [1 4 9]    element-wise power

% Matrix product — dimensions must line up:
A = [1 2; 3 4];
B = [5 6; 7 8];
A * B                               % true matrix product
A .^ 2                              % squares ELEMENTS, not A*A
A ^ 2                               % same as A*A (matrix power)

% log/exp/sqrt are element-wise by default:
exp([0 1 2])                        % [1 e e^2]
`),

    ex("matlab-ex-006", "Strings and sprintf", "String arrays, char rows, strcat and sprintf — formatting text the MATLAB way.", "Basics", "strings_sprintf",
        `% Strings: char arrays, string scalars, sprintf.
format compact

name = "world";                     % double quotes -> string scalar
greeting = "Hello, " + name + "!"   % + concatenates strings
old = 'single quotes';              % char row vector

row = strcat("app", "les")          % strcat removes trailing spaces
fruits = ["apple"; "pear"; "plum"]  % 3x1 string array
upperF = upper(fruits)

% sprintf -> formatted char/string; fprintf prints directly
msg = sprintf("%d fruits, first is %s", numel(fruits), fruits(1))
fprintf("pi = %.3f, e = %.3f\\n", pi, exp(1))

% String comparisons / tests
strcmp("apple", "pear")             % logical 0
contains(greeting, "Hello")         % logical 1
`),

    ex("matlab-ex-007", "Cell arrays", "Curly braces for contents, round braces for cells — the container that holds anything.", "Basics", "cell_arrays",
        `% Cell arrays: mixed-type containers.
format compact

c = {42, "forty-two", [1 2 3], {1, 2}}

c{1}                                % CONTENTS of cell 1 -> 42
c(1)                                % the CELL itself -> {42}
c{3}(2)                             % chain: content then index -> 2

% Build a table-of-records pattern with cells:
names = {"Ada"; "Alan"; "Grace"};
years = {1815; 1912; 1906};
for i = 1:numel(names)
  fprintf("%-8s born %d\\n", names{i}, years{i})
end

% cellfun maps a function over contents:
lengths = cellfun(@numel, names)    % [3 4 5]
`),

    ex("matlab-ex-008", "Structures and tables", "struct arrays, dynamic field names, and the table type for labeled columns of data.", "Basics", "structs_tables",
        `% Structures (and a peek at table).
format compact

p.name = "E-Niang";
p.role = "engineer";
p.hours = [8 7.5 9 8];
disp(p)

% struct arrays: one struct per index
team = struct("name", {"Ada", "Alan"}, "score", {91, 84});
team(1).name
[team.score]                        % comma-list the field -> vector

% Dynamic field names:
field = "score";
team(1).(field)

% table: labeled columns (base MATLAB, prints itself nicely)
t = table({"Ada"; "Alan"; "Grace"}, [91; 84; 96], ...
   'VariableNames', {'name', 'score'})
disp(t)
fprintf("mean score: %.1f\\n", mean(t.score))
`),

    ex("matlab-ex-009", "Logical operations", "Comparisons, any/all/find and the logical short-cuts that replace loops.", "Basics", "logical_ops",
        `% Logical operations on arrays.
format compact

v = [3 -1 0 5 -2 4];
positive = v > 0                    % logical mask
allPositive = all(v > 0)            % false
anyZero = any(v == 0)               % true
idx = find(v < 0)                   % indices of negatives: [2 5]

% Combine masks with & and | (element-wise; && is scalar-only):
between = (v > 0) & (v < 5)
count = nnz(between)

% Replace by mask — no loop:
w = v;
w(v < 0) = 0                        % clip negatives to zero
isodd = logical(mod(1:2:10, 2))     % logical() makes masks explicit
`),

    ex("matlab-ex-010", "Control flow", "if / elseif / switch / for / while / break / continue with vector-friendly idioms.", "Basics", "control_flow",
        `% Control flow: if, switch, for, while, break, continue.
format compact

grade = 87;
if grade >= 90
  letter = 'A';
elseif grade >= 80
  letter = 'B';
else
  letter = 'C';
end
fprintf("grade %d -> %s\\n", grade, letter)

day = "sat";
switch day
  case {"sat", "sun"}, kind = "weekend";
  otherwise,        kind = "weekday";
end
fprintf("%s is a %s\\n", day, kind)

% for over a range; while with a tolerance:
total = 0;
for k = 1:10
  if mod(k, 2) == 0, continue; end  % skip evens
  total = total + k;
end

x = 1;                              % Newton iteration toward sqrt(2)
while abs(x*x - 2) > 1e-12
  x = x - (x*x - 2) / (2*x);
end
fprintf("sum of odds 1..9 = %d, sqrt(2) = %.12f\\n", total, x)
`),

    ex("matlab-ex-011", "Descriptive statistics", "mean, median, std, var, min, max, mode — with the 'all' and dimension arguments.", "Statistics", "descriptive_stats",
        `% Descriptive statistics, by hand and built-in.
format compact

data = [12 15 11 19 24 15 13 15 17 99];   % one outlier sneaks in

fprintf("n        = %d\\n", numel(data))
fprintf("mean     = %.2f   (dragged by the outlier)\\n", mean(data))
fprintf("median   = %.2f   (robust)\\n", median(data))
fprintf("std      = %.2f\\n", std(data))
fprintf("var      = %.2f\\n", var(data))
fprintf("min/max  = %d / %d\\n", min(data), max(data))
fprintf("range    = %d\\n", range = max(data) - min(data))

% Column-wise stats over a matrix (dimension 1 = down the rows):
M = [1 2 3; 4 5 6; 7 8 9];
mean(M, 1)                          % per-column mean
mean(M, 2)                          % per-row mean

% The interquartile range via sort (no toolbox needed):
s = sort(data);
q1 = s(floor(0.25 * numel(s)) + 1);
q3 = s(floor(0.75 * numel(s)) + 1);
fprintf("IQR      = %.2f\\n", q3 - q1)
`),

    ex("matlab-ex-012", "Random numbers and seeds", "rng + rand / randn / randi: reproducible samples from uniform, normal and integer distributions.", "Statistics", "random_numbers",
        `% Random numbers: reproducible sampling with rng.
format compact

rng(42)                             % seed -> the SAME numbers every run
u = rand(1, 5)                      % uniform [0, 1)
n = randn(1, 5)                     % standard normal (mean 0, std 1)
i = randi([1, 6], 1, 10)            % 10 dice rolls

% scaled / shifted: uniform on [5, 15]
x = 5 + 10 * rand(1, 1000);
fprintf("uniform 5..15: mean %.2f, min %.2f, max %.2f\\n", ...
        mean(x), min(x), max(x))

% normal with mean 70, std 8:
y = 70 + 8 * randn(1, 10000);
fprintf("normal(70,8):  mean %.2f, std  %.2f\\n", mean(y), std(y))

% Sample WITHOUT replacement (shuffle):
deck = 1:52;
shuffled = deck(randperm(numel(deck)));
fprintf("first 5 cards: %s\\n", mat2str(shuffled(1:5)))
`),

    ex("matlab-ex-013", "Histograms", "histogram with custom bins and normalizations — density versus count.", "Statistics", "histograms",
        `% Histograms: counts, probabilities, density.
format compact

rng(7)
x = 50 + 12 * randn(1, 2000);       % ~2000 normal samples

% counts in fixed bins:
edges = 0:5:110;
counts = histcounts(x, edges);
for b = 1:numel(counts)
  if counts(b) > 0
    fprintf("%3d..%3d | %s (%d)\\n", edges(b), edges(b+1), ...
            repmat('#', 1, round(counts(b)/8)), counts(b))
  end
end

fprintf("total binned: %d of %d\\n", sum(counts), numel(x))

% A figure version (headless-safe: saved to a PNG next to nothing):
figure('Visible', 'off')
histogram(x, 40, 'Normalization', 'pdf')
xlabel('value'); ylabel('density')
title('Normal(50, 12) sample')
saveas(gcf, 'histogram_demo.png')
fprintf("figure saved to histogram_demo.png\\n")
`),

    ex("matlab-ex-014", "Correlation", "Pearson correlation by hand and with corrcoef — the strength of a linear relationship.", "Statistics", "correlation",
        `% Pearson correlation: built-in and by hand.
format compact

hours     = [2 4 5 7 9 10 11.5];
scores    = [55 61 64 70 76 79 84];

R = corrcoef(hours, scores);
r_builtin = R(1, 2);

% By hand: r = cov(x,y) / (std(x) * std(y))
cx = hours - mean(hours);
cy = scores - mean(scores);
r_manual = sum(cx .* cy) / sqrt(sum(cx.^2) * sum(cy.^2));

fprintf("corrcoef : %.4f\\n", r_builtin)
fprintf("by hand  : %.4f\\n", r_manual)
fprintf("r^2      : %.4f  (variance of y explained by x)\\n", r_manual^2)

% Rank (Spearman) correlation — rank the values first:
rh = corrcoef(tiedrank(hours), tiedrank(scores));
fprintf("spearman : %.4f\\n", rh(1, 2))
`),

    ex("matlab-ex-015", "Polynomial fitting", "polyfit / polyval: fit a line and a parabola, then read the residuals.", "Statistics", "polyfit_curve",
        `% Least-squares polynomial fitting.
format compact

t  = [0 1 2 3 4 5 6 7 8];
y  = [2.1 4.4 8.9 15.8 25.1 36.7 50.9 67.8 87.3];
                                  % clearly ~ t^2

p1 = polyfit(t, y, 1);            % straight line
p2 = polyfit(t, y, 2);            % parabola

res1 = y - polyval(p1, t);
res2 = y - polyval(p2, t);

fprintf("linear   fit: y = %.3f t + %.3f\\n", p1(1), p1(2))
fprintf("quadratic fit: y = %.3f t^2 + %.3f t + %.3f\\n", p2(1), p2(2), p2(3))
fprintf("SSE linear   = %.3f\\n", sum(res1.^2))
fprintf("SSE quadratic= %.3f  (much smaller -> t^2 wins)\\n", sum(res2.^2))

% interpolate / extrapolate with the fitted model:
fprintf("fit at t=4.5 -> %.2f, at t=10 -> %.2f\\n", ...
        polyval(p2, 4.5), polyval(p2, 10))
`),

    ex("matlab-ex-016", "Normal CDF and z-scores", "erf-based CDF, z-scores and the 68-95-99.7 rule, computed without any toolbox.", "Statistics", "normal_cdf",
        `% The normal distribution from first principles (erf is base MATLAB).
format compact

mu = 100; sigma = 15;

phi  = @(z) exp(-z.^2 / 2) / sqrt(2*pi);       % density
Phi  = @(z) (1 + erf(z / sqrt(2))) / 2;        % CDF

z = (115 - mu) / sigma;                        % standardize -> z-score
fprintf("z(115)     = %.3f\\n", z)
fprintf("P(X <= 115) = %.4f\\n", Phi(z))
fprintf("P(X >  115) = %.4f\\n", 1 - Phi(z))

% The 68-95-99.7 rule:
for k = [1 2 3]
  fprintf("within +-%d sigma: %.2f%%\\n", k, 100 * (Phi(k) - Phi(-k)))
end

% Percentile from a probability (invert the CDF by bisection):
target = 0.95; lo = 0; hi = 6;
for it = 1:60
  mid = (lo + hi) / 2;
  if Phi(mid) < target, lo = mid; else, hi = mid; end
end
fprintf("95th percentile of N(100,15) = %.1f\\n", mu + sigma * (lo + hi) / 2)
`),

    ex("matlab-ex-017", "Two-sample t-test", "Welch's t-test from scratch: means, standard errors and the Satterthwaite degrees of freedom.", "Statistics", "ttest_manual",
        `% Welch's two-sample t-test, computed by hand.
format compact

rng(11)
a = 102 + 12 * randn(1, 30);        % method A results
b = 97  + 12 * randn(1, 35);        % method B results

ma = mean(a); mb = mean(b);
va = var(a);  vb = var(b);
na = numel(a); nb = numel(b);

se = sqrt(va/na + vb/nb);           % standard error of the difference
t  = (ma - mb) / se;

% Satterthwaite degrees of freedom:
df = (va/na + vb/nb)^2 / ((va/na)^2/(na-1) + (vb/nb)^2/(nb-1));

% two-sided p-value from the t distribution via betainc (base MATLAB):
p = betainc(df / (df + t^2), df/2, 0.5);   % = 2 * (1 - tcdf(|t|))

fprintf("mean A = %.2f, mean B = %.2f, diff = %+.2f\\n", ma, mb, ma - mb)
fprintf("t = %.3f on %.1f df, two-sided p = %.4f\\n", t, df, p)
if p < 0.05
  fprintf("-> significant at the 5%% level (reject equal means)\\n")
else
  fprintf("-> NOT significant at the 5%% level\\n")
end
`),

    ex("matlab-ex-018", "One-way ANOVA", "Sum-of-squares decomposition, the F statistic and its p-value — a one-way ANOVA by hand.", "Statistics", "anova_manual",
        `% One-way ANOVA, spelled out.
format compact

rng(5)
g1 = 50 + 6 * randn(1, 12);         % three groups, same spread
g2 = 53 + 6 * randn(1, 12);
g3 = 49 + 6 * randn(1, 12);
groups = {g1, g2, g3};
k = numel(groups);                  % number of groups

allv = [groups{:}];
N = numel(allv);
grand = mean(allv);

ssBetween = 0; ssWithin = 0;
for i = 1:k
  gi = groups{i};
  ssBetween = ssBetween + numel(gi) * (mean(gi) - grand)^2;
  ssWithin  = ssWithin  + sum((gi - mean(gi)).^2);
end
ssTotal = sum((allv - grand).^2);

dfB = k - 1;   dfW = N - k;
msB = ssBetween / dfB;   msW = ssWithin / dfW;
F = msB / msW;

% p-value: 1 - Fcdf(F, dfB, dfW) with the incomplete beta function:
p = betainc(dfW / (dfW + dfB * F), dfW/2, dfB/2);

fprintf("group means: %s\\n", mat2str(round([mean(g1) mean(g2) mean(g3)], 2)))
fprintf("SS_between=%.1f SS_within=%.1f SS_total=%.1f\\n", ssBetween, ssWithin, ssTotal)
fprintf("F(%d,%d) = %.3f, p = %.4f\\n", dfB, dfW, F, p)
if p < 0.05, fprintf("-> group means differ\\n"); else, fprintf("-> no evidence of a difference\\n"); end
`),

    ex("matlab-ex-019", "Bootstrap resampling", "The bootstrap: resample with replacement and read a confidence interval off the percentile distribution.", "Statistics", "bootstrap",
        `% Bootstrap confidence interval for the mean.
format compact

rng(21)
x = [12 15 11 19 24 15 13 15 17 22 14 16];
n = numel(x);

B = 10000;                          % resamples
bootMeans = zeros(1, B);
for b = 1:B
  idx = randi(n, 1, n);             % sample WITH replacement
  bootMeans(b) = mean(x(idx));
end

lo = prctileManual = sort(bootMeans);
qlo = lo(floor(0.025 * B) + 1);
qhi = lo(floor(0.975 * B));

fprintf("sample mean = %.2f\\n", mean(x))
fprintf("95%% bootstrap CI = [%.2f, %.2f]\\n", qlo, qhi)
fprintf("boot SE = %.2f  (std of the resampled means)\\n", std(bootMeans))

% The bootstrap also works for ANY statistic — the median:
bootMed = zeros(1, B);
for b = 1:B
  bootMed(b) = median(x(randi(n, 1, n)));
end
srt = sort(bootMed);
fprintf("median = %.2f, 95%% CI = [%.2f, %.2f]\\n", ...
        median(x), srt(floor(0.025*B)+1), srt(floor(0.975*B)))
`),

    ex("matlab-ex-020", "Standardization and outliers", "z-scores, robust centers and the 1.5*IQR outlier fence.", "Statistics", "standardize_outliers",
        `% Standardization + the classic outlier fences.
format compact

x = [12 15 11 19 24 15 13 15 17 99];

% z-scores (toolbox-free):
z = (x - mean(x)) / std(x)

% robust z-scores (median / MAD — immune to the outlier itself):
med = median(x);
mad = median(abs(x - med));
rz = 0.6745 * (x - med) / mad

% Tukey fences: anything outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR]
s = sort(x);
q1 = s(floor(0.25 * numel(s)) + 1);
q3 = s(floor(0.75 * numel(s)) + 1);
fenceLo = q1 - 1.5 * (q3 - q1);
fenceHi = q3 + 1.5 * (q3 - q1);
outliers = x(x < fenceLo | x > fenceHi)

fprintf("fences: [%.1f, %.1f] -> outliers: %s\\n", ...
        fenceLo, fenceHi, mat2str(outliers))
`),

    ex("matlab-ex-021", "Line plots", "plot with styles, markers, labels, legend, grid and axis control.", "Plotting", "line_plots",
        `% Line plots — the daily driver.
format compact
figure('Visible', 'off')

x = linspace(0, 2*pi, 200);
plot(x, sin(x), 'b-',  'LineWidth', 1.6); hold on
plot(x, cos(x), 'r--', 'LineWidth', 1.6)
plot(x(1:20:end), sin(x(1:20:end)), 'ko', 'MarkerFaceColor', 'k')
hold off

xlabel('x'); ylabel('amplitude')
title('sin and cos on [0, 2\\pi]')
legend('sin(x)', 'cos(x)', 'samples', 'Location', 'best')
grid on
axis([0 2*pi -1.2 1.2])

saveas(gcf, 'line_plots.png')
fprintf("saved line_plots.png\\n")
`),

    ex("matlab-ex-022", "Subplots and hold", "A 2x2 subplot grid plus the hold pattern for layering series.", "Plotting", "subplots",
        `% Subplots: one figure, four axes.
format compact
figure('Visible', 'off')

t = linspace(0, 2, 300);

subplot(2, 2, 1)                    % top-left
plot(t, t.^2);      title('square')

subplot(2, 2, 2)                    % top-right
plot(t, sqrt(t));   title('sqrt'); grid on

subplot(2, 2, 3)                    % bottom-left
plot(t, exp(t/2));  title('exp'); ylim([0 5])

subplot(2, 2, 4)                    % bottom-right: layered with hold
plot(t, sin(2*pi*t), 'LineWidth', 1.5); hold on
plot(t, 0.5*sin(4*pi*t), '--')
hold off; title('two tones'); legend('f', '2f')

sgtitle('Four small functions')
saveas(gcf, 'subplots_demo.png')
fprintf("saved subplots_demo.png\\n")
`),

    ex("matlab-ex-023", "Bar charts", "Grouped and stacked bars with value labels — counts by category.", "Plotting", "bar_charts",
        `% Bar charts: grouped, stacked, labeled.
format compact
figure('Visible', 'off')

regions = {'north', 'south', 'east', 'west'};
q1 = [120 98 143 87];
q2 = [135 104 151 92];

subplot(1, 2, 1)
bar([q1; q2]')                      % grouped by region
set(gca, 'XTickLabel', regions)
title('grouped'); legend('Q1', 'Q2')

subplot(1, 2, 2)
bar([q1; q2]', 'stacked')
set(gca, 'XTickLabel', regions)
title('stacked'); legend('Q1', 'Q2')

% label the stacked totals above each bar:
totals = q1 + q2;
for i = 1:numel(totals)
  text(i, totals(i) + 6, num2str(totals(i)), 'HorizontalAlignment', 'center')
end

saveas(gcf, 'bar_charts.png')
fprintf("saved bar_charts.png\\n")
`),

    ex("matlab-ex-024", "Scatter plots", "scatter with size and color channels — three variables in one plot.", "Plotting", "scatter_plots",
        `% Scatter: x, y, size and color channels.
format compact
figure('Visible', 'off')

rng(3)
n = 120;
weight = 50 + 25 * randn(n, 1);
power = 40 + 0.9 * (weight - 70) + 6 * randn(n, 1);
age   = randi([18, 70], n, 1);

scatter(weight, power, 18 + (age - 18), age, 'filled')
colormap(parula)
cb = colorbar;
cb.Label.String = 'age (years)';

xlabel('weight (kg)'); ylabel('power (W)')
title('bubble chart: size & color encode age')
grid on

saveas(gcf, 'scatter_demo.png')
fprintf("saved scatter_demo.png\\n")
`),

    ex("matlab-ex-025", "3D surfaces", "meshgrid + surf: a two-variable function as a shaded surface.", "Plotting", "surface_plots",
        `% 3D surface: meshgrid -> surf.
format compact
figure('Visible', 'off')

[x, y] = meshgrid(linspace(-3, 3, 80));
r = sqrt(x.^2 + y.^2);
z = sinc(r);                        % the classic "sombrero"

surf(x, y, z, 'EdgeColor', 'none')
colormap(turbo)
xlabel('x'); ylabel('y'); zlabel('z')
title('sinc(sqrt(x^2 + y^2))')
colorbar
view(-37.5, 30)                     % the default 3D angle

saveas(gcf, 'surface_demo.png')
fprintf("saved surface_demo.png\\n")
`),

    ex("matlab-ex-026", "Contour plots", "contour and clabel: level sets of the same surface, with labeled contours.", "Plotting", "contour_plots",
        `% Contours: slicing a surface into level curves.
format compact
figure('Visible', 'off')

[x, y] = meshgrid(linspace(-2.5, 2.5, 200));
z = (1 - x/4 + x.^5 + y.^3) .* exp(-x.^2 - y.^2);

levels = linspace(min(z(:)), max(z(:)), 12);
[cs, h] = contour(x, y, z, levels);
clabel(cs, h, 'FontSize', 7, 'Color', 'k')
colormap(cool)
xlabel('x'); ylabel('y')
title('labeled contour lines')
axis equal tight

saveas(gcf, 'contour_demo.png')
fprintf("saved contour_demo.png\\n")
`),

    ex("matlab-ex-027", "Polar and pie charts", "polarplot for angle data and pie for part-of-whole shares.", "Plotting", "polar_pie",
        `% Polar + pie, side by side.
format compact
figure('Visible', 'off')

theta = linspace(0, 2*pi, 300);

subplot(1, 2, 1)
polarplot(theta, 1 + cos(theta), 'b-', 'LineWidth', 1.6)
hold on
polarplot(theta, 0.5 + 0.5*cos(4*theta), 'r--')
hold off
title('cardioid + 4-leaf rose')
legend('r = 1 + cos\\theta', 'r = 0.5 + 0.5cos4\\theta')

subplot(1, 2, 2)
shares = [38 27 21 14];
labels = {'build', 'test', 'docs', 'misc'};
pie(shares, labels)
title('effort split')

saveas(gcf, 'polar_pie.png')
fprintf("saved polar_pie.png\\n")
`),

    ex("matlab-ex-028", "Error bars and confidence bands", "errorbar for point-wise uncertainty and a shaded band for a fit plus/minus 2SE.", "Plotting", "error_bars",
        `% Error bars and a shaded confidence band.
format compact
figure('Visible', 'off')

x  = (1:10)';
y  = 2*x + 5 + 3*randn(size(x));    % noisy line
p  = polyfit(x, y, 1);
yf = polyval(p, x);

subplot(1, 2, 1)
errorbar(x, y, 3*ones(size(x)), 3*ones(size(x)), 'o-')
hold on; plot(x, yf, 'r-', 'LineWidth', 1.5); hold off
xlabel('x'); ylabel('y'); legend('data \\pm 3', 'fit'); grid on
title('errorbar + fit')

subplot(1, 2, 2)
xx = linspace(min(x), max(x), 100);
resid = y - yf;
se = std(resid) * sqrt(1 + 1/numel(x) + ...
        (xx - mean(x)).^2 / sum((x - mean(x)).^2));
yy = polyval(p, xx);
fill([xx; flipud(xx)], [yy + 2*se; flipud(yy - 2*se)], ...
     [0.8 0.9 1], 'EdgeColor', 'none'); hold on
plot(xx, yy, 'b-', 'LineWidth', 1.6)
plot(x, y, 'ko', 'MarkerFaceColor', 'w')
hold off; xlabel('x'); ylabel('y'); grid on
title('fit \\pm 2 SE band')

saveas(gcf, 'error_bands.png')
fprintf("saved error_bands.png\\n")
`),

    ex("matlab-ex-029", "Plotting from data files", "Read a CSV, plot series per column and annotate peaks — the data-to-figure pipeline.", "Plotting", "plot_from_data",
        `% CSV -> figure, with a peak annotation.
format compact

% (write a small CSV first so the example is self-contained)
csv = ["time,sensorA,sensorB";
       sprintf("%g,%g,%g\\n", ...
         [linspace(0,10,50); ...
          sin(linspace(0,10,50)) + 0.05*randn(1,50); ...
          cos(linspace(0,10,50))])];
fid = fopen('sensors.csv', 'w');
fprintf(fid, '%s\\n', csv); fclose(fid);

T = readtable('sensors.csv');
figure('Visible', 'off')
plot(T.time, T.sensorA, 'b-', 'LineWidth', 1.4); hold on
plot(T.time, T.sensorB, 'r--', 'LineWidth', 1.4); hold off
xlabel('time (s)'); ylabel('voltage'); grid on
legend('sensor A', 'sensor B')

% annotate the global peak of sensor A:
[pk, idx] = max(T.sensorA);
plot(T.time(idx), pk, 'kv', 'MarkerFaceColor', 'y')
text(T.time(idx)+0.3, pk, sprintf('peak %.2f V', pk))
title('two sensors from sensors.csv')

saveas(gcf, 'plot_from_data.png')
fprintf("saved plot_from_data.png\\n")
`),

    ex("matlab-ex-030", "Log and twin-axis plots", "semilogy for ranges of magnitude; yyaxis for two units in one axes.", "Plotting", "log_twin_axis",
        `% Log scales and twin axes.
format compact
figure('Visible', 'off')

subplot(1, 2, 1)
f = logspace(0, 4, 200);            % 1 Hz .. 10 kHz
H = 1 ./ sqrt(1 + (f/100).^2);      % low-pass response
semilogx(f, 20*log10(H), 'LineWidth', 1.6)
grid on; xlabel('frequency (Hz)'); ylabel('gain (dB)')
title('RC low-pass on a log x-axis')

subplot(1, 2, 2)
t = linspace(0, 10, 200);
yyaxis left
plot(t, 100*exp(-t/4), 'b-'); ylabel('temperature (\\circC)')
yyaxis right
plot(t, 60*exp(-t/8),  'r-'); ylabel('pressure (kPa)')
xlabel('time (min)'); grid on
title('two units, twin y-axes')

saveas(gcf, 'log_twin.png')
fprintf("saved log_twin.png\\n")
`),

    ex("matlab-ex-031", "Solving linear systems", "The backslash operator: Ax = b solved the right way (LU, never inv).", "Linear algebra", "solve_systems",
        `% Solving A x = b — the backslash operator.
format compact

A = [ 3  1  0;
      1  4  2;
      0  2  5 ];
b = [6; 1; -4];

x = A \\ b                          % LU solve — the MATLAB way
fprintf("check A*x - b = %s\\n", mat2str(A*x - b, 3))

% The ANTI-pattern for comparison (slower + less accurate):
xinv = inv(A) * b;
fprintf("difference vs inv(): %.2e\\n", norm(x - xinv))

% Overdetermined systems: backslash does LEAST SQUARES:
Ato = [1 1; 2 1; 3 1; 4 1];         % 4 equations, 2 unknowns
bto = [1.1; 2.0; 2.9; 4.2];
xls = Ato \\ bto                    % best-fit line slope/intercept
fprintf("fit: y = %.3f x + %.3f\\n", xls(1), xls(2))
`),

    ex("matlab-ex-032", "Eigenvalues and eigenvectors", "eig: spectra of symmetric and non-symmetric matrices, and A = V D V^-1.", "Linear algebra", "eigen",
        `% Eigen-decomposition with eig.
format compact

S = [4 1; 1 3];                     % SYMMETRIC -> real, orthogonal
[V, D] = eig(S);
fprintf("eigenvalues: %s\\n", mat2str(diag(D)', 4))
fprintf("orthogonal V?  ||V'V - I|| = %.2e\\n", norm(V'*V - eye(2)))

% Reconstruct: S = V D V'
fprintf("reconstruction error: %.2e\\n", norm(V * D * V' - S))

% Non-symmetric: eigenvalues can be complex.
N = [0 -1; 1 0];                    % rotation by 90 degrees
[Vn, Dn] = eig(N);
fprintf("rotation eigenvalues: %s (pure imaginary)\\n", ...
        mat2str(diag(Dn)', 3))

% Power iteration for the LARGEST eigenvalue (by hand):
M = [6 2; 2 3];
v = [1; 0];
for it = 1:40
  w = M * v;  v = w / norm(w);
end
fprintf("power iteration: lambda ~ %.4f (eig says %.4f)\\n", ...
        v' * M * v, max(eig(M)))
`),

    ex("matlab-ex-033", "Singular value decomposition", "svd: rank, low-rank approximation and the energy in the top components.", "Linear algebra", "svd",
        `% The SVD: A = U S V', rank + compression.
format compact

A = [3 1 0 2;
     1 4 2 0;
     0 2 5 1];

[U, S, V] = svd(A, 'econ');         % economy size for tall/wide
singular = diag(S)
fprintf("rank(A) = %d\\n", rank(A))

% How much energy sits in the first k components?
energy = cumsum(singular.^2) / sum(singular.^2);
fprintf("energy captured: %s\\n", mat2str(round(energy, 4)))

% Best rank-2 approximation (Eckart-Young):
A2 = U(:, 1:2) * S(1:2, 1:2) * V(:, 1:2)';
fprintf("||A - A2|| = %.4f  (equals s3 = %.4f)\\n", ...
        norm(A - A2), singular(3))

% Pseudoinverse from the SVD:
tol = max(size(A)) * eps(max(singular));
Sinv = diag(1 ./ singular(singular > tol));
Aplus = V(:, 1:numel(Sinv)) * Sinv * U(:, 1:numel(Sinv))';
fprintf("||pinv(A) - Aplus|| = %.2e\\n", norm(pinv(A) - Aplus))
`),

    ex("matlab-ex-034", "Determinant, inverse, trace", "det, inv and trace — and when NOT to use them.", "Linear algebra", "det_inv_trace",
        `% det / inv / trace — the classics, used carefully.
format compact

A = [2 7; 1 8];

d = det(A);                         % determinant
Ai = inv(A);                        % inverse
tr = trace(A);                      % sum of diagonal

fprintf("det = %g, trace = %g\\n", d, tr)
fprintf("A * inv(A) = \\n%s\\n", mat2str(round(A * Ai, 10)))

% Cramer's rule for a 2x2 system (nice to SEE once):
b = [10; 9];
x1 = det([b A(:,2)]) / d;
x2 = det([A(:,1) b]) / d;
fprintf("Cramer solution: [%g; %g]\\n", x1, x2)

% In practice: solve, don't multiply by inv —
% solve is one LU factorization instead of a full inverse.
fprintf("backslash solution: %s\\n", mat2str(A \\ b))

% A near-singular matrix: det is a terrible rank test.
H = hilb(12);                       % notoriously ill-conditioned
fprintf("det(hilb(12)) = %.3e but cond = %.3e\\n", det(H), cond(H))
`),

    ex("matlab-ex-035", "Least squares fitting", "The normal equations, backslash and residuals — fitting models to data three ways.", "Linear algebra", "least_squares",
        `% Least squares: overdetermined systems.
format compact

t = (0:0.5:10)';
y = 3*exp(-0.3*t) + 0.15 + 0.05*randn(size(t));

% Fit y = a*exp(b*t) + c linearized is messy; fit a POLYNOMIAL model
% instead: y = p1*t^2 + p2*t + p3 in the design-matrix form:
X = [t.^2, t, ones(size(t))];
p = X \\ y;                          % the least-squares solve

% The three normal equations solved the textbook way:
pne = (X'*X) \\ (X'*y);
fprintf("backslash  : %s\\n", mat2str(p', 4))
fprintf("normal eqns: %s (same)\\n", mat2str(pne', 4))

residuals = y - X*p;
fprintf("RMS residual = %.4f\\n", sqrt(mean(residuals.^2)))

figure('Visible', 'off')
plot(t, y, 'o'); hold on
plot(t, X*p, '-', 'LineWidth', 1.5); hold off
xlabel('t'); ylabel('y'); legend('data', 'least-squares fit')
saveas(gcf, 'least_squares.png')
fprintf("saved least_squares.png\\n")
`),

    ex("matlab-ex-036", "Rank, null space and projections", "rank, orth and a hand-built null space from the SVD.", "Linear algebra", "rank_null",
        `% Rank, null space and orthogonal projections.
format compact

A = [1 2 3;
     2 4 6;
     1 1 1];                        % row2 = 2*row1 -> rank 2

fprintf("rank = %d of 3\\n", rank(A))

% Null space (kernel): vectors with A x = 0, from the SVD.
[~, S, V] = svd(A);
tol = max(size(A)) * eps(max(diag(S)));
nullV = V(:, sum(diag(S) > tol) + 1:end)
fprintf("A * null vector = %s\\n", mat2str(round(A * nullV, 12)))

% Compare with the toolbox-free null() (base MATLAB has it):
fprintf("matches null(): %.2e\\n", norm(nullV - null(A)))

% Project b onto the column space of A:
b = [1; 2; 3];
bproj = A * (A \\ b);               % projection via least squares
fprintf("projection error is in the null space of A': %.2e\\n", ...
        norm(A' * (b - bproj)))
`),

    ex("matlab-ex-037", "Norms and conditioning", "Vector/matrix norms, cond, and why ill-conditioned systems amplify noise.", "Linear algebra", "norms_cond",
        `% Norms and conditioning.
format compact

v = [3, -4];
fprintf("||v||_2 = %.4f, ||v||_1 = %g, ||v||_inf = %g\\n", ...
        norm(v), norm(v, 1), norm(v, inf))

A = [1 0.99; 0.99 0.98];            % nearly singular
fprintf("||A||_2 = %.4f, cond(A) = %.1f\\n", norm(A), cond(A))

% Perturb b slightly and watch the solution explode:
b  = [1; 1];
x  = A \\ b;
db = [1e-6; 0];
x2 = A \\ (b + db);
fprintf("relative b change: %.2e\\n", norm(db) / norm(b))
fprintf("relative x change: %.2e (amplified by cond(A))\\n", ...
        norm(x2 - x) / norm(x))

% The condition number bounds the damage:
fprintf("bound: cond * rel(b) = %.2e\\n", cond(A) * norm(db) / norm(b))
`),

    ex("matlab-ex-038", "LU, QR and Cholesky", "The three factorizations every numeric code leans on.", "Linear algebra", "factorizations",
        `% LU, QR, Cholesky.
format compact

A = [4 2 1;
     2 5 3;
     1 3 6];

% LU (what backslash uses internally):
[L, U, P] = lu(A);
fprintf("LU error: %.2e\\n", norm(P*A - L*U))

% QR: least squares via Q' b:
[Q, R] = qr(A);
b = [7; 14; 21];
xqr = R \\ (Q' * b);                % upper-triangular back-substitution
fprintf("QR solve == backslash: %.2e\\n", norm(xqr - A \\ b))

% Cholesky for symmetric positive definite matrices:
SPD = A * A';
C = chol(SPD);                      % SPD = C' C
fprintf("chol error: %.2e\\n", norm(SPD - C' * C))

% Cholesky-based solve (2 triangular solves, very fast):
y = C' \\ b;  xch = C \\ y;
fprintf("chol solve == backslash: %.2e\\n", norm(xch - SPD \\ (SPD * (A\\b) * 0 + b)))
`),

    ex("matlab-ex-039", "Sparse matrices", "sparse storage, spy and iterative solves for big, mostly-zero systems.", "Linear algebra", "sparse",
        `% Sparse matrices: storage that scales with nonzeros.
format compact

n = 200;                            % a 200x200 tridiagonal system
e = ones(n, 1);
A = spdiags([e -2*e e], -1:1, n, n);
b = ones(n, 1);

fprintf("nnz = %d of %d (%.1f%%)\\n", nnz(A), n*n, 100*nnz(A)/(n*n))
fprintf("density of full(): %.1f MB vs sparse: %.1f kB\\n", ...
        n*n*8/1e6, nnz(A)*12/1e3)

x = A \\ b;                          % sparse-aware backslash
fprintf("residual: %.2e\\n", norm(A*x - b))

% spy: the nonzero pattern, headless-saved:
figure('Visible', 'off')
spy(A)
title('tridiagonal nonzero pattern')
saveas(gcf, 'sparse_spy.png')
fprintf("saved sparse_spy.png\\n")
`),

    ex("matlab-ex-040", "Matrix functions", "expm, sqrtm and the matrix geometric series — powers that behave.", "Linear algebra", "matrix_functions",
        `% Matrix functions: expm / sqrtm / powers.
format compact

A = [0 1; -1 0];                    % 90-degree rotation generator

% exp of a MATRIX (series-based, NOT element-wise exp):
E = expm(A)
fprintf("expm of the rotation generator = rotation matrix\\n")
fprintf("|| expm(A) - [cos1 -sin1; sin1 cos1] || = %.2e\\n", ...
        norm(E - [cos(1) -sin(1); sin(1) cos(1)]))

% Compare with element-wise exp (totally different animal):
fprintf("exp(A) element-wise = %s\\n", mat2str(exp(A), 3))

% sqrtm: the matrix whose square IS A:
S = [4 1; 2 3];
Rm = sqrtm(S);
fprintf("|| sqrtm(S)^2 - S || = %.2e\\n", norm(Rm^2 - S))

% Geometric series for a converging spectral radius:
B = 0.4 * [1 0.5; 0.2 1];
sumB = (eye(2) - B) \\ eye(2);       % closed form of sum(B^k)
acc = eye(2);
for k = 1:40, acc = acc + B^k; end
fprintf("series vs closed form: %.2e\\n", norm(acc - sumB))
`),

    ex("matlab-ex-041", "FFT and spectra", "fft, frequency bins, fftshift and a single-sided amplitude spectrum.", "Signals & control", "fft_spectrum",
        `% The FFT: what lives in a signal.
format compact

fs = 1000;                          % sample rate (Hz)
t  = 0:1/fs:1-1/fs;                 % 1 second of samples
x  = 0.8*sin(2*pi*50*t) + 0.5*sin(2*pi*120*t) + 0.2*randn(size(t));

N  = numel(x);
X  = fft(x);
f  = (0:N-1) * fs / N;              % frequency bins

% single-sided amplitude spectrum:
amp = abs(X) / N;
half = 1:floor(N/2) + 1;

[~, ord] = sort(amp(half), 'descend');
fprintf("dominant frequencies (Hz): %s\\n", ...
        mat2str(round(f(half(ord(1:4))), 1)))

% Parseval: energy in time == energy in frequency:
fprintf("Parseval check: %.2e\\n", ...
        abs(sum(x.^2) - sum(abs(X).^2) / N))

figure('Visible', 'off')
plot(f(half), amp(half), 'LineWidth', 1.2)
xlim([0 200]); xlabel('frequency (Hz)'); ylabel('|X|/N')
title('single-sided spectrum'); grid on
saveas(gcf, 'fft_spectrum.png')
fprintf("saved fft_spectrum.png\\n")
`),

    ex("matlab-ex-042", "Filtering a noisy signal", "A first-order IIR via filter() and a moving average via conv — smoothing before analysis.", "Signals & control", "filtering",
        `% Smoothing: filter() and conv().
format compact

fs = 500;  t = 0:1/fs:2;
clean = sin(2*pi*3*t) + 0.5*sin(2*pi*10*t);
noisy = clean + 0.4*randn(size(t));

% Moving average (FIR) via conv:
w = 9;  h = ones(1, w) / w;
ma = conv(noisy, h, 'same');

% One-pole exponential smoother (IIR) via filter:
alpha = 0.15;
smoothed = filter(alpha, [1 -(1-alpha)], noisy);

% improvement in SNR:
snr = @(s, n) 10*log10(sum(s.^2) / sum(n.^2));
fprintf("raw   SNR: %.1f dB\\n", snr(clean, noisy - clean))
fprintf("MA    SNR: %.1f dB\\n", snr(clean, ma - clean))
fprintf("exp   SNR: %.1f dB\\n", snr(clean, smoothed - clean))

figure('Visible', 'off')
plot(t, noisy, 'Color', [0.8 0.8 0.8]); hold on
plot(t, clean, 'k-', 'LineWidth', 1.5)
plot(t, smoothed, 'r--', 'LineWidth', 1.2); hold off
legend('noisy', 'clean', 'smoothed'); xlabel('t (s)')
title('smoothing a noisy sum of tones')
saveas(gcf, 'filtering_demo.png')
fprintf("saved filtering_demo.png\\n")
`),

    ex("matlab-ex-043", "Convolution and correlation", "conv for the sliding dot product, plus a hand-rolled cross-correlation.", "Signals & control", "conv_correlate",
        `% Convolution + cross-correlation.
format compact

% Convolution: the moving-average kernel is a low-pass:
x = ones(1, 20);  h = ones(1, 5) / 5;
y = conv(x, h);
fprintf("conv length: %d = %d + %d - 1\\n", numel(y), numel(x), numel(h))
fprintf("steady state reaches 1: %s\\n", mat2str(y(6:15)))

% Cross-correlation by hand (flip + slide):
a = [1 2 3 4 5 4 3 2 1];
b = [3 4 5];
xc = conv(a, b(end:-1:1));          % correlate == conv with flip
[~, lag] = max(xc);
fprintf("best alignment at shift %d\\n", lag - numel(b) + 1)

% Autocorrelation reveals periodicity:
s = repmat([1 -1], 1, 8);           % square wave, period 2
ac = conv(s, s(end:-1:1)) / numel(s);
peaks = find(diff(sign(diff(ac))) < 0) + 1;
fprintf("autocorr peaks at lags: %s (period = %d)\\n", ...
        mat2str(peaks(1:4)), peaks(2) - peaks(1))
`),

    ex("matlab-ex-044", "Window functions", "Rectangular vs Hamming vs Hann: spectral leakage and sidelobes, seen on a DFT.", "Signals & control", "window_functions",
        `% Window functions and spectral leakage.
format compact

N = 256;
f = 25.3;                           % NOT bin-aligned on purpose
t = (0:N-1)';
sig = cos(2*pi*f*t/N);

rect = ones(N, 1);
hamm = 0.54 - 0.46*cos(2*pi*(0:N-1)'/ (N-1));
hann = 0.5 * (1 - cos(2*pi*(0:N-1)'/(N-1)));

A = @(s) abs(fft(s)) / N;
aRect = A(sig .* rect); aHamm = A(sig .* hamm); aHann = A(sig .* hann);

% sidelobe level (dB) relative to the main lobe, away from the peak:
half = 2:floor(N/2);
[~, pk] = max(aRect(half));
fprintf("peak bin: %d\\n", pk)
fprintf("rect sidelobes ~ -13 dB; windowed: much lower\\n")
fprintf("max sidelobe rect: %.1f dB, hann: %.1f dB\\n", ...
        20*log10(max(aRect(half(half~=pk)))), ...
        20*log10(max(aHann(half(half~=pk)))))

figure('Visible', 'off')
semilogy(half, aRect(half)+1e-12); hold on
semilogy(half, aHamm(half)+1e-12); semilogy(half, aHann(half)+1e-12)
hold off; legend('rect', 'hamming', 'hann')
xlabel('bin'); ylabel('|X|/N'); title('leakage: windowed vs rectangular')
saveas(gcf, 'windows.png')
fprintf("saved windows.png\\n")
`),

    ex("matlab-ex-045", "Second-order step response", "The closed-form step of a mass-spring-damper — underdamped, critical, overdamped.", "Signals & control", "step_response",
        `% Second-order system step response (closed form, no toolbox).
format compact

% m x'' + c x' + k x = u(t),  m=1
m = 1; k = 16;
for c = [2 8 12]                    % under / critical / over-damped
  wn = sqrt(k/m);
  zeta = c / (2*sqrt(k*m));
  t = linspace(0, 3, 400);
  if zeta < 1
    wd = wn * sqrt(1 - zeta^2);
    x = 1 - exp(-zeta*wn*t) .* (cos(wd*t) + zeta*wn/wd * sin(wd*t));
    kind = 'underdamped';
  elseif zeta == 1
    x = 1 - exp(-wn*t) .* (1 + wn*t);
    kind = 'critically damped';
  else
    r1 = -wn * (zeta - sqrt(zeta^2 - 1));
    r2 = -wn * (zeta + sqrt(zeta^2 - 1));
    x = 1 - (r2*exp(r1*t) - r1*exp(r2*t)) / (r2 - r1);
    kind = 'overdamped';
  end
  overshoot = max(0, max(x) - 1);
  fprintf("c=%2d (zeta=%.2f, %-17s) overshoot %5.1f%%\\n", ...
          c, zeta, kind, 100*overshoot);
end

% settling time for the underdamped case (2% band):
zeta = 2 / (2*sqrt(k*m));  wn = sqrt(k/m);
ts = -log(0.02 * sqrt(1 - zeta^2)) / (zeta * wn);
fprintf("2%% settling time ~ %.2f s\\n", ts)
`),

    ex("matlab-ex-046", "Discrete simulation", "Euler integration of dx/dt = f(x, u): a state-space model stepped in a loop.", "Signals & control", "discrete_sim",
        `% Discrete-time state-space simulation (forward Euler).
format compact

% A damped pendulum: theta'' = -(g/L) sin(theta) - d theta'
g = 9.81; L = 1.0; d = 0.25;
f = @(s) [s(2); -(g/L)*sin(s(1)) - d*s(2)];   % state = [theta; omega]

dt = 0.005;  T = 12;
n = round(T / dt);
x = [1.4; 0];                        % 80 degrees, at rest
hist = zeros(2, n+1); hist(:, 1) = x;

for k = 1:n
  x = x + dt * f(x);                 % forward Euler
  hist(:, k+1) = x;
end

t = (0:n) * dt;
fprintf("final angle %.3f rad, omega %.3f rad/s\\n", hist(1, end), hist(2, end))
fprintf("energy decayed by %.0f%%\\n", ...
        100 * (1 - (g/L)*(1-cos(hist(1,1))) / (g/L)*(1-cos(hist(1,end))) / ((g/L)*(1-cos(hist(1,1))))) )

figure('Visible', 'off')
plot(t, hist(1,:), 'LineWidth', 1.5)
xlabel('t (s)'); ylabel('\\theta (rad)')
title('damped pendulum, forward Euler')
grid on
saveas(gcf, 'pendulum.png')
fprintf("saved pendulum.png\\n")
`),

    ex("matlab-ex-047", "Frequency-domain filtering", "Design an ideal low-pass by zeroing DFT bins, then check the ringing trade-off.", "Signals & control", "freq_filter",
        `% Ideal low-pass filter, applied in the frequency domain.
format compact

fs = 200;  t = 0:1/fs:2-1/fs;
x = sin(2*pi*5*t) + 0.6*sin(2*pi*40*t) + 0.15*randn(size(t));
N = numel(x);

X = fft(x);
bins = (0:N-1) * fs / N;

cutoff = 15;                         % Hz
mask = (bins < cutoff) | (bins > fs - cutoff);
Xf = X .* mask;                      % zero the high bins
y = real(ifft(Xf));

% how much of each tone survived?
surv = @(fr) abs(sum(y .* exp(-2i*pi*fr*t))) * 2 / N;
fprintf("5 Hz survives:  %.2f (was 1.00)\\n", surv(5))
fprintf("40 Hz killed:   %.2f (was 0.60)\\n", surv(40))

figure('Visible', 'off')
subplot(2, 1, 1)
plot(t, x); title('noisy two-tone'); ylabel('x(t)')
subplot(2, 1, 2)
plot(t, y); title('after 15 Hz ideal low-pass'); ylabel('y(t)'); xlabel('t (s)')
saveas(gcf, 'freq_filter.png')
fprintf("saved freq_filter.png (notice the ringing near the edges)\\n")
`),

    ex("matlab-ex-048", "Noise and SNR", "Generating, measuring and defeating noise — dB bookkeeping for real signals.", "Signals & control", "noise_snr",
        `% Noise, SNR and dB arithmetic.
format compact

rng(9)
fs = 1000; t = 0:1/fs:1-1/fs;
sig = 1.5 * sin(2*pi*10*t);

for noiseLevel = [0.05 0.2 0.8]
  noisy = sig + noiseLevel * randn(size(t));
  snr = 10 * log10(sum(sig.^2) / sum((noisy - sig).^2));
  rmsSig = rms(sig); rmsN = rms(noisy - sig);
  fprintf("noise std %.2f -> SNR %5.1f dB (rms %.2f vs %.2f)\\n", ...
          noiseLevel, snr, rmsSig, rmsN);
end

% Averaging N runs buys sqrt(N) in SNR:
for Nruns = [1 4 16 64]
  acc = zeros(size(t));
  for r = 1:Nruns
    acc = acc + sig + 0.3 * randn(size(t));
  end
  avg = acc / Nruns;
  snr = 10 * log10(sum(sig.^2) / sum((avg - sig).^2));
  fprintf("average of %2d runs -> SNR %.1f dB (+%.1f)\\n", ...
          Nruns, snr, snr - 10*log10(sum(sig.^2)/sum(0.3^2*ones(size(t)))));
end
`),

    ex("matlab-ex-049", "Discrete PID controller", "A full discrete PID loop in 20 lines: plant, error, integral, derivative, anti-windup.", "Signals & control", "pid_loop",
        `% A discrete PID controller, from scratch.
format compact

% Plant: first-order process  y' = (u - y) / tau
tau = 1.2;
dt = 0.02;  T = 8;  n = round(T/dt);

Kp = 2.2; Ki = 0.9; Kd = 0.15;      % gains
sp = 1.0;                           % setpoint

y = 0; e_int = 0; e_prev = 0;
uhist = zeros(1, n+1); yhist = uhist;

for k = 1:n
  e = sp - y;
  e_int = e_int + e * dt;
  e_int = max(min(e_int, 1.5), -1.5);        % anti-windup clamp
  e_der = (e - e_prev) / dt;
  u = Kp*e + Ki*e_int + Kd*e_der;
  u = max(min(u, 2), 0);                     % actuator saturation

  y = y + dt * (u - y) / tau;                % plant step

  uhist(k+1) = u; yhist(k+1) = y; e_prev = e;
end

t = (0:n) * dt;
overshoot = max(0, max(yhist) - sp);
[~, kSettle] = max(abs(yhist - sp) < 0.02);
fprintf("overshoot: %.1f%%, 2%% settling: %.2f s\\n", 100*overshoot, t(min(kSettle+1, n+1)))

figure('Visible', 'off')
plot(t, sp*ones(size(t)), 'k--'); hold on
plot(t, yhist, 'b-', 'LineWidth', 1.6)
plot(t, uhist, 'r-'); hold off
legend('setpoint', 'y(t)', 'u(t)')
xlabel('t (s)'); title('discrete PID on a first-order plant')
saveas(gcf, 'pid_demo.png')
fprintf("saved pid_demo.png\\n")
`),

    ex("matlab-ex-050", "Numerical integration of ODEs", "RK4 versus Euler on a Van der Pol oscillator — accuracy for the same step size.", "Signals & control", "ode_rk4",
        `% Van der Pol oscillator: Euler vs classic Runge-Kutta 4.
format compact

mu = 1.5;
f = @(s) [s(2); mu*(1 - s(1)^2)*s(2) - s(1)];

dt = 0.05; T = 30; n = round(T/dt);

% Euler:
xE = zeros(2, n+1); xE(:, 1) = [2; 0];
for k = 1:n
  xE(:, k+1) = xE(:, k) + dt * f(xE(:, k));
end

% RK4:
xR = xE;
for k = 1:n
  s = xR(:, k);
  k1 = f(s);
  k2 = f(s + dt/2*k1);
  k3 = f(s + dt/2*k2);
  k4 = f(s + dt*k3);
  xR(:, k+1) = s + dt/6 * (k1 + 2*k2 + 2*k3 + k4);
end

% Compare against a fine-grained RK4 reference:
dtr = 0.001; nr = round(T/dtr);
xRef = xR(:, 1);
for k = 1:nr
  s = xRef(:, k);
  k1 = f(s); k2 = f(s + dtr/2*k1); k3 = f(s + dtr/2*k2); k4 = f(s + dtr*k3);
  xRef(:, k+1) = s + dtr/6*(k1 + 2*k2 + 2*k3 + k4);
end
refEnd = xRef(:, end);

fprintf("final state error vs reference:\\n")
fprintf("  Euler : %.4f\\n", norm(xE(:, end) - refEnd))
fprintf("  RK4   : %.2e   (orders of magnitude better)\\n", norm(xR(:, end) - refEnd))

figure('Visible', 'off')
t = (0:n)*dt;
plot(t, xE(1, :), 'r--'); hold on
plot(t, xR(1, :), 'b-', 'LineWidth', 1.5); hold off
legend('Euler', 'RK4'); xlabel('t'); ylabel('x(t)')
title('Van der Pol, \\mu = 1.5')
saveas(gcf, 'vanderpol.png')
fprintf("saved vanderpol.png\\n")
`),
];
