% tags: matlab, monte-carlo
% PiMonteCarlo.m — 200k-sample Monte Carlo estimate of pi with
% progress lines every 40k samples. Deterministic seed, so the run
% history diff stays meaningful.

rng(7);
n = 200000;
inside = 0;

for i = 1:n
    x = rand;
    y = rand;
    if x * x + y * y <= 1
        inside = inside + 1;
    end
    if mod(i, 40000) == 0
        est = 4 * inside / i;
        fprintf('after %6d samples: pi ~= %.5f (err %+0.5f)\n', ...
                i, est, est - pi);
    end
end

fprintf('final estimate: %.5f after %d samples\n', 4 * inside / n, n);
fprintf('monte carlo run complete\n');
