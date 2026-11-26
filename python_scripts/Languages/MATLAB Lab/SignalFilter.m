% tags: matlab, dsp
% SignalFilter.m — a noisy sine smoothed by a moving-average filter.
% Pure core MATLAB/Octave (no toolboxes): randn, mean, fprintf.

rng(42);
n = 200;
t = (0:n-1)' / 10;
clean = sin(2 * pi * 1.5 * t);
noisy = clean + 0.35 * randn(n, 1);

window = 5;
half = floor(window / 2);
filtered = zeros(n, 1);
for i = 1:n
    lo = max(1, i - half);
    hi = min(n, i + half);
    filtered(i) = mean(noisy(lo:hi));
end

err_raw = noisy - clean;
err_fil = filtered - clean;
snr_raw = 10 * log10(sum(clean .^ 2) / sum(err_raw .^ 2));
snr_fil = 10 * log10(sum(clean .^ 2) / sum(err_fil .^ 2));

fprintf('samples: %d, filter window: %d\n', n, window);
fprintf('SNR raw    : %7.2f dB\n', snr_raw);
fprintf('SNR filtered: %7.2f dB  (gain %+0.2f dB)\n', snr_fil, snr_fil - snr_raw);

% A 64-column ASCII look at the smoothed signal (peak of each column).
cols = 64;
step = floor(n / cols);
for c = 1:cols
    seg = filtered((c - 1) * step + 1 : c * step);
    v = max(abs(seg));
    bar = round(v * 20);
    fprintf('%s', repmat('#', 1, bar));
    fprintf('%s', repmat(' ', 1, max(0, 4)));
end
fprintf('\n');
fprintf('signal filter run complete\n');
