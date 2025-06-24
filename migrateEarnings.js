import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  updateDoc,
  doc,
} from "firebase/firestore";

const firebaseConfig = {
  // TODO: provide your firebase config
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrateEarnings() {
  const eventsSnap = await getDocs(collection(db, "events"));

  for (const eventDoc of eventsSnap.docs) {
    const eventId = eventDoc.id;
    const data = eventDoc.data();

    for (const entry of data.attended || []) {
      if (!entry.id || typeof entry.earnings !== "number") continue;
      const playerRef = doc(db, "players", entry.id);
      const playerSnap = await getDoc(playerRef);
      if (!playerSnap.exists()) continue;

      const currentData = playerSnap.data();
      const oldHistory = currentData.earningsHistory || [];

      await updateDoc(playerRef, {
        earningsHistory: [
          ...oldHistory,
          { eventId, amount: entry.earnings },
        ],
      });
    }
  }

  console.log("Earnings migration complete.");
}

migrateEarnings().catch((err) => {
  console.error("Migration failed", err);
});
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  updateDoc,
  doc,
} from "firebase/firestore";

const firebaseConfig = {
  // TODO: provide your firebase config
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrateEarnings() {
  const eventsSnap = await getDocs(collection(db, "events"));

  for (const eventDoc of eventsSnap.docs) {
    const eventId = eventDoc.id;
    const data = eventDoc.data();

    for (const entry of data.attended || []) {
      if (!entry.id || typeof entry.earnings !== "number") continue;
      const playerRef = doc(db, "players", entry.id);
      const playerSnap = await getDoc(playerRef);
      if (!playerSnap.exists()) continue;

      const currentData = playerSnap.data();
      const oldHistory = currentData.earningsHistory || [];

      await updateDoc(playerRef, {
        earningsHistory: [
          ...oldHistory,
          { eventId, amount: entry.earnings },
        ],
      });
    }
  }

  console.log("Earnings migration complete.");
}

migrateEarnings().catch((err) => {
  console.error("Migration failed", err);
});
