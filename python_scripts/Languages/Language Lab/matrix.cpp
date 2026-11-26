// tags: cpp, getting-started
// matrix.cpp — compiled with g++ and run by the IDE.
#include <cstdio>
#include <vector>

class Matrix {
    int rows_;
    int cols_;
    std::vector<double> data_;

public:
    Matrix(int rows, int cols)
        : rows_(rows), cols_(cols), data_(rows * cols, 0.0) {}

    double &at(int r, int c) { return data_[r * cols_ + c]; }
    const double &at(int r, int c) const { return data_[r * cols_ + c]; }

    Matrix multiply(const Matrix &other) const {
        Matrix out(rows_, other.cols_);
        for (int i = 0; i < rows_; i++) {
            for (int k = 0; k < cols_; k++) {
                double a = at(i, k);
                for (int j = 0; j < other.cols_; j++) {
                    out.at(i, j) += a * other.at(k, j);
                }
            }
        }
        return out;
    }

    void print(const char *label) const {
        printf("%s:\n", label);
        for (int i = 0; i < rows_; i++) {
            for (int j = 0; j < cols_; j++) {
                printf("%6.1f", at(i, j));
            }
            printf("\n");
        }
    }
};

int main() {
    Matrix a(2, 3);
    Matrix b(3, 2);
    double vals[6] = { 1, 2, 3, 4, 5, 6 };
    for (int i = 0; i < 6; i++) {
        a.at(i / 3, i % 3) = vals[i];
        b.at(i % 3, i / 3) = vals[i];
    }
    Matrix c = a.multiply(b);
    a.print("A (2x3)");
    b.print("B (3x2)");
    c.print("A*B (2x2)");
    printf("C++ run complete.\n");
    return 0;
}
