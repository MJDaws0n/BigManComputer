// BMC - CPU Simulator & Visualisation (Client-Side)
// Uses BMC.parse/step/run from bmcvm.js - no network calls for execution.

let vm = null;
let vmState = null;
let stepCount = 0;
let isRunning = false;
let runInterval = null;
let wasRunningBeforeInput = false;
let lastOutputLen = 0;
let clockMultiplier = 1;
const BASE_INTERVAL = 300; // ms at 1x speed

const OPCODE_NAMES = BMC.OP_NAMES;

document.addEventListener('DOMContentLoaded', () => {
    initMemoryGrid();
    setupControls();
});

// Build the 10x10 memory grid
function initMemoryGrid() {
    const grid = document.getElementById('memory-grid');
    if (!grid) return;
    let html = '';
    for (let i = 0; i < 100; i++) {
        html += `<div class="memory-cell" id="mem-${i}" title="Address ${i}">
            <span class="cell-addr">${String(i).padStart(2,'0')}</span>
            <span class="cell-val" id="memval-${i}">000</span>
        </div>`;
    }
    grid.innerHTML = html;
}

function setupControls() {
    const btnLoad = document.getElementById('btn-load');
    const btnStep = document.getElementById('btn-step');
    const btnRun = document.getElementById('btn-run');
    const btnReset = document.getElementById('btn-reset');
    const btnInput = document.getElementById('btn-send-input');
    const inputField = document.getElementById('input-field');

    if (btnLoad) btnLoad.addEventListener('click', loadProgram);
    if (btnStep) btnStep.addEventListener('click', stepProgram);
    if (btnRun) btnRun.addEventListener('click', toggleRun);
    if (btnReset) btnReset.addEventListener('click', resetProgram);
    if (btnInput) btnInput.addEventListener('click', sendInput);
    if (inputField) {
        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendInput();
        });
    }

    // Clock speed dropdown
    const clockDropdown = document.getElementById('clock-speed-dropdown');
    if (clockDropdown) {
        clockDropdown.addEventListener('dropdown-change', (e) => {
            const val = parseFloat(e.detail.value);
            if (val > 0) {
                clockMultiplier = val;
                if (isRunning) {
                    stopRunning();
                    startRunning();
                }
            }
        });
    }
}

// ---- Client-Side Execution ----

function loadProgram() {
    const code = getCode();
    if (!code.trim()) {
        bmcAlert('Write some code first!', 'warning');
        return;
    }

    setStatus('loading', '⏳ Loading...');
    clearOutput();
    clearLog();
    stepCount = 0;
    lastOutputLen = 0;

    const parsed = BMC.parse(code);
    if (parsed.error) {
        setStatus('halted', '✖ Error');
        addLog('ERROR: ' + parsed.error);
        bmcAlert('Parse error: ' + parsed.error, 'error');
        return;
    }

    vm = BMC.createVM(parsed);
    vmState = BMC.toJSON(vm);
    updateVisualization();
    setStatus('ready', '● Loaded');
    enableControls(true);
    addLog('Program loaded (' + parsed.instCount + ' instructions)');
}

function stepProgram() {
    if (!vm) return;

    const prevState = vmState;
    BMC.step(vm);
    vmState = BMC.toJSON(vm);
    stepCount++;
    updateVisualization(prevState);

    // Show new output
    const fullOutput = vm.output || '';
    if (fullOutput.length > lastOutputLen) {
        displayNewOutput(fullOutput.substring(lastOutputLen));
        lastOutputLen = fullOutput.length;
    }

    if (vm.halted) {
        setStatus('halted', '■ Halted');
        addLog('Step ' + stepCount + ': HLT - Program halted');
        enableControls(false);
        stopRunning();
    } else if (vm.error === 'WAITING_INPUT') {
        wasRunningBeforeInput = isRunning;
        setStatus('waiting', '⏸ Waiting for input');
        addLog('Step ' + stepCount + ': INP - Waiting for input');
        showInputBar(true);
        stopRunning();
    } else {
        setStatus('ready', '● Step ' + stepCount);
        addLog('Step ' + stepCount + ': ' + (vmState.cir || ''));
    }
}

function toggleRun() {
    if (isRunning) {
        stopRunning();
    } else {
        startRunning();
    }
}

function startRunning() {
    isRunning = true;
    const btn = document.getElementById('btn-run');
    if (btn) { btn.textContent = '⏸ Pause'; }
    setStatus('running', '▶ Running');

    const interval = Math.max(1, Math.round(BASE_INTERVAL / clockMultiplier));
    runInterval = setInterval(() => {
        if (!isRunning || !vm) return;
        stepProgram();
    }, interval);
}

function stopRunning() {
    isRunning = false;
    if (runInterval) {
        clearInterval(runInterval);
        runInterval = null;
    }
    const btn = document.getElementById('btn-run');
    if (btn) { btn.textContent = '⏩ Run'; }
}

function resetProgram() {
    if (!vm) return;
    stopRunning();

    // Re-parse and re-create VM from current code
    const code = getCode();
    if (!code.trim()) return;

    const parsed = BMC.parse(code);
    if (parsed.error) {
        addLog('ERROR: ' + parsed.error);
        return;
    }

    vm = BMC.createVM(parsed);
    vmState = BMC.toJSON(vm);
    stepCount = 0;
    lastOutputLen = 0;
    updateVisualization();
    setStatus('ready', '● Reset');
    enableControls(true);
    clearOutput();
    clearLog();
    addLog('Simulator reset');
    showInputBar(false);
}

function sendInput() {
    const field = document.getElementById('input-field');
    if (!field || !vm) return;
    const raw = field.value.trim();
    if (raw === '') return;

    // If it's a number, use it directly; if it's a character, use its ASCII code
    let value;
    if (/^-?\d+$/.test(raw)) {
        value = parseInt(raw, 10);
    } else {
        value = raw.charCodeAt(0);
    }

    BMC.provideInput(vm, value);
    BMC.step(vm);
    vmState = BMC.toJSON(vm);
    stepCount++;
    updateVisualization();
    addLog('Input: ' + raw + (raw !== String(value) ? ' (ASCII ' + value + ')' : ''));
    appendInputDisplay(raw !== String(value) ? raw + ' → ' + value : String(value));
    showInputBar(false);
    setStatus('ready', '● Step ' + stepCount);

    // Show any new output
    const fullOutput = vm.output || '';
    if (fullOutput.length > lastOutputLen) {
        displayNewOutput(fullOutput.substring(lastOutputLen));
        lastOutputLen = fullOutput.length;
    }

    // Resume running if we were in run mode
    if (wasRunningBeforeInput) {
        wasRunningBeforeInput = false;
        startRunning();
    }

    field.value = '';
}

// ---- Visualization Updates ----

function updateVisualization(prevState) {
    if (!vmState) return;

    updateRegister('acc', vmState.acc, prevState ? prevState.acc : null);
    updateRegister('pc', vmState.pc, prevState ? prevState.pc : null);
    updateRegister('mar', vmState.mar, prevState ? prevState.mar : null);
    updateRegister('mdr', vmState.mdr, prevState ? prevState.mdr : null);

    // CIR: show opcode name
    const cirEl = document.getElementById('val-cir');
    if (cirEl) {
        const opName = vmState.cir || '---';
        cirEl.textContent = opName;
        const cirBox = document.getElementById('reg-cir');
        if (prevState && vmState.cirNum !== prevState.cirNum) {
            flashChanged(cirBox);
        }
    }

    // SR: show flags
    const srEl = document.getElementById('val-sr');
    if (srEl) {
        srEl.textContent = vmState.sr || '---';
    }

    // ALU operation display
    const aluOp = document.getElementById('alu-op');
    if (aluOp) {
        aluOp.textContent = vmState.cir || 'Idle';
    }

    // Data bus animation
    const busTop = document.getElementById('bus-top');
    const busBot = document.getElementById('bus-bottom');
    if (busTop && busBot) {
        const isActive = vmState.cirNum > 0 && !vmState.halted;
        busTop.className = 'data-bus' + (isActive ? ' active' : '');
        busBot.className = 'data-bus' + (isActive ? ' active' : '');
    }

    // Update memory grid
    updateMemory(prevState);

    // Step counter
    const stepEl = document.getElementById('step-counter');
    if (stepEl) stepEl.textContent = 'Step: ' + stepCount;
}

function updateRegister(name, value, prevValue) {
    const el = document.getElementById('val-' + name);
    if (!el) return;
    el.textContent = String(value || 0).padStart(3, '0');

    if (prevValue !== null && prevValue !== undefined && value !== prevValue) {
        const box = document.getElementById('reg-' + name);
        flashChanged(box);
    }
}

function flashChanged(el) {
    if (!el) return;
    el.classList.add('changed');
    setTimeout(() => el.classList.remove('changed'), 600);
}

function updateMemory(prevState) {
    if (!vmState || !vmState.memory) return;
    const mem = vmState.memory;
    const prevMem = prevState ? prevState.memory : null;

    for (let i = 0; i < 100; i++) {
        const cell = document.getElementById('mem-' + i);
        const valEl = document.getElementById('memval-' + i);
        if (!cell || !valEl) continue;

        const val = mem[i] || 0;
        valEl.textContent = String(val).padStart(3, '0');

        // Highlight current PC location
        cell.classList.remove('active', 'highlight');
        if (i === vmState.pc) {
            cell.classList.add('active');
        }
        if (i === vmState.mar) {
            cell.classList.add('highlight');
        }

        // Flash if value changed
        if (prevMem && prevMem[i] !== undefined && prevMem[i] !== val) {
            flashChanged(cell);
        }
    }
}

// ---- UI Helpers ----

function setStatus(type, text) {
    const el = document.getElementById('status-indicator');
    if (!el) return;
    el.className = 'toolbar-status status-' + type;
    el.textContent = text;
}

function enableControls(enabled) {
    const step = document.getElementById('btn-step');
    const run = document.getElementById('btn-run');
    const reset = document.getElementById('btn-reset');
    if (step) step.disabled = !enabled;
    if (run) run.disabled = !enabled;
    if (reset) reset.disabled = !enabled;
}

function clearOutput() {
    const el = document.getElementById('output-area');
    if (el) el.innerHTML = '';
    lastOutputLen = 0;
}

function displayNewOutput(text) {
    const el = document.getElementById('output-area');
    if (!el || !text) return;
    // Handle terminal-like output: only break to new div on \n
    // OTC chars (no newline) append to the current line
    const parts = text.split('\n');
    for (let i = 0; i < parts.length; i++) {
        if (i === 0) {
            // First part: append to last existing line, or create one
            let last = el.querySelector('.output-line:last-child');
            if (!last) {
                last = document.createElement('div');
                last.className = 'output-line';
                el.appendChild(last);
            }
            last.textContent += parts[i];
        } else {
            // After each \n, start a new line
            const line = document.createElement('div');
            line.className = 'output-line';
            line.textContent = parts[i];
            el.appendChild(line);
        }
    }
    el.scrollTop = el.scrollHeight;
}

function appendOutput(text) {
    const el = document.getElementById('output-area');
    if (!el) return;
    const line = document.createElement('div');
    line.className = 'output-line';
    line.textContent = text;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
}

function appendInputDisplay(text) {
    const el = document.getElementById('input-display');
    if (!el) return;
    const line = document.createElement('div');
    line.className = 'input-line';
    line.textContent = '> ' + text;
    el.appendChild(line);
}

function showInputBar(show) {
    const bar = document.getElementById('input-bar');
    if (bar) {
        bar.style.display = show ? 'flex' : 'none';
        if (show) {
            const field = document.getElementById('input-field');
            if (field) field.focus();
        }
    }
}

function clearLog() {
    const el = document.getElementById('exec-log');
    if (el) el.innerHTML = '';
}

function addLog(text) {
    const el = document.getElementById('exec-log');
    if (!el) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = text;
    el.appendChild(entry);
    el.scrollTop = el.scrollHeight;
}
