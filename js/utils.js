// js/utils.js

/**
 * Normalizes a string for search and comparison.
 * Converts to lowercase, removes punctuation, and trims extra spaces.
 * @param {string} str - The input string.
 * @returns {string} The normalized string.
 */
export function normalizeString(str) {
    if (typeof str !== 'string') return '';
    str = str.toLowerCase();
    str = str.replace(/[-:()*,]/g, ' ');
    str = str.replace(/'/g, '');
    str = str.replace(/\s+/g, ' ');
    return str.trim();
}

/**
 * Preloads an image to check if it's accessible and loads correctly within a timeout.
 * @param {string} url - The URL of the image to preload.
 * @param {number} [timeout=7000] - The maximum time in milliseconds to wait for the image to load.
 * @returns {Promise<string>} A promise that resolves with the URL if the image loads successfully,
 * or rejects with an error if it fails or times out.
 */
export function preloadImage(url, timeout = 7000) {
    return new Promise((resolve, reject) => {
        if (!url) return reject(new Error("URL is empty"));
        const img = new Image();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            img.src = ""; // Stop loading to prevent further network activity
            reject(new Error("Image preload timeout"));
        }, timeout);
        img.onload = () => {
            if (!timedOut) {
                clearTimeout(timer);
                resolve(url);
            }
        };
        img.onerror = () => {
            if (!timedOut) {
                clearTimeout(timer);
                reject(new Error("Image preload error"));
            }
        };
        img.src = url;
    });
}

/**
 * Displays a message in a designated UI element.
 * @param {string} elementId - The ID of the HTML element to display the message in.
 * @param {string} message - The message text.
 * @param {boolean} [isError=false] - True if the message is an error, false for success/info.
 */
export function showMessage(elementId, message, isError = false) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.classList.remove('hidden', 'bg-red-600', 'bg-green-600');
        if (isError) {
            element.classList.add('bg-red-600');
        } else {
            element.classList.add('bg-green-600');
        }
    }
}

/**
 * Hides a message in a designated UI element.
 * @param {string} elementId - The ID of the HTML element to hide.
 */
export function hideMessage(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.add('hidden');
    }
}
