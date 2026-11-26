/**
 * 10 C reference templates (the "add other languages also +
 * their examples to check" batch). Bodies are portable C99, created
 * as .c files; Run compiles them with gcc and executes the artifact
 * (the runtime chip in the viewer header reports when gcc is missing).
 *
 * C identifiers keep their native snake_case (no naming tokens).
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "C";

const ex = (
    id: string, label: string, description: string, sub: string, baseName: string,
    body: string,
) => mkExample("c", id, label, description, CAT, sub, baseName, ".c", () => body);

export const C_EXAMPLES: FileExample[] = [
    ex("c-ex-001", "Hello, C", "printf with format verbs and the main signature every program starts from.", "Basics", "hello_c",
        `/* Hello, C — printf and friends. */
#include <stdio.h>

int main(void) {
    printf("Hello from C!\\n");

    /* printf verbs: %d int, %f double, %s string, %c char, %zu size_t. */
    int count = 42;
    double pi = 3.14159;
    char letter = 'A';
    size_t bytes = sizeof(int);

    printf("count=%d pi=%.4f letter=%c\\n", count, pi, letter);
    printf("int occupies %zu bytes on this machine\\n", bytes);
    printf("field widths: |%10d| |%-10d| |%.2f|\\n", 7, 7, 2.71828);

    /* puts adds the newline for you. */
    puts("puts works too");
    return 0;
}
`),

    ex("c-ex-002", "Types and casts", "The primitive sizes, sizeof, integer division gotchas and explicit casts.", "Basics", "types_casts",
        `/* The type zoo and the traps everyone steps in once. */
#include <stdio.h>

int main(void) {
    int    i = 7;
    double d = 2.0;

    /* Integer division truncates — the classic surprise. */
    int    truncated = i / 2;        /* 3, not 3.5 */
    double promoted = i / 2.0;      /* 3.5 — one operand makes it double */

    printf("truncated=%d promoted=%.1f\\n", truncated, promoted);

    /* Explicit casts. */
    int narrowed = (int) 3.99;      /* 3 — toward zero */
    char as_char  = (char) 65;      /* 'A' */
    printf("narrowed=%d as_char=%c\\n", narrowed, as_char);

    /* sizeof gives byte widths (platform-dependent values printed). */
    printf("char=%zu short=%zu int=%zu long=%zu\\n",
           sizeof(char), sizeof(short), sizeof(int), sizeof(long));
    printf("float=%zu double=%zu pointer=%zu\\n",
           sizeof(float), sizeof(double), sizeof(void *));

    /* unsigned wrap-around. */
    unsigned char byte = 255;
    byte = byte + 1;                /* wraps to 0 */
    printf("255+1 in a byte = %d\\n", byte);
    return 0;
}
`),

    ex("c-ex-003", "Branching and loops", "if/else chains, switch, while/for/do-while and break/continue.", "Control flow", "branching_loops",
        `/* Every control shape in one program. */
#include <stdio.h>

int main(void) {
    int score = 87;
    char grade;
    if (score >= 90)       grade = 'A';
    else if (score >= 80)   grade = 'B';
    else                    grade = 'C';
    printf("score=%d grade=%c\\n", score, grade);

    switch (grade) {
        case 'A':
            printf("excellent\\n");
            break;                       /* without break it FALLS THROUGH */
        case 'B':
            printf("solid\\n");
            break;
        default:
            printf("keep going\\n");
    }

    int total = 0;
    for (int i = 1; i <= 10; i++) total += i;
    printf("1..10 sums to %d\\n", total);

    int power = 1;
    while (power < 100) power *= 3;
    printf("first power of 3 past 100: %d\\n", power);

    int tries = 0;
    do { tries++; } while (0);           /* runs once */
    printf("do-while ran %d time\\n", tries);

    for (int i = 1; i <= 10; i++) {
        if (i % 2 == 0) continue;        /* skip evens */
        if (i > 7) break;                 /* stop past 7 */
        printf("odd: %d\\n", i);
    }
    return 0;
}
`),

    ex("c-ex-004", "Functions", "Declarations before main, pass-by-value semantics, prototypes and static helpers.", "Functions", "functions_tour",
        `/* Functions — prototypes, by-value arguments, recursion. */
#include <stdio.h>

/* Prototype: the compiler needs the signature before the calls. */
long factorial(int n);
int  sum_range(int lo, int hi);

long factorial(int n) {
    return n <= 1 ? 1 : n * factorial(n - 1);
}

int sum_range(int lo, int hi) {
    int total = 0;
    for (int i = lo; i <= hi; i++) total += i;
    return total;
}

/* Swapping via POINTERS — C passes by value, so the pointers are how
   the callee writes into the caller's memory. */
void swap(int *a, int *b) {
    int tmp = *a;
    *a = *b;
    *b = tmp;
}

int main(void) {
    printf("6! = %ld\\n", factorial(6));
    printf("sum 1..10 = %d\\n", sum_range(1, 10));

    int x = 1, y = 99;
    swap(&x, &y);
    printf("after swap: x=%d y=%d\\n", x, y);
    return 0;
}
`),

    ex("c-ex-005", "Arrays and strings", "Array init, iteration, strlen/strcpy and string literals as char arrays.", "Data structures", "arrays_strings",
        `/* Arrays + C strings (NUL-terminated char arrays). */
#include <stdio.h>
#include <string.h>

int main(void) {
    int nums[] = {5, 1, 4, 2, 3};
    size_t n = sizeof(nums) / sizeof(nums[0]);   /* element count idiom */

    int total = 0;
    for (size_t i = 0; i < n; i++) total += nums[i];
    printf("count=%zu total=%d mean=%.2f\\n", n, total, (double) total / n);

    /* 2-D arrays are row-major blocks. */
    int grid[2][3] = {{1, 2, 3}, {4, 5, 6}};
    printf("grid[1][2]=%d\\n", grid[1][2]);

    /* Strings: arrays of char ending in '\\0'. */
    char greeting[20] = "Hello";        /* room to append */
    strcat(greeting, ", C!");
    printf("%s (length %zu)\\n", greeting, strlen(greeting));

    char copy[20];
    strcpy(copy, greeting);
    printf("copy: %s\\n", copy);

    /* strncmp compares a bounded number of chars — the safe twin. */
    printf("match prefix: %d\\n", strncmp(copy, "Hello", 5) == 0);
    return 0;
}
`),

    ex("c-ex-006", "Pointers", "& and *, NULL, pointer arithmetic over an array, and pointer-as-iterator.", "Core concepts", "pointers_tour",
        `/* Pointers — the heart of C, in one small page. */
#include <stdio.h>

int main(void) {
    int value = 42;
    int *p = &value;          /* p holds the ADDRESS of value */

    printf("value=%d  *p=%d  &value=%p\\n", value, *p, (void *) &value);
    *p = 99;                  /* writing THROUGH the pointer */
    printf("after *p=99: value=%d\\n", value);

    /* Pointer arithmetic walks an array (ints step sizeof(int)). */
    int nums[5] = {10, 20, 30, 40, 50};
    int *end = nums + 5;
    for (int *q = nums; q < end; q++) {
        printf("%d ", *q);
    }
    printf("\\n");

    /* A NULL pointer points at nothing — always test before use. */
    int *maybe = NULL;
    if (maybe == NULL) {
        printf("maybe is NULL — not dereferencing it\\n");
    }

    /* Arrays decay to pointers at a boundary; sizeof differs. */
    printf("sizeof nums=%zu  sizeof decayed=%zu\\n",
           sizeof(nums), sizeof(nums + 0));
    return 0;
}
`),

    ex("c-ex-007", "Dynamic memory", "malloc/free, realloc growth, and the rules that keep heap code safe.", "Core concepts", "dynamic_memory",
        `/* Heap memory: malloc, realloc, free — and the ownership rules. */
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    /* malloc returns untyped memory — always size * count. */
    size_t capacity = 4;
    int *data = malloc(capacity * sizeof(int));
    if (data == NULL) {                    /* ALWAYS check malloc */
        fprintf(stderr, "out of memory\\n");
        return 1;
    }

    size_t used = 0;
    for (int i = 1; i <= 6; i++) {
        if (used == capacity) {
            capacity *= 2;                 /* grow geometrically */
            int *grown = realloc(data, capacity * sizeof(int));
            if (grown == NULL) {
                free(data);                 /* original still valid */
                return 1;
            }
            data = grown;
        }
        data[used++] = i * i;               /* squares */
    }

    printf("capacity=%zu used=%zu: ", capacity, used);
    for (size_t i = 0; i < used; i++) printf("%d ", data[i]);
    printf("\\n");

    free(data);                             /* exactly once, then never touch it */
    return 0;
}
`),

    ex("c-ex-008", "Structs", "typedef struct, member access with . vs ->, and arrays of structs.", "Data structures", "structs_tour",
        `/* structs — C's record type. */
#include <stdio.h>
#include <string.h>

typedef struct {
    char name[32];
    double mass_kg;      /* kilograms */
    double orbit_days;    /* one full revolution */
} Planet;

/* A function that takes a struct BY VALUE (a copy — edits stay local). */
static void report(const Planet *p) {
    printf("%-8s mass=%8.1f kg orbit=%7.1f d\\n", p->name, p->mass_kg, p->orbit_days);
}

int main(void) {
    /* Designated initializers make the field order obvious. */
    Planet planets[3] = {
        {"Mercury", 3.30e23,   87.97},
        {"Earth",   5.97e24,  365.26},
        {"Jupiter", 1.90e27, 4332.6},
    };

    for (int i = 0; i < 3; i++) {
        report(&planets[i]);       /* &planet → arrow access inside */
    }

    /* Copy assignment copies the whole block, string included. */
    Planet backup = planets[1];
    strcpy(backup.name, "Earth-copy");
    printf("copied: %s (%.2e kg)\\n", backup.name, backup.mass_kg);
    return 0;
}
`),

    ex("c-ex-009", "File I/O", "fopen/fclose, reading lines with fgets, fprintf writing and error checking.", "Practical", "file_io",
        `/* File I/O — the stdio trio: open, read, write, close. */
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    /* tmpfile gives an anonymous temp file that deletes itself. */
    FILE *out = fopen("/tmp/praxis_demo.txt", "w");
    if (out == NULL) {
        perror("fopen for write");
        return 1;
    }
    fprintf(out, "line one\\n");
    fprintf(out, "line two\\n");
    fprintf(out, "line three\\n");
    fclose(out);                       /* flush + release */

    FILE *in = fopen("/tmp/praxis_demo.txt", "r");
    if (in == NULL) {
        perror("fopen for read");
        return 1;
    }

    char line[256];
    int lineno = 0;
    while (fgets(line, sizeof(line), in) != NULL) {
        lineno++;
        printf("%d: %s", lineno, line); /* fgets keeps the newline */
    }
    fclose(in);
    remove("/tmp/praxis_demo.txt");    /* tidy up */
    return 0;
}
`),

    ex("c-ex-010", "qsort and bsearch", "The stdlib quicksort with a comparison callback, then binary search over the result.", "Practical", "qsort_bsearch",
        `/* qsort + bsearch: the standard-library workhorse pair. */
#include <stdio.h>
#include <stdlib.h>

/* Comparison callback: negative / zero / positive ordering. */
static int compare_ints(const void *a, const void *b) {
    int x = *(const int *) a;
    int y = *(const int *) b;
    return (x > y) - (x < y);          /* branchless sign */
}

int main(void) {
    int nums[] = {42, 7, 19, 3, 88, 15, 1, 55};
    size_t n = sizeof(nums) / sizeof(nums[0]);

    qsort(nums, n, sizeof(int), compare_ints);
    printf("sorted: ");
    for (size_t i = 0; i < n; i++) printf("%d ", nums[i]);
    printf("\\n");

    /* bsearch needs a SORTED array — same comparator. */
    int key = 19;
    int *found = bsearch(&key, nums, n, sizeof(int), compare_ints);
    if (found != NULL) {
        printf("found %d at index %zu\\n", *found, (size_t) (found - nums));
    } else {
        printf("%d not found\\n", key);
    }
    return 0;
}
`),
];
