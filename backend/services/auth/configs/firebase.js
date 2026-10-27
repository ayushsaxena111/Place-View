import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert, getApps } from "firebase-admin/app";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The service account key stays at services/auth/serviceAccountKey.json (as
// before). FIREBASE_SERVICE_ACCOUNT_PATH can point somewhere else.
const keyPath = () =>
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
    : path.join(__dirname, "..", "serviceAccountKey.json");

let firebaseApp = null;

// Initialised lazily so the service can boot (and report a clear error on
// login) even when the key file is missing.
export const getFirebaseApp = () => {
  if (firebaseApp) return firebaseApp;
  if (getApps().length) {
    firebaseApp = getApps()[0];
    return firebaseApp;
  }

  const file = keyPath();
  if (!fs.existsSync(file)) {
    throw new Error(`Firebase service account key not found at ${file}`);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(file, "utf8"));
  firebaseApp = initializeApp({ credential: cert(serviceAccount) });
  return firebaseApp;
};
