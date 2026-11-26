/* tags: c, getting-started
 * quicksort.c — compiled with gcc and run by the IDE (two stages:
 * the compile diagnostics stream first, then the program's stdout).
 */
#include <stdio.h>

static void swap(int *a, int *b) {
    int tmp = *a;
    *a = *b;
    *b = tmp;
}

static int partition(int *xs, int lo, int hi) {
    int pivot = xs[hi];
    int i = lo - 1;
    for (int j = lo; j < hi; j++) {
        if (xs[j] <= pivot) {
            i++;
            swap(&xs[i], &xs[j]);
        }
    }
    swap(&xs[i + 1], &xs[hi]);
    return i + 1;
}

static void quicksort(int *xs, int lo, int hi) {
    if (lo < hi) {
        int p = partition(xs, lo, hi);
        quicksort(xs, lo, p - 1);
        quicksort(xs, p + 1, hi);
    }
}

int main(void) {
    int xs[] = { 9, 3, 7, 1, 8, 2, 5, 4, 6 };
    int n = sizeof(xs) / sizeof(xs[0]);
    quicksort(xs, 0, n - 1);
    for (int i = 0; i < n; i++) {
        printf("%d%c", xs[i], i + 1 < n ? ' ' : '\n');
    }
    printf("C run complete.\n");
    return 0;
}
