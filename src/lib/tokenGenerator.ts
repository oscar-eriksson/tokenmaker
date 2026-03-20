import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import initManifold from 'manifold-3d';
import manifoldWasm from 'manifold-3d/manifold.wasm?url';
import * as ClipperLib from 'clipper-lib';

// Robust 2D polygon offsetting using ClipperLib
// Robust 2D polygon operations using ClipperLib
function booleanShapesRobust(subjects: THREE.Shape[], clips: THREE.Shape[], op: number): THREE.Shape[] {
    const scale = 100000;
    const clipper = new ClipperLib.Clipper();
    
    function addShapesToClipper(shapes: THREE.Shape[], type: any) {
        for (const shape of shapes) {
            const outerPts = shape.getPoints(12);
            clipper.AddPath(outerPts.map(p => ({ X: Math.round(p.x * scale), Y: Math.round(p.y * scale) })), type, true);
            if (shape.holes && shape.holes.length > 0) {
                for (const hole of shape.holes) {
                    const holePts = hole.getPoints(12);
                    clipper.AddPath(holePts.map(p => ({ X: Math.round(p.x * scale), Y: Math.round(p.y * scale) })), type, true);
                }
            }
        }
    }

    addShapesToClipper(subjects, ClipperLib.PolyType.ptSubject);
    addShapesToClipper(clips, ClipperLib.PolyType.ptClip);

    const solutionTree = new ClipperLib.PolyTree();
    clipper.Execute(op, solutionTree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    
    const resultShapes: THREE.Shape[] = [];
    function parseNode(node: any) {
        if (!node.IsHole()) {
            const shapePts = node.Contour().map((pt: any) => new THREE.Vector2(pt.X / scale, pt.Y / scale));
            const shape = new THREE.Shape(shapePts);
            for (const child of node.Childs()) {
                const holePts = child.Contour().map((pt: any) => new THREE.Vector2(pt.X / scale, pt.Y / scale));
                shape.holes.push(new THREE.Path(holePts));
                for (const island of child.Childs()) parseNode(island);
            }
            resultShapes.push(shape);
        }
    }
    for (const child of solutionTree.Childs()) parseNode(child);
    return resultShapes;
}

function offsetShapesRobust(shapes: THREE.Shape[], amount: number): THREE.Shape[] {
    const scale = 100000;
    const co = new ClipperLib.ClipperOffset();
    const joinType = ClipperLib.JoinType.jtRound;
    const endType = ClipperLib.EndType.etClosedPolygon;

    const paths: any[][] = [];
    for (const shape of shapes) {
        const outerPts = shape.getPoints(12);
        paths.push(outerPts.map(p => ({ X: Math.round(p.x * scale), Y: Math.round(p.y * scale) })));
        if (shape.holes && shape.holes.length > 0) {
            for (const hole of shape.holes) {
                const holePts = hole.getPoints(12);
                paths.push(holePts.map(p => ({ X: Math.round(p.x * scale), Y: Math.round(p.y * scale) })));
            }
        }
    }

    co.AddPaths(paths, joinType, endType);
    const solutionTree = new ClipperLib.PolyTree();
    co.Execute(solutionTree, amount * scale);
    const resultShapes: THREE.Shape[] = [];

    function parseNode(node: any) {
        if (!node.IsHole()) {
            const shapePts = node.Contour().map((pt: any) => new THREE.Vector2(pt.X / scale, pt.Y / scale));
            const shape = new THREE.Shape(shapePts);
            for (const child of node.Childs()) {
                const holePts = child.Contour().map((pt: any) => new THREE.Vector2(pt.X / scale, pt.Y / scale));
                shape.holes.push(new THREE.Path(holePts));
                for (const island of child.Childs()) {
                    parseNode(island);
                }
            }
            resultShapes.push(shape);
        }
    }
    for (const child of solutionTree.Childs()) parseNode(child);
    return resultShapes;
}

let manifoldModule: any = null;
export async function getManifold() {
    if (manifoldModule) return manifoldModule;
    manifoldModule = await initManifold({
        locateFile: () => manifoldWasm
    });
    manifoldModule.setup();
    return manifoldModule;
}

function threeMeshToManifold(m: any, mesh: THREE.Mesh): any {
    mesh.updateMatrixWorld();
    let geometry = mesh.geometry;
    if (geometry.index) {
        geometry = geometry.toNonIndexed();
    }
    const pos = geometry.attributes.position.array as Float32Array;
    
    const matrix = mesh.matrixWorld;
    const transformedPos = new Float32Array(pos.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) {
        v.set(pos[i], pos[i+1], pos[i+2]).applyMatrix4(matrix);
        transformedPos[i] = v.x;
        transformedPos[i+1] = v.y;
        transformedPos[i+2] = v.z;
    }

    const indices = new Uint32Array(transformedPos.length / 3);
    for (let i = 0; i < indices.length; i++) indices[i] = i;

    const meshData = new m.Mesh({
        numProp: 3,
        vertProperties: transformedPos,
        triVerts: indices
    });

    meshData.merge(); // Important: Fixes common non-manifold issues in input mesh

    const manifold = m.Manifold.ofMesh(meshData);
    return manifold;
}

function manifoldToThreeMesh(mMesh: any, material: THREE.Material): THREE.Mesh {
    const mesh = mMesh.getMesh();
    const geometry = new THREE.BufferGeometry();
    
    const numVert = mesh.numVert;
    const numProp = mesh.numProp;
    const vertProperties = mesh.vertProperties;
    
    // Extract only x, y, z positions from interleaved properties
    const pos = new Float32Array(numVert * 3);
    for (let i = 0; i < numVert; i++) {
        pos[i * 3 + 0] = vertProperties[i * numProp + 0];
        pos[i * 3 + 1] = vertProperties[i * numProp + 1];
        pos[i * 3 + 2] = vertProperties[i * numProp + 2];
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
    
    // Convert to non-indexed to get sharp edges and compute normals
    const nonIndexedGeom = geometry.toNonIndexed();
    nonIndexedGeom.computeVertexNormals();
    
    // Add vertex colors for fake AO/shading
    const positions = nonIndexedGeom.attributes.position.array;
    const normals = nonIndexedGeom.attributes.normal.array;
    const colors = new Float32Array(positions.length);
    
    for (let i = 0; i < normals.length; i += 3) {
        const nx = normals[i];
        const ny = normals[i+1];
        const nz = normals[i+2];
        
        let color = 1.0; // Default (top surface)
        
        // Face points mostly up
        if (nz > 0.9) {
            color = 1.0; // Full base color
        } 
        // Face points mostly down
        else if (nz < -0.9) {
            color = 0.3; // Deep shadow
        }
        // Side walls
        else {
            color = 0.6; // Mid shadow
        }
        
        colors[i] = color;
        colors[i+1] = color;
        colors[i+2] = color;
    }
    
    nonIndexedGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const shadedMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x94a3b8, // Elegant slate blue-grey
        vertexColors: true,
        roughness: 0.4,
        metalness: 0.2
    });
    
    return new THREE.Mesh(nonIndexedGeom, shadedMaterial);
}

function shapesToPolygons(shapes: THREE.Shape[]): [number, number][][] {
    const polygons: [number, number][][] = [];
    for (const shape of shapes) {
        const points = shape.getPoints(12);
        polygons.push(points.map(p => [p.x, p.y]));
        for (const hole of shape.holes) {
            const hPoints = hole.getPoints(12);
            polygons.push(hPoints.map(p => [p.x, p.y]));
        }
    }
    return polygons;
}

let cachedFont: Font | null = null;
export async function loadFont(): Promise<Font> {
    if (cachedFont) return cachedFont;
    return new Promise((resolve, reject) => {
        const loader = new TTFLoader();
        loader.load('/fonts/Roboto-Black.ttf', (json) => {
            cachedFont = new Font(json);
            resolve(cachedFont);
        }, undefined, (err) => reject(err));
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
    iconMargin: number;
    iconDepth: number;
}

export async function createTokenGroup(options: TokenOptions, onStatusUpdate?: (status: string) => Promise<void> | void): Promise<THREE.Group> {
    const group = new THREE.Group();
    const overlap = 0.5;

    const m = await getManifold();

    // 1. Base (Three.js Extrude is simpler for bevels, then converted to manifold)
    await onStatusUpdate?.('Generating Base...');
    const radius = options.width / 2;
    const filletR = Math.min(1.0, options.height * 0.15);
    const baseDepth = Math.max(0.5, options.height - 2 * filletR);
    const circleShape = new THREE.Shape();
    circleShape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const baseGeom = new THREE.ExtrudeGeometry(circleShape, {
        depth: baseDepth,
        curveSegments: 64,
        bevelEnabled: true,
        bevelSize: filletR,
        bevelThickness: filletR,
        bevelSegments: 3,
    });
    baseGeom.translate(0, 0, -baseDepth / 2);
    const baseMesh = new THREE.Mesh(baseGeom, new THREE.MeshStandardMaterial({ color: 0xffffff }));
    baseMesh.updateMatrixWorld();

    const topZ = options.height / 2;

    // 2. Text Prep using Manifold CrossSection
    let mText: any = null;
    let mStroke: any = null;

    if (options.label.trim().length > 0) {
        await onStatusUpdate?.('Extruding Text (Manifold)...');
        const font = await loadFont();
        const ttfSize = options.textSize * (72 / 100);
        const letterShapes = font.generateShapes(options.label, ttfSize);

        // Center text in 2D
        const dummyGeom = new THREE.ShapeGeometry(letterShapes);
        dummyGeom.computeBoundingBox();
        const textCenter = dummyGeom.boundingBox!.getCenter(new THREE.Vector3());
        
        const fData = (font as any).data;
        const scaleFact = ttfSize / (fData.resolution || 1000);
        const centralY = (((fData.ascender || 800) + (fData.descender || -200)) / 2) * scaleFact;

        const textCS = m.CrossSection.ofPolygons(shapesToPolygons(letterShapes), 'NonZero');
        mText = textCS.extrude(options.textDepth + overlap)
            .translate([-textCenter.x, -centralY, -(options.textDepth + overlap) / 2])
            .rotate([0, 0, -options.textRotation])
            .translate([options.textPosX, options.textPosY, topZ - options.textDepth / 2]);
        textCS.delete();

        const strokeShapes = offsetShapesRobust(letterShapes, options.textStrokeSize);
        const strokeCS = m.CrossSection.ofPolygons(shapesToPolygons(strokeShapes), 'NonZero');
        mStroke = strokeCS.extrude(options.iconDepth + overlap)
            .translate([-textCenter.x, -centralY, -(options.iconDepth + overlap) / 2])
            .rotate([0, 0, -options.textRotation])
            .translate([options.textPosX, options.textPosY, topZ - (options.iconDepth - overlap) / 2]);
        strokeCS.delete();
    }

    // 3. Icon Prep using Manifold CrossSection
    let mIcon: any = null;
    if (options.svgContent) {
        await onStatusUpdate?.('Processing Icon (Manifold)...');
        const loader = new SVGLoader();
        const svgData = loader.parse(options.svgContent);
        const lightShapes: THREE.Shape[] = [];
        const darkShapes: THREE.Shape[] = [];

        for (const path of svgData.paths) {
            const luminance = 0.299 * path.color.r + 0.587 * path.color.g + 0.114 * path.color.b;
            const shapes = SVGLoader.createShapes(path);
            for (const shape of shapes) {
                const shapeGeom = new THREE.ShapeGeometry(shape);
                shapeGeom.computeBoundingBox();
                if (shapeGeom.boundingBox) {
                    const box = shapeGeom.boundingBox;
                    if (box.max.x - box.min.x >= 510) continue;
                }
                if (luminance >= 0.5) lightShapes.push(shape);
                else darkShapes.push(shape);
            }
        }

        if (darkShapes.length > 0 || lightShapes.length > 0) {
            const scale = Math.max(0, options.width - options.iconMargin * 2) / 512;
            const allHoleShapes: THREE.Shape[] = [...lightShapes];
            for (const s of [...darkShapes, ...lightShapes]) {
                for (const h of s.holes) {
                    allHoleShapes.push(new THREE.Shape(h.getPoints(12)));
                }
            }

            const combinedDarkShapes = booleanShapesRobust(darkShapes, allHoleShapes, ClipperLib.ClipType.ctDifference);
            const finalShapes = combinedDarkShapes.length > 0 ? combinedDarkShapes : lightShapes;

            if (finalShapes.length > 0) {
                const iconCS = m.CrossSection.ofPolygons(shapesToPolygons(finalShapes), 'NonZero');
                mIcon = iconCS.extrude(options.iconDepth + overlap)
                    .translate([-256, -256, -(options.iconDepth + overlap) / 2])
                    .scale([scale, -scale, 1])
                    .translate([options.iconPosX, options.iconPosY, topZ - options.iconDepth / 2]);
                iconCS.delete();
            }
        }
    }

    // 4. Combined Boolean using Manifold
    await onStatusUpdate?.('Boolean Operations (Manifold)...');
    
    let mBase = threeMeshToManifold(m, baseMesh);
    
    // Safety clamp (cylinder)
    const safetyGeom = new THREE.CylinderGeometry(radius + filletR, radius + filletR, options.height * 2, 64);
    safetyGeom.rotateX(Math.PI / 2);
    const mSafety = threeMeshToManifold(m, new THREE.Mesh(safetyGeom));

    let mCutter: any = null;

    if (mIcon) {
        if (mStroke) {
            mIcon = mIcon.subtract(mStroke);
            mStroke.delete();
        }
        mCutter = mIcon;
    }
    
    if (mText) {
        mCutter = mCutter ? mCutter.add(mText) : mText;
    }

    if (mCutter) {
        const mClampedCutter = mCutter.intersect(mSafety);
        mBase = mBase.subtract(mClampedCutter);
        
        mCutter.delete();
        mClampedCutter.delete();
    }

    mSafety.delete();

    const finalMesh = manifoldToThreeMesh(mBase, baseMesh.material as THREE.Material);
    mBase.delete();

    await onStatusUpdate?.('Finalizing...');
    group.add(finalMesh);
    return group;
}
