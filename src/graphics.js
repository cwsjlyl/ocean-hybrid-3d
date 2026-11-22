import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { getSeabedHeight, PHYSICS_CONSTANTS } from './physics.js';

/**
 * Nintendo Switch 級別風格化 PBR 水族館渲染管線（靈感源自《集合啦！動物森友會》博物館水族館）
 * 包含：PMREM 程序化海底環境光反射、Fresnel 邊緣補光 Shader、雙層焦散、體積耶穌光柱、3D 關節生物建模
 */

const SHARED_RIM_COLOR = new THREE.Color(0x7ef9ff);

/**
 * 為 MeshStandardMaterial 注入任天堂風格 Fresnel 邊緣補光（Rim Light），提升水下輪廓立體感
 */
export function enhanceMaterialSwitchStyle(material, rimStrength = 0.34, rimHex = null) {
    if (!material || material.userData?.switchEnhanced) return material;
    material.userData = material.userData || {};
    material.userData.switchEnhanced = true;

    const rimColor = rimHex ? new THREE.Color(rimHex) : SHARED_RIM_COLOR;
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uRimColor = { value: rimColor };
        shader.uniforms.uRimStrength = { value: rimStrength };
        shader.fragmentShader =
            `uniform vec3 uRimColor;\nuniform float uRimStrength;\n` +
            shader.fragmentShader.replace(
                '#include <lights_fragment_end>',
                `#include <lights_fragment_end>
                vec3 switchViewDir = normalize( vViewPosition );
                float switchRim = 1.0 - max( 0.0, abs( dot( normal, switchViewDir ) ) );
                totalEmissiveRadiance += uRimColor * pow( switchRim, 2.5 ) * uRimStrength;`
            );
    };
    material.customProgramCacheKey = () => `switch-rim-${rimStrength.toFixed(2)}-${rimColor.getHexString()}`;
    return material;
}

/**
 * 建立程序化海底 IBL 環境貼圖（無需外部 HDR 檔案，離線與 Google Sites 100% 可用）
 */
export function setupSwitchLightingAndEnv(renderer, scene) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x0a6ca8);

    // 海面天窗亮光圓盤
    const skyLightMesh = new THREE.Mesh(
        new THREE.CircleGeometry(18, 32),
        new THREE.MeshBasicMaterial({ color: 0x9ff8ff, side: THREE.DoubleSide })
    );
    skyLightMesh.position.set(0, 20, 0);
    skyLightMesh.rotation.x = Math.PI / 2;
    envScene.add(skyLightMesh);

    // 海底暖沙漫反射底盤
    const sandBounceMesh = new THREE.Mesh(
        new THREE.CircleGeometry(22, 32),
        new THREE.MeshBasicMaterial({ color: 0xe8c99b, side: THREE.DoubleSide })
    );
    sandBounceMesh.position.set(0, -16, 0);
    sandBounceMesh.rotation.x = -Math.PI / 2;
    envScene.add(sandBounceMesh);

    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    pmrem.dispose();

    // 半球環境光（海面青藍 + 沙底暖金）
    const hemiLight = new THREE.HemisphereLight(0x8cf4ff, 0xd4b483, 1.35);
    hemiLight.position.set(0, 30, 0);
    scene.add(hemiLight);

    // 主陽光（帶柔和陰影）
    const sunLight = new THREE.DirectionalLight(0xfffbe8, 1.85);
    sunLight.position.set(14, 34, 16);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 6;
    sunLight.shadow.camera.far = 68;
    const d = 32;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0008;
    scene.add(sunLight);

    // 背向補光，消除死黑暗部
    const rimDirLight = new THREE.DirectionalLight(0x48dbfb, 0.75);
    rimDirLight.position.set(-20, 14, -18);
    scene.add(rimDirLight);

    return { sunLight, hemiLight };
}

/**
 * 生成高質感水波焦散（Caustics）與接觸陰影程序貼圖
 */
function createCausticsTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 512, 512);

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 64; i++) {
        const x = (Math.sin(i * 12.9898) * 0.5 + 0.5) * 512;
        const y = (Math.cos(i * 78.233) * 0.5 + 0.5) * 512;
        const r = 36 + (i % 5) * 18;
        const grad = ctx.createRadialGradient(x, y, r * 0.18, x, y, r);
        grad.addColorStop(0, 'rgba(0, 80, 110, 0.0)');
        grad.addColorStop(0.68, 'rgba(135, 250, 255, 0.28)');
        grad.addColorStop(0.84, 'rgba(220, 255, 255, 0.42)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 5);
    return tex;
}

function createSoftShadowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    g.addColorStop(0, 'rgba(4, 28, 48, 0.46)');
    g.addColorStop(0.55, 'rgba(4, 28, 48, 0.18)');
    g.addColorStop(1, 'rgba(4, 28, 48, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
}

function createGodRayTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(190, 252, 255, 0.34)');
    g.addColorStop(0.45, 'rgba(120, 238, 255, 0.14)');
    g.addColorStop(1, 'rgba(60, 190, 240, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 256);
    return new THREE.CanvasTexture(canvas);
}

const SOFT_SHADOW_TEX = createSoftShadowTexture();

/**
 * 建構 3D 起伏海床、雙層流動焦散、海面波光、體積耶穌光柱、3D 珊瑚礁與 GLB 沉船資產
 */
export function buildOceanWorld(scene, gltfLoader, texLoader, physicsWorld, onAssetProgress) {
    // 1. 3D 雕刻起伏海床沙地（帶頂點色漸層）
    const sandGeo = new THREE.PlaneGeometry(92, 92, 72, 72);
    sandGeo.rotateX(-Math.PI / 2);
    const posAttr = sandGeo.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);
    const cCenter = new THREE.Color(0xf6e2bc);
    const cEdge = new THREE.Color(0x78b7bb);
    const tmpColor = new THREE.Color();

    for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const y = getSeabedHeight(x, z);
        posAttr.setY(i, y);

        const blend = THREE.MathUtils.clamp(Math.hypot(x, z) / 44.0, 0, 1);
        tmpColor.copy(cCenter).lerp(cEdge, blend * 0.72);
        colors[i * 3] = tmpColor.r;
        colors[i * 3 + 1] = tmpColor.g;
        colors[i * 3 + 2] = tmpColor.b;
    }
    sandGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    sandGeo.computeVertexNormals();

    const sandMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.02
    });
    const sandMesh = new THREE.Mesh(sandGeo, sandMat);
    sandMesh.receiveShadow = true;
    scene.add(sandMesh);

    // 2. 雙層反向流動海底焦散光網 (Dual Caustics)
    const causticsTexA = createCausticsTexture();
    const causticsTexB = causticsTexA.clone();
    causticsTexB.needsUpdate = true;
    causticsTexB.repeat.set(3.7, 3.7);

    const causticsGeo = sandGeo.clone();
    const causticsMatA = new THREE.MeshBasicMaterial({
        map: causticsTexA,
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const causticsMatB = new THREE.MeshBasicMaterial({
        map: causticsTexB,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const causticsMeshA = new THREE.Mesh(causticsGeo, causticsMatA);
    causticsMeshA.position.y = 0.05;
    const causticsMeshB = new THREE.Mesh(causticsGeo, causticsMatB);
    causticsMeshB.position.y = 0.08;
    scene.add(causticsMeshA, causticsMeshB);

    // 3. 仰望波光粼粼海面
    const waterSurface = new THREE.Mesh(
        new THREE.CircleGeometry(58, 48),
        new THREE.MeshPhysicalMaterial({
            color: 0x6ef3ff,
            roughness: 0.12,
            transmission: 0.55,
            transparent: true,
            opacity: 0.42,
            side: THREE.DoubleSide
        })
    );
    waterSurface.rotation.x = Math.PI / 2;
    waterSurface.position.y = PHYSICS_CONSTANTS.SURFACE_Y + 0.6;
    scene.add(waterSurface);

    // 4. 體積陽光光束 (Volumetric God Rays)
    const godRayTex = createGodRayTexture();
    const godRayMat = new THREE.MeshBasicMaterial({
        map: godRayTex,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const godRays = [];
    const rayGeo = new THREE.CylinderGeometry(1.4, 5.8, 26, 18, 1, true);
    for (let i = 0; i < 6; i++) {
        const ray = new THREE.Mesh(rayGeo, godRayMat);
        const angle = (i / 6) * Math.PI * 2 + 0.3;
        const dist = 6 + (i % 3) * 6.5;
        ray.position.set(Math.cos(angle) * dist, 12.5, Math.sin(angle) * dist);
        ray.rotation.z = -0.18;
        ray.rotation.x = 0.12;
        ray.userData = { baseX: ray.position.x, phase: i * 1.1 };
        scene.add(ray);
        godRays.push(ray);
    }

    // 5. 3D 晶瑩氣泡 InstancedMesh（1 次 Draw Call 繪製 110 顆具立體高光與波義耳膨脹的氣泡）
    const bubbleCount = 110;
    const bubbleGeo = new THREE.SphereGeometry(1, 12, 10);
    const bubbleMat = new THREE.MeshPhysicalMaterial({
        color: 0xdffbff,
        roughness: 0.08,
        metalness: 0.05,
        transmission: 0.72,
        transparent: true,
        opacity: 0.68,
        ior: 1.33
    });
    const bubbleInstanced = new THREE.InstancedMesh(bubbleGeo, bubbleMat, bubbleCount);
    bubbleInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(bubbleInstanced);

    const bubblesData = [];
    for (let i = 0; i < bubbleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 2.0 + Math.random() * 31.0;
        const bx = Math.cos(angle) * dist;
        const bz = Math.sin(angle) * dist;
        const baseRadius = 0.07 + Math.random() * 0.13;
        bubblesData.push({
            baseX: bx,
            baseZ: bz,
            y: Math.random() * PHYSICS_CONSTANTS.SURFACE_Y,
            baseRadius,
            // 終端上升速度與氣泡半徑平方根正相關
            riseSpeed: 1.05 + Math.sqrt(baseRadius) * 2.1,
            wobbleFreq: 2.1 + Math.random() * 1.6,
            wobbleAmp: 0.12 + Math.random() * 0.18,
            phase: Math.random() * Math.PI * 2
        });
    }

    // 6. 載入現有 Blender / Kenney 3D GLB 模型並自動套用 Switch 風格化 PBR 升級
    const bottleTemplates = [];
    const glbTasks = [
        { url: './assets/models/shipwreck.glb', pos: [-8, 0, -6], scale: 2.2, rotY: 0.5 },
        { url: './assets/models/chest.glb', pos: [-2.2, 0, -3.1], scale: 1.85, rotY: -0.6 },
        { url: './assets/models/barrel.glb', pos: [-3.9, 0, -1.9], scale: 1.7, rotY: 0.25 },
        { url: './assets/models/crate.glb', pos: [4.2, 0, -8.2], scale: 1.8, rotY: 0.8 }
    ];

    const rockFiles = [
        './assets/models/rocks-a.glb',
        './assets/models/rocks-b.glb',
        './assets/models/rocks-sand-a.glb',
        './assets/models/rocks-sand-b.glb'
    ];

    let loadedCount = 0;
    const totalToLoad = glbTasks.length + rockFiles.length + 2;
    const bumpProgress = () => {
        loadedCount++;
        if (onAssetProgress) onAssetProgress(loadedCount / totalToLoad);
    };

    const upgradeGLBMesh = (root, cast = true) => {
        root.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = cast;
                child.receiveShadow = true;
                if (child.geometry && !child.geometry.attributes.normal) {
                    child.geometry.computeVertexNormals();
                }
                if (child.material) {
                    const m = child.material.clone();
                    if ('roughness' in m) {
                        m.roughness = THREE.MathUtils.clamp(m.roughness * 0.82, 0.32, 0.78);
                        m.metalness = Math.min(m.metalness || 0, 0.18);
                    }
                    enhanceMaterialSwitchStyle(m, 0.26);
                    child.material = m;
                }
            }
        });
    };

    glbTasks.forEach((item) => {
        gltfLoader.load(
            item.url,
            (gltf) => {
                const model = gltf.scene;
                upgradeGLBMesh(model, true);
                const groundY = getSeabedHeight(item.pos[0], item.pos[2]);
                model.position.set(item.pos[0], groundY - 0.05, item.pos[2]);
                model.scale.setScalar(item.scale);
                model.rotation.y = item.rotY;
                scene.add(model);
                bumpProgress();
            },
            undefined,
            bumpProgress
        );
    });

    rockFiles.forEach((url, idx) => {
        gltfLoader.load(
            url,
            (gltf) => {
                const baseModel = gltf.scene;
                upgradeGLBMesh(baseModel, true);
                for (let k = 0; k < 4; k++) {
                    const clone = baseModel.clone(true);
                    const angle = ((idx * 4 + k) / 16) * Math.PI * 2 + 0.25;
                    const dist = 16.5 + (k % 3) * 5.8;
                    const rx = Math.cos(angle) * dist;
                    const rz = Math.sin(angle) * dist;
                    const s = 2.0 + (k % 3) * 0.65;
                    clone.position.set(rx, getSeabedHeight(rx, rz) - 0.12, rz);
                    clone.scale.setScalar(s);
                    clone.rotation.y = angle + k;
                    scene.add(clone);
                    physicsWorld.addObstacle(rx, rz, s * 0.95, 4.2);
                }
                bumpProgress();
            },
            undefined,
            bumpProgress
        );
    });

    // 預載專案內的 3D 漂浮膠樽模型（bottle.glb & bottle-large.glb）
    ['./assets/models/bottle.glb', './assets/models/bottle-large.glb'].forEach((url) => {
        gltfLoader.load(
            url,
            (gltf) => {
                const template = gltf.scene;
                upgradeGLBMesh(template, false);
                bottleTemplates.push(template);
                bumpProgress();
            },
            undefined,
            bumpProgress
        );
    });

    // 7. 建立豐富 3D 風格化珊瑚礁群（腦珊瑚、鹿角珊瑚、海葵管珊瑚）與搖曳海草
    const swayingPlants = [];
    buildStylizedCoralGarden(scene, texLoader, swayingPlants);

    return {
        causticsTexA,
        causticsTexB,
        godRays,
        bubbleInstanced,
        bubblesData,
        bottleTemplates,
        swayingPlants
    };
}

function buildStylizedCoralGarden(scene, texLoader, swayingPlants) {
    const coralPalette = [0xff6b81, 0xff9f43, 0xa29bfe, 0x1dd1a1, 0xfeca57, 0xff7eb3];
    const coralMats = coralPalette.map((hex) =>
        enhanceMaterialSwitchStyle(
            new THREE.MeshStandardMaterial({
                color: hex,
                roughness: 0.48,
                metalness: 0.04
            }),
            0.42
        )
    );

    const brainGeo = new THREE.IcosahedronGeometry(0.95, 2);
    const tubeGeo = new THREE.CylinderGeometry(0.22, 0.14, 1.45, 10);
    const branchGeo = new THREE.CapsuleGeometry(0.14, 1.1, 6, 10);

    for (let i = 0; i < 28; i++) {
        const angle = (i / 28) * Math.PI * 2 + Math.sin(i) * 0.25;
        const dist = 7.5 + (i % 5) * 5.2;
        const cx = Math.cos(angle) * dist;
        const cz = Math.sin(angle) * dist;
        // 避開沉船中心
        if (Math.hypot(cx + 8, cz + 6) < 6.8) continue;

        const cy = getSeabedHeight(cx, cz);
        const mat = coralMats[i % coralMats.length];
        const cluster = new THREE.Group();
        cluster.position.set(cx, cy, cz);

        if (i % 3 === 0) {
            // 圓潤腦珊瑚群
            const dome = new THREE.Mesh(brainGeo, mat);
            dome.scale.set(1.25, 0.85, 1.15);
            dome.position.y = 0.55;
            dome.castShadow = true;
            dome.receiveShadow = true;
            cluster.add(dome);
        } else if (i % 3 === 1) {
            // 海葵／管狀珊瑚叢（小丑魚最愛！）
            for (let t = 0; t < 5; t++) {
                const tube = new THREE.Mesh(tubeGeo, mat);
                const ta = (t / 5) * Math.PI * 2;
                tube.position.set(Math.cos(ta) * 0.36, 0.65, Math.sin(ta) * 0.36);
                tube.rotation.z = Math.cos(ta) * 0.22;
                tube.rotation.x = Math.sin(ta) * 0.22;
                tube.castShadow = true;
                cluster.add(tube);
            }
            swayingPlants.push({ obj: cluster, baseRotZ: 0, phase: i * 0.7, amp: 0.05 });
        } else {
            // 鹿角珊瑚
            for (let b = 0; b < 4; b++) {
                const br = new THREE.Mesh(branchGeo, mat);
                br.position.set((b - 1.5) * 0.28, 0.72 + (b % 2) * 0.25, (b % 2 - 0.5) * 0.25);
                br.rotation.z = (b - 1.5) * 0.28;
                br.castShadow = true;
                cluster.add(br);
            }
        }
        scene.add(cluster);
    }

    // 結合現有海草高畫質貼圖，製作十字立體搖曳海草叢
    const seaweedPaths = [
        './assets/sprites/seaweed_green_a.png',
        './assets/sprites/seaweed_green_b.png',
        './assets/sprites/seaweed_pink_a.png',
        './assets/sprites/seaweed_orange_a.png',
        './assets/sprites/seaweed_grass_a.png'
    ];
    const weedPlane = new THREE.PlaneGeometry(2.4, 2.8);
    weedPlane.translate(0, 1.35, 0);

    seaweedPaths.forEach((path, sIdx) => {
        const tex = texLoader.load(path);
        tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshStandardMaterial({
            map: tex,
            alphaTest: 0.35,
            side: THREE.DoubleSide,
            roughness: 0.65
        });

        for (let k = 0; k < 7; k++) {
            const idx = sIdx * 7 + k;
            const angle = (idx / 35) * Math.PI * 2 + 0.13;
            const dist = 9.0 + (idx % 6) * 4.4;
            const wx = Math.cos(angle) * dist;
            const wz = Math.sin(angle) * dist;
            if (Math.hypot(wx + 8, wz + 6) < 6.0) continue;

            const tuft = new THREE.Group();
            const p1 = new THREE.Mesh(weedPlane, mat);
            const p2 = new THREE.Mesh(weedPlane, mat);
            p2.rotation.y = Math.PI / 2;
            tuft.add(p1, p2);

            const scale = 0.85 + (idx % 4) * 0.22;
            tuft.scale.setScalar(scale);
            tuft.position.set(wx, getSeabedHeight(wx, wz) - 0.1, wz);
            scene.add(tuft);
            swayingPlants.push({ obj: tuft, baseRotZ: 0, phase: idx * 0.9, amp: 0.09 });
        }
    });
}

/**
 * 建立靈動有神的 3D 眼睛（黑色瞳孔 + 白色高光反光點，呈現任天堂角色親和力）
 */
const EYE_BLACK_GEO = new THREE.SphereGeometry(0.085, 12, 10);
const EYE_HIGHLIGHT_GEO = new THREE.SphereGeometry(0.032, 8, 8);
const EYE_BLACK_MAT = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.1, metalness: 0.1 });
const EYE_WHITE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });

function addCuteEyes(parent, xOffset, yPos, zPos, eyeScale = 1.0) {
    [-1, 1].forEach((side) => {
        const eyeGroup = new THREE.Group();
        eyeGroup.position.set(side * xOffset, yPos, zPos);
        eyeGroup.scale.setScalar(eyeScale);

        const pupil = new THREE.Mesh(EYE_BLACK_GEO, EYE_BLACK_MAT);
        const glint = new THREE.Mesh(EYE_HIGHLIGHT_GEO, EYE_WHITE_MAT);
        glint.position.set(side * 0.045, 0.035, 0.055);
        eyeGroup.add(pupil, glint);
        parent.add(eyeGroup);
    });
}

/**
 * 建立 Nintendo Switch 圓潤風格化全 3D 關節海洋生物（支援真實游動骨架動畫與 iPad 放大觸控球）
 * 生物面向 +Z 方向（與 atan2(vx, vz) 航向完全一致）
 */
export function createCreature3D(spec) {
    const root = new THREE.Group();
    const modelGroup = new THREE.Group();
    root.add(modelGroup);

    const mainMat = enhanceMaterialSwitchStyle(
        new THREE.MeshStandardMaterial({ color: spec.primaryColor, roughness: 0.36, metalness: 0.05 }),
        0.42
    );
    const subMat = enhanceMaterialSwitchStyle(
        new THREE.MeshStandardMaterial({ color: spec.secondaryColor, roughness: 0.42, metalness: 0.03 }),
        0.32
    );
    const accentMat = new THREE.MeshStandardMaterial({ color: spec.accentColor, roughness: 0.45 });

    const tailPivot = new THREE.Group();
    const finLeftPivot = new THREE.Group();
    const finRightPivot = new THREE.Group();

    if (spec.id === 'clownfish') {
        // 圓潤小丑魚身 + 經典三道白紋 + 扇形圓尾
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 22, 18), mainMat);
        body.scale.set(0.68, 0.88, 1.38);
        body.castShadow = true;
        modelGroup.add(body);

        [-0.26, 0.04, 0.32].forEach((zBand, idx) => {
            const r = idx === 1 ? 0.465 : 0.39;
            const stripe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.13, 20), subMat);
            stripe.rotation.x = Math.PI / 2;
            stripe.scale.set(0.69, 1.0, 0.89);
            stripe.position.z = zBand;
            modelGroup.add(stripe);
        });

        const dorsal = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), mainMat);
        dorsal.scale.set(0.22, 0.75, 1.35);
        dorsal.position.set(0, 0.38, -0.02);
        modelGroup.add(dorsal);

        tailPivot.position.set(0, 0, -0.58);
        const tailFan = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), mainMat);
        tailFan.scale.set(0.18, 0.92, 1.05);
        tailFan.position.z = -0.22;
        tailPivot.add(tailFan);
        modelGroup.add(tailPivot);

        const pecGeo = new THREE.SphereGeometry(0.18, 12, 10);
        pecGeo.scale(0.18, 0.65, 0.95);
        finLeftPivot.position.set(0.28, -0.06, 0.15);
        finRightPivot.position.set(-0.28, -0.06, 0.15);
        finLeftPivot.add(new THREE.Mesh(pecGeo, mainMat));
        finRightPivot.add(new THREE.Mesh(pecGeo, mainMat));
        modelGroup.add(finLeftPivot, finRightPivot);

        addCuteEyes(modelGroup, 0.21, 0.1, 0.46, 1.05);
    } else if (spec.id === 'turtle') {
        // 綠海龜：圓拱背甲 + 暖黃腹甲 + 圓頭 + 雙翼前鰭足拍動
        const carapace = new THREE.Mesh(new THREE.SphereGeometry(0.58, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), subMat);
        carapace.scale.set(0.95, 0.68, 1.18);
        carapace.position.y = -0.02;
        carapace.castShadow = true;
        modelGroup.add(carapace);

        const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.48, 0.12, 20), accentMat);
        belly.scale.set(0.92, 1, 1.12);
        belly.position.y = -0.04;
        modelGroup.add(belly);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 14), mainMat);
        head.scale.set(0.88, 0.85, 1.18);
        head.position.set(0, 0.06, 0.72);
        modelGroup.add(head);
        addCuteEyes(modelGroup, 0.15, 0.11, 0.84, 0.9);

        // 長翼狀前鰭足
        const flipperGeo = new THREE.SphereGeometry(0.36, 14, 10);
        flipperGeo.scale(1.35, 0.14, 0.44);
        finLeftPivot.position.set(0.42, 0.0, 0.28);
        finRightPivot.position.set(-0.42, 0.0, 0.28);
        const flMesh = new THREE.Mesh(flipperGeo, mainMat);
        flMesh.position.set(0.32, 0, -0.06);
        flMesh.rotation.y = -0.25;
        const frMesh = new THREE.Mesh(flipperGeo, mainMat);
        frMesh.position.set(-0.32, 0, -0.06);
        frMesh.rotation.y = 0.25;
        finLeftPivot.add(flMesh);
        finRightPivot.add(frMesh);
        modelGroup.add(finLeftPivot, finRightPivot);

        // 後小鰭足
        [-1, 1].forEach((side) => {
            const rear = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mainMat);
            rear.scale.set(0.65, 0.14, 1.1);
            rear.position.set(side * 0.3, -0.03, -0.62);
            rear.rotation.y = side * 0.35;
            modelGroup.add(rear);
        });
    } else if (spec.id === 'shark') {
        // 雙髻鯊：流線型魚雷身 + 白色腹面 + 標誌性 T 字形鎚頭 + 高聳背鰭 + 新月尾鰭
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.05, 10, 18), mainMat);
        torso.rotation.x = Math.PI / 2;
        torso.scale.set(0.88, 1.0, 0.92);
        torso.castShadow = true;
        modelGroup.add(torso);

        const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.95, 8, 14), subMat);
        belly.rotation.x = Math.PI / 2;
        belly.position.y = -0.07;
        modelGroup.add(belly);

        // T 字形雙髻鎚頭 (Cephalofoil)
        const hammer = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.78, 8, 14), mainMat);
        hammer.rotation.z = Math.PI / 2;
        hammer.scale.set(1.0, 1.0, 1.35);
        hammer.position.set(0, 0.02, 0.72);
        modelGroup.add(hammer);
        addCuteEyes(modelGroup, 0.49, 0.04, 0.74, 0.95);

        // 高背鰭
        const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.58, 12), mainMat);
        dorsal.scale.set(0.24, 1.0, 1.15);
        dorsal.position.set(0, 0.44, 0.02);
        dorsal.rotation.x = -0.28;
        modelGroup.add(dorsal);

        // 左右胸鰭
        [-1, 1].forEach((side) => {
            const pec = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.56, 10), mainMat);
            pec.scale.set(1.1, 1.0, 0.22);
            pec.position.set(side * 0.38, -0.1, 0.22);
            pec.rotation.z = -side * 1.25;
            pec.rotation.y = side * 0.25;
            modelGroup.add(pec);
        });

        // 尾柄與新月尾鰭
        tailPivot.position.set(0, 0, -0.72);
        const upperLobe = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.62, 10), mainMat);
        upperLobe.scale.set(0.22, 1.0, 1.0);
        upperLobe.position.set(0, 0.2, -0.24);
        upperLobe.rotation.x = -0.68;
        const lowerLobe = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.38, 10), mainMat);
        lowerLobe.scale.set(0.22, 1.0, 1.0);
        lowerLobe.position.set(0, -0.14, -0.18);
        lowerLobe.rotation.x = -2.4;
        tailPivot.add(upperLobe, lowerLobe);
        modelGroup.add(tailPivot);
    } else if (spec.id === 'whale') {
        // 藍鯨：流線巨型身軀 + 淺藍喉腹摺 + 水平寬闊尾鰭（上下擺動！）
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.35, 12, 22), mainMat);
        body.rotation.x = Math.PI / 2;
        body.scale.set(1.05, 1.0, 0.88);
        body.castShadow = true;
        modelGroup.add(body);

        const throat = new THREE.Mesh(new THREE.SphereGeometry(0.35, 18, 14), subMat);
        throat.scale.set(0.98, 0.68, 1.85);
        throat.position.set(0, -0.11, 0.24);
        modelGroup.add(throat);

        // 背部小背鰭（藍鯨真實特徵：背鰭偏後且小巧）
        const smallDorsal = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 10), mainMat);
        smallDorsal.scale.set(0.3, 1, 1.2);
        smallDorsal.position.set(0, 0.32, -0.45);
        smallDorsal.rotation.x = -0.4;
        modelGroup.add(smallDorsal);

        // 修長胸鰭
        [-1, 1].forEach((side) => {
            const flipper = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), mainMat);
            flipper.scale.set(1.45, 0.14, 0.38);
            flipper.position.set(side * 0.46, -0.12, 0.25);
            flipper.rotation.z = -side * 0.28;
            flipper.rotation.y = -side * 0.25;
            modelGroup.add(flipper);
        });

        // 水平雙葉尾鰭 (Horizontal Cetacean Flukes)
        tailPivot.position.set(0, 0, -0.92);
        const peduncle = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.48, 12), mainMat);
        peduncle.rotation.x = -Math.PI / 2;
        peduncle.position.z = -0.16;
        const flukeLeft = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), mainMat);
        flukeLeft.scale.set(1.25, 0.12, 0.52);
        flukeLeft.position.set(0.28, 0, -0.38);
        flukeLeft.rotation.y = -0.28;
        const flukeRight = flukeLeft.clone();
        flukeRight.position.x = -0.28;
        flukeRight.rotation.y = 0.28;
        tailPivot.add(peduncle, flukeLeft, flukeRight);
        modelGroup.add(tailPivot);

        addCuteEyes(modelGroup, 0.34, 0.02, 0.58, 0.85);
    } else {
        // 藍刀鯛 / 粉紅珊瑚魚：側扁圓潤熱帶魚 + 撞色亮麗叉尾
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 16), mainMat);
        body.scale.set(0.48, 0.96, 1.28);
        body.castShadow = true;
        modelGroup.add(body);

        const crest = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), subMat);
        crest.scale.set(0.18, 0.72, 1.35);
        crest.position.set(0, 0.34, -0.05);
        modelGroup.add(crest);

        tailPivot.position.set(0, 0, -0.52);
        const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.44, 12), subMat);
        tailMesh.scale.set(0.2, 1.0, 1.0);
        tailMesh.rotation.x = Math.PI / 2;
        tailMesh.position.z = -0.18;
        tailPivot.add(tailMesh);
        modelGroup.add(tailPivot);

        const finGeo = new THREE.SphereGeometry(0.15, 10, 8);
        finGeo.scale(0.18, 0.55, 0.85);
        finLeftPivot.position.set(0.21, -0.06, 0.12);
        finRightPivot.position.set(-0.21, -0.06, 0.12);
        finLeftPivot.add(new THREE.Mesh(finGeo, subMat));
        finRightPivot.add(new THREE.Mesh(finGeo, subMat));
        modelGroup.add(finLeftPivot, finRightPivot);

        addCuteEyes(modelGroup, 0.18, 0.09, 0.42, 1.0);
    }

    // 依物種目標尺寸縮放模型群組
    const baseVisualScale = spec.size * 0.62;
    modelGroup.scale.setScalar(baseVisualScale);

    // iPad 小二學生友善放大隱形觸控碰撞球（colorWrite: false 零繪製成本且 100% 支援 Raycaster！）
    const hitRadius = Math.max(1.35, spec.size * 0.55);
    const hitbox = new THREE.Mesh(
        new THREE.SphereGeometry(hitRadius, 10, 8),
        new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: false,
            transparent: true,
            opacity: 0
        })
    );
    hitbox.userData = { type: 'creature', ownerRoot: root };
    root.add(hitbox);

    // 海床柔和投影圓斑（由主迴圈貼合海床高度更新）
    const shadowBlob = new THREE.Mesh(
        new THREE.PlaneGeometry(spec.size * 1.05, spec.size * 0.65),
        new THREE.MeshBasicMaterial({
            map: SOFT_SHADOW_TEX,
            transparent: true,
            opacity: 0.45,
            depthWrite: false
        })
    );
    shadowBlob.rotation.x = -Math.PI / 2;

    // 清晰膠囊名稱標籤
    const labelEl = document.createElement('div');
    labelEl.className = 'fish-label';
    labelEl.textContent = `${spec.emoji} ${spec.zh}`;
    const labelObj = new CSS2DObject(labelEl);
    labelObj.position.set(0, Math.max(0.9, spec.size * 0.36), 0);
    root.add(labelObj);

    return {
        group: root,
        modelGroup,
        tailPivot,
        finLeftPivot,
        finRightPivot,
        hitbox,
        shadowBlob
    };
}

/**
 * 依據生物分類學運動力學更新關節動畫：
 * - 魚類／鯊魚：尾鰭左右擺動 (Yaw) + 胸鰭微拍
 * - 鯨豚哺乳類：水平尾鰭上下擺動 (Pitch)
 * - 海龜：雙翼前肢同步上下滑翔拍動
 */
export function animateCreatureRig(c) {
    const phase = c.swimPhase;
    const loco = c.spec.locomotion;

    if (loco === 'cetacean') {
        c.rig.tailPivot.rotation.x = Math.sin(phase) * 0.34;
        c.rig.modelGroup.rotation.x = Math.cos(phase) * 0.04;
    } else if (loco === 'turtle') {
        const stroke = Math.sin(phase) * 0.52;
        c.rig.finLeftPivot.rotation.z = stroke;
        c.rig.finRightPivot.rotation.z = -stroke;
        c.rig.finLeftPivot.rotation.x = Math.cos(phase) * 0.18;
        c.rig.finRightPivot.rotation.x = Math.cos(phase) * 0.18;
    } else {
        c.rig.tailPivot.rotation.y = Math.sin(phase) * 0.42;
        c.rig.modelGroup.rotation.y = -Math.sin(phase) * 0.06;
        c.rig.finLeftPivot.rotation.y = Math.cos(phase * 1.2) * 0.25;
        c.rig.finRightPivot.rotation.y = -Math.cos(phase * 1.2) * 0.25;
    }

    // 同步海床接觸陰影位置與高度衰減
    const pos = c.group.position;
    const sandY = getSeabedHeight(pos.x, pos.z);
    const heightAboveSand = Math.max(0, pos.y - sandY);
    c.rig.shadowBlob.position.set(pos.x, sandY + 0.06, pos.z);
    c.rig.shadowBlob.rotation.z = -c.yaw;
    c.rig.shadowBlob.material.opacity = THREE.MathUtils.clamp(0.46 - heightAboveSand * 0.028, 0.06, 0.46);
}

/**
 * 建立 3D 漂浮海洋塑膠樽（優先使用專案內 assets/models/bottle.glb，載入前提供半透明 3D PET 膠樽備援）
 */
const FALLBACK_BOTTLE_BODY = new THREE.CylinderGeometry(0.22, 0.24, 0.82, 14);
const FALLBACK_BOTTLE_NECK = new THREE.CylinderGeometry(0.09, 0.2, 0.24, 12);
const FALLBACK_CAP_GEO = new THREE.CylinderGeometry(0.1, 0.1, 0.1, 12);
const FALLBACK_PET_MAT = new THREE.MeshPhysicalMaterial({
    color: 0xa8e6ff,
    roughness: 0.14,
    transmission: 0.65,
    transparent: true,
    opacity: 0.78
});
const FALLBACK_CAP_MAT = new THREE.MeshStandardMaterial({ color: 0xff4757, roughness: 0.35 });
const RING_GEO = new THREE.RingGeometry(0.62, 0.78, 24);
const RING_MAT = new THREE.MeshBasicMaterial({
    color: 0xffd32a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.68
});

export function createTrashItem3D(bottleTemplates) {
    const group = new THREE.Group();
    const visualHolder = new THREE.Group();
    group.add(visualHolder);

    if (bottleTemplates && bottleTemplates.length > 0) {
        const tpl = bottleTemplates[Math.floor(Math.random() * bottleTemplates.length)];
        const model = tpl.clone(true);
        model.scale.setScalar(2.35);
        visualHolder.add(model);
    } else {
        const body = new THREE.Mesh(FALLBACK_BOTTLE_BODY, FALLBACK_PET_MAT);
        const neck = new THREE.Mesh(FALLBACK_BOTTLE_NECK, FALLBACK_PET_MAT);
        neck.position.y = 0.52;
        const cap = new THREE.Mesh(FALLBACK_CAP_GEO, FALLBACK_CAP_MAT);
        cap.position.y = 0.68;
        visualHolder.add(body, neck, cap);
        group.userData.usingFallback = true;
    }

    // 醒目環保提示光環，方便小二學生於 iPad 辨識並點擊清理
    const ring = new THREE.Mesh(RING_GEO, RING_MAT);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    // 放大觸控球
    const hitbox = new THREE.Mesh(
        new THREE.SphereGeometry(1.55, 10, 8),
        new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 })
    );
    hitbox.userData = { type: 'trash', ownerGroup: group };
    group.add(hitbox);

    return { group, visualHolder, ring, hitbox };
}
