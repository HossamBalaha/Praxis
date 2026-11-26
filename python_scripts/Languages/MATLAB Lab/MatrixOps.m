% tags: matlab, math
% MatrixOps.m — the classics: product, eigenvalues, determinant and
% a linear solve with the backslash operator. Pure core functions.

A = [1 2 3; 4 5 6];
B = [7 8; 9 10; 11 12];
C = A * B;

fprintf('A (2x3):\n');
disp(A);
fprintf('B (3x2):\n');
disp(B);
fprintf('A*B (2x2):\n');
disp(C);

M = [4 1 2; 1 3 0; 2 0 5];
eigs = sort(eig(M));
fprintf('eigenvalues of M: %s\n', mat2str(eigs', 4));
fprintf('det(M) = %.4f\n', det(M));
fprintf('trace(M) = %.0f\n', trace(M));

b = [1; 2; 3];
x = M \ b;
fprintf('solution of M\\b = [%s]\n', strjoin(arrayfun(@(v) sprintf('%.4f', v), x, 'UniformOutput', false), ', '));
fprintf('residual ||M*x - b|| = %.2e\n', norm(M * x - b));
fprintf('matrix ops run complete\n');
