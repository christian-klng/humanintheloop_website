/**
 * Responsive image variant generator.
 * Given an image file path, generates WebP variants at standard widths.
 * Skips SVGs, videos, and GIFs (animated). Only processes raster images.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const VARIANT_WIDTHS = [640, 1280, 1920];

const PROCESSABLE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/**
 * Derive the variant filename for a given original filename and width.
 * Example: "photo.jpg" + 640 -> "photo-640w.webp"
 */
function variantFilename(originalFilename, width) {
    const ext = path.extname(originalFilename);
    const base = path.basename(originalFilename, ext);
    return `${base}-${width}w.webp`;
}

/**
 * Generate responsive WebP variants for an uploaded image.
 * Writes variants alongside the original file.
 * Returns array of generated variant info objects, or empty array if skipped/failed.
 *
 * @param {string} filePath - Absolute path to original file on disk
 * @returns {Promise<Array<{width: number, filename: string, size: number}>>}
 */
async function generateVariants(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (!PROCESSABLE_EXTENSIONS.has(ext)) {
        return [];
    }

    const dir = path.dirname(filePath);
    const originalFilename = path.basename(filePath);
    const results = [];

    try {
        const metadata = await sharp(filePath).metadata();
        const originalWidth = metadata.width;

        if (!originalWidth) {
            console.warn(`Could not read width for ${filePath}, skipping variants.`);
            return [];
        }

        for (const width of VARIANT_WIDTHS) {
            // Skip variants wider than or equal to original (no upscaling)
            if (width >= originalWidth) continue;

            const outName = variantFilename(originalFilename, width);
            const outPath = path.join(dir, outName);

            try {
                const info = await sharp(filePath)
                    .resize(width, null, {
                        withoutEnlargement: true,
                        fit: 'inside'
                    })
                    .webp({ quality: 80 })
                    .toFile(outPath);

                results.push({
                    width,
                    filename: outName,
                    size: info.size
                });
            } catch (variantErr) {
                console.error(`Failed to generate ${width}w variant for ${originalFilename}:`, variantErr.message);
            }
        }
    } catch (err) {
        console.error(`Image variant generation failed for ${filePath}:`, err.message);
    }

    return results;
}

/**
 * Delete all variants for a given original file.
 * Call this when the original file is deleted via the admin panel.
 *
 * @param {string} filePath - Absolute path to the original file
 */
function deleteVariants(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!PROCESSABLE_EXTENSIONS.has(ext)) return;

    const dir = path.dirname(filePath);
    const originalFilename = path.basename(filePath);

    for (const width of VARIANT_WIDTHS) {
        const varName = variantFilename(originalFilename, width);
        const varPath = path.join(dir, varName);
        try {
            if (fs.existsSync(varPath)) {
                fs.unlinkSync(varPath);
            }
        } catch (err) {
            console.error(`Failed to delete variant ${varName}:`, err.message);
        }
    }
}

module.exports = {
    generateVariants,
    deleteVariants,
    variantFilename,
    VARIANT_WIDTHS,
    PROCESSABLE_EXTENSIONS
};
