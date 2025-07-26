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

    // Log the current state of allScenepacksData for debugging
    console.log(`updateContentForPage called for page: ${page}`);
    console.log("Current allScenepacksData:", allScenepacksData);

    switch (page) {
        case 'home':
            searchInput = document.getElementById('homeSearchInput');
            resultsContainerId = 'homeScenepackResults';
            noResultsMessageId = 'noHomeResultsMessage';
            // Filter logic: if search input is empty, show all. Otherwise, filter by name.
            const homeSearchQuery = normalizeString(searchInput.value || '');
            filteredScenepacks = allScenepacksData.filter(pack =>
                homeSearchQuery === '' || normalizeString(pack.name).includes(homeSearchQuery)
            );
            break;
        case 'scenepacks': // New case for "Scenepacks" page (all types)
            searchInput = document.getElementById('scenepacksSearchInput');
            genreFilter = document.getElementById('scenepacksGenreFilter');
            resultsContainerId = 'scenepacksScenepackResults';
            noResultsMessageId = 'noScenepacksResultsMessage';

            // Populate genre filter for ALL types (pass null as categoryType)
            populateGenreFilter('scenepacksGenreFilter', null, allScenepacksData);

            const scenepacksSearchQuery = normalizeString(searchInput.value || '');
            const scenepacksSelectedGenre = genreFilter.value;

            filteredScenepacks = allScenepacksData.filter(pack => {
                const matchesSearch = scenepacksSearchQuery === '' || normalizeString(pack.name).includes(scenepacksSearchQuery);
                const matchesGenre = (scenepacksSelectedGenre === '' || (pack.genre && normalizeString(pack.genre) === normalizeString(scenepacksSelectedGenre)));
                return matchesSearch && matchesGenre; // No type filter for 'scenepacks' page
            });
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

            const categorySearchQuery = normalizeString(searchInput.value || '');
            const categorySelectedGenre = genreFilter.value;

            filteredScenepacks = allScenepacksData.filter(pack => {
                const matchesType = pack.type === typeFilter;
                const matchesSearch = categorySearchQuery === '' || normalizeString(pack.name).includes(categorySearchQuery);
                const matchesGenre = (categorySelectedGenre === '' || (pack.genre && normalizeString(pack.genre) === normalizeString(categorySelectedGenre)));
                return matchesType && matchesSearch && matchesGenre;
            });
            break;
        case 'dashboard':
            renderDashboard(); // Dashboard has its own rendering logic
            return; // Don't proceed with displayScenepacks for dashboard
        case 'how-to-download':
        case 'report-dead-link':
        case 'other':
            // These pages don't display scenepacks, so no filtering/display needed
            return;
    }

    // Sort filtered results alphabetically by name before displaying
    filteredScenepacks.sort((a, b) => a.name.localeCompare(b.name));
    console.log(`Filtered scenepacks for ${page}:`, filteredScenepacks); // Log filtered results
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
    // IMPORTANT: Replace with your actual deployed backend URL
    window.location.href = "https://scenepacks-652656771624.us-central1.run.app/login/discord";
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
        console.log("Firestore data updated. allScenepacksData:", allScenepacksData); // Log data after fetch
        // Trigger content update for the current page whenever data changes in Firestore
        updateContentForPage(currentPage);
    }, (err) => {
        console.error("Error fetching all scenepacks:", err);
        showMessage('dashboard-message', 'Failed to load data. Please check your internet connection.', true);
    });


    // --- Attach Event Listeners to UI Elements ---

    // Navigation buttons
    document.getElementById('nav-home').addEventListener('click', () => showPage('home'));
    document.getElementById('nav-scenepacks').addEventListener('click', () => showPage('scenepacks')); // New listener for 'Scenepacks'
    document.getElementById('nav-movies').addEventListener('click', () => showPage('movies'));
    document.getElementById('nav-games').addEventListener('click', () => showPage('games'));
    document.getElementById('nav-tvshows').addEventListener('click', () => showPage('tvshows'));
    document.getElementById('nav-anime').addEventListener('click', () => showPage('anime'));
    document.getElementById('nav-how-to-download').addEventListener('click', () => showPage('how-to-download')); // New listener
    document.getElementById('nav-report-dead-link').addEventListener('click', () => showPage('report-dead-link')); // New listener
    document.getElementById('nav-other').addEventListener('click', () => showPage('other')); // New listener
    document.getElementById('nav-dashboard').addEventListener('click', () => showPage('dashboard'));

    // Search and filter input listeners for each section
    document.getElementById('homeSearchInput').addEventListener('input', () => updateContentForPage('home'));

    // New listeners for scenepacks page
    document.getElementById('scenepacksSearchInput').addEventListener('input', () => updateContentForPage('scenepacks'));
    document.getElementById('scenepacksGenreFilter').addEventListener('change', () => updateContentForPage('scenepacks'));

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
