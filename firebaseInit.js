import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDqLxlBmdM_O1wmeOPPKyRh8PFnSw-dTH0",
  authDomain: "poker-crm.firebaseapp.com",
  projectId: "poker-crm",
  storageBucket: "poker-crm.appspot.com",
  messagingSenderId: "218784808902",
  appId: "1:218784808902:web:c587bdf584d704f7733107",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

