/**
 * rating-detector.js — Shared Pressure Rating Detection
 * Replaces duplicated detectRating logic in weight-service.js and integration-bridge.js.
 * Uses pressureRatingMap from config (defaults.js).
 *
 * Lookup strategy: keywords are sorted by length (longest first) then checked
 * against the input string. This prevents false matches (e.g., "1500" matches
 * before "150" or "15").
 */

import { getConfig } from '../config/config-store.js';
import { gate } from './gate-logger.js';

/**
 * Detect pressure rating from a class/rating string.
 * @param {string} pipingClass - e.g. "150LB", "300#", "A1-150", "100*"
 * @returns {number|null} Rating value or null
 */
export function detectRating(pipingClass) {
    if (!pipingClass) return null;
    const clean = String(pipingClass).trim().toUpperCase();
    if (!clean) return null;

    const config = getConfig();
    const ratingMap = config?.pressureRatingMap;
    if (!ratingMap) return null;

    // Sort keywords by length (longest first) to avoid false matches
    // e.g., "1500" must be checked before "150", "100*" before "100"
    const sortedKeys = Object.keys(ratingMap)
        .sort((a, b) => b.length - a.length);

    for (const keyword of sortedKeys) {
        if (clean.includes(keyword.toUpperCase())) {
            gate('RatingDetector', 'detectRating', 'Rating Detected', {
                input: pipingClass, keyword, result: ratingMap[keyword], method: 'config-table'
            });
            return ratingMap[keyword];
        }
    }

    gate('RatingDetector', 'detectRating', 'Rating Not Found', {
        input: pipingClass, method: 'config-table-miss'
    });
    return null;
}
