// js/data-operations.js
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId } from './firebase-init.js'; // Import db and appId from firebase-init

/**
 * Adds a new scenepack to Firestore.
 * @param {object} scenepackData - The data for the new scenepack.
 * @returns {Promise<void>} A promise that resolves when the scenepack is added.
 * @throws {Error} If the database is not initialized or the operation fails.
 */
export async function addScenepack(scenepackData) {
    if (!db) {
        throw new Error('Firestore database not initialized.');
    }
    await addDoc(collection(db, `artifacts/${appId}/public/data/scenepacks`), scenepackData);
}

/**
 * Updates an existing scenepack in Firestore.
 * @param {string} scenepackId - The ID of the scenepack to update.
 * @param {object} scenepackData - The updated data for the scenepack.
 * @returns {Promise<void>} A promise that resolves when the scenepack is updated.
 * @throws {Error} If the database is not initialized or the operation fails.
 */
export async function updateScenepack(scenepackId, scenepackData) {
    if (!db) {
        throw new Error('Firestore database not initialized.');
    }
    const scenepackRef = doc(db, `artifacts/${appId}/public/data/scenepacks`, scenepackId);
    await updateDoc(scenepackRef, scenepackData);
}

/**
 * Deletes a scenepack from Firestore.
 * @param {string} scenepackId - The ID of the scenepack to delete.
 * @returns {Promise<void>} A promise that resolves when the scenepack is deleted.
 * @throws {Error} If the database is not initialized or the operation fails.
 */
export async function deleteScenepack(scenepackId) {
    if (!db) {
        throw new Error('Firestore database not initialized.');
    }
    const scenepackRef = doc(db, `artifacts/${appId}/public/data/scenepacks`, scenepackId);
    await deleteDoc(scenepackRef);
}
