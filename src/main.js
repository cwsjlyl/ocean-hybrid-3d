import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { SPECIES_DATA, QUIZ_QUESTIONS } from './quiz-data.js';
import { PhysicsWorld, getSeabedHeight, PHYSICS_CONSTANTS } from './physics.js';
import {
    setupSwitchLightingAndEnv,
    buildOceanWorld,
    createCreature3D,
    animateCreatureRig,
    createTrashItem3D
} from './graphics.js';
import { AudioTTSManager } from './audio-tts.js';

// ========================
// 1. 初始化狀態與核心管理模組
// ========================
const audioTTS = new AudioTTSManager();
const physicsWorld = new PhysicsWorld();

let currentMode = 'explore'; // 'explore' | 'feed'
let highQuality = true;
let starScore = 0;
let cleanedTrashTotal = 0;
const TARGET_CLEAN_GOAL = 8; // 清理 8 個膠樽即可達到 100% 清澈海洋
const discoveredSpecies = new Set();
let selectedSpecies = null;

// 問答狀態
let quizIndex = 0;
let quizCorrectCount = 0;
let quizAnsweredCurrent = false;
let autoReadQuiz = false;

// 鏡頭平滑聚焦狀態
const defaultCamTarget = new THREE.Vector3(0, 4.5, 0);
const desiredCamTarget = new THREE.Vector3(0, 4.5, 0);

// ========================
// 2. Three.js 場景、鏡頭與渲染器
// ========================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const murkyColor = new THREE.Color(0x0b587c);
const crystalColor = new THREE.Color(0x0b7fab);
scene.background = murkyColor.clone().lerp(crystalColor, 0.4);
scene.fog = new THREE.FogExp2(scene.background.getHex(), 0.0155);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.3, 140);
camera.position.set(0, 13.5, 29.0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
labelRenderer.domElement.style.zIndex = '5';
document.body.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minPolarAngle = 0.22;
controls.minDistance = 9;
controls.maxDistance = 46;
controls.target.copy(defaultCamTarget);

const { sunLight } = setupSwitchLightingAndEnv(renderer, scene);

// ========================
// 3. 建構海底世界、3D 海洋生物與漂浮膠樽
// ========================
const loadingBar = document.getElementById('loading-bar');
const loadingScreen = document.getElementById('loading-screen');

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();

const worldEnv = buildOceanWorld(scene, gltfLoader, texLoader, physicsWorld, (ratio) => {
    const pct = Math.min(100, Math.round(15 + ratio * 85));
    loadingBar.style.width = `${pct}%`;
    if (ratio >= 0.99) {
        setTimeout(() => loadingScreen.classList.add('hidden'), 260);
    }
});
// 安全退避：即使慢速網路亦於 2.2 秒內進入遊戲
setTimeout(() => loadingScreen.classList.add('hidden'), 2200);

const creatures = [];
const clickableHitboxes = [];

SPECIES_DATA.forEach((spec) => {
    for (let i = 0; i < spec.count; i++) {
        const rig = createCreature3D(spec);
        const angle = Math.random() * Math.PI * 2;
        const radius = 7.5 + Math.random() * 19.5;
        const [minY, maxY] = spec.depthRange;
        const startY = minY + Math.random() * (maxY - minY);

        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        rig.group.position.set(x, Math.max(startY, getSeabedHeight(x, z) + 1.5), z);

        const orbitDir = Math.random() > 0.3 ? 1 : -1;
        const initYaw = angle + (Math.PI / 2) * orbitDir;
        const initVel = new THREE.Vector3(Math.sin(initYaw), 0, Math.cos(initYaw)).multiplyScalar(spec.cruiseSpeed);

        const creatureRecord = {
            spec,
            rig,
            group: rig.group,
            velocity: initVel,
            yaw: initYaw,
            pitch: 0,
            bank: 0,
            swimPhase: Math.random() * Math.PI * 2,
            preferredRadius: radius,
            preferredY: startY,
            orbitDir,
            seed: Math.random() * 100
        };

        rig.hitbox.userData.creatureRecord = creatureRecord;
        scene.add(rig.group);
        scene.add(rig.shadowBlob);
        creatures.push(creatureRecord);
        clickableHitboxes.push(rig.hitbox);
    }
});

// 漂浮海洋塑膠樽系統
const trashItems = [];
function spawnTrashBatch(count = 6) {
    for (let i = 0; i < count; i++) {
        const tObj = createTrashItem3D(worldEnv.bottleTemplates);
        const angle = Math.random() * Math.PI * 2;
        const dist = 7.0 + Math.random() * 21.0;
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        const eqY = 4.5 + Math.random() * 10.5;

        tObj.group.position.set(x, eqY, z);
        const record = {
            ...tObj,
            velocity: new THREE.Vector3(),
            eqY,
            phase: Math.random() * Math.PI * 2,
            baseTiltX: (Math.random() - 0.5) * 0.9,
            baseTiltZ: (Math.random() - 0.5) * 0.9,
            spinSpeed: (Math.random() - 0.5) * 0.45
        };
        tObj.hitbox.userData.trashRecord = record;
        scene.add(tObj.group);
        trashItems.push(record);
        clickableHitboxes.push(tObj.hitbox);
    }
}
spawnTrashBatch(8);

// 若 bottle.glb 稍後完成載入，自動將備援瓶身升級為精細 GLB 模型
const bottleUpgradeTimer = setInterval(() => {
    if (worldEnv.bottleTemplates.length > 0) {
        trashItems.forEach((item) => {
            if (item.group.userData.usingFallback) {
                item.visualHolder.clear();
                const tpl = worldEnv.bottleTemplates[Math.floor(Math.random() * worldEnv.bottleTemplates.length)];
                const m = tpl.clone(true);
                m.scale.setScalar(2.35);
                item.visualHolder.add(m);
                item.group.userData.usingFallback = false;
            }
        });
        clearInterval(bottleUpgradeTimer);
    }
}, 500);

// 魚糧顆粒共用幾何體與材質（避免重複配置 GPU 記憶體）
const foodPelletGeo = new THREE.SphereGeometry(0.18, 12, 10);
const foodPelletMat = new THREE.MeshStandardMaterial({
    color: 0xfeca57,
    emissive: 0xd97706,
    emissiveIntensity: 0.25,
    roughness: 0.45
});
const foods = [];

function spawnFoodAt(worldPoint) {
    if (foods.length >= 30) return; // 保護 iPad 效能上限
    // 每次投餵撒下 3 粒自然散開的魚糧
    for (let k = 0; k < 3; k++) {
        const mesh = new THREE.Mesh(foodPelletGeo, foodPelletMat);
        mesh.position.set(
            worldPoint.x + (Math.random() - 0.5) * 1.1,
            THREE.MathUtils.clamp(worldPoint.y + 1.6 + Math.random() * 0.6, 2.5, PHYSICS_CONSTANTS.SURFACE_Y - 1.0),
            worldPoint.z + (Math.random() - 0.5) * 1.1
        );
        scene.add(mesh);
        foods.push({
            mesh,
            velocity: new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.35, (Math.random() - 0.5) * 0.4),
            age: 0,
            grounded: false
        });
    }
    audioTTS.playSfx('feed');
}

function removeFoodAtIndex(idx) {
    const f = foods[idx];
    if (!f) return;
    scene.remove(f.mesh);
    foods.splice(idx, 1);
}

// ========================
// 4. 生態潔淨度與 UI 狀態更新
// ========================
const scoreValEl = document.getElementById('score-val');
const ecoPercentEl = document.getElementById('eco-percent');
const ecoBarFillEl = document.getElementById('eco-bar-fill');
const bookCountEl = document.getElementById('book-count');
const toastBanner = document.getElementById('toast-banner');
let toastTimer = null;

function showToast(msg) {
    toastBanner.textContent = msg;
    toastBanner.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastBanner.classList.remove('show'), 2800);
}

function addStars(points) {
    starScore += points;
    scoreValEl.textContent = String(starScore);
}

function updateEcoCleanliness() {
    // 初始 40%，每清理 1 個膠樽提升潔淨度直至 100%，海水真實變清澈！
    const ratio = THREE.MathUtils.clamp(0.4 + (cleanedTrashTotal / TARGET_CLEAN_GOAL) * 0.6, 0.4, 1.0);
    const pct = Math.round(ratio * 100);
    ecoPercentEl.textContent = `${pct}%`;
    ecoBarFillEl.style.width = `${pct}%`;

    scene.background.copy(murkyColor).lerp(crystalColor, ratio);
    scene.fog.color.copy(scene.background);
    scene.fog.density = THREE.MathUtils.lerp(0.0185, 0.0105, ratio);
}
updateEcoCleanliness();

// ========================
// 5. 生物介紹卡 & 海洋收集圖鑑
// ========================
const creatureCard = document.getElementById('creature-card');
const cardEmoji = document.getElementById('card-emoji');
const cardZh = document.getElementById('card-zh');
const cardEn = document.getElementById('card-en');
const cardDesc = document.getElementById('card-desc');
const cardFact = document.getElementById('card-fact');

function openCreatureCard(spec, focusPos = null) {
    selectedSpecies = spec;
    cardEmoji.textContent = spec.emoji;
    cardZh.textContent = spec.zh;
    cardEn.textContent = spec.en;
    cardDesc.textContent = spec.desc;
    cardFact.textContent = spec.funFact;
    creatureCard.classList.add('open');

    if (focusPos) {
        desiredCamTarget.copy(focusPos).clampLength(0, 22);
        desiredCamTarget.y = THREE.MathUtils.clamp(focusPos.y, 1.8, 15.0);
    }

    if (!discoveredSpecies.has(spec.id)) {
        discoveredSpecies.add(spec.id);
        bookCountEl.textContent = `${discoveredSpecies.size}/${SPECIES_DATA.length}`;
        addStars(5);
        showToast(`🎉 解鎖新圖鑑：${spec.emoji} ${spec.zh}！（+5 ⭐）`);
        audioTTS.playSfx('clean');
    } else {
        audioTTS.playSfx('bubble');
    }
}

document.getElementById('btn-close-card').addEventListener('click', () => {
    creatureCard.classList.remove('open');
    audioTTS.stopSpeech();
});
document.getElementById('btn-speak-zh').addEventListener('click', () => {
    if (selectedSpecies) {
        audioTTS.speakCantonese(`${selectedSpecies.zh}。${selectedSpecies.desc}`);
    }
});
document.getElementById('btn-speak-en').addEventListener('click', () => {
    if (selectedSpecies) {
        audioTTS.speakEnglish(selectedSpecies.en);
    }
});

// 圖鑑 Modal
const bookModal = document.getElementById('book-modal');
const bookGrid = document.getElementById('book-grid');

function renderBookModal() {
    bookGrid.innerHTML = '';
    SPECIES_DATA.forEach((sp) => {
        const unlocked = discoveredSpecies.has(sp.id);
        const div = document.createElement('div');
        div.className = `book-item ${unlocked ? '' : 'locked'}`;
        div.innerHTML = `
            <div class="book-icon">${sp.emoji}</div>
            <h4>${unlocked ? sp.zh : '？？？'}</h4>
            <p>${unlocked ? sp.en : '喺海底點選牠即可解鎖！'}</p>
        `;
        if (unlocked) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'voice-action-btn secondary-voice';
            btn.style.width = '100%';
            btn.style.justifyContent = 'center';
            btn.textContent = '🔊 聽介紹';
            btn.addEventListener('click', () => {
                audioTTS.speakCantonese(`${sp.zh}，英文係 ${sp.en}。${sp.desc}`);
            });
            div.appendChild(btn);
        }
        bookGrid.appendChild(div);
    });
}

document.getElementById('open-book').addEventListener('click', () => {
    renderBookModal();
    bookModal.classList.add('open');
    audioTTS.playSfx('bubble');
});
document.getElementById('btn-close-book').addEventListener('click', () => {
    bookModal.classList.remove('open');
    audioTTS.stopSpeech();
});

// ========================
// 6. 香港小二海洋問答系統（每題支援選擇讀出問題及選項！）
// ========================
const quizModal = document.getElementById('quiz-modal');
const quizProgressEl = document.getElementById('quiz-progress');
const quizStarsEl = document.getElementById('quiz-stars');
const quizIconEl = document.getElementById('quiz-icon');
const quizQuestionTextEl = document.getElementById('quiz-question-text');
const quizOptionsListEl = document.getElementById('quiz-options-list');
const quizFeedbackEl = document.getElementById('quiz-feedback');
const btnNextQuestion = document.getElementById('btn-next-question');
const btnReadAll = document.getElementById('btn-read-all');
const btnReadQuestion = document.getElementById('btn-read-question');
const btnStopVoice = document.getElementById('btn-stop-voice');
const btnAutoRead = document.getElementById('btn-auto-read');

// 語音播放時同步高亮對應選項及顯示停止掣
audioTTS.onSpeechStateChange((isSpeaking, highlightOptionIdx) => {
    btnStopVoice.style.display = isSpeaking ? 'inline-flex' : 'none';
    btnReadAll.classList.toggle('speaking', isSpeaking && highlightOptionIdx === -1);

    const rows = quizOptionsListEl.querySelectorAll('.quiz-option-row');
    rows.forEach((row, idx) => {
        row.classList.toggle('reading-highlight', isSpeaking && idx === highlightOptionIdx);
    });
});

function renderQuizQuestion() {
    audioTTS.stopSpeech();
    quizAnsweredCurrent = false;
    const q = QUIZ_QUESTIONS[quizIndex];

    quizProgressEl.textContent = `第 ${quizIndex + 1} / ${QUIZ_QUESTIONS.length} 題`;
    quizStarsEl.textContent = `🌟 答對：${quizCorrectCount}`;
    quizIconEl.textContent = q.icon;
    quizQuestionTextEl.textContent = q.question;

    quizFeedbackEl.className = '';
    quizFeedbackEl.textContent = '';
    btnNextQuestion.classList.remove('show');
    btnNextQuestion.textContent = quizIndex === QUIZ_QUESTIONS.length - 1 ? '🎉 完成挑戰！' : '下一題 ➡️';

    quizOptionsListEl.innerHTML = '';
    const letters = ['A', 'B', 'C'];

    q.options.forEach((optText, idx) => {
        const row = document.createElement('div');
        row.className = 'quiz-option-row';

        const ansBtn = document.createElement('button');
        ansBtn.type = 'button';
        ansBtn.className = 'quiz-option-btn';
        ansBtn.innerHTML = `<span class="opt-letter">${letters[idx]}</span><span>${optText}</span>`;
        ansBtn.addEventListener('click', () => handleAnswerSelect(idx, ansBtn));

        // 每個選項旁設有獨立「🔊」朗讀按鈕，方便小二學生單獨聽取選項而不誤觸作答
        const speakOptBtn = document.createElement('button');
        speakOptBtn.type = 'button';
        speakOptBtn.className = 'opt-speak-btn';
        speakOptBtn.title = `讀出選項 ${letters[idx]}`;
        speakOptBtn.setAttribute('aria-label', `讀出選項 ${letters[idx]}：${optText}`);
        speakOptBtn.textContent = '🔊';
        speakOptBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            audioTTS.speakSingleOption(idx, optText);
        });

        row.appendChild(ansBtn);
        row.appendChild(speakOptBtn);
        quizOptionsListEl.appendChild(row);
    });

    if (autoReadQuiz) {
        setTimeout(() => audioTTS.speakQuestionAndAllOptions(q), 220);
    }
}

function handleAnswerSelect(chosenIdx, btnEl) {
    if (quizAnsweredCurrent) return;
    const q = QUIZ_QUESTIONS[quizIndex];

    if (chosenIdx === q.answer) {
        quizAnsweredCurrent = true;
        quizCorrectCount++;
        addStars(10);
        btnEl.classList.add('correct');
        quizStarsEl.textContent = `🌟 答對：${quizCorrectCount}`;

        quizFeedbackEl.textContent = `✅ ${q.explanation}（+10 ⭐）`;
        quizFeedbackEl.className = 'show good';
        btnNextQuestion.classList.add('show');
        audioTTS.playSfx('correct');
        if (autoReadQuiz) {
            audioTTS.speakCantonese(q.explanation);
        }
    } else {
        btnEl.classList.add('wrong');
        quizFeedbackEl.textContent = '💡 唔緊要，再諗一諗或者撳「🔊 讀出題目及全部選項」聽多次，再試下其他選項啦！';
        quizFeedbackEl.className = 'show retry';
        audioTTS.playSfx('retry');
    }
}

btnReadAll.addEventListener('click', () => {
    audioTTS.speakQuestionAndAllOptions(QUIZ_QUESTIONS[quizIndex]);
});
btnReadQuestion.addEventListener('click', () => {
    audioTTS.speakQuestionOnly(QUIZ_QUESTIONS[quizIndex]);
});
btnStopVoice.addEventListener('click', () => {
    audioTTS.stopSpeech();
});
btnAutoRead.addEventListener('click', () => {
    autoReadQuiz = !autoReadQuiz;
    btnAutoRead.textContent = `🔁 自動讀題：${autoReadQuiz ? '開' : '關'}`;
    if (autoReadQuiz) {
        audioTTS.speakQuestionAndAllOptions(QUIZ_QUESTIONS[quizIndex]);
    } else {
        audioTTS.stopSpeech();
    }
});

btnNextQuestion.addEventListener('click', () => {
    if (quizIndex < QUIZ_QUESTIONS.length - 1) {
        quizIndex++;
        renderQuizQuestion();
    } else {
        audioTTS.stopSpeech();
        quizModal.classList.remove('open');
        showToast(`🏆 恭喜完成海洋小博士挑戰！共答對 ${quizCorrectCount} 題！`);
        audioTTS.playSfx('correct');
        quizIndex = 0;
        quizCorrectCount = 0;
    }
});

document.getElementById('open-quiz').addEventListener('click', () => {
    creatureCard.classList.remove('open');
    renderQuizQuestion();
    quizModal.classList.add('open');
    audioTTS.playSfx('bubble');
});
document.getElementById('btn-close-quiz').addEventListener('click', () => {
    audioTTS.stopSpeech();
    quizModal.classList.remove('open');
});

// ========================
// 7. iPad 觸控與滑鼠 Raycasting 互動
// ========================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const dropPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -9.5);
const dropPoint = new THREE.Vector3();

let pointerDownPos = { x: 0, y: 0 };

renderer.domElement.addEventListener('pointerdown', (e) => {
    audioTTS.unlockAudio();
    pointerDownPos.x = e.clientX;
    pointerDownPos.y = e.clientY;
});

renderer.domElement.addEventListener('pointerup', (e) => {
    // 若手指拖曳超過 12px 視為旋轉鏡頭，避免誤觸
    const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    if (moveDist > 12) return;

    pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);

    if (currentMode === 'feed') {
        if (raycaster.ray.intersectPlane(dropPlane, dropPoint)) {
            dropPoint.clampLength(0, PHYSICS_CONSTANTS.TANK_RADIUS - 4.0);
            spawnFoodAt(dropPoint);
        } else {
            raycaster.ray.at(18, dropPoint);
            dropPoint.clampLength(0, PHYSICS_CONSTANTS.TANK_RADIUS - 4.0);
            spawnFoodAt(dropPoint);
        }
        return;
    }

    // 探索與清潔模式：優先檢測放大版隱形碰撞球
    const hits = raycaster.intersectObjects(clickableHitboxes, false);
    if (hits.length > 0) {
        const hitObj = hits[0].object;
        if (hitObj.userData.type === 'trash') {
            const rec = hitObj.userData.trashRecord;
            scene.remove(rec.group);
            const tIdx = trashItems.indexOf(rec);
            if (tIdx !== -1) trashItems.splice(tIdx, 1);
            const hIdx = clickableHitboxes.indexOf(hitObj);
            if (hIdx !== -1) clickableHitboxes.splice(hIdx, 1);

            cleanedTrashTotal++;
            addStars(10);
            updateEcoCleanliness();
            audioTTS.playSfx('clean');

            if (trashItems.length === 0) {
                showToast('🌟 海域垃圾已全部清乾淨！海水變得超清澈！（3 秒後巡邏新海域）');
                setTimeout(() => spawnTrashBatch(5), 3200);
            } else {
                showToast(`♻️ 成功回收海洋膠樽！（+10 ⭐，尚餘 ${trashItems.length} 個）`);
            }
        } else if (hitObj.userData.type === 'creature') {
            const cRec = hitObj.userData.creatureRecord;
            openCreatureCard(cRec.spec, cRec.group.position);
        }
    }
});

// 底部與頂部按鈕切換
const btnExplore = document.getElementById('mode-explore');
const btnFeed = document.getElementById('mode-feed');

btnExplore.addEventListener('click', () => {
    currentMode = 'explore';
    btnExplore.classList.add('active');
    btnFeed.classList.remove('active');
    showToast('🔍 探索模式：點選海洋生物聽介紹，或點選膠樽清潔海洋！');
});

btnFeed.addEventListener('click', () => {
    currentMode = 'feed';
    btnFeed.classList.add('active');
    btnExplore.classList.remove('active');
    creatureCard.classList.remove('open');
    showToast('🍞 投餵模式：點選水面或海中撒下魚糧，小魚同海龜會游過嚟食㗎！');
});

document.getElementById('btn-reset-cam').addEventListener('click', () => {
    desiredCamTarget.copy(defaultCamTarget);
    camera.position.set(0, 13.5, 29.0);
    showToast('🎯 已重置最佳觀賞視角');
});

const btnQuality = document.getElementById('btn-quality');
btnQuality.addEventListener('click', () => {
    highQuality = !highQuality;
    renderer.setPixelRatio(highQuality ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    renderer.shadowMap.enabled = highQuality;
    sunLight.castShadow = highQuality;
    worldEnv.godRays.forEach((r) => { r.visible = highQuality; });
    btnQuality.textContent = highQuality ? '✨ Switch 高畫質' : '🔋 iPad 省電模式';
    showToast(highQuality ? '✨ 已開啟 Switch 高畫質光影模式' : '🔋 已切換至 iPad 流暢省電模式');
});

const btnSound = document.getElementById('btn-sound');
btnSound.addEventListener('click', () => {
    const on = audioTTS.toggleSound();
    btnSound.textContent = on ? '🔊 音效開' : '🔇 音效關';
});

// ========================
// 8. 嚴格 Δt 物理與動畫主迴圈
// ========================
const clock = new THREE.Clock();
const bubbleDummy = new THREE.Object3D();

function animate() {
    requestAnimationFrame(animate);

    // 限制單幀最大 dt 為 0.05s，防止分頁切換回來時物理爆衝，並確保 60Hz 與 120Hz ProMotion iPad 速度完全一致
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;

    // 1. 魚糧流體下沉與過期回收
    const expiredFoods = physicsWorld.updateFoodPellets(foods, dt, elapsed);
    for (let i = expiredFoods.length - 1; i >= 0; i--) {
        removeFoodAtIndex(expiredFoods[i]);
    }

    // 2. 漂浮塑膠樽浮力與光環脈動
    physicsWorld.updateTrashItems(trashItems, dt, elapsed);
    for (let i = 0; i < trashItems.length; i++) {
        const pulse = 0.92 + Math.sin(elapsed * 3.5 + trashItems[i].phase) * 0.14;
        trashItems[i].ring.scale.setScalar(pulse);
    }

    // 3. 3D 氣泡上升與波義耳減壓膨脹
    physicsWorld.updateBubbles(worldEnv.bubblesData, worldEnv.bubbleInstanced, bubbleDummy, dt, elapsed);

    // 4. 海洋生物 Boids 導航、避障與進食判定
    physicsWorld.updateCreatures(creatures, foods, dt, elapsed, (eatenFoodIdx) => {
        removeFoodAtIndex(eatenFoodIdx);
        addStars(2);
        audioTTS.playSfx('bubble');
    });
    for (let i = 0; i < creatures.length; i++) {
        animateCreatureRig(creatures[i]);
    }

    // 5. 海底雙層焦散流動、體積光束搖曳與海草擺動
    worldEnv.causticsTexA.offset.x = (elapsed * 0.028) % 1;
    worldEnv.causticsTexA.offset.y = (elapsed * 0.021) % 1;
    worldEnv.causticsTexB.offset.x = (-elapsed * 0.019) % 1;
    worldEnv.causticsTexB.offset.y = (elapsed * 0.025) % 1;

    if (highQuality) {
        for (let i = 0; i < worldEnv.godRays.length; i++) {
            const ray = worldEnv.godRays[i];
            ray.position.x = ray.userData.baseX + Math.sin(elapsed * 0.45 + ray.userData.phase) * 1.4;
            ray.material.opacity = 0.32 + Math.sin(elapsed * 0.8 + ray.userData.phase) * 0.08;
        }
    }

    for (let i = 0; i < worldEnv.swayingPlants.length; i++) {
        const sp = worldEnv.swayingPlants[i];
        sp.obj.rotation.z = sp.baseRotZ + Math.sin(elapsed * 1.6 + sp.phase) * sp.amp;
    }

    // 6. 鏡頭目標平滑過渡
    controls.target.lerp(desiredCamTarget, Math.min(1.0, 3.5 * dt));
    controls.update();

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
