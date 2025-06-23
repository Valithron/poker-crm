import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { whitelist } from "./accessControl.js";

const firebaseConfig = {
  apiKey: "AIzaSyDqLxlBmdM_O1wmeOPPKyRh8PFnSw-dTH0",
  authDomain: "poker-crm.firebaseapp.com",
  projectId: "poker-crm",
  storageBucket: "poker-crm.appspot.com",
  messagingSenderId: "218784808902",
  appId: "1:218784808902:web:c587bdf584d704f7733107",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export function authCheck() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    if (!whitelist.includes(user.email)) {
      await signOut(auth);
      alert("Access denied: Not an approved user.");
      window.location.href = "login.html";
    }
  });
}

export { auth };
