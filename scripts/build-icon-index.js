import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

async function fetchGitHubTree() {
    return new Promise((resolve, reject) => {
        https.get('https://api.github.com/repos/game-icons/icons/git/trees/master?recursive=1', {
            headers: { 'User-Agent': 'TokenMaker-Build-Script' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function buildIconIndex() {
    console.log('Fetching Game-Icons repository tree...');
    const treeData = await fetchGitHubTree();

    if (!treeData.tree) {
        console.error('Failed to fetch tree data', treeData);
        process.exit(1);
    }

    // Filter out only SVGs in the 1x1 directories usually or just get all the SVGs under root or author folders.
    // game-icons/icons repository structure generally looks like: `author/icon-name.svg`
    const svgs = treeData.tree
        .filter((node) => node.type === 'blob' && node.path.endsWith('.svg'))
        .map((node) => {
            const parts = node.path.split('/');
            // some paths are deeply nested, but mostly it's author/icon.svg
            const name = parts[parts.length - 1].replace('.svg', '').replace(/-/g, ' ');
            const filepath = node.path;
            return { name, path: filepath };
        });

    console.log(`Found ${svgs.length} icons. Saving to public/icons.json`);

    fs.writeFileSync(
        path.join(PUBLIC_DIR, 'icons.json'),
        JSON.stringify(svgs)
    );

    console.log('Done!');
}

buildIconIndex();
