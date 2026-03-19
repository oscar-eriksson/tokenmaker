import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import JSZip from 'jszip';
import { createTokenGroup, type TokenOptions } from './tokenGenerator';
import { exportStatus } from './stores';

export async function exportTokens(config: any) {
    const exporter = new STLExporter();
    const zip = new JSZip();

    // Parse labels into sequence
    const labelParts = config.labels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

    if (labelParts.length === 0) {
        labelParts.push('');
    }

    exportStatus.set({
        active: true,
        current: 0,
        total: labelParts.length,
        label: ''
    });

    // Short yield to allow the "active: true" state to trigger a DOM render of the overlay
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        let count = 0;
        for (const label of labelParts) {
            count++;
            exportStatus.update(s => ({ ...s, current: count, label: label || 'Default' }));
            
            // Yield to event loop to allow UI to update the progress bar/label text
            await new Promise(resolve => setTimeout(resolve, 50));

            const options: TokenOptions = {
                width: config.width,
                height: config.height,
                svgContent: config.svgContent,
                label: label,
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

            const group = await createTokenGroup(options);
            group.updateMatrixWorld(true);

            // STLExporter parse returns a DataView when binary is true
            const stlData = exporter.parse(group, { binary: true }) as DataView;
            const filename = label ? `token_${label}.stl` : 'token.stl';
            
            // Explicitly pass the binary view as a Uint8Array to JSZip
            const stlBuffer = new Uint8Array(stlData.buffer, stlData.byteOffset, stlData.byteLength);
            zip.file(filename, stlBuffer);
        }

        exportStatus.update(s => ({ ...s, label: 'Generating ZIP...' }));
        
        // Generate the ZIP as a Blob first
        const blob = await zip.generateAsync({ 
            type: 'blob',
            mimeType: 'application/zip',
            compression: 'DEFLATE'
        });
        
        console.log(`Export generated: ${blob.size} bytes`);

        // Use a File object instead of a raw Blob. 
        // Modern Chrome often respects the filename property of a File object 
        // better than it does the 'download' attribute of a Blob-URL link.
        const file = new File([blob], 'dnd_tokens.zip', { type: 'application/zip' });
        const url = URL.createObjectURL(file);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'dnd_tokens.zip';
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        
        // IMPORTANT: We do NOT revoke the URL immediately. 
        // For large blobs, revoking too early can cause "unreachable blob" errors 
        // if the browser hasn't finished copying the data to the download manager.
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 30000); // 30 second grace period
    } catch (err) {
        console.error("Export process failed:", err);
        throw err;
    } finally {
        exportStatus.set({
            active: false,
            current: 0,
            total: 0,
            label: ''
        });
    }
}
