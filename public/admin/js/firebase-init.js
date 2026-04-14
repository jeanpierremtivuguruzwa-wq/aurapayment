// Firebase configuration (compat version for older pages)
const firebaseConfig = {
    apiKey: "AIzaSyDlz5mH-x7P7H6FNdPj62PYhqAY5hsH19A",
    authDomain: "aura-payment.firebaseapp.com",
    projectId: "aura-payment",
    storageBucket: "aura-payment.firebasestorage.app",
    messagingSenderId: "213847107667",
    appId: "1:213847107667:web:9949c7a1ad9101959afea6",
    measurementId: "G-YG1G8CGC07"
};

// Initialize Firebase (compat)
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
}

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { firebaseConfig };
}