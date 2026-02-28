// ============================================================================
// BMC - CPU Simulator & Visualization
// ============================================================================

let sessionId = null;
let vmState = null;
let stepCount = 0;
let isRunning = false;
let runInterval = null;

const OPCODE_NAMES = {
    1: 'LDA', 2: 'STA', 3: 'ADD', 4: 'SUB', 5: 'MUL', 6: 'DIV', 7: 'MOD',
    8: 'INP', 9: 'OUT', 10: 'OTC', 11: 'HLT', 12: 'BRA', 13: 'BRZ',
    14: 'BRP', 15: 'AND', 16: 'OR', 17: 'NOT', 0: '---'
};

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
}

// ---- API Calls ----

async function loadProgram() {
    const code = getCode();
    if (!code.trim()) {
        alert('Write some code first!');
        return;
    }

    setStatus('loading', '⏳ Loading...');
    clearOutput();
    clearLog();
    stepCount = 0;

    try {
        const res = await fetch('/api/load', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (data.ok) {
            sessionId = data.session_id;
            vmState = data.state;
            updateVisualization();
            setStatus('ready', '● Loaded');
            enableControls(true);
            addLog('Program loaded successfully (' + (data.instruction_count || '?') + ' instructions)');
        } else {
            setStatus('halted', '✖ Error');
            addLog('ERROR: ' + (data.error || 'Failed to load'));
            alert('Parse error: ' + (data.error || 'Unknown error'));
        }
    } catch(e) {
        setStatus('halted', '✖ Error');
        addLog('ERROR: Connection failed');
    }
}

async function stepProgram() {
    if (!sessionId) return;

    try {
        const res = await fetch('/api/step', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ session_id: sessionId })
        });
        const data = await res.json();
        if (data.ok) {
            const prevState = vmState;
            vmState = data.state;
            stepCount++;
            updateVisualization(prevState);

            if (data.output) {
                appendOutput(data.output);
            }

            if (data.halted) {
                setStatus('halted', '■ Halted');
                addLog('Step ' + stepCount + ': HLT — Program halted');
                enableControls(false);
                stopRunning();
            } else if (data.waiting_input) {
                setStatus('waiting', '⏸ Waiting for input');
                addLog('Step ' + stepCount + ': INP — Waiting for input');
                showInputBar(true);
                stopRunning();
            } else {
                setStatus('ready', '● Step ' + stepCount);
                const op = data.state ? (data.state.cir || '') : '';
                addLog('Step ' + stepCount + ': ' + op);
            }
        } else {
            addLog('ERROR: ' + (data.error || 'Step failed'));
        }
    } catch(e) {
        addLog('ERROR: Connection failed');
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

    runInterval = setInterval(async () => {
        if (!isRunning) return;
        await stepProgram();
    }, 300);
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

async function resetProgram() {
    if (!sessionId) return;
    stopRunning();

    try {
        const res = await fetch('/api/reset', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ session_id: sessionId })
        });
        const data = await res.json();
        if (data.ok) {
            vmState = data.state;
            stepCount = 0;
            updateVisualization();
            setStatus('ready', '● Reset');
            enableControls(true);
            clearOutput();
            clearLog();
            addLog('Simulator reset');
            showInputBar(false);
        }
    } catch(e) {
        addLog('ERROR: Reset failed');
    }
}

async function sendInput() {
    const field = document.getElementById('input-field');
    if (!field || !sessionId) return;
    const value = field.value.trim();
    if (value === '') return;

    try {
        const res = await fetch('/api/input', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ session_id: sessionId, value: parseInt(value) || 0 })
        });
        const data = await res.json();
        if (data.ok) {
            vmState = data.state;
            stepCount++;
            updateVisualization();
            addLog('Input: ' + value);
            appendInputDisplay(value);
            showInputBar(false);
            setStatus('ready', '● Step ' + stepCount);
        }
    } catch(e) {
        addLog('ERROR: Input failed');
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
