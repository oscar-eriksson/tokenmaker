import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { Font, FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { SUBTRACTION, INTERSECTION, ADDITION, Evaluator, Brush } from 'three-bvh-csg';

// Helper to safely convert evaluated meshes back into CSG Brushes for continuous grouping
function toBrush(mesh: THREE.Mesh | Brush): Brush {
    if (mesh instanceof Brush) {
        mesh.updateMatrixWorld();
        return mesh;
    }
    const b = new Brush(mesh.geometry, mesh.material);
    b.position.copy(mesh.position);
    b.rotation.copy(mesh.rotation);
    b.scale.copy(mesh.scale);
    b.updateMatrixWorld();
    return b;
}

let cachedFont: Font | null = null;

export async function loadFont(): Promise<Font> {
    if (cachedFont) return cachedFont;

    return new Promise((resolve, reject) => {
        const loader = new TTFLoader();
        loader.load(
            '/fonts/Roboto-Black.ttf',
            (json) => {
                cachedFont = new Font(json);
                resolve(cachedFont);
            },
            undefined,
            (err) => reject(err)
        );
    });
}

export interface TokenOptions {
    width: number;
    height: number;
    svgContent: string | null;
    label: string;
    textPosX: number;
    textPosY: number;
    textRotation: number;
    textSize: number;
    textDepth: number;
    textStrokeSize: number;
    iconPosX: number;
    iconPosY: number;
    iconMargin: number; // Space around the icon (so it doesn't scrape the edge)
    iconDepth: number;
}

export async function createTokenGroup(options: TokenOptions): Promise<THREE.Group> {
    const group = new THREE.Group();
    const overlap = 0.1; // 0.1mm overlap for tight, manifold CSG unions

    // 1. Base Cylinder
    const radius = options.width / 2;
    const baseGeom = new THREE.CylinderGeometry(radius, radius, options.height, 64);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.rotation.x = Math.PI / 2; // point up
    baseMesh.updateMatrixWorld();

    let finalTokenMesh: THREE.Mesh = baseMesh;
    const evaluator = new Evaluator();
    evaluator.useGroups = true; // VERY IMPORTANT: Preserves multi-materials (colors) physically!

    // Z position for features to sit on top of the base
    const topZ = options.height / 2;

    // 2. Text Label & Cutout Logic
    let iconMesh: THREE.Mesh | null = null;
    let textCutterBrush: Brush | null = null;
    let strokeMeshToRender: THREE.Mesh | null = null;
    let textMeshToRender: THREE.Mesh | null = null;

    if (options.label.trim().length > 0) {
        const font = await loadFont();

        const innerGeom = new TextGeometry(options.label, {
            font: font,
            size: options.textSize,
            depth: options.textDepth + overlap,
            curveSegments: 12,
            bevelEnabled: false,
        });
        innerGeom.computeBoundingBox();
        const innerCenter = innerGeom.boundingBox!.getCenter(new THREE.Vector3());

        if (options.textStrokeSize > 0) {
            // Text Cutter (Inner Text used to carve a hole)
            const cutterGeom = innerGeom.clone();
            // Important: We only want the cutter to slightly breach the geometry it's cutting,
            // not extend infinitely. Coplanar large planes confuse the CSG engine and create 
            // zero-thickness non-manifold edges. We'll make it precisely as deep as the stroke + overlap.
            cutterGeom.translate(-innerCenter.x, -innerCenter.y, -(options.textDepth + overlap * 2) / 2);

            const cutterMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
            textCutterBrush = new Brush(cutterGeom, cutterMat);
            // Position cutter slightly lower than the top to guarantee it breaches the top surface
            textCutterBrush.position.set(options.textPosX, options.textPosY, topZ - overlap);
            textCutterBrush.rotation.z = THREE.MathUtils.degToRad(-options.textRotation);
            textCutterBrush.updateMatrixWorld();

            // Solid Stroke (Outer Bevel boundary)
            const outerGeom = new TextGeometry(options.label, {
                font: font,
                size: options.textSize,
                depth: options.textDepth + overlap,
                curveSegments: 12,
                bevelEnabled: true,
                bevelThickness: 0.1,
                bevelSize: options.textStrokeSize,
                bevelSegments: 3
            });

            outerGeom.computeBoundingBox();
            const outerCenter = outerGeom.boundingBox!.getCenter(new THREE.Vector3());
            outerGeom.translate(-outerCenter.x, -outerCenter.y, -(options.textDepth + overlap) / 2);

            const outerMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
            const outerBrush = new Brush(outerGeom, outerMat);
            // Push stroke down by `overlap` so it embeds into the base cylinder cleanly
            outerBrush.position.set(options.textPosX, options.textPosY, topZ + (options.textDepth - overlap) / 2 - overlap);
            outerBrush.rotation.z = THREE.MathUtils.degToRad(-options.textRotation);
            outerBrush.updateMatrixWorld();

            // For carving the hollow stroke itself, create a matching local brush that cleanly
            // bisects the stroke geometry without producing coplanar artifact walls.
            const strokeCutterGeom = innerGeom.clone();
            strokeCutterGeom.translate(-innerCenter.x, -innerCenter.y, -(options.textDepth + overlap * 4) / 2);

            const strokeCutterBrush = new Brush(strokeCutterGeom, cutterMat);
            strokeCutterBrush.position.set(options.textPosX, options.textPosY, topZ + (options.textDepth - overlap) / 2 - overlap);
            strokeCutterBrush.rotation.z = THREE.MathUtils.degToRad(-options.textRotation);
            strokeCutterBrush.updateMatrixWorld();

            // Subtract cutter from outer boundary to get the hollow Stroke shape
            strokeMeshToRender = evaluator.evaluate(outerBrush, strokeCutterBrush, SUBTRACTION);
        } else {
            // Normal solid text (embossed)
            innerGeom.translate(-innerCenter.x, -innerCenter.y, -(options.textDepth + overlap) / 2);
            const textMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
            textMeshToRender = new THREE.Mesh(innerGeom, textMat);
            // Push text down by `overlap` so it embeds into the base cylinder cleanly
            textMeshToRender.position.set(options.textPosX, options.textPosY, topZ + (options.textDepth - overlap) / 2 - overlap);
            textMeshToRender.rotation.z = THREE.MathUtils.degToRad(-options.textRotation);
        }
    }

    // 3. Icon (SVG) - Rendered after text to apply CSG cut
    if (options.svgContent) {
        const loader = new SVGLoader();
        const svgData = loader.parse(options.svgContent);

        const material = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const allShapes: THREE.Shape[] = [];

        for (const path of svgData.paths) {
            const shapes = SVGLoader.createShapes(path);
            for (const shape of shapes) {
                const shapeGeom = new THREE.ShapeGeometry(shape);
                shapeGeom.computeBoundingBox();
                if (shapeGeom.boundingBox) {
                    const box = shapeGeom.boundingBox;
                    const w = box.max.x - box.min.x;
                    const h = box.max.y - box.min.y;
                    if (w >= 510 && h >= 510 && shape.holes.length === 0) {
                        continue;
                    }
                }
                allShapes.push(shape);
            }
        }

        if (allShapes.length > 0) {
            const iconGeom = new THREE.ExtrudeGeometry(allShapes, {
                depth: options.iconDepth + overlap,
                bevelEnabled: false,
            });

            iconGeom.computeBoundingBox();
            const box = iconGeom.boundingBox!;
            const center = box.getCenter(new THREE.Vector3());
            const maxDim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y);

            const diameterMinusMargins = Math.max(0, options.width - (options.iconMargin * 2));
            const targetSize = diameterMinusMargins;
            const scale = targetSize / maxDim;

            iconMesh = new THREE.Mesh(iconGeom, material);
            iconGeom.translate(-center.x, -center.y, -(options.iconDepth + overlap) / 2);

            iconMesh.scale.set(scale, -scale, 1);
            // Push icon down by `overlap` so it embeds into the base cylinder cleanly
            iconMesh.position.set(options.iconPosX, options.iconPosY, topZ + (options.iconDepth - overlap) / 2 - overlap);
            iconMesh.updateMatrixWorld();
        }
    }

    // 4. Sequentially UNION everything via CSG to guarantee a Manifold STL Export
    // (A) Merge Vector Icon into Base
    if (iconMesh) {
        let finalIconBrush = toBrush(iconMesh);

        // Clip Icon bounds to Token Radius Margin
        const innerRadius = Math.max(0, radius - options.iconMargin);
        const clipGeom = new THREE.CylinderGeometry(innerRadius, innerRadius, options.height * 10, 64);
        clipGeom.rotateX(Math.PI / 2);
        const clipBrush = new Brush(clipGeom, new THREE.MeshBasicMaterial());
        clipBrush.position.z = 0;
        clipBrush.updateMatrixWorld();

        finalIconBrush = toBrush(evaluator.evaluate(finalIconBrush, clipBrush, INTERSECTION));

        // Let the Text Cutter hollow out the Icon (game-icons native feature matching)
        if (textCutterBrush) {
            finalIconBrush = toBrush(evaluator.evaluate(finalIconBrush, textCutterBrush, SUBTRACTION));
        }

        // Union the final clipped/carved Icon onto the Token Base
        finalTokenMesh = evaluator.evaluate(toBrush(finalTokenMesh), finalIconBrush, ADDITION);
    }

    // (B) Merge Text Stroke onto Base
    if (strokeMeshToRender) {
        finalTokenMesh = evaluator.evaluate(toBrush(finalTokenMesh), toBrush(strokeMeshToRender), ADDITION);
    }

    // (C) Merge Solid Text onto Base
    if (textMeshToRender) {
        finalTokenMesh = evaluator.evaluate(toBrush(finalTokenMesh), toBrush(textMeshToRender), ADDITION);
    }

    // Add the single, unified, manifold mesh to the scene
    group.add(finalTokenMesh);

    return group;
}
