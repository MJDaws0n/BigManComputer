// ============================================================================
// BMC - Code Editor with Syntax Highlighting
// ============================================================================

const EXAMPLES = {
    add: `; Add Two Numbers
        INP          ; Get first number
        STA num1     ; Store it
        INP          ; Get second number
        ADD num1     ; Add first number
        OUT          ; Display result
        HLT          ; Stop

num1:   DAT 0`,

    countdown: `; Countdown from Input
        INP          ; Get starting number
loop:   OUT          ; Display current value
        SUB one      ; Subtract 1
        BRP loop     ; If still positive, continue
        HLT          ; Done

one:    DAT 1`,

    multiply: `; Multiply Two Numbers
        INP          ; First number (multiplier)
        STA count
        INP          ; Second number (multiplicand)
        STA num
        LDA zero     ; Start result at 0
        STA result
loop:   LDA count
        BRZ done     ; If count is 0, done
        LDA result
        ADD num      ; Add multiplicand to result
        STA result
        LDA count
        SUB one      ; Decrement counter
        STA count
        BRA loop     ; Repeat
done:   LDA result
        OUT          ; Display result
        HLT

count:  DAT 0
num:    DAT 0
result: DAT 0
zero:   DAT 0
one:    DAT 1`,

    fibonacci: `; Fibonacci Sequence (first 10 numbers)
        LDA zero
        STA a
        LDA one
        STA b
        LDA count
        STA i
loop:   LDA a
        OUT          ; Output current number
        ADD b
        STA temp
        LDA b
        STA a
        LDA temp
        STA b
        LDA i
        SUB one
        STA i
        BRP loop
        HLT

a:      DAT 0
b:      DAT 1
temp:   DAT 0
i:      DAT 0
count:  DAT 10
zero:   DAT 0
one:    DAT 1`,

    echo: `; Echo Characters (type ASCII codes, 0 to quit)
loop:   INP          ; Get ASCII code
        BRZ quit     ; If 0, stop
        OTC          ; Output as character
        BRA loop     ; Repeat
quit:   HLT`
};

const OPCODES = ['LDA','STA','ADD','SUB','MUL','DIV','MOD','INP','OUT','OTC','HLT','BRA','BRZ','BRP','AND','OR','NOT','DAT'];

let codeInput, lineNumbers;

document.addEventListener('DOMContentLoaded', () => {
    codeInput = document.getElementById('code-input');
    lineNumbers = document.getElementById('line-numbers');

    if (!codeInput) return;

    // Update line numbers on input
    codeInput.addEventListener('input', updateLineNumbers);
    codeInput.addEventListener('scroll', syncScroll);
    codeInput.addEventListener('keydown', handleTab);

    // Example selector
    const exSelect = document.getElementById('example-select');
    if (exSelect) {
        exSelect.addEventListener('change', (e) => {
            if (e.target.value && EXAMPLES[e.target.value]) {
                codeInput.value = EXAMPLES[e.target.value];
                updateLineNumbers();
            }
            e.target.value = '';
        });
    }

    // Load program from URL query param
    const params = new URLSearchParams(window.location.search);
    const loadName = params.get('load');
    if (loadName) {
        loadProgramByName(loadName);
    }

    updateLineNumbers();
});

function updateLineNumbers() {
    if (!codeInput || !lineNumbers) return;
    const lines = codeInput.value.split('\n');
    const count = lines.length;
    let nums = '';
    for (let i = 1; i <= count; i++) {
        nums += i + '\n';
    }
    lineNumbers.textContent = nums;
    const lineCountEl = document.getElementById('line-count');
    if (lineCountEl) lineCountEl.textContent = 'Lines: ' + count;
}

function syncScroll() {
    if (lineNumbers && codeInput) {
        lineNumbers.scrollTop = codeInput.scrollTop;
    }
}

function handleTab(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = codeInput.selectionStart;
        const end = codeInput.selectionEnd;
        codeInput.value = codeInput.value.substring(0, start) + '        ' + codeInput.value.substring(end);
        codeInput.selectionStart = codeInput.selectionEnd = start + 8;
        updateLineNumbers();
    }
}

function getCode() {
    return codeInput ? codeInput.value : '';
}

function setCode(code) {
    if (codeInput) {
        codeInput.value = code;
        updateLineNumbers();
    }
}

async function loadProgramByName(name) {
    try {
        const res = await fetch('/api/programs/load?name=' + encodeURIComponent(name));
        const data = await res.json();
        if (data.ok && data.code) {
            setCode(data.code);
        }
    } catch(e) {
        console.error('Failed to load program:', e);
    }
}

// Save functionality
function setupSave() {
    const btnSave = document.getElementById('btn-save');
    const dialog = document.getElementById('save-dialog');
    const btnConfirm = document.getElementById('btn-save-confirm');
    const btnCancel = document.getElementById('btn-save-cancel');

    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const user = await checkAuthAndUpdateNav();
            if (!user) {
                alert('Please log in to save programs.');
                window.location.href = '/login';
                return;
            }
            if (dialog) dialog.style.display = 'flex';
        });
    }

    if (btnConfirm) {
        btnConfirm.addEventListener('click', async () => {
            const name = document.getElementById('save-name').value.trim();
            if (!name) { alert('Please enter a program name.'); return; }
            try {
                const res = await fetch('/api/programs/save', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name, code: getCode() })
                });
                const data = await res.json();
                if (data.ok) {
                    if (dialog) dialog.style.display = 'none';
                    alert('Program saved!');
                } else {
                    alert(data.error || 'Failed to save');
                }
            } catch(e) {
                alert('Failed to save program');
            }
        });
    }

    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            if (dialog) dialog.style.display = 'none';
        });
    }
}

// Export functionality
function setupExport() {
    const btnExport = document.getElementById('btn-export');
    const btnExportSrc = document.getElementById('btn-export-src');

    if (btnExport) {
        btnExport.addEventListener('click', async () => {
            const code = getCode();
            if (!code.trim()) { alert('No code to export.'); return; }
            btnExport.disabled = true;
            btnExport.textContent = '⏳ Compiling...';
            try {
                const res = await fetch('/api/export', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ code })
                });
                if (res.ok) {
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'bmc_program';
                    a.click();
                    URL.revokeObjectURL(url);
                } else {
                    const data = await res.json();
                    alert(data.error || 'Export failed');
                }
            } catch(e) {
                alert('Export failed');
            }
            btnExport.disabled = false;
            btnExport.textContent = '📦 Export';
        });
    }

    if (btnExportSrc) {
        btnExportSrc.addEventListener('click', async () => {
            const code = getCode();
            if (!code.trim()) { alert('No code to export.'); return; }
            try {
                const res = await fetch('/api/export/source', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ code })
                });
                const data = await res.json();
                if (data.ok && data.source) {
                    const blob = new Blob([data.source], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'bmc_program.nov';
                    a.click();
                    URL.revokeObjectURL(url);
                } else {
                    alert(data.error || 'Export failed');
                }
            } catch(e) {
                alert('Export failed');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupSave();
    setupExport();
});
