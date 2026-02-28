// ============================================================================
// BMC - Shared Application Utilities
// ============================================================================

// Check authentication status and update navbar
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
});
