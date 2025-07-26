// js/app.js
import { initializeFirebase, db, auth, userId, isAuthReady, appId, userDiscordInfo } from './firebase-init.js';
import { normalizeString, showMessage, hideMessage } from './utils.js';
import {
    displayScenepacks,
    populateGenreFilter,
    renderDashboardTable,
    resetFormUI,
    populateFormForEdit,
    showConfirmModalUI,
    hideConfirmModalUI,
    setActiveNavButton,
    showPageSection,
    showDiscordLoginUI,
    showDashboardContentUI,
    displayDiscordProfile,
    hideDiscordProfile
} from './ui-renderer.js';
import { addScenepack, updateScenepack, deleteScenepack } from './data-operations.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Global Application State Variables ---
let allScenepacksData = []; // Stores all scenepacks fetched from Firestore
let currentEditingScenepackId = null; // To track which scenepack is being edited
let scenepackToDelete = null; // Stores the pack to be deleted
let currentPage = 'home'; // Tracks the currently active page

// --- Page Navigation and Content Management ---

/**
 * Switches the displayed page and updates navigation.
 * @param {string} pageId - The ID of the page to navigate to (e.g., 'home', 'movies', 'dashboard').
 */
function showPage(pageId) {
    showPageSection(pageId); // Show the target section
    setActiveNavButton(pageId); // Update active class for navigation buttons

    currentPage = pageId; // Update current page state
    updateContentForPage(pageId); // Refresh content for the new page
}

/**
 * Updates content for a specific page based on current filters/search.
 * This function is called when navigating to a page or when search/filter inputs change.
 * @param {string} page - The ID of the current page.
 */
function updateContentForPage(page) {
    let filteredScenepacks = [];
    let searchInput, genreFilter, resultsContainerId, noResultsMessageId, typeFilter;

    switch (page) {
        case 'home':
            searchInput = document.getElementById('homeSearchInput');
            resultsContainerId = 'homeScenepackResults';
            noResultsMessageId = 'noHomeResultsMessage';
            filteredScenepacks = allScenepacksData.filter(pack =>
                normalizeString(pack.name).includes(normalizeString(searchInput.value || ''))
            );
            break;
        case 'movies':
        case 'games':
        case 'tvshows':
        case 'anime':
            typeFilter = page.slice(0, -1); // Extracts 'movie', 'game', etc.
            searchInput = document.getElementById(`${typeFilter}SearchInput`);
            genreFilter = document.getElementById(`${typeFilter}GenreFilter`);
            resultsContainerId = `${typeFilter}ScenepackResults`;
            noResultsMessageId = `no${page.charAt(0).toUpperCase() + page.slice(1)}ResultsMessage`;

            // Populate genre filter on page load/switch
            populateGenreFilter(`${typeFilter}GenreFilter`, typeFilter, allScenepacksData);

            filteredScenepacks = allScenepacksData.filter(pack => {
                const matchesType = pack.type === typeFilter;
                const matchesSearch = normalizeString(pack.name).includes(normalizeString(searchInput.value || ''));
                const matchesGenre = (genreFilter.value === '' || (pack.genre && normalizeString(pack.genre) === normalizeString(genreFilter.value)));
                return matchesType && matchesSearch && matchesGenre;
            });
            break;
        case 'dashboard':
            renderDashboard(); // Dashboard has its own rendering logic
            return; // Don't proceed with displayScenepacks for dashboard
    }

    // Sort filtered results alphabetically by name before displaying
    filteredScenepacks.sort((a, b) => a.name.localeCompare(b.name));
    displayScenepacks(filteredScenepacks, resultsContainerId, noResultsMessageId);
}

// --- Dashboard Logic ---

/**
 * Renders the dashboard view, including authentication status and scenepack table.
 */
async function renderDashboard() {
    const dashboardAuthMessage = document.getElementById('dashboard-auth-message');
    const dashboardUserIdElement = document.getElementById('dashboard-user-id');

    if (!isAuthReady) {
        dashboardAuthMessage.textContent = "Loading authentication status...";
        showDiscordLoginUI(); // Show login UI while loading
        dashboardUserIdElement.textContent = '';
        hideDiscordProfile();
        return;
    }

    // Check if user is logged in via Discord and has the required role
    if (userDiscordInfo.hasRequiredRole && userDiscordInfo.id) {
        showDashboardContentUI(); // Show form and table
        displayDiscordProfile(userDiscordInfo.pfp, userDiscordInfo.username); // Display Discord profile
        dashboardUserIdElement.textContent = `Your Discord User ID: ${userDiscordInfo.id}`;

        // Filter scenepacks to show only those created by the current user
        const dashboardScenepacks = allScenepacksData.filter(pack => pack.creatorId === userDiscordInfo.id);
        dashboardScenepacks.sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

        renderDashboardTable(dashboardScenepacks, userDiscordInfo.id, handleEdit, handleDeleteClick);
    } else {
        // User is not authenticated with Discord or doesn't have the role
        showDiscordLoginUI(); // Show login button and message
        dashboardUserIdElement.textContent = '';
        hideDiscordProfile();
    }
}

/**
 * Handles form submission for adding or updating scenepacks.
 * @param {Event} event - The form submission event.
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    hideMessage('dashboard-message');

    const name = document.getElementById('scenepack-name').value;
    const type = document.getElementById('scenepack-type').value;
    const genre = document.getElementById('scenepack-genre').value;
    const url = document.getElementById('scenepack-url').value;
    const imageUrl = document.getElementById('scenepack-imageUrl').value;

    if (!name || !type || !url) {
        showMessage('dashboard-message', 'Please fill in all required fields (Name, Type, URL).', true);
        return;
    }

    if (!db || !userDiscordInfo.id) {
        showMessage('dashboard-message', 'Database not initialized or user not authenticated.', true);
        return;
    }

    try {
        const scenepackData = {
            name,
            type,
            genre,
            url,
            imageUrl,
            creatorId: userDiscordInfo.id // Assign the current Discord user's ID as creator
        };

        if (currentEditingScenepackId) {
            await updateScenepack(currentEditingScenepackId, scenepackData);
            showMessage('dashboard-message', 'Scenepack updated successfully!');
        } else {
            await addScenepack(scenepackData);
            showMessage('dashboard-message', 'Scenepack added successfully!');
        }
        resetFormAndState(); // Reset form and internal state after successful operation
    } catch (err) {
        console.error("Error saving scenepack:", err);
        showMessage('dashboard-message', `Error: ${err.message || 'Failed to save scenepack. Check console for details.'}`, true);
    }
}

/**
 * Resets the scenepack form UI and internal editing state.
 */
function resetFormAndState() {
    resetFormUI(); // Resets the form elements
    currentEditingScenepackId = null; // Clear the editing ID
    hideMessage('dashboard-message'); // Hide any messages
}

/**
 * Populates the form for editing an existing scenepack.
 * @param {object} pack - The scenepack data object to load into the form.
 */
function handleEdit(pack) {
    // Ensure the user owns this scenepack before allowing edit
    if (pack.creatorId !== userDiscordInfo.id) {
        showMessage('dashboard-message', 'You can only edit your own scenepacks.', true);
        return;
    }
    populateFormForEdit(pack); // Populates form elements
    currentEditingScenepackId = pack.id; // Set the editing ID
    hideMessage('dashboard-message'); // Clear any messages
}

/**
 * Initiates the delete confirmation flow by showing a modal.
 * @param {object} pack - The scenepack data object to be deleted.
 */
function handleDeleteClick(pack) {
    // Ensure the user owns this scenepack before allowing delete
    if (pack.creatorId !== userDiscordInfo.id) {
        showMessage('dashboard-message', 'You can only delete your own scenepacks.', true);
        return;
    }
    scenepackToDelete = pack; // Store the scenepack to be deleted
    showConfirmModalUI(`Are you sure you want to delete "${pack.name}"?`);
}

/**
 * Confirms and executes the deletion of the currently selected scenepack.
 */
async function confirmDelete() {
    if (!scenepackToDelete || !db) return;

    try {
        await deleteScenepack(scenepackToDelete.id);
        showMessage('dashboard-message', 'Scenepack deleted successfully!');
        hideConfirmModalUI();
        resetFormAndState(); // Reset form and state after deletion
    } catch (err) {
        console.error("Error deleting scenepack:", err);
        showMessage('dashboard-message', `Error: ${err.message || 'Failed to delete scenepack.'}`, true);
        hideConfirmModalUI();
    } finally {
        scenepackToDelete = null; // Clear the stored scenepack
    }
}

/**
 * Cancels the delete operation and hides the confirmation modal.
 */
function cancelDelete() {
    scenepackToDelete = null;
    hideConfirmModalUI();
}

/**
 * Initiates the Discord OAuth login process by redirecting to the backend.
 */
function startDiscordLogin() {
    // Redirect to your Flask backend's Discord login endpoint
    window.location.href = "https://scenepacks-652656771624.us-central1.run.app/login/discord"; // Updated for deployment!
}

// --- Initialization and Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Firebase and set up auth listener
    await initializeFirebase(
        (currentUserId, authReady) => {
            // This callback runs when auth state changes or is initially determined
            // It ensures UI updates based on authentication status (e.g., dashboard access)
            if (authReady) {
                updateContentForPage(currentPage);
            }
        },
        (errorMessage) => {
            // Handle Firebase initialization errors
            showMessage('dashboard-message', errorMessage, true);
        }
    );

    // Set up real-time listener for all scenepacks data from Firestore
    // This listener keeps `allScenepacksData` up-to-date across the entire application
    const scenepacksCollectionRef = collection(db, `artifacts/${appId}/public/data/scenepacks`);
    onSnapshot(scenepacksCollectionRef, (snapshot) => {
        allScenepacksData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        // Trigger content update for the current page whenever data changes in Firestore
        updateContentForPage(currentPage);
    }, (err) => {
        console.error("Error fetching all scenepacks:", err);
        showMessage('dashboard-message', 'Failed to load data. Please check your internet connection.', true);
    });


    // --- Attach Event Listeners to UI Elements ---

    // Navigation buttons
    document.getElementById('nav-home').addEventListener('click', () => showPage('home'));
    document.getElementById('nav-movies').addEventListener('click', () => showPage('movies'));
    document.getElementById('nav-games').addEventListener('click', () => showPage('games'));
    document.getElementById('nav-tvshows').addEventListener('click', () => showPage('tvshows'));
    document.getElementById('nav-anime').addEventListener('click', () => showPage('anime'));
    document.getElementById('nav-dashboard').addEventListener('click', () => showPage('dashboard'));

    // Search and filter input listeners for each section
    document.getElementById('homeSearchInput').addEventListener('input', () => updateContentForPage('home'));

    document.getElementById('movieSearchInput').addEventListener('input', () => updateContentForPage('movies'));
    document.getElementById('movieGenreFilter').addEventListener('change', () => updateContentForPage('movies'));

    document.getElementById('gameSearchInput').addEventListener('input', () => updateContentForPage('games'));
    document.getElementById('gameGenreFilter').addEventListener('change', () => updateContentForPage('games'));

    document.getElementById('tvshowSearchInput').addEventListener('input', () => updateContentForPage('tvshows'));
    document.getElementById('tvshowGenreFilter').addEventListener('change', () => updateContentForPage('tvshows'));

    document.getElementById('animeSearchInput').addEventListener('input', () => updateContentForPage('anime'));
    document.getElementById('animeGenreFilter').addEventListener('change', () => updateContentForPage('anime'));

    // Dashboard specific event listeners
    document.getElementById('discord-login-btn').addEventListener('click', startDiscordLogin);
    document.getElementById('scenepack-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('cancel-edit-btn').addEventListener('click', resetFormAndState);

    // Dashboard modal buttons
    document.getElementById('confirm-delete-btn').addEventListener('click', confirmDelete);
    document.getElementById('cancel-delete-btn').addEventListener('click', cancelDelete);

    // Show the home page initially when the app loads
    showPage('home');
});
