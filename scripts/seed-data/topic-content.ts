/**
 * Authored learning content for a curated set of topics.
 *
 * Keyed by **canonical topic key**, not by subject or college. A canonical key
 * is derived from the topic title alone, so one entry here reaches "Recursion
 * and its cost" wherever it appears — R23 CSE at one college, R20 IT at
 * another (§55). That is the whole reason the key exists: writing this text
 * once per curriculum would mean writing it six times for the seeded data
 * alone, and six copies drift.
 *
 * Everything here is `origin: "authored"` and goes in **published**. It is
 * written by hand, for this seed, and is deliberately not generated: a
 * demonstration database whose explanations came from a model would make the
 * review workflow (§45) look like a formality nobody actually performs.
 *
 * Deliberately small. Eight topics, chosen so the Data Structures subject in
 * `seed-curriculum` has enough prepared content for the topic page, the
 * progress bar and the "explanation ready" marker to be exercised properly —
 * while the topics *without* content exercise the other half of the screen,
 * which is the state most real topics will be in for a long time.
 */

export type SeedCheckQuestion = {
  question: string;
  answer: string;
  hint?: string;
};

export type SeedTopicContent = {
  /** `canonicalTopicKey(title)` — see `src/lib/learning/topic-identity.ts`. */
  canonicalKey: string;
  basicExplanation: string;
  whyItMatters: string;
  realWorldAnalogy?: string;
  terminology?: { term: string; meaning: string }[];
  practicalExplanation?: string;
  realWorldExamples?: string[];
  codeExample?: { language: string; code: string; explanation: string; output?: string };
  keyPoints: string[];
  commonMistakes?: string[];
  prerequisites?: string[];
  checkYourUnderstanding?: SeedCheckQuestion[];
  advancedOverview?: string;
};

export const SEED_TOPIC_CONTENT: SeedTopicContent[] = [
  // ── Unit 1 ──────────────────────────────────────────────────────────────
  {
    canonicalKey: "abstract-data-types",
    basicExplanation: `An **abstract data type** (ADT) is a description of what a data structure does, with nothing said about how it does it.

Take a stack. Its ADT says: you can push a value on, you can pop the most recent one off, you can look at the top, and you can ask whether it is empty. That is the whole specification. It says nothing about arrays, nothing about pointers, nothing about memory.

The point is the separation. Code that *uses* a stack only needs the four operations. Code that *implements* a stack decides whether to use an array or a linked list. Neither has to know about the other, and either can be rewritten without touching the other.

This is why textbooks introduce every structure twice: first as an ADT (what it promises), then as one or more implementations (how the promise is kept). Arrays and linked lists both implement the list ADT; they make different promises about cost, not about behaviour.`,
    whyItMatters:
      "Every data structure in this course is presented as an ADT first. If you learn the operations and their costs rather than one particular implementation, you can pick the right structure for a problem instead of reaching for the one you happen to remember.",
    realWorldAnalogy:
      "A car's controls are an ADT: steering wheel, accelerator, brake. You can drive a petrol car and an electric one without knowing which is under you — the interface is the same and the implementation is not.",
    terminology: [
      { term: "Abstract data type", meaning: "A set of operations and their behaviour, with no implementation attached." },
      { term: "Implementation", meaning: "The concrete data and code that provide an ADT's operations." },
      { term: "Interface", meaning: "The operations a user of the structure may call." },
      { term: "Encapsulation", meaning: "Keeping the internal representation hidden from the user of the ADT." },
    ],
    practicalExplanation: `The list ADT specifies: insert at a position, delete at a position, get the element at a position, and report the length.

Implement it with an **array** and \`get\` costs one step while \`insert\` at the front costs n steps, because everything shifts. Implement it with a **linked list** and \`insert\` at the front costs one step while \`get\` costs up to n, because you walk the chain.

Same ADT. Same operations. Completely different program if you choose wrong: a system that inserts constantly and reads rarely wants the second, and one that reads constantly wants the first.`,
    realWorldExamples: [
      "The browser back button is a stack ADT — the implementation is irrelevant to the button.",
      "A printer queue is a queue ADT, whichever structure the driver actually uses.",
      "A phone contact list is a map ADT: look up a name, get a number.",
    ],
    keyPoints: [
      "An ADT specifies behaviour; an implementation supplies it.",
      "One ADT can have several implementations with very different costs.",
      "Choosing a structure means choosing an implementation whose costs match your access pattern.",
      "Code written against an ADT survives a change of implementation.",
      "The exam usually asks for both: define the ADT, then give an implementation.",
    ],
    commonMistakes: [
      "Describing a stack as \"an array where you add at the end\" — that is one implementation, not the ADT.",
      "Assuming an ADT implies a cost. Only the implementation has a cost.",
    ],
    checkYourUnderstanding: [
      {
        question: "State the queue ADT without referring to any implementation.",
        answer:
          "A queue supports enqueue (add an element at the rear), dequeue (remove the element at the front), peek (read the front element without removing it) and isEmpty. Elements leave in the order they arrived — first in, first out.",
        hint: "List the operations and the ordering rule. Say nothing about arrays or pointers.",
      },
      {
        question: "Both an array and a linked list implement the list ADT. Give one operation each is better at.",
        answer:
          "An array is better at access by index — it is one address calculation regardless of position. A linked list is better at insertion and deletion at the front — it re-points one link, while the array must shift every following element.",
      },
    ],
    advancedOverview:
      "Formally, an ADT is specified by a signature (the operation names and their types) and axioms relating them — pop(push(s, x)) = s, for instance. Algebraic specification of this kind is what allows an implementation to be *proved* correct against its ADT rather than tested against it, and it is the foundation of the type classes and interfaces in modern languages.",
  },

  {
    canonicalKey: "algorithm-analysis-time-space-complexity",
    basicExplanation: `Algorithm analysis asks a single question: **as the input grows, how much worse does this get?**

Not "how many seconds does it take" — that depends on the machine, the compiler and what else is running. Instead we count the operations that dominate, as a function of the input size n.

Two costs matter:

- **Time complexity** — how the number of steps grows with n.
- **Space complexity** — how much extra memory is needed, beyond the input itself.

A loop over n elements does n steps: linear, written O(n). A nested loop over the same n does n×n: quadratic, O(n²). Halving the search space each step reaches the answer in about log₂ n steps: logarithmic, O(log n).

The difference is not academic. At n = 1,000,000: a linear algorithm does a million steps, a logarithmic one does twenty, and a quadratic one does a trillion. The first two run instantly and the third does not finish today.`,
    whyItMatters:
      "Every structure in this course is chosen by its costs, and every exam question about \"which structure would you use\" is really a question about complexity. It is also the single thing interviewers ask about most.",
    realWorldAnalogy:
      "Finding a name in a phone book. Reading every page is linear. Opening at the middle and halving each time is logarithmic. With a million names that is the difference between a million checks and twenty.",
    terminology: [
      { term: "n", meaning: "The size of the input — number of elements, usually." },
      { term: "Time complexity", meaning: "How the step count grows with n." },
      { term: "Space complexity", meaning: "How the extra memory used grows with n." },
      { term: "Auxiliary space", meaning: "Extra space excluding the input itself." },
      { term: "Dominant term", meaning: "The fastest-growing term, the only one kept as n grows." },
    ],
    practicalExplanation: `To analyse a fragment, count how many times the innermost statement runs.

A single loop from 0 to n-1 runs n times: O(n).

A loop inside a loop, each to n, runs n² times: O(n²).

A loop that doubles its counter — 1, 2, 4, 8, … up to n — runs log₂ n times: O(log n).

Then drop the constants and the smaller terms. 3n² + 500n + 9000 is O(n²), because at n = 10,000 the n² term is a hundred million and the rest is rounding error. That is not sloppiness; it is the deliberate choice to describe growth rather than a specific machine.`,
    codeExample: {
      language: "c",
      code: `// O(n) — one pass
int sum(int a[], int n) {
    int total = 0;
    for (int i = 0; i < n; i++)
        total += a[i];
    return total;
}

// O(n^2) — every pair
int hasDuplicate(int a[], int n) {
    for (int i = 0; i < n; i++)
        for (int j = i + 1; j < n; j++)
            if (a[i] == a[j]) return 1;
    return 0;
}

// O(log n) — halve the range each step
int binarySearch(int a[], int n, int key) {
    int low = 0, high = n - 1;
    while (low <= high) {
        int mid = low + (high - low) / 2;
        if (a[mid] == key) return mid;
        if (a[mid] < key) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}`,
      explanation:
        "`sum` touches each element once, so its cost is proportional to n. `hasDuplicate` pairs every element with every later one — about n²/2 comparisons, which is O(n²). `binarySearch` discards half the remaining range on every iteration, so it needs only log₂ n iterations; note `low + (high - low) / 2` rather than `(low + high) / 2`, which overflows on large arrays.",
      output: "For n = 1,000,000: sum does 10^6 steps, hasDuplicate about 5x10^11, binarySearch about 20.",
    },
    keyPoints: [
      "Complexity describes growth, not seconds.",
      "Keep the dominant term and drop constants: 3n² + 500n is O(n²).",
      "O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2ⁿ).",
      "Space complexity counts extra memory, not the input.",
      "Worst case is the usual guarantee; average case needs an assumption about the input.",
      "A nested loop is not automatically O(n²) — check what the inner loop actually ranges over.",
    ],
    commonMistakes: [
      "Writing O(2n) or O(n + 3). Constants are dropped: both are O(n).",
      "Assuming two nested loops always give O(n²). If the inner loop runs a fixed number of times, it is O(n).",
      "Confusing best case with average case. Linear search is O(1) at best and O(n) on average.",
      "Counting the input array as auxiliary space.",
    ],
    checkYourUnderstanding: [
      {
        question: "What is the time complexity of a loop that runs from i = 1 to n, doubling i each time?",
        answer:
          "O(log n). The values are 1, 2, 4, 8 … n, so the loop body runs about log₂ n times.",
        hint: "How many times can you double 1 before passing n?",
      },
      {
        question: "Why is O(n log n) considered close to linear in practice?",
        answer:
          "log n grows extremely slowly. At n = 1,000,000, log₂ n is about 20 — so n log n is roughly twenty times n, not a different order of magnitude the way n² is (which would be a million times n).",
      },
      {
        question: "An algorithm does 5n² + 1000n + 200 operations. State its complexity and justify it.",
        answer:
          "O(n²). As n grows the n² term dominates: at n = 10,000 it contributes 5×10⁸ against 10⁷ from the linear term, so the constants and lower-order terms stop mattering.",
      },
    ],
    advancedOverview:
      "Big-O is an upper bound only, which is why theta is the more precise statement when you have one. Beyond worst-case analysis lie amortised analysis (the cost of a *sequence* of operations, which is how a dynamic array's doubling comes out O(1) per insert) and expected-case analysis over a distribution of inputs, which is what makes randomised quicksort O(n log n) in practice despite an O(n²) worst case.",
  },

  {
    canonicalKey: "recursion-its-cost",
    basicExplanation: `A **recursive** function is one that calls itself on a smaller version of the same problem.

Every recursive function needs two things:

1. A **base case** — an input small enough to answer outright, with no further call.
2. A **recursive case** — a step that reduces the problem and calls itself.

Miss the base case and it never stops. Fail to make the problem smaller and it never stops either. Both end the same way: the call stack fills and the program crashes.

The cost is what students usually miss. Each call is not free. The machine pushes a **stack frame** holding the function's parameters, its local variables and the address to return to. A recursion 10,000 deep means 10,000 frames alive at once, and the stack is typically only one to eight megabytes. That is why recursion depth is a real limit and not a theoretical one.`,
    whyItMatters:
      "Trees and graphs are defined recursively, so their traversals are naturally recursive. Knowing what recursion costs is what lets you decide when to convert one into a loop — which is a standard exam question and a standard interview one.",
    realWorldAnalogy:
      "Standing in a queue and wanting to know your position: you ask the person ahead of you what their position is and add one. They ask the person ahead of them. The person at the front knows they are first and answers without asking — that is the base case, and the answer then unwinds back down the queue.",
    terminology: [
      { term: "Base case", meaning: "The input answered directly, ending the recursion." },
      { term: "Recursive case", meaning: "The step that reduces the problem and calls the function again." },
      { term: "Call stack", meaning: "The stack of frames for calls that have started and not yet returned." },
      { term: "Stack frame", meaning: "One call's parameters, locals and return address." },
      { term: "Tail recursion", meaning: "A recursive call that is the very last action, so no frame need be kept." },
      { term: "Stack overflow", meaning: "The crash when the call stack runs out of room." },
    ],
    practicalExplanation: `Factorial is the standard first example, and it is a poor advertisement for recursion — the loop is shorter and cheaper.

The honest case for recursion is a structure that is itself recursive. A binary tree is "a node with a left tree and a right tree", so a traversal that visits the left subtree, the node, then the right subtree is three lines and obviously correct. Written as a loop it needs an explicit stack, and the loop is longer and easier to get wrong.

The rule of thumb: use recursion when the *data* is recursive, and a loop when you are just counting.

Naive recursion can also be catastrophically slow. Fibonacci written recursively recomputes the same subproblems exponentially many times — fib(40) makes over 300 million calls for a value it recalculates constantly. Storing results (memoisation) collapses it back to linear.`,
    codeExample: {
      language: "c",
      code: `// Base case + recursive case
int factorial(int n) {
    if (n <= 1) return 1;          // base case
    return n * factorial(n - 1);   // recursive case
}

// The same thing as a loop: O(1) space instead of O(n)
int factorialLoop(int n) {
    int result = 1;
    for (int i = 2; i <= n; i++) result *= i;
    return result;
}

// Recursion earning its place: the data is recursive
void inorder(struct Node *root) {
    if (root == NULL) return;      // base case
    inorder(root->left);
    printf("%d ", root->data);
    inorder(root->right);
}`,
      explanation:
        "`factorial` uses O(n) time and O(n) *stack* space, because n frames are alive when it reaches the base case. `factorialLoop` is the same O(n) time in O(1) space — for pure counting, the loop wins. `inorder` is where recursion pays: the base case is the empty subtree, and the two calls mirror the definition of a binary tree exactly. Its stack depth is the tree's height, which is about log n for a balanced tree and n for a degenerate one.",
      output: "factorial(5) = 120, and at its deepest 5 frames are on the stack.",
    },
    keyPoints: [
      "Every recursive function needs a base case and a step that makes the problem smaller.",
      "Each call costs a stack frame — recursion uses O(depth) memory even when it uses no arrays.",
      "Stack depth, not total call count, is what causes a stack overflow.",
      "Any recursion can be rewritten as a loop with an explicit stack; the loop is often longer and less clear.",
      "Use recursion when the data is recursive (trees, graphs), a loop when you are counting.",
      "Naive recursion on overlapping subproblems (Fibonacci) is exponential — memoise it.",
    ],
    commonMistakes: [
      "Writing a base case that the recursive calls can never reach — for example decrementing by 2 from an odd number toward a base case of exactly 0.",
      "Forgetting that recursion uses memory. \"It uses no extra space\" is wrong: the stack is extra space.",
      "Assuming recursion is always slower. For tree traversals the difference is negligible and the clarity is worth a great deal.",
      "Recursing on the same size of problem, which loops forever with no visible loop.",
    ],
    checkYourUnderstanding: [
      {
        question: "What are the two parts every recursive function must have, and what happens if either is missing?",
        answer:
          "A base case that returns without recursing, and a recursive case that reduces the problem. Without a base case, or without genuine reduction, the calls never stop and the program crashes with a stack overflow when the call stack is exhausted.",
      },
      {
        question: "What is the space complexity of recursive factorial, and why is it not O(1)?",
        answer:
          "O(n). Although it allocates no arrays, n stack frames are alive simultaneously when the base case is reached — each holds its own copy of n and a return address. The iterative version is O(1) because only one frame ever exists.",
        hint: "Count how many calls have started but not yet returned at the deepest point.",
      },
      {
        question: "Why is recursive Fibonacci exponential when recursive factorial is linear?",
        answer:
          "Factorial makes one recursive call per level, so the calls form a chain of length n. Fibonacci makes two, so the calls form a branching tree of about 2ⁿ nodes — and the same subproblems are recomputed over and over. Memoising the results reduces it to O(n).",
      },
    ],
    advancedOverview:
      "Tail-call optimisation removes the frame when the recursive call is the last action, turning recursion into a jump and the space cost into O(1) — guaranteed in Scheme, common in functional languages, and available but not required in C compilers at -O2. The Master Theorem gives closed-form complexities for divide-and-conquer recurrences of the form T(n) = aT(n/b) + f(n), which is how merge sort's O(n log n) and binary search's O(log n) are derived rather than guessed.",
  },

  // ── Unit 2 ──────────────────────────────────────────────────────────────
  {
    canonicalKey: "singly-linked-lists-insertion-deletion-traversal",
    basicExplanation: `A **singly linked list** stores a sequence as a chain of nodes. Each node holds a value and a pointer to the next node. The last node points to NULL, which is how you know the list has ended.

The list itself is just a pointer to the first node, usually called **head**. There is no block of memory holding the whole list — the nodes can be anywhere, and the pointers are what hold the order.

This is the opposite trade-off from an array:

- An array stores elements side by side, so element *i* is one address calculation away — but inserting at the front means shifting everything.
- A linked list has no such calculation, so reaching element *i* means walking *i* links — but inserting at the front is re-pointing one link.

Neither is better. They are good at different things, and choosing between them is the point of studying both.`,
    whyItMatters:
      "Stacks, queues, trees, graphs and hash tables with chaining are all built on linked nodes. Getting comfortable with pointer manipulation here is what makes all of them straightforward later.",
    realWorldAnalogy:
      "A treasure hunt. Each clue tells you where the next clue is. You cannot skip to the fifth clue — you must follow the first four. But adding a new clue in the middle only means rewriting two of them, however long the hunt is.",
    terminology: [
      { term: "Node", meaning: "One element: a value plus a pointer to the next node." },
      { term: "Head", meaning: "The pointer to the first node — the list's identity." },
      { term: "NULL", meaning: "The end marker in the last node's next pointer." },
      { term: "Traversal", meaning: "Walking from head to NULL, visiting each node." },
      { term: "Dangling pointer", meaning: "A pointer to memory that has already been freed." },
      { term: "Memory leak", meaning: "A node unlinked from the list but never freed." },
    ],
    practicalExplanation: `Three operations, and the order of the pointer assignments is what makes or breaks each one.

**Insert at the front** — O(1). Make the new node point at the current head, then move head to the new node. Do it the other way round and you have lost every node after the first.

**Insert after a node** — O(1) once you are there, O(n) to get there. Point the new node at the current next, then point the current node at the new one. Same trap, same order.

**Delete** — O(n), because you need the *previous* node to re-point it, and a singly linked list has no way back. Keep a trailing pointer while you walk. Free the removed node, or it leaks.

**Traverse** — O(n). Walk a temporary pointer from head until it is NULL. Never move head itself: lose it and the whole list is unreachable.`,
    codeExample: {
      language: "c",
      code: `struct Node {
    int data;
    struct Node *next;
};

// Insert at the front: O(1)
struct Node* insertFront(struct Node *head, int value) {
    struct Node *node = malloc(sizeof(struct Node));
    node->data = value;
    node->next = head;   // point at the old first node FIRST
    return node;         // the new node is now the head
}

// Delete the first node holding \`value\`: O(n)
struct Node* deleteValue(struct Node *head, int value) {
    struct Node *current = head, *previous = NULL;

    while (current != NULL && current->data != value) {
        previous = current;
        current = current->next;
    }
    if (current == NULL) return head;        // not present

    if (previous == NULL) head = current->next;   // it was the head
    else previous->next = current->next;          // bypass it

    free(current);       // or it leaks
    return head;
}

// Traverse: O(n)
void traverse(struct Node *head) {
    for (struct Node *p = head; p != NULL; p = p->next)
        printf("%d -> ", p->data);
    printf("NULL\\n");
}`,
      explanation:
        "In `insertFront`, `node->next = head` must come before the return — the new node has to know the old first node before anything else changes. In `deleteValue`, `previous` exists only because a singly linked list cannot look backwards; the `previous == NULL` branch is the case where the node being deleted is the head itself, which is the case most implementations get wrong. `free(current)` after the bypass, never before: reading `current->next` from freed memory is undefined behaviour that usually appears to work.",
      output: "10 -> 20 -> 30 -> NULL, then after deleting 20: 10 -> 30 -> NULL",
    },
    keyPoints: [
      "A node is a value plus a pointer; the list is a pointer to the first node.",
      "Insert and delete at the front: O(1). Access by index: O(n).",
      "Deletion needs the previous node, so keep a trailing pointer while walking.",
      "Always set the new node's next pointer before changing the existing one.",
      "Free deleted nodes, and free them after the last read of their fields.",
      "Extra memory per element: one pointer. An array has none.",
      "Never advance `head` while traversing — use a temporary pointer.",
    ],
    commonMistakes: [
      "Assigning the pointers in the wrong order on insert, which orphans the rest of the list.",
      "Forgetting the empty-list case (head == NULL) and dereferencing it.",
      "Forgetting the delete-the-head case, which needs head itself to move.",
      "Calling free() before reading current->next.",
      "Losing the head pointer during traversal and leaking the entire list.",
    ],
    checkYourUnderstanding: [
      {
        question: "Why is deletion O(n) in a singly linked list even when you already have a pointer to the node to delete?",
        answer:
          "Because deletion means re-pointing the *previous* node's next pointer, and a singly linked node has no pointer backwards. You must walk from the head to find the predecessor, which is O(n). A doubly linked list stores a prev pointer precisely to make this O(1).",
        hint: "What has to change when a node is removed, and can you reach it from the node itself?",
      },
      {
        question: "What goes wrong if insertFront sets head = node before setting node->next = head?",
        answer:
          "node->next would then point at the new node itself, creating a one-node cycle and losing the rest of the list — every existing node becomes unreachable, and any traversal loops forever.",
      },
      {
        question: "Give one thing an array does better and one thing a linked list does better.",
        answer:
          "An array gives O(1) access by index and uses no extra memory per element, and its contiguous layout is far friendlier to the CPU cache. A linked list gives O(1) insertion and deletion at the front and grows without needing a contiguous block or a reallocation.",
      },
    ],
    advancedOverview:
      "The asymptotic comparison understates arrays in practice: contiguous memory means a linear scan of an array is one cache line miss per several elements, while a linked list is potentially one per node — often a 10x difference in wall-clock time at the same complexity. This is why real containers (C++ std::vector, Java ArrayList, Python list) are array-backed with amortised doubling, and why linked lists survive mainly where nodes must be spliced without invalidating other pointers: intrusive kernel lists, LRU caches paired with a hash map, and free lists in allocators.",
  },

  // ── Unit 3 ──────────────────────────────────────────────────────────────
  {
    canonicalKey: "stack-adt-array-linked-implementations",
    basicExplanation: `A **stack** is a collection where the last item added is the first one removed — **LIFO**, last in first out. Only one end is ever touched, and that end is called the **top**.

Four operations:

- **push(x)** — put x on the top.
- **pop()** — remove and return the top.
- **peek()** — read the top without removing it.
- **isEmpty()** — is there anything there?

There is no operation to reach the middle. That is not a limitation the implementation happens to have; it is the definition. A structure that let you reach the middle would not be a stack, and the restriction is what makes stacks useful — it guarantees the order things come back out.

All four operations are O(1) in both standard implementations, which is the other reason stacks are everywhere.`,
    whyItMatters:
      "The call stack that makes recursion work is one of these. So is expression evaluation, so is undo, so is the backtracking in every maze and puzzle solver. Postfix conversion and evaluation are near-certain exam questions.",
    realWorldAnalogy:
      "A stack of plates in a canteen. You add to the top and take from the top. Getting the bottom plate means removing every plate above it first — there is no reaching in.",
    terminology: [
      { term: "LIFO", meaning: "Last in, first out — the stack's ordering rule." },
      { term: "Top", meaning: "The end where all operations happen." },
      { term: "Overflow", meaning: "Pushing onto a full array-backed stack." },
      { term: "Underflow", meaning: "Popping from an empty stack." },
      { term: "Infix / postfix", meaning: "a + b versus a b + — postfix needs no brackets or precedence rules." },
    ],
    practicalExplanation: `**Array implementation.** Keep an array and an integer \`top\`, starting at -1. Push increments top and writes; pop reads and decrements. Simple and fast, and the memory is contiguous so it is cache-friendly. The cost: a fixed capacity, so push must check for overflow.

**Linked implementation.** Keep a head pointer and push at the front. No capacity limit, but one pointer of overhead per element and a malloc per push.

Both are O(1) for every operation. Choose the array when you know a bound, the linked list when you do not.

**The classic application** is expression evaluation. Infix — 2 + 3 × 4 — needs precedence rules and brackets. Postfix — 2 3 4 × + — needs neither: scan left to right, push operands, and on an operator pop two, apply, push the result. When the scan finishes, the single value left on the stack is the answer. Compilers convert infix to postfix for exactly this reason.`,
    codeExample: {
      language: "c",
      code: `#define MAX 100

struct Stack {
    int items[MAX];
    int top;        // -1 when empty
};

void init(struct Stack *s)     { s->top = -1; }
int  isEmpty(struct Stack *s)  { return s->top == -1; }
int  isFull(struct Stack *s)   { return s->top == MAX - 1; }

void push(struct Stack *s, int value) {
    if (isFull(s)) { printf("Overflow\\n"); return; }
    s->items[++s->top] = value;
}

int pop(struct Stack *s) {
    if (isEmpty(s)) { printf("Underflow\\n"); return -1; }
    return s->items[s->top--];
}

// Evaluate a postfix expression: "2 3 4 * +" -> 14
int evaluatePostfix(char *expr) {
    struct Stack s; init(&s);

    for (int i = 0; expr[i]; i++) {
        if (isdigit(expr[i])) {
            push(&s, expr[i] - '0');
        } else if (expr[i] != ' ') {
            int b = pop(&s);         // second operand comes off FIRST
            int a = pop(&s);
            switch (expr[i]) {
                case '+': push(&s, a + b); break;
                case '-': push(&s, a - b); break;
                case '*': push(&s, a * b); break;
                case '/': push(&s, a / b); break;
            }
        }
    }
    return pop(&s);
}`,
      explanation:
        "`++s->top` increments before writing, so the first push lands at index 0; `s->top--` reads before decrementing, so pop returns the right element. In `evaluatePostfix`, the pop order matters and is the mistake most students make: the *second* operand is on top, so `b` must be popped before `a` — get it backwards and subtraction and division silently give the wrong answer while addition and multiplication still look right.",
      output: "evaluatePostfix(\"2 3 4 * +\") returns 14, because 3*4=12 is pushed, then 2+12.",
    },
    keyPoints: [
      "LIFO: the last element pushed is the first popped.",
      "push, pop, peek and isEmpty are all O(1) in both implementations.",
      "There is no access to the middle — that restriction is the definition.",
      "Array-backed: fixed capacity, must check overflow, cache-friendly.",
      "Linked: unbounded, one pointer overhead per element, a malloc per push.",
      "In postfix evaluation the second operand pops first.",
      "The function call stack is a stack — which is why deep recursion overflows.",
    ],
    commonMistakes: [
      "Popping the operands in the wrong order, which breaks - and / but not + and *.",
      "Initialising top to 0 instead of -1, wasting index 0 or reading uninitialised memory.",
      "Popping without checking isEmpty, returning whatever happens to be in memory.",
      "Trying to access items[i] for a middle i — legal C, but no longer a stack.",
    ],
    checkYourUnderstanding: [
      {
        question: "Convert 2 + 3 * (4 - 1) to postfix.",
        answer:
          "2 3 4 1 - * +. The bracket forces 4 - 1 first, then the multiplication by 3, then the addition — and the postfix form needs no brackets because the order is now positional.",
        hint: "Work out the evaluation order first, then write each operator immediately after its two operands.",
      },
      {
        question: "Why must the second operand be popped first when evaluating postfix?",
        answer:
          "The operands were pushed left to right, so the right-hand operand is on top. For \"5 3 -\", 3 is popped first and 5 second, giving 5 - 3 = 2. Popping in the other order would compute 3 - 5.",
      },
      {
        question: "Both implementations are O(1) for every operation. Give one practical reason to choose each.",
        answer:
          "Choose the array when you know an upper bound on the size: no allocation per push and contiguous memory that the cache handles well. Choose the linked version when the size is unpredictable and an overflow would be worse than the per-node pointer and malloc cost.",
      },
    ],
    advancedOverview:
      "The infix-to-postfix conversion above is the shunting-yard algorithm, and it generalises: give each operator a precedence and an associativity and the same single-stack scan handles unary operators, right-associative exponentiation and function calls. Production parsers use the same idea as precedence climbing. A stack-based virtual machine — the JVM, CPython's evaluator, WebAssembly — is this evaluation loop over an instruction stream rather than a string, which is why compiling to postfix and compiling to bytecode look so similar.",
  },

  // ── Unit 4 ──────────────────────────────────────────────────────────────
  {
    canonicalKey: "tree-traversals-inorder-preorder-postorder",
    basicExplanation: `A **traversal** visits every node in a tree exactly once. Unlike a list, a tree has no single obvious order — so there are several, and each is useful for something different.

The three depth-first traversals differ only in *when the node itself is visited* relative to its subtrees:

- **Inorder** — left subtree, node, right subtree.
- **Preorder** — node, left subtree, right subtree.
- **Postorder** — left subtree, right subtree, node.

The two recursive calls are always left then right. The only thing that moves is where you print.

That single difference produces three genuinely different useful orders. On a binary search tree, inorder emits the values in sorted order — that is not a coincidence, it is what the BST ordering property means. Preorder visits a parent before its children, which is what you want to copy a tree. Postorder visits children before their parent, which is what you want to free one.`,
    whyItMatters:
      "Almost every tree algorithm is a traversal with work done at the visit. \"Write the inorder traversal\" and \"given these two traversals, reconstruct the tree\" are both standard exam questions.",
    realWorldAnalogy:
      "Reading a table of contents. Preorder is reading it top to bottom — chapter title, then its sections. Postorder is totalling page counts: you cannot state a chapter's total until you have added up all its sections.",
    terminology: [
      { term: "Root", meaning: "The node with no parent." },
      { term: "Leaf", meaning: "A node with no children." },
      { term: "Subtree", meaning: "Any node together with all its descendants." },
      { term: "Height", meaning: "The longest path from a node down to a leaf." },
      { term: "Depth-first", meaning: "Go as deep as possible before backtracking — the three traversals here." },
      { term: "Level order", meaning: "Visit level by level, breadth-first, using a queue rather than recursion." },
    ],
    practicalExplanation: `Take this tree:

\`\`\`
        1
       / \\
      2   3
     / \\
    4   5
\`\`\`

- **Inorder** (left, node, right): 4 2 5 1 3
- **Preorder** (node, left, right): 1 2 4 5 3
- **Postorder** (left, right, node): 4 5 2 3 1

Where each is used:

- **Inorder** on a BST gives sorted output. It is also how expression trees are printed back as infix.
- **Preorder** serialises a tree — the first element is always the root, which is what makes reconstruction possible.
- **Postorder** handles anything where children must be finished first: freeing memory, computing directory sizes, evaluating an expression tree.

All three are O(n) in time and O(h) in stack space, where h is the height — about log n for a balanced tree and n for a degenerate one.

One reconstruction fact worth remembering: **inorder plus either preorder or postorder** determines the tree uniquely. Preorder plus postorder does not.`,
    codeExample: {
      language: "c",
      code: `struct Node {
    int data;
    struct Node *left, *right;
};

// Left, node, right — sorted output on a BST
void inorder(struct Node *root) {
    if (root == NULL) return;
    inorder(root->left);
    printf("%d ", root->data);
    inorder(root->right);
}

// Node, left, right — the root comes out first
void preorder(struct Node *root) {
    if (root == NULL) return;
    printf("%d ", root->data);
    preorder(root->left);
    preorder(root->right);
}

// Left, right, node — children finished before the parent
void postorder(struct Node *root) {
    if (root == NULL) return;
    postorder(root->left);
    postorder(root->right);
    printf("%d ", root->data);
}

// Postorder doing real work: free the whole tree safely
void destroy(struct Node *root) {
    if (root == NULL) return;
    destroy(root->left);
    destroy(root->right);
    free(root);           // only after both children are gone
}`,
      explanation:
        "The three functions are identical apart from the position of the printf — the recursive calls never change order. `destroy` is postorder for a reason that is not stylistic: freeing the root first would leave `root->left` a read of freed memory, which is undefined behaviour that usually appears to work in testing and crashes elsewhere.",
      output: "For the tree above: inorder 4 2 5 1 3, preorder 1 2 4 5 3, postorder 4 5 2 3 1",
    },
    keyPoints: [
      "The three traversals differ only in where the node is visited; the calls are always left then right.",
      "Inorder on a BST produces sorted order.",
      "Preorder visits the root first, which is what makes it useful for copying and serialising.",
      "Postorder visits children first, which is what makes it correct for freeing and for evaluation.",
      "All three are O(n) time and O(h) stack space.",
      "Inorder plus preorder, or inorder plus postorder, reconstructs the tree uniquely. Preorder plus postorder does not.",
      "Level order is the fourth traversal and needs a queue, not recursion.",
    ],
    commonMistakes: [
      "Swapping the left and right calls, which reverses the output.",
      "Omitting the NULL base case and dereferencing a null pointer at the first leaf.",
      "Freeing a node before recursing into its children.",
      "Believing preorder and postorder together determine a tree — they do not.",
    ],
    checkYourUnderstanding: [
      {
        question: "Preorder is 1 2 4 5 3 and inorder is 4 2 5 1 3. What is the root, and what is in the left subtree?",
        answer:
          "The root is 1 — preorder always visits the root first. Locating 1 in the inorder sequence splits it: everything before it (4 2 5) is the left subtree and everything after (3) is the right. Recursing on each half rebuilds the whole tree.",
        hint: "Use preorder to identify the root, then use inorder to split around it.",
      },
      {
        question: "Why must a tree be freed in postorder rather than preorder?",
        answer:
          "Freeing the parent first invalidates the pointers to its children — reading root->left after free(root) is undefined behaviour and the children become unreachable, leaking. Postorder frees both subtrees while the parent is still valid, then frees the parent last.",
      },
      {
        question: "What is the space complexity of a recursive inorder traversal, and when is it worst?",
        answer:
          "O(h), where h is the height, because that is the maximum number of frames alive at once. It is worst for a degenerate tree — one where every node has a single child — which has height n and therefore O(n) stack usage.",
      },
    ],
    advancedOverview:
      "Morris traversal achieves inorder in O(1) space by temporarily rewriting NULL right-pointers of a subtree's rightmost node into threads back to the successor, then undoing them on the way through — the basis of threaded binary trees. Level-order (BFS) is the odd one out: it needs a queue rather than a stack, which is exactly the difference between BFS and DFS on a general graph, and it is what makes it the traversal that finds shortest paths in an unweighted structure.",
  },

  // ── Unit 5 ──────────────────────────────────────────────────────────────
  {
    canonicalKey: "breadth-first-search",
    basicExplanation: `**Breadth-first search** explores a graph level by level: first the starting vertex, then everything one edge away, then everything two edges away, and so on.

It needs two things:

- A **queue** of vertices discovered but not yet explored.
- A **visited** marker for every vertex.

The loop is short. Take a vertex off the front of the queue, look at its neighbours, and for each one not yet visited, mark it and put it on the back. Repeat until the queue is empty.

The queue is what makes it breadth-first. A stack in the same algorithm gives depth-first search — that is the entire difference between the two, and it is worth remembering as one fact rather than two algorithms.

The visited marker is not an optimisation. Without it a cycle makes the loop run forever, and a vertex reachable by several paths is processed several times.`,
    whyItMatters:
      "BFS finds the shortest path in an unweighted graph, which is why it turns up in routing, in social-network degrees of separation and in every puzzle asking for the fewest moves. It is also one of the most frequently asked interview algorithms.",
    realWorldAnalogy:
      "News spreading through a group of friends. On day one you tell your friends. On day two they tell theirs. Everyone hears it in the fewest hops from you — which is exactly what BFS computes.",
    terminology: [
      { term: "Vertex", meaning: "A node of the graph." },
      { term: "Edge", meaning: "A connection between two vertices." },
      { term: "Adjacent", meaning: "Two vertices joined by an edge — neighbours." },
      { term: "Visited set", meaning: "The vertices already discovered, so none is processed twice." },
      { term: "Frontier", meaning: "The queue's contents — everything discovered but not yet explored." },
      { term: "Unweighted graph", meaning: "One where every edge counts the same; BFS finds shortest paths only here." },
    ],
    practicalExplanation: `Mark the start visited and enqueue it. Then, while the queue is not empty: dequeue a vertex, process it, and enqueue every unvisited neighbour — marking each visited *as it is enqueued*, not when it is dequeued.

That timing matters. Marking on dequeue lets a vertex with two discovered edges enter the queue twice, which duplicates work and, on a large graph, blows up the queue.

Cost is O(V + E) with an adjacency list: every vertex is enqueued once and every edge is examined once. With an adjacency matrix it degrades to O(V²), because finding the neighbours of a vertex means scanning a whole row of V entries whether or not the edges exist.

For shortest paths, keep a distance array alongside: distance[neighbour] = distance[current] + 1 when you discover it. Because BFS reaches every vertex by the fewest edges, this is the shortest path — no relaxation and no re-examination needed, which is exactly what Dijkstra's algorithm has to add once edges carry different weights.`,
    codeExample: {
      language: "c",
      code: `// BFS over an adjacency list, recording distance from the source
void bfs(struct Graph *g, int start) {
    int visited[MAX] = {0};
    int distance[MAX];
    int queue[MAX], front = 0, rear = 0;

    visited[start] = 1;      // mark on ENQUEUE, not on dequeue
    distance[start] = 0;
    queue[rear++] = start;

    while (front < rear) {
        int current = queue[front++];
        printf("%d ", current);

        for (struct Node *n = g->adj[current]; n != NULL; n = n->next) {
            if (!visited[n->vertex]) {
                visited[n->vertex] = 1;
                distance[n->vertex] = distance[current] + 1;
                queue[rear++] = n->vertex;
            }
        }
    }
}`,
      explanation:
        "`visited[n->vertex] = 1` sits inside the discovery branch, before the enqueue — marking after the dequeue instead would let a vertex with two edges into it be queued twice. `distance[current] + 1` is correct without any later correction because BFS reaches each vertex by the fewest edges the first time it sees it. Swapping the queue for a stack — `queue[--rear]` instead of `queue[front++]` — turns this same function into DFS, and the distances stop being shortest paths.",
      output: "From vertex 0 on a graph 0-1, 0-2, 1-3, 2-3: visits 0 1 2 3, distances 0 1 1 2.",
    },
    keyPoints: [
      "BFS uses a queue; DFS uses a stack. That is the whole difference.",
      "Mark a vertex visited when you enqueue it, not when you dequeue it.",
      "O(V + E) with an adjacency list, O(V²) with an adjacency matrix.",
      "Finds the shortest path in an *unweighted* graph, and only there.",
      "Space is O(V) — the queue can hold an entire level at once.",
      "Without the visited set, a cycle loops forever.",
      "A disconnected graph needs BFS started again from each unvisited vertex.",
    ],
    commonMistakes: [
      "Marking visited on dequeue, which lets duplicates into the queue.",
      "Using BFS for shortest paths on a weighted graph — that needs Dijkstra.",
      "Forgetting that one BFS reaches only one connected component.",
      "Using an adjacency matrix on a sparse graph and paying O(V²) unnecessarily.",
    ],
    checkYourUnderstanding: [
      {
        question: "Why does BFS find the shortest path in an unweighted graph while DFS does not?",
        answer:
          "BFS explores in order of distance from the source: everything one edge away before anything two edges away. So the first time it reaches a vertex is necessarily by the fewest edges. DFS follows one path as deep as it goes, and may reach a vertex by a long route before ever seeing the short one.",
        hint: "Think about the order in which each visits vertices relative to their distance from the start.",
      },
      {
        question: "What happens if the visited check is removed on a graph containing a cycle?",
        answer:
          "The algorithm never terminates. Vertices in the cycle are re-enqueued endlessly, each re-enqueueing the next, and the queue grows without bound until memory runs out.",
      },
      {
        question: "State the time complexity of BFS for both graph representations and explain the difference.",
        answer:
          "O(V + E) with an adjacency list: each vertex is enqueued once and each edge examined once. O(V²) with an adjacency matrix: finding a vertex's neighbours means scanning all V entries of its row regardless of how many edges actually exist, so V vertices cost V² work.",
      },
    ],
    advancedOverview:
      "BFS is the unweighted special case of Dijkstra's algorithm — replace the queue with a priority queue keyed on distance and you have it, which is why Dijkstra reduces to BFS when every weight is 1. Bidirectional BFS searches from both endpoints and meets in the middle, cutting the explored frontier from b^d to roughly 2b^(d/2) — a decisive difference on large graphs. On a graph with weights of only 0 and 1, 0-1 BFS with a deque recovers O(V + E) where Dijkstra would cost O(E log V).",
  },

  {
    canonicalKey: "binary-search-trees-insertion-deletion-search",
    basicExplanation: `A **binary search tree** is a binary tree with one extra rule, applied at every node:

> everything in the left subtree is smaller than this node, and everything in the right subtree is larger.

That single invariant is what the whole structure is for. It means a search never has to look at both subtrees: compare with the node, and the comparison tells you which half to discard. Each step throws away roughly half the remaining tree, which is why search, insertion and deletion are all O(h) — where h is the height.

And that is the catch. For a **balanced** tree h is about log₂ n, so a million nodes take twenty comparisons. But insert already-sorted data and every node becomes a right child: the tree degenerates into a linked list, h becomes n, and every operation is O(n). The structure has not broken — it is still a valid BST — it has simply lost the property that made it worth using. Fixing that is what AVL and red-black trees are for.`,
    whyItMatters:
      "The BST invariant is the idea behind database indexes, the ordered maps in every standard library, and file-system directory structures. Deletion of a node with two children is one of the most commonly asked exam and interview questions.",
    realWorldAnalogy:
      "A well-organised filing cabinet where you know at each drawer whether what you want sorts before or after it. You never search a drawer you can rule out — but if every file happened to go in the last drawer, you would be back to looking through all of them.",
    terminology: [
      { term: "BST property", meaning: "Left subtree < node < right subtree, at every node." },
      { term: "Height (h)", meaning: "The longest root-to-leaf path — what every operation actually costs." },
      { term: "Balanced", meaning: "Height about log n, so the halving actually happens." },
      { term: "Degenerate", meaning: "Every node has one child; the tree is a list and h = n." },
      { term: "Inorder successor", meaning: "The next value in sorted order — the leftmost node of the right subtree." },
      { term: "Leaf", meaning: "A node with no children." },
    ],
    practicalExplanation: `**Search.** Compare with the root. Equal, done. Smaller, go left. Larger, go right. NULL, not present. O(h).

**Insertion.** Search for the value; where the search falls off the tree is where the new node belongs. Always a leaf, so no existing node moves. O(h).

**Deletion** is the one with cases, and the third is the one that gets asked:

1. **Leaf** — remove it and set the parent's pointer to NULL.
2. **One child** — bypass it: point the parent at the only child.
3. **Two children** — you cannot simply remove it, because two subtrees would be orphaned. Instead find its **inorder successor** (the smallest value in the right subtree — go right once, then left until you cannot), copy that value into the node, and delete the successor from the right subtree. The successor has at most one child by construction, so this second deletion is always case 1 or case 2 and the recursion cannot go deeper than once.

Copying the successor's *value* rather than moving nodes is what keeps this correct: the successor is by definition larger than everything on the left and smaller than everything remaining on the right, so the BST property survives.`,
    codeExample: {
      language: "c",
      code: `struct Node { int key; struct Node *left, *right; };

// O(h): each comparison discards one subtree
struct Node* search(struct Node *root, int key) {
    if (root == NULL || root->key == key) return root;
    return key < root->key ? search(root->left, key)
                           : search(root->right, key);
}

// O(h): the new node always lands as a leaf
struct Node* insert(struct Node *root, int key) {
    if (root == NULL) return newNode(key);
    if (key < root->key)      root->left  = insert(root->left, key);
    else if (key > root->key) root->right = insert(root->right, key);
    return root;              // duplicates ignored
}

struct Node* minValueNode(struct Node *node) {
    while (node->left != NULL) node = node->left;
    return node;              // leftmost = smallest
}

struct Node* deleteNode(struct Node *root, int key) {
    if (root == NULL) return NULL;

    if (key < root->key)      root->left  = deleteNode(root->left, key);
    else if (key > root->key) root->right = deleteNode(root->right, key);
    else {
        // Case 1 and 2: no child, or one child
        if (root->left == NULL)  { struct Node *r = root->right; free(root); return r; }
        if (root->right == NULL) { struct Node *l = root->left;  free(root); return l; }

        // Case 3: two children
        struct Node *successor = minValueNode(root->right);
        root->key = successor->key;                              // copy the value
        root->right = deleteNode(root->right, successor->key);   // delete the successor
    }
    return root;
}`,
      explanation:
        "Each function returns the (possibly new) subtree root and the caller reassigns it — `root->left = insert(root->left, key)` — which is what removes the need for a separate parent pointer. In `deleteNode`, the two-children case copies only the key and then deletes the successor from the right subtree; because the successor is the leftmost node there, it has no left child, so that recursive call always lands in case 1 or 2 and terminates immediately.",
      output: "Insert 50, 30, 70, 20, 40. Inorder gives 20 30 40 50 70. Delete 30 and it gives 20 40 50 70.",
    },
    keyPoints: [
      "The BST property holds at every node, not just the root.",
      "Search, insert and delete are all O(h) — not O(log n) unless the tree is balanced.",
      "Balanced: h is about log₂ n. Degenerate: h = n and everything is O(n).",
      "Inserting sorted data produces the degenerate case — the worst possible input.",
      "Insertion always creates a leaf; no existing node moves.",
      "Deletion has three cases; the two-child case uses the inorder successor.",
      "An inorder traversal of a BST is sorted output, which is a free O(n) sort.",
    ],
    commonMistakes: [
      "Checking the BST property only against the immediate parent. A node in the left subtree must be smaller than *every* ancestor it hangs below on the right.",
      "Claiming BST operations are O(log n) unconditionally. They are O(h).",
      "In the two-child deletion, deleting the successor node directly instead of recursing — which orphans its right child.",
      "Using the inorder *predecessor* while describing it as the successor. Both work; mixing up the names loses marks.",
    ],
    checkYourUnderstanding: [
      {
        question: "Insert 10, 20, 30, 40, 50 in that order. What shape results, and what does search now cost?",
        answer:
          "Each value is larger than everything before it, so each becomes the right child of the previous — a degenerate right-leaning chain of height 5. Search is O(n), exactly a linked list. This is why self-balancing trees exist.",
        hint: "Draw it. Where does each new value go relative to the last?",
      },
      {
        question: "When deleting a node with two children, why the inorder successor specifically?",
        answer:
          "The inorder successor is the smallest value in the right subtree, so it is larger than everything in the left subtree and smaller than everything else in the right — the only value that can sit in that position and preserve the BST property at that node. (The inorder predecessor, the largest in the left subtree, works equally well for the symmetric reason.)",
      },
      {
        question: "Why is deleting the inorder successor never itself a two-child case?",
        answer:
          "The successor is found by going right once and then left as far as possible, so it is by construction the leftmost node of that subtree and has no left child. With at most a right child, its deletion is always case 1 or case 2, and the recursion stops after one step.",
      },
    ],
    advancedOverview:
      "Self-balancing variants restore h = O(log n) by rotating after modification: AVL trees keep the height difference of any node's subtrees within 1, giving faster lookups; red-black trees allow a looser balance, giving faster insertion and deletion, and are what most standard libraries ship (C++ std::map, Java TreeMap). Databases use B-trees and B+-trees instead — a node holds hundreds of keys so the tree is only three or four levels deep, which matters because the cost there is disk seeks rather than comparisons.",
  },
];
