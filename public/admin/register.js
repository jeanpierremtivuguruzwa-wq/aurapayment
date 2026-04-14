// register.js - Firebase Sign-Up Module
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDlz5mH-x7P7H6FNdPj62PYhqAY5hsH19A",
  authDomain: "aura-payment.firebaseapp.com",
  projectId: "aura-payment",
  storageBucket: "aura-payment.firebasestorage.app",
  messagingSenderId: "213847107667",
  appId: "1:213847107667:web:9949c7a1ad9101959afea6",
  measurementId: "G-YG1G8CGC07"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);

// Wait for the DOM to be fully loaded
document.addEventListener("DOMContentLoaded", () => {
  // Get form elements (adjust IDs to match your sign-up HTML)
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const submitBtn = document.getElementById("submit");
  const messageDiv = document.getElementById("feedbackMessage"); // optional

  if (!submitBtn) {
    console.error("Submit button not found. Make sure your sign-up form has id='submit'");
    return;
  }

  submitBtn.addEventListener("click", (event) => {
    event.preventDefault(); // Prevent any default form submission

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    // Basic validation
    if (!email || !password) {
      if (messageDiv) {
        messageDiv.textContent = "❌ Please fill in both email and password.";
        messageDiv.style.display = "block";
      } else {
        alert("Please fill in both email and password.");
      }
      return;
    }

    // Disable button to avoid double submission
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account...";

    // Create user with Firebase
    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        // Signed up successfully
        const user = userCredential.user;
        console.log("User created:", user.email);

        if (messageDiv) {
          messageDiv.textContent = "✅ Account created successfully! Redirecting...";
          messageDiv.style.backgroundColor = "#c6f6d5";
          messageDiv.style.color = "#22543d";
          messageDiv.style.display = "block";
        }

        // Optional: store additional user info in localStorage or redirect
        setTimeout(() => {
          window.location.href = "dashboard.html"; // Change to your desired redirect page
        }, 2000);
      })
      .catch((error) => {
        const errorCode = error.code;
        const errorMessage = error.message;
        console.error(`Firebase error (${errorCode}): ${errorMessage}`);

        let userFriendlyMessage = "Sign-up failed. ";
        if (errorCode === "auth/email-already-in-use") {
          userFriendlyMessage += "This email is already registered.";
        } else if (errorCode === "auth/weak-password") {
          userFriendlyMessage += "Password should be at least 6 characters.";
        } else if (errorCode === "auth/invalid-email") {
          userFriendlyMessage += "Please enter a valid email address.";
        } else {
          userFriendlyMessage += errorMessage;
        }

        if (messageDiv) {
          messageDiv.textContent = `❌ ${userFriendlyMessage}`;
          messageDiv.style.backgroundColor = "#fed7d7";
          messageDiv.style.color = "#742a2a";
          messageDiv.style.display = "block";
        } else {
          alert(userFriendlyMessage);
        }

        // Re-enable button
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign Up";
      });
  });
});
