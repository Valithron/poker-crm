import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDqLx1BmdM_01wmeOPPKyRh8PFnSw-dTH0",
  authDomain: "poker-crm.firebaseapp.com",
  projectId: "poker-crm",
  storageBucket: "poker-crm.appspot.com",
  messagingSenderId: "218784808902",
  appId: "1:218784808902:web:c587bdf584d704f7733107",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Wait for auth state to load
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
  }
});
