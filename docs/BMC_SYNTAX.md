# BMC Assembly Syntax Reference

Big Man Computer (BMC) is an enhanced version of the Little Man Computer (LMC) instruction set. It provides a simple assembly language for learning about CPU architecture and instruction execution.

## Assembly Format

```
[label:] OPCODE [operand] [; comment]
```

- **Labels** end with a colon (e.g., `loop:`) and mark memory addresses for branching
- **Opcodes** are case-insensitive (e.g., `ADD`, `add`, `Add` are equivalent)
- **Operands** are either memory addresses (0–99) or label references
- **Comments** start with `;` and continue to the end of the line
- Blank lines are ignored

## Instruction Set

### Data Movement

| Instruction | Opcode | Operand | Description |
|-------------|--------|---------|-------------|
| `LDA addr`  | 1      | Address | Load value from memory address into Accumulator |
| `STA addr`  | 2      | Address | Store Accumulator value into memory address |

### Arithmetic

| Instruction | Opcode | Operand | Description |
|-------------|--------|---------|-------------|
| `ADD addr`  | 3      | Address | Add value at memory address to Accumulator |
| `SUB addr`  | 4      | Address | Subtract value at memory address from Accumulator |
| `MUL addr`  | 5      | Address | Multiply Accumulator by value at memory address |
| `DIV addr`  | 6      | Address | Divide Accumulator by value at memory address (integer division) |
| `MOD addr`  | 7      | Address | Accumulator modulo value at memory address |

### Input/Output

| Instruction | Opcode | Operand | Description |
|-------------|--------|---------|-------------|
| `INP`       | 8      | None    | Read a number from input into Accumulator |
| `OUT`       | 9      | None    | Output Accumulator value as a number |
| `OTC`       | 10     | None    | Output Accumulator value as an ASCII character |

### Control Flow

| Instruction | Opcode | Operand | Description |
|-------------|--------|---------|-------------|
| `HLT`       | 11     | None    | Halt program execution |
| `BRA addr`  | 12     | Address | Branch always (unconditional jump) |
| `BRZ addr`  | 13     | Address | Branch if Accumulator is zero |
| `BRP addr`  | 14     | Address | Branch if Accumulator is positive (≥ 0) |

### Bitwise Operations

| Instruction | Opcode | Operand | Description |
|-------------|--------|---------|-------------|
| `AND addr`  | 15     | Address | Bitwise AND Accumulator with value at memory address |
| `OR addr`   | 16     | Address | Bitwise OR Accumulator with value at memory address |
| `NOT`       | 17     | None    | Bitwise NOT of Accumulator |

### Data Definition

| Instruction | Opcode | Operand | Description |
|-------------|--------|---------|-------------|
| `DAT value` | 18     | Value   | Define a data value at this memory location |

## CPU Registers

| Register | Name | Description |
|----------|------|-------------|
| **ACC**  | Accumulator | Main working register for arithmetic and I/O |
| **PC**   | Program Counter | Address of the next instruction to execute |
| **MAR**  | Memory Address Register | Holds the address being accessed |
| **MDR**  | Memory Data Register | Holds the data being read/written |
| **CIR**  | Current Instruction Register | Holds the current instruction being executed |
| **SR**   | Status Register | Flags: Z (Zero), P (Positive), N (Negative) |

## Memory

- **100 memory locations** (addresses 0–99)
- Each location stores an integer value
- Program instructions are loaded starting at address 0
- `DAT` values are placed at their instruction address

## Fetch-Decode-Execute Cycle

Each step of execution follows this cycle:

1. **Fetch**: PC → MAR, Memory[MAR] → MDR, MDR → CIR, PC incremented
2. **Decode**: CIR split into opcode and operand
3. **Execute**: Instruction performed, SR flags updated

## Status Register Flags

After each arithmetic operation, the Status Register is updated:

- **Z** (Zero): ACC == 0
- **P** (Positive): ACC > 0
- **N** (Negative): ACC < 0

## Example Programs

### Add Two Numbers
```
        INP         ; Read first number
        STA first   ; Store it
        INP         ; Read second number
        ADD first   ; Add first number
        OUT         ; Output result
        HLT         ; Stop
first:  DAT 0       ; Storage for first number
```

### Countdown from 10
```
        LDA ten     ; Load 10
loop:   OUT         ; Output current value
        SUB one     ; Subtract 1
        BRP loop    ; If positive, continue loop
        HLT         ; Stop
ten:    DAT 10      ; Starting value
one:    DAT 1       ; Decrement value
```

### Multiply Two Numbers
```
        INP         ; Read first number
        STA num1    ; Store it
        INP         ; Read second number
        STA num2    ; Store it
        LDA num1    ; Load first
        MUL num2    ; Multiply by second
        OUT         ; Output result
        HLT         ; Stop
num1:   DAT 0
num2:   DAT 0
```

### Print "HI" (ASCII)
```
        LDA h       ; Load 'H' (72)
        OTC         ; Output as character
        LDA i       ; Load 'I' (73)
        OTC         ; Output as character
        HLT
h:      DAT 72      ; ASCII 'H'
i:      DAT 73      ; ASCII 'I'
```

### Fibonacci Sequence (first 10 numbers)
```
        LDA one     ; a = 1
        STA a
        LDA zero    ; b = 0
        STA b
        LDA ten     ; counter = 10
        STA count
loop:   LDA a       ; Output a
        OUT
        LDA a       ; temp = a + b
        ADD b
        STA temp
        LDA a       ; b = a
        STA b
        LDA temp    ; a = temp
        STA a
        LDA count   ; counter--
        SUB one
        STA count
        BRP loop    ; If counter >= 0, continue
        HLT
zero:   DAT 0
one:    DAT 1
ten:    DAT 10
a:      DAT 0
b:      DAT 0
temp:   DAT 0
count:  DAT 0
```
