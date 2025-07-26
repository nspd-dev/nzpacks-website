// js/ui-renderer.js
import { preloadImage } from './utils.js';

/**
 * Renders a single scenepack card for public display.
 * @param {object} pack - The scenepack data object.
 * @param {string} containerElementId - The ID of the HTML container element to append the card to.
 */
export async function renderScenepackCard(pack, containerElementId) {
    const container = document.getElementById(containerElementId);
    if (!container) return;

    const card = document.createElement('div');
    card.className = 'scenepack-card';

    const link = document.createElement('a');
    link.href = pack.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "block"; // Make the whole card clickable

    const img = document.createElement('img');
    let displayImageUrl = pack.imageUrl;
    try {
        // Attempt to preload the image; if it fails, use a placeholder
        await preloadImage(pack.imageUrl, 7000);
    } catch (e) {
        displayImageUrl = `https://placehold.co/300x400/000000/FFFFFF?text=No+Image`;
    }
    img.src = displayImageUrl;
    img.alt = pack.name || 'Featured Image';
    img.className = 'card-image';
    img.loading = "lazy"; // Enable native lazy loading

    const textContainer = document.createElement('div');
    textContainer.className = 'p-4';

    const titleElement = document.createElement('h4');
    titleElement.className = 'card-title';
    titleElement.textContent = pack.name;

    textContainer.appendChild(titleElement);
    if (pack.genre) {
        const genreElement = document.createElement('p');
        genreElement.className = 'text-gray-400 text-sm';
        genreElement.textContent = pack.genre;
        textContainer.appendChild(genreElement);
    }

    link.appendChild(img);
    link.appendChild(textContainer);
    card.appendChild(link);
    container.appendChild(card);
}

/**
 * Displays a list of scenepacks in a given container element.
 * @param {Array<object>} results - An array of scenepack data objects to display.
 * @param {string} containerId - The ID of the HTML container element.
 * @param {string} noResultsMessageId - The ID of the element to show when no results are found.
 */
export async function displayScenepacks(results, containerId, noResultsMessageId) {
    const container = document.getElementById(containerId);
    const noResultsMessage = document.getElementById(noResultsMessageId);

    if (!container || !noResultsMessage) return;

    container.innerHTML = ''; // Clear previous results
    noResultsMessage.classList.add('hidden'); // Hide no results message by default

    if (results.length === 0) {
        noResultsMessage.classList.remove('hidden');
        return;
    }

    // Use Promise.all to render all cards concurrently for better performance
    await Promise.all(results.map(pack => renderScenepackCard(pack, containerId)));
}

/**
 * Populates a genre filter dropdown with unique genres for a given category type.
 * @param {string} filterId - The ID of the select element for the genre filter.
 * @param {string} categoryType - The type of scenepack (e.g., 'movie', 'game') to filter genres for.
 * @param {Array<object>} allScenepacksData - The complete list of all scenepacks.
 */
export function populateGenreFilter(filterId, categoryType, allScenepacksData) {
    const filterElement = document.getElementById(filterId);
    if (!filterElement) return;

    filterElement.innerHTML = '<option value="">All Genres</option>'; // Reset options

    const uniqueGenres = [...new Set(allScenepacksData
        .filter(item => item.type === categoryType && item.genre)
        .map(item => item.genre)
    )].sort(); // Sort genres alphabetically

    uniqueGenres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        filterElement.appendChild(option);
    });
}

/**
 * Renders the table of scenepacks in the dashboard.
 * @param {Array<object>} dashboardScenepacks - The list of scenepacks to display in the table.
 * @param {string} userId - The current authenticated user's ID.
 * @param {Function} handleEditCallback - Callback function for edit button click.
 * @param {Function} handleDeleteClickCallback - Callback function for delete button click.
 */
export function renderDashboardTable(dashboardScenepacks, userId, handleEditCallback, handleDeleteClickCallback) {
    const dashboardAuthMessage = document.getElementById('dashboard-auth-message');
    const dashboardUserId = document.getElementById('dashboard-user-id');
    const dashboardScenepacksTableBody = document.getElementById('dashboard-scenepacks-table-body');
    const noDashboardScenepacks = document.getElementById('no-dashboard-scenepacks');

    // Display user ID
    dashboardUserId.textContent = `Your User ID: ${userId}`;

    dashboardScenepacksTableBody.innerHTML = ''; // Clear existing rows

    if (dashboardScenepacks.length === 0) {
        noDashboardScenepacks.classList.remove('hidden');
    } else {
        noDashboardScenepacks.classList.add('hidden');
        dashboardScenepacks.forEach((pack, index) => {
            const row = dashboardScenepacksTableBody.insertRow();
            row.className = `${index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-700'} border-b border-gray-600`;

            row.innerHTML = `
                <td class="px-4 py-3 text-white">${pack.name}</td>
                <td class="px-4 py-3 text-gray-300">${pack.type}</td>
                <td class="px-4 py-3 text-gray-300">${pack.genre || 'N/A'}</td>
                <td class="px-4 py-3">
                    <a href="${pack.url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline truncate block max-w-[150px] sm:max-w-[200px]">
                        ${pack.url}
                    </a>
                </td>
                <td class="px-4 py-3 text-center">
                    <button data-id="${pack.id}" class="btn-edit mr-2">Edit</button>
                    <button data-id="${pack.id}" class="btn-delete">Delete</button>
                </td>
            `;

            // Add event listeners to the dynamically created buttons
            row.querySelector('.btn-edit').addEventListener('click', () => handleEditCallback(pack));
            row.querySelector('.btn-delete').addEventListener('click', () => handleDeleteClickCallback(pack));
        });
    }
}

/**
 * Resets the scenepack form UI elements to their initial state.
 */
export function resetFormUI() {
    document.getElementById('scenepack-form').reset();
    document.getElementById('form-title').textContent = 'Add New Scenepack';
    document.getElementById('submit-scenepack-btn').textContent = 'Add Scenepack';
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}

/**
 * Populates the scenepack form with data for editing an existing scenepack.
 * @param {object} pack - The scenepack data object to populate the form with.
 */
export function populateFormForEdit(pack) {
    document.getElementById('scenepack-name').value = pack.name;
    document.getElementById('scenepack-type').value = pack.type;
    document.getElementById('scenepack-genre').value = pack.genre || '';
    document.getElementById('scenepack-url').value = pack.url;
    document.getElementById('scenepack-imageUrl').value = pack.imageUrl || '';

    document.getElementById('form-title').textContent = 'Edit Scenepack';
    document.getElementById('submit-scenepack-btn').textContent = 'Update Scenepack';
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
}

/**
 * Shows the delete confirmation modal with a specific message.
 * @param {string} message - The message to display in the modal.
 */
export function showConfirmModalUI(message) {
    document.getElementById('confirm-modal-message').textContent = message;
    document.getElementById('confirm-modal').classList.remove('hidden');
}

/**
 * Hides the delete confirmation modal.
 */
export function hideConfirmModalUI() {
    document.getElementById('confirm-modal').classList.add('hidden');
}

/**
 * Sets the active navigation button.
 * @param {string} pageId - The ID of the page (e.g., 'home', 'movies') to set as active.
 */
export function setActiveNavButton(pageId) {
    const navButtons = document.querySelectorAll('.header-nav-button');
    navButtons.forEach(button => button.classList.remove('active'));
    const activeButton = document.getElementById('nav-' + pageId);
    if (activeButton) {
        activeButton.classList.add('active');
    }
}

/**
 * Controls the visibility of page sections.
 * @param {string} pageId - The ID of the page section to show (e.g., 'home', 'dashboard').
 */
export function showPageSection(pageId) {
    const sections = document.querySelectorAll('.page-section');
    sections.forEach(section => section.classList.add('hidden')); // Hide all sections

    const targetSection = document.getElementById(pageId + '-section');
    if (targetSection) {
        targetSection.classList.remove('hidden'); // Show the target section
    }
}
