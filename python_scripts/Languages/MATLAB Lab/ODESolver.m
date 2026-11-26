% tags: matlab, simulation
% ODESolver.m — semi-implicit Euler integration of a damped spring:
%     y'' = -k*y - c*y'
% The stepped table prints every 10th step; the Auto-format MATLAB
% entry keeps the for/if blocks and the end closers tidy.

k = 4;      % stiffness
c = 0.4;    % damping
h = 0.05;   % step (s)
steps = 120;

y = 1;      % initial displacement
v = 0;      % initial velocity

fprintf('  time       y          v\n');
fprintf('  --------------------------\n');
for i = 0:steps
    if mod(i, 10) == 0
        fprintf('%6.2f  %9.4f  %9.4f\n', i * h, y, v);
    end
    a = -k * y - c * v;
    y = y + h * v;
    v = v + h * a;
end
fprintf('  --------------------------\n');
fprintf('settled after %d steps (%.1f s simulated)\n', steps, steps * h);
fprintf('ode solver run complete\n');
