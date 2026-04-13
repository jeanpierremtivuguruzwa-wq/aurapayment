// Auth helper functions for Aura Payment

function getCurrentUser() {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch (e) {
        return null;
    }
}

function requireAuth(redirectTo = 'signin.html') {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = redirectTo;
        return false;
    }
    return true;
}

function logout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('aura_user_profile');
    window.location.href = 'index.html';
}

function updateNavbarUser() {
    const user = getCurrentUser();
    if (!user) return;
    
    const displayNameElem = document.getElementById('displayName');
    const initialsElem = document.getElementById('userInitials');
    
    if (displayNameElem) {
        const name = user.displayName || user.fullName?.split(' ')[0] || 'User';
        displayNameElem.textContent = name;
    }
    if (initialsElem && user.fullName) {
        const initials = user.fullName.split(' ').map(n => n[0]).join('').toUpperCase();
        initialsElem.textContent = initials.substring(0, 2);
    }
}

// Auto-run on pages that include this script
document.addEventListener('DOMContentLoaded', () => {
    updateNavbarUser();
    startPresenceHeartbeat();
});

// ── Presence heartbeat ─────────────────────────────────────────────────────
// Writes lastSeen + currentPage to the user's Firestore doc every 30s,
// so the admin Live Activity page can show who is online right now.
function startPresenceHeartbeat() {
    const user = getCurrentUser();
    if (!user || !user.uid) return;

    const db = firebase.firestore ? firebase.firestore() : null;
    if (!db) return;

    function beat() {
        db.collection('users').doc(user.uid).set({
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            currentPage: window.location.pathname.split('/').pop() || 'index.html',
        }, { merge: true }).catch(() => {});
    }

    beat();
    setInterval(beat, 30000);
}