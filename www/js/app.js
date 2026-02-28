// ============================================================================
// BMC - Shared Application Utilities
// ============================================================================

// ---- Custom Modal/Popup System (replaces native alert/confirm) ----

function bmcAlert(message, type) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'bmc-modal-overlay';
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const icon = icons[type] || icons.info;
        overlay.innerHTML = `
            <div class="bmc-modal">
                <div class="bmc-modal-icon">${icon}</div>
                <div class="bmc-modal-message">${escapeHtml(message)}</div>
                <div class="bmc-modal-actions">
                    <button class="btn btn-primary btn-sm bmc-modal-ok">OK</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('visible'));
        const close = () => { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); resolve(true); };
        overlay.querySelector('.bmc-modal-ok').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    });
}

function bmcConfirm(message) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'bmc-modal-overlay';
        overlay.innerHTML = `
            <div class="bmc-modal">
                <div class="bmc-modal-icon">⚠️</div>
                <div class="bmc-modal-message">${escapeHtml(message)}</div>
                <div class="bmc-modal-actions">
                    <button class="btn btn-outline btn-sm bmc-modal-cancel">Cancel</button>
                    <button class="btn btn-primary btn-sm bmc-modal-ok">Confirm</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('visible'));
        const close = (val) => { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); resolve(val); };
        overlay.querySelector('.bmc-modal-ok').addEventListener('click', () => close(true));
        overlay.querySelector('.bmc-modal-cancel').addEventListener('click', () => close(false));
        overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    });
}

// ---- Custom Dropdown (replaces native <select>) ----

function initCustomDropdowns() {
    document.querySelectorAll('.custom-dropdown').forEach(dd => {
        const toggle = dd.querySelector('.dropdown-toggle');
        const menu = dd.querySelector('.dropdown-menu');
        if (!toggle || !menu) return;

        toggle.addEventListener('click', e => {
            e.stopPropagation();
            document.querySelectorAll('.custom-dropdown.open').forEach(d => { if (d !== dd) d.classList.remove('open'); });
            dd.classList.toggle('open');
        });

        menu.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                dd.classList.remove('open');
                const val = item.dataset.value;
                const text = item.textContent;
                toggle.querySelector('.dropdown-text').textContent = text;
                dd.dispatchEvent(new CustomEvent('change', { detail: { value: val } }));
            });
        });
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-dropdown.open').forEach(d => d.classList.remove('open'));
    });
}

// ---- Auth & Nav ----

async function checkAuthAndUpdateNav() {
    try {
        const res = await fetch('/api/me');
        const data = await res.json();
        if (data.ok && data.username) {
            updateNavAuth(data.username);
            return data.username;
        }
    } catch(e) {}
    return null;
}

function updateNavAuth(username) {
    const nav = document.getElementById('nav-auth');
    if (!nav) return;
    if (username) {
        nav.innerHTML = `
            <a href="/dashboard" class="btn btn-ghost btn-sm">📊 ${escapeHtml(username)}</a>
            <button class="btn btn-outline btn-sm" onclick="logout()">Logout</button>
        `;
    } else {
        nav.innerHTML = `
            <a href="/login" class="btn btn-outline btn-sm">Log In</a>
            <a href="/signup" class="btn btn-primary btn-sm">Sign Up</a>
        `;
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
}

function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Cookie consent
function acceptCookies() {
    document.cookie = 'bmc_cookie_consent=accepted;path=/;max-age=31536000;SameSite=Strict';
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.style.display = 'none';
}

function checkCookieConsent() {
    if (document.cookie.indexOf('bmc_cookie_consent=accepted') === -1) {
        const banner = document.getElementById('cookie-banner');
        if (banner) banner.style.display = 'flex';
    }
}

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAuthAndUpdateNav();
    checkCookieConsent();
    initCustomDropdowns();
});
