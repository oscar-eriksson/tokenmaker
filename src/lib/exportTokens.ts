import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import JSZip from 'jszip';
import { createTokenGroup, type TokenOptions } from './tokenGenerator';
import { exportStatus } from './stores';

export async function exportTokens(config: any) {
    const exporter = new STLExporter();
    const zip = new JSZip();

    // Parse labels into sequence
    let labelParts = config.labels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

    if (config.skipLabel) {
        labelParts = [''];
    } else if (labelParts.length === 0) {
        labelParts.push('');
    }

    exportStatus.set({
        active: true,
        complete: false,
        current: 0,
        total: labelParts.length + 1, // +1 for the final zipping step
        label: 'Initializing...',
        blob: null,
        filename: ''
    });

    // Short yield to allow the "active: true" state to trigger a DOM render of the overlay
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        let count = 0;
        for (const label of labelParts) {
            const displayLabel = label || 'Default';
            // Update label before starting processing, but keep current at the previous value (or 0 for the first one)
            exportStatus.update(s => ({ ...s, label: displayLabel }));
            
            // Yield to event loop to allow UI to update
            await new Promise(resolve => setTimeout(resolve, 50));

            const options: TokenOptions = {
                width: config.width,
                height: config.height,
                svgContent: config.svgContent,
                label: config.skipLabel ? '' : label,
                textPosX: config.textPosX,
                textPosY: config.textPosY,
                textRotation: config.textRotation,
                textSize: config.textSize,
                textDepth: config.textDepth,
                textStrokeSize: config.textStrokeSize,
                iconPosX: config.iconPosX,
                iconPosY: config.iconPosY,
                iconMargin: config.iconMargin,
                iconDepth: config.iconDepth
            };

            const group = await createTokenGroup(options, async (status) => {
                exportStatus.update(s => ({ ...s, label: `${displayLabel} (${status})` }));
                // Yield to the browser's UI thread so it can re-render the label text
                await new Promise(resolve => setTimeout(resolve, 10));
            });
            
            group.updateMatrixWorld(true);

            // STLExporter parse returns a DataView when binary is true
            const stlData = exporter.parse(group, { binary: true }) as DataView;
            const filename = label ? `token_${label}.stl` : 'token.stl';
            
            // Explicitly pass the binary view as a Uint8Array to JSZip
            const stlBuffer = new Uint8Array(stlData.buffer, stlData.byteOffset, stlData.byteLength);
            zip.file(filename, stlBuffer);

            // Increment current AFTER the token is fully processed
            count++;
            exportStatus.update(s => ({ ...s, current: count }));
        }

        exportStatus.update(s => ({ ...s, label: 'Generating ZIP...' }));
        
        // Generate the ZIP as a Blob with DEFLATE compression
        const blob = await zip.generateAsync({ 
            type: 'blob',
            mimeType: 'application/zip',
            compression: 'DEFLATE' 
        });
        
        // Count the ZIP generation as the final step
        exportStatus.update(s => ({ ...s, current: labelParts.length + 1 }));
        
        console.log(`ZIP Export generated: ${blob.size} bytes`);
        
        // More aggressive sanitization for filename
        const sanitize = (s: string) => s.replace(/[^a-z0-9]/gi, '_').toLowerCase().replace(/__+/g, '_');
        const iconPart = config.iconName ? sanitize(config.iconName) : 'no_icon';
        const labelsPart = labelParts.slice(0, 3).map((l: string) => sanitize(l)).join('_');
        const suffix = labelParts.length > 3 ? '_etc' : '';
        const sizePart = `${config.width}mm`;
        const zipFilename = `tokens_${iconPart}_${labelsPart}${suffix}_${sizePart}.zip`.replace(/__+/g, '_');
        
        console.log(`Preparing download for: ${zipFilename}`);
        
        // Update store with completion info but do NOT trigger download yet
        exportStatus.update(s => ({
            ...s,
            complete: true,
            label: 'Ready for Download',
            blob: blob,
            filename: zipFilename
        }));

    } catch (err) {
        console.error("Export process failed:", err);
        // Reset state on error
        exportStatus.set({
            active: false,
            complete: false,
            current: 0,
            total: 0,
            label: '',
            blob: null,
            filename: ''
        });
        throw err;
    }
}
