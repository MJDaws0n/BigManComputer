// BMC Client-Side Virtual Machine
// Parses and runs BMC assembly entirely in the browser.
// No network calls needed for run/step - only export/save/load use the server.

const BMC = (() => {

    // Opcode constants
    const OP = {
        LDA: 1, STA: 2, ADD: 3, SUB: 4, MUL: 5, DIV: 6, MOD: 7,
        INP: 8, OUT: 9, OTC: 10, HLT: 11, BRA: 12, BRZ: 13,
        BRP: 14, AND: 15, OR: 16, NOT: 17, DAT: 18
    };

    const OP_NAMES = {
        1:'LDA', 2:'STA', 3:'ADD', 4:'SUB', 5:'MUL', 6:'DIV', 7:'MOD',
        8:'INP', 9:'OUT', 10:'OTC', 11:'HLT', 12:'BRA', 13:'BRZ',
        14:'BRP', 15:'AND', 16:'OR', 17:'NOT', 18:'DAT', 0:'---'
    };

    function parseOpcode(s) {
        const map = {
            'LDA':1,'STA':2,'ADD':3,'SUB':4,'MUL':5,'DIV':6,'MOD':7,
            'INP':8,'OUT':9,'OTC':10,'HLT':11,'BRA':12,'BRZ':13,
            'BRP':14,'AND':15,'OR':16,'NOT':17,'DAT':18
        };
        return map[s.toUpperCase()] || 0;
    }

    function hasOperand(op) {
        return op >= 1 && op <= 7 || op === 12 || op === 13 || op === 14
            || op === 15 || op === 16 || op === 18;
    }

    // ---- Parser ----

    function parse(code) {
        const lines = code.split('\n');
        const labelNames = [];
        const labelAddrs = [];
        const opcodes = [];
        const operands = [];
        let addr = 0;

        // Pass 1: collect labels and instructions
        for (const raw of lines) {
            let line = raw.replace(/;.*$/, '').trim();
            if (!line) continue;

            let label = null;
            const colonIdx = line.indexOf(':');
            if (colonIdx >= 0) {
                const beforeColon = line.substring(0, colonIdx).trim();
                // Only treat as label if it's a simple identifier
                if (/^[A-Za-z_]\w*$/.test(beforeColon)) {
                    label = beforeColon;
                    line = line.substring(colonIdx + 1).trim();
                }
            }

            if (label) {
                labelNames.push(label);
                labelAddrs.push(addr);
            }

            if (!line) { addr++; continue; }

            const tokens = line.split(/\s+/);
            const mnemonic = tokens[0].toUpperCase();
            const op = parseOpcode(mnemonic);

            if (op === 0) {
                return { error: 'Unknown instruction: ' + mnemonic };
            }

            let operand = 0;
            if (tokens.length > 1) {
                const opStr = tokens[1];
                const numVal = parseInt(opStr, 10);
                if (!isNaN(numVal)) {
                    operand = numVal;
                } else {
                    operand = -999; // placeholder for label
                    // Store label name for resolution
                    opcodes.push(op);
                    operands.push(opStr);
                    addr++;
                    continue;
                }
            }

            opcodes.push(op);
            operands.push(operand);
            addr++;
        }

        // Pass 2: resolve labels
        for (let i = 0; i < operands.length; i++) {
            if (typeof operands[i] === 'string') {
                const labelIdx = labelNames.indexOf(operands[i]);
                if (labelIdx >= 0) {
                    operands[i] = labelAddrs[labelIdx];
                } else {
                    return { error: 'Unknown label: ' + operands[i] };
                }
            }
        }

        return { opcodes, operands, instCount: opcodes.length };
    }

    // ---- VM State ----

    function createVM(parsed) {
        const memory = new Array(100).fill(0);
        const { opcodes, operands, instCount } = parsed;

        // Load opcodes into memory and initialise DAT values
        for (let i = 0; i < instCount && i < 100; i++) {
            // Encode instruction: opcode * 100 + operand (LMC-style encoding)
            if (opcodes[i] === OP.DAT) {
                memory[i] = operands[i] || 0;
            } else if (hasOperand(opcodes[i])) {
                memory[i] = opcodes[i] * 100 + (operands[i] || 0);
            } else {
                memory[i] = opcodes[i] * 100;
            }
        }

        return {
            acc: 0,
            pc: 0,
            mar: 0,
            mdr: 0,
            cir: 0,       // opcode number
            cirName: '---',
            sr: 'Z',      // Z=zero, P=positive, N=negative
            halted: false,
            output: '',
            error: '',
            inputBuf: '',  // queued input
            memory,
            opcodes,       // raw opcodes array
            operands,      // raw operands array
            instCount
        };
    }

    // ---- Execution ----

    function step(vm) {
        if (vm.halted) return vm;
        if (vm.error === 'WAITING_INPUT') return vm;

        const pc = vm.pc;
        if (pc < 0 || pc >= vm.instCount) {
            vm.halted = true;
            vm.error = 'PC out of range';
            return vm;
        }

        const opcode = vm.opcodes[pc];
        const operand = vm.operands[pc];
        vm.cir = opcode;
        vm.cirName = OP_NAMES[opcode] || '???';
        vm.mar = operand || 0;
        vm.pc = pc + 1;

        switch (opcode) {
            case OP.LDA:
                vm.mar = operand;
                vm.mdr = vm.memory[operand] || 0;
                vm.acc = vm.mdr;
                break;
            case OP.STA:
                vm.mar = operand;
                vm.mdr = vm.acc;
                vm.memory[operand] = vm.acc;
                break;
            case OP.ADD:
                vm.mar = operand;
                vm.mdr = vm.memory[operand] || 0;
                vm.acc = vm.acc + vm.mdr;
                break;
            case OP.SUB:
                vm.mar = operand;
                vm.mdr = vm.memory[operand] || 0;
                vm.acc = vm.acc - vm.mdr;
                break;
            case OP.MUL:
                vm.mar = operand;
                vm.mdr = vm.memory[operand] || 0;
                vm.acc = vm.acc * vm.mdr;
                break;
            case OP.DIV:
                vm.mar = operand;
                vm.mdr = vm.memory[operand] || 0;
                if (vm.mdr === 0) {
                    vm.error = 'Division by zero';
                    vm.halted = true;
                } else {
                    vm.acc = Math.trunc(vm.acc / vm.mdr);
                }
                break;
            case OP.MOD:
                vm.mar = operand;
                vm.mdr = vm.memory[operand] || 0;
                if (vm.mdr === 0) {
                    vm.error = 'Division by zero';
                    vm.halted = true;
                } else {
                    vm.acc = vm.acc % vm.mdr;
                }
                break;
            case OP.INP:
                if (vm.inputBuf !== '') {
                    vm.acc = parseInt(vm.inputBuf, 10) || 0;
                    vm.inputBuf = '';
                } else {
                    vm.error = 'WAITING_INPUT';
                    vm.pc = pc; // stay at INP
                }
                break;
            case OP.OUT:
                vm.output += String(vm.acc) + '\n';
                break;
            case OP.OTC:
                vm.output += String.fromCharCode(vm.acc & 0xFF);
                break;
            case OP.HLT:
                vm.halted = true;
                break;
            case OP.BRA:
                vm.pc = operand;
                break;
            case OP.BRZ:
                if (vm.acc === 0) vm.pc = operand;
                break;
            case OP.BRP:
                if (vm.acc >= 0) vm.pc = operand;
                break;
            case OP.AND:
                vm.mar = operand;
                vm.mdr = vm.memory[operand] || 0;
                vm.acc = vm.acc & vm.mdr;
                break;
            case OP.OR:
                vm.mar = operand;
                vm.mdr = vm.memory[operand] || 0;
                vm.acc = vm.acc | vm.mdr;
                break;
            case OP.NOT:
                vm.acc = 999 - vm.acc;
                break;
            case OP.DAT:
                // Data cell - skip over it
                break;
            default:
                vm.error = 'Unknown opcode: ' + opcode;
                vm.halted = true;
        }

        // Update status register
        if (!vm.halted && vm.error !== 'WAITING_INPUT') {
            if (vm.acc === 0) vm.sr = 'Z';
            else if (vm.acc > 0) vm.sr = 'P';
            else vm.sr = 'N';
        }

        return vm;
    }

    function provideInput(vm, value) {
        vm.inputBuf = String(value);
        vm.error = '';
        return vm;
    }

    function run(vm, maxSteps) {
        maxSteps = maxSteps || 10000;
        let steps = 0;
        while (!vm.halted && vm.error !== 'WAITING_INPUT' && steps < maxSteps) {
            step(vm);
            steps++;
        }
        return vm;
    }

    function toJSON(vm) {
        return {
            acc: vm.acc,
            pc: vm.pc,
            mar: vm.mar,
            mdr: vm.mdr,
            cir: vm.cirName,
            cirNum: vm.cir,
            sr: vm.sr,
            halted: vm.halted,
            output: vm.output,
            error: vm.error,
            instCount: vm.instCount,
            memory: vm.memory.slice()
        };
    }

    return { parse, createVM, step, provideInput, run, toJSON, OP_NAMES };
})();
