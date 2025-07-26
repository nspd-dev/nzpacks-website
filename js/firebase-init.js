// js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Global Firebase Variables ---
export let app;
export let db;
export let auth;
export let userId = null; // Will now store Discord User ID if logged in via Discord
export let isAuthReady = false;
export let appId = 'default-app-id'; // Default for local dev, will be overridden by __app_id
export let userDiscordInfo = { // Stores Discord profile data
    id: null,
    username: null,
    pfp: null,
    hasRequiredRole: false // Custom claim from Firebase token
};

/**
 * Initializes Firebase, sets up authentication, and handles Discord OAuth callback.
 * @param {Function} onAuthStatusChangeCallback - Callback function to be called when auth status changes.
 * @param {Function} onFirebaseErrorCallback - Callback function to handle Firebase initialization errors.
 */
export async function initializeFirebase(onAuthStatusChangeCallback, onFirebaseErrorCallback) {
    try {
        // Access global variables provided by the Canvas environment
        appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
        // __initial_auth_token is primarily for Canvas environment's internal auth,
        // we will prioritize Discord auth if available.
        // const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        if (!firebaseConfig) {
            console.error("Firebase config not found. Please ensure __firebase_config is set.");
            onFirebaseErrorCallback('Firebase config not found. Cannot initialize.');
            return;
        }

        // Initialize Firebase app, Firestore database, and Auth service
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Listen for auth state changes to get the user ID and confirm auth readiness
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid; // Firebase UID is now Discord User ID
                // Fetch custom claims to get Discord profile info
                try {
                    const idTokenResult = await user.getIdTokenResult();
                    userDiscordInfo = {
                        id: user.uid,
                        username: idTokenResult.claims.discord_username || user.displayName,
                        pfp: idTokenResult.claims.discord_pfp || user.photoURL,
                        hasRequiredRole: idTokenResult.claims.has_role || false
                    };
                    console.log("Firebase user authenticated:", user.uid, "Discord Info:", userDiscordInfo);
                } catch (error) {
                    console.error("Error fetching custom claims:", error);
                    // Fallback to basic user info if claims fail
                    userDiscordInfo = {
                        id: user.uid,
                        username: user.displayName,
                        pfp: user.photoURL,
                        hasRequiredRole: false
                    };
                }
            } else {
                userId = null;
                userDiscordInfo = { id: null, username: null, pfp: null, hasRequiredRole: false };
            }
            isAuthReady = true;
            onAuthStatusChangeCallback(userId, isAuthReady); // Notify app.js of auth status change
        });

        // Handle Discord OAuth callback parameters from the URL fragment
        const fragment = window.location.hash.substring(1); // Get fragment without '#'
        const params = new URLSearchParams(fragment);
        const discordToken = params.get('token');
        const discordStatus = params.get('status');
        const discordUserIdFromUrl = params.get('discord_user_id'); // Discord user ID from URL
        const discordUsernameFromUrl = params.get('discord_username');
        const discordPfpFromUrl = params.get('discord_pfp');

        // Clear fragment to prevent re-processing on refresh
        if (fragment) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }

        if (discordToken && discordStatus === 'success') {
            try {
                // Sign in to Firebase with the custom token from the Python backend
                await signInWithCustomToken(auth, discordToken);
                console.log("Signed in to Firebase with Discord custom token.");
                // The onAuthStateChanged listener will pick up the user and claims
            } catch (authError) {
                console.error("Error signing in with Discord custom token:", authError);
                onFirebaseErrorCallback(`Discord login failed: ${authError.message}`);
                // Fallback to anonymous if Discord custom token fails
                try {
                    await signInAnonymously(auth);
                    console.log("Signed in anonymously after Discord token failure.");
                } catch (anonError) {
                    console.error("Failed to sign in anonymously:", anonError);
                    onFirebaseErrorCallback(`Authentication failed: ${anonError.message}`);
                }
            }
        } else if (!auth.currentUser) {
            // If no Discord token or it failed, and not already authenticated, sign in anonymously
            try {
                await signInAnonymously(auth);
                console.log("Signed in anonymously.");
            } catch (anonError) {
                console.error("Failed to sign in anonymously:", anonError);
                onFirebaseErrorCallback(`Authentication failed: ${anonError.message}`);
            }
        }

    } catch (error) {
        console.error("Failed to initialize Firebase:", error);
        onFirebaseErrorCallback(`Failed to initialize application: ${error.message}`);
    }
}
