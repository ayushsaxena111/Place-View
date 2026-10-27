
import { initializeApp } from "firebase/app";
import {getAuth, GoogleAuthProvider} from "firebase/auth"
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_APIKEY,
  authDomain: "ai-interview-d7435.firebaseapp.com",
  projectId: "ai-interview-d7435",
  storageBucket: "ai-interview-d7435.firebasestorage.app",
  messagingSenderId: "996079937851",
  appId: "1:996079937851:web:244e5605bffb77e97daf1e"
};


const app = initializeApp(firebaseConfig);

const auth = getAuth(app)

const provider = new GoogleAuthProvider()

export {auth , provider}