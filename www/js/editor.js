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

    // Auto-save to localStorage on every change
    codeInput.addEventListener('input', () => {
        updateLineNumbers();
        saveToLocalStorage();
    });
    codeInput.addEventListener('scroll', syncScroll);
    codeInput.addEventListener('keydown', handleKeydown);

    // Load from localStorage if no query param loaded
    const savedCode = localStorage.getItem('bmc_autosave');
    if (savedCode && !new URLSearchParams(window.location.search).get('load') && !new URLSearchParams(window.location.search).get('example')) {
        codeInput.value = savedCode;
    }

    // Example selector (custom dropdown)
    const exDropdown = document.getElementById('example-dropdown');
    if (exDropdown) {
        exDropdown.addEventListener('dropdown-change', (e) => {
            const val = e.detail.value;
            if (val && EXAMPLES[val]) {
                codeInput.value = EXAMPLES[val];
                updateLineNumbers();
            }
            // Reset label
            const toggle = exDropdown.querySelector('.dropdown-text');
            if (toggle) setTimeout(() => { toggle.textContent = 'Load Example...'; }, 300);
        });
    }

    // Load program from URL query param
    const params = new URLSearchParams(window.location.search);
    const loadName = params.get('load');
    if (loadName) {
        loadProgramByName(loadName);
    }
    const exampleName = params.get('example');
    if (exampleName && EXAMPLES[exampleName]) {
        codeInput.value = EXAMPLES[exampleName];
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

function saveToLocalStorage() {
    if (codeInput) localStorage.setItem('bmc_autosave', codeInput.value);
}

// Undo/Redo stack for the code editor
const undoStack = [];
const redoStack = [];
let undoTimer = null;

function pushUndo() {
    if (!codeInput) return;
    const state = { value: codeInput.value, start: codeInput.selectionStart, end: codeInput.selectionEnd };
    if (undoStack.length > 0 && undoStack[undoStack.length - 1].value === state.value) return;
    undoStack.push(state);
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
}

function scheduleUndoSnapshot() {
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(() => pushUndo(), 400);
}

function handleKeydown(e) {
    // Ctrl+Z / Cmd+Z = Undo
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        if (undoStack.length > 0) {
            redoStack.push({ value: codeInput.value, start: codeInput.selectionStart, end: codeInput.selectionEnd });
            const prev = undoStack.pop();
            codeInput.value = prev.value;
            codeInput.selectionStart = prev.start;
            codeInput.selectionEnd = prev.end;
            updateLineNumbers();
            saveToLocalStorage();
        }
        return;
    }
    // Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y = Redo
    if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        if (redoStack.length > 0) {
            undoStack.push({ value: codeInput.value, start: codeInput.selectionStart, end: codeInput.selectionEnd });
            const next = redoStack.pop();
            codeInput.value = next.value;
            codeInput.selectionStart = next.start;
            codeInput.selectionEnd = next.end;
            updateLineNumbers();
            saveToLocalStorage();
        }
        return;
    }

    if (e.key === 'Tab') {
        e.preventDefault();
        pushUndo();
        const start = codeInput.selectionStart;
        const end = codeInput.selectionEnd;
        const val = codeInput.value;
        const indent = '        '; // 8 spaces

        if (e.shiftKey) {
            // Shift+Tab: unindent selected lines or current line
            const lineStart = val.lastIndexOf('\n', start - 1) + 1;
            const lineEnd = end === start ? (val.indexOf('\n', end) === -1 ? val.length : val.indexOf('\n', end)) : (val.indexOf('\n', end - 1) === -1 ? val.length : val.indexOf('\n', end - 1));
            const before = val.substring(0, lineStart);
            const block = val.substring(lineStart, lineEnd);
            const after = val.substring(lineEnd);
            const lines = block.split('\n');
            let removed = 0;
            const newLines = lines.map(line => {
                let r = 0;
                while (r < 8 && r < line.length && line[r] === ' ') r++;
                if (r > 0) removed += r;
                return line.substring(r);
            });
            codeInput.value = before + newLines.join('\n') + after;
            codeInput.selectionStart = Math.max(lineStart, start - (lines[0].length - newLines[0].length));
            codeInput.selectionEnd = Math.max(codeInput.selectionStart, end - removed);
        } else if (start !== end) {
            // Tab with selection: indent all selected lines
            const lineStart = val.lastIndexOf('\n', start - 1) + 1;
            const before = val.substring(0, lineStart);
            const block = val.substring(lineStart, end);
            const after = val.substring(end);
            const lines = block.split('\n');
            const newBlock = lines.map(l => indent + l).join('\n');
            codeInput.value = before + newBlock + after;
            codeInput.selectionStart = start + 8;
            codeInput.selectionEnd = end + lines.length * 8;
        } else {
            // Tab with no selection: insert spaces
            codeInput.value = val.substring(0, start) + indent + val.substring(end);
            codeInput.selectionStart = codeInput.selectionEnd = start + 8;
        }
        updateLineNumbers();
        saveToLocalStorage();
        return;
    }

    // Snapshot undo on typing
    scheduleUndoSnapshot();
}

function handleTab(e) {
    handleKeydown(e);
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
    const saveExistingGroup = document.getElementById('save-existing-group');
    const saveNameInput = document.getElementById('save-name');

    let selectedExisting = '';
    let userPrograms = [];

    // Listen for existing program dropdown changes — fill the name input
    const saveExistingDropdown = document.getElementById('save-existing-dropdown');
    if (saveExistingDropdown) {
        saveExistingDropdown.addEventListener('dropdown-change', (e) => {
            selectedExisting = e.detail.value;
            if (selectedExisting && saveNameInput) {
                saveNameInput.value = selectedExisting;
            }
        });
    }

    // Clear dropdown selection when user types a new name
    if (saveNameInput) {
        saveNameInput.addEventListener('input', () => {
            selectedExisting = '';
            const existText = saveExistingDropdown ? saveExistingDropdown.querySelector('.dropdown-text') : null;
            if (existText) existText.textContent = 'Select existing program...';
        });
    }

    async function loadUserPrograms() {
        try {
            const res = await fetch('/api/programs/list');
            const data = await res.json();
            userPrograms = (data.programs || []);
            const menu = document.getElementById('save-existing-menu');
            if (userPrograms.length === 0) {
                saveExistingGroup.style.display = 'none';
            } else {
                saveExistingGroup.style.display = 'block';
                if (menu) {
                    menu.innerHTML = userPrograms.map(p =>
                        '<div class="dropdown-item" data-value="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + '</div>'
                    ).join('');
                    initCustomDropdowns();
                }
            }
        } catch(e) {
            saveExistingGroup.style.display = 'none';
        }
    }

    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const user = await checkAuthAndUpdateNav();
            if (!user) {
                // Not logged in — save to localStorage
                const code = getCode();
                if (!code.trim()) { bmcAlert('Nothing to save.', 'warning'); return; }
                localStorage.setItem('bmc_autosave', code);
                bmcAlert('Code saved locally to your browser! Log in to save to the cloud.', 'success');
                return;
            }
            selectedExisting = '';
            if (saveNameInput) saveNameInput.value = '';
            const existText = saveExistingDropdown ? saveExistingDropdown.querySelector('.dropdown-text') : null;
            if (existText) existText.textContent = 'Select existing program...';

            await loadUserPrograms();
            if (dialog) {
                dialog.style.display = 'flex';
                requestAnimationFrame(() => dialog.classList.add('visible'));
            }
        });
    }

    if (btnConfirm) {
        btnConfirm.addEventListener('click', async () => {
            const name = saveNameInput ? saveNameInput.value.trim() : '';
            if (!name) {
                bmcAlert('Please enter a program name or select an existing one.', 'warning');
                return;
            }

            // If the name matches an existing program, send with overwrite
            const isExisting = userPrograms.some(p => p.name === name);
            const overwrite = isExisting ? "true" : "false";

            // If overwriting and user didn't pick from dropdown, confirm first
            if (isExisting && selectedExisting !== name) {
                const ok = await bmcConfirm('A program named "' + name + '" already exists. Overwrite it?');
                if (!ok) return;
            }

            try {
                const res = await fetch('/api/programs/save', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name, code: getCode(), overwrite })
                });
                const data = await res.json();
                if (data.ok) {
                    if (dialog) { dialog.classList.remove('visible'); setTimeout(() => dialog.style.display = 'none', 200); }
                    bmcAlert('Program saved!', 'success');
                } else {
                    bmcAlert(data.error || 'Failed to save', 'error');
                }
            } catch(e) {
                bmcAlert('Failed to save program', 'error');
            }
        });
    }

    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            if (dialog) { dialog.classList.remove('visible'); setTimeout(() => dialog.style.display = 'none', 200); }
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
            if (!code.trim()) { bmcAlert('No code to export.', 'warning'); return; }
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
                    a.download = 'bmc_program.bmc';
                    a.click();
                    URL.revokeObjectURL(url);
                } else {
                    const data = await res.json();
                    bmcAlert(data.error || 'Export failed', 'error');
                }
            } catch(e) {
                bmcAlert('Export failed', 'error');
            }
            btnExport.disabled = false;
            btnExport.textContent = '📦 Export';
        });
    }

    if (btnExportSrc) {
        btnExportSrc.addEventListener('click', async () => {
            const code = getCode();
            if (!code.trim()) { bmcAlert('No code to export.', 'warning'); return; }
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
                    a.download = 'bmc_program.bmc';
                    a.click();
                    URL.revokeObjectURL(url);
                } else {
                    bmcAlert(data.error || 'Export failed', 'error');
                }
            } catch(e) {
                bmcAlert('Export failed', 'error');
            }
        });
    }
}

// Assembly export functionality
function setupAsmExport() {
    const btnAsm = document.getElementById('btn-export-asm');
    const dialog = document.getElementById('asm-dialog');
    const btnCancel = document.getElementById('btn-asm-cancel');
    const btnDownload = document.getElementById('btn-asm-download');
    const preview = document.getElementById('asm-preview');
    const previewWrap = document.getElementById('asm-preview-wrap');
    const archDropdown = document.getElementById('asm-arch-dropdown');

    let selectedArch = 'arm64-macos';
    let currentAsm = '';

    function generatePreview() {
        const code = getCode();
        if (!code.trim()) {
            currentAsm = '; No code to generate assembly for.';
        } else {
            currentAsm = bmcToAsm(code, selectedArch);
        }
        if (preview) preview.textContent = currentAsm;
        if (previewWrap) previewWrap.style.display = 'block';
    }

    if (archDropdown) {
        archDropdown.addEventListener('dropdown-change', (e) => {
            selectedArch = e.detail.value;
            generatePreview();
        });
    }

    if (btnAsm) {
        btnAsm.addEventListener('click', () => {
            const code = getCode();
            if (!code.trim()) { bmcAlert('Write some code first!', 'warning'); return; }
            generatePreview();
            if (dialog) {
                dialog.style.display = 'flex';
                requestAnimationFrame(() => dialog.classList.add('visible'));
            }
            initCustomDropdowns();
        });
    }

    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            if (!currentAsm) return;
            const ext = selectedArch.replace(/-/g, '_');
            const blob = new Blob([currentAsm], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'bmc_program_' + ext + '.s';
            a.click();
            URL.revokeObjectURL(url);
            if (dialog) { dialog.classList.remove('visible'); setTimeout(() => dialog.style.display = 'none', 200); }
            bmcAlert('Assembly downloaded!', 'success');
        });
    }

    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            if (dialog) { dialog.classList.remove('visible'); setTimeout(() => dialog.style.display = 'none', 200); }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupSave();
    setupAsmExport();
});
