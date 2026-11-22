import * as THREE from 'three';

/**
 * 真實比例海水流體力學與海洋生物運動物理引擎
 * 世界單位：1 Three.js Unit = 1 公尺 (m)
 */
export const PHYSICS_CONSTANTS = {
    GRAVITY: 9.81,              // 重力加速度 g (m/s^2)
    SEAWATER_DENSITY: 1025.0,   // 標準海水密度 ρ_w (kg/m^3, 35‰ 鹽度)
    PELLET_DENSITY: 1180.0,     // 下沉型魚糧密度 ρ_p (kg/m^3, > 1025 故具負浮力自然下沉)
    ATM_PRESSURE: 101325.0,     // 海平面大氣壓力 P_0 (Pa)
    SURFACE_Y: 22.0,            // 水面高度 (m)
    TANK_RADIUS: 36.5,          // 生態館有效游動半徑 (m)
    STROUHAL_NUMBER: 0.28       // 水生生物最佳推進無因次 Strouhal 數 (St = f * A / U ≈ 0.28)
};

/**
 * 決定性連續海床高度函數 y = h(x, z)
 * 沉船區 (-8, -6) 附近保持平緩盆地避免穿模，外圍珊瑚環微隆起呈現立體地形
 */
export function getSeabedHeight(x, z) {
    const r = Math.hypot(x, z);
    // 沉船平坦保護區權重
    const wreckDist = Math.hypot(x + 8, z + 6);
    const wreckFlatten = THREE.MathUtils.smoothstep(wreckDist, 3.5, 11.5);

    const ripples =
        Math.sin(x * 0.22 + z * 0.14) * 0.32 +
        Math.cos(x * 0.13 - z * 0.25) * 0.28 +
        Math.sin(r * 0.45) * 0.14;

    const outerRim = THREE.MathUtils.smoothstep(r, 14.0, 38.0) * 1.35;
    return (ripples * wreckFlatten) + outerRim - 0.15;
}

/**
 * 水深靜水壓力 P(y) = P_0 + ρ * g * h (Pa)
 */
export function getHydrostaticPressure(y) {
    const depth = Math.max(0, PHYSICS_CONSTANTS.SURFACE_Y - y);
    return PHYSICS_CONSTANTS.ATM_PRESSURE +
        PHYSICS_CONSTANTS.SEAWATER_DENSITY * PHYSICS_CONSTANTS.GRAVITY * depth;
}

/**
 * 波義耳定律 (Boyle's Law: P1*V1 = P2*V2) 氣泡上升減壓體積膨脹半徑比
 * R(y) / R_bottom = (P_bottom / P(y))^(1/3)
 */
const P_BOTTOM = getHydrostaticPressure(0);
export function getBubbleScaleFactor(y) {
    const pNow = getHydrostaticPressure(y);
    return Math.pow(P_BOTTOM / pNow, 1 / 3);
}

/**
 * 三維溫和層流洋流場 u_current(x, y, z, t) (m/s)
 */
export function getOceanCurrent(x, y, z, t, target) {
    const depthFactor = 0.45 + 0.55 * THREE.MathUtils.clamp(y / PHYSICS_CONSTANTS.SURFACE_Y, 0, 1);
    target.set(
        Math.sin(t * 0.35 + z * 0.08) * 0.16 * depthFactor,
        Math.cos(t * 0.28 + x * 0.07) * 0.03,
        Math.cos(t * 0.31 - x * 0.08) * 0.16 * depthFactor
    );
    return target;
}

export class PhysicsWorld {
    constructor() {
        // 靜態圓柱／球體障礙物（沉船、大型礁石），防止魚類與垃圾穿模
        this.obstacles = [
            { x: -8.0, z: -6.0, radius: 6.4, maxY: 8.8 }, // 沉船主體安全排斥場
            { x: -2.0, z: -3.0, radius: 1.6, maxY: 2.6 }  // 寶箱與木桶群
        ];
        this._tmpVec = new THREE.Vector3();
        this._tmpCurrent = new THREE.Vector3();
        this._steer = new THREE.Vector3();
        this._diff = new THREE.Vector3();
    }

    addObstacle(x, z, radius, maxY = 5.0) {
        this.obstacles.push({ x, z, radius, maxY });
    }

    /**
     * 更新魚糧顆粒：阿基米德負浮力 + 二次方水阻力 + 洋流漂移 + 海床真實著陸
     * 淨向下加速度 a_net = -g * (1 - ρ_water / ρ_pellet) ≈ -1.289 m/s^2
     * 阻力項 -k_d * |v_rel| * v_rel，終端下沉速度 v_t ≈ 0.76 m/s
     */
    updateFoodPellets(foods, dt, t) {
        const netBuoyancyAcc = -PHYSICS_CONSTANTS.GRAVITY *
            (1.0 - PHYSICS_CONSTANTS.SEAWATER_DENSITY / PHYSICS_CONSTANTS.PELLET_DENSITY);
        const dragCoeff = 2.2; // 1/m，對應終端沉降速度 sqrt(1.289 / 2.2) ≈ 0.765 m/s
        const expiredIndices = [];

        for (let i = 0; i < foods.length; i++) {
            const f = foods[i];
            f.age += dt;
            if (f.age > 20.0) {
                expiredIndices.push(i);
                continue;
            }

            const pos = f.mesh.position;
            const vel = f.velocity;
            const floorY = getSeabedHeight(pos.x, pos.z) + 0.16;

            if (!f.grounded) {
                getOceanCurrent(pos.x, pos.y, pos.z, t, this._tmpCurrent);
                this._tmpVec.subVectors(vel, this._tmpCurrent);
                const relSpeed = this._tmpVec.length();

                // a = a_buoyancy - k_d * |v_rel| * v_rel - linear_viscous * v_rel
                vel.x -= (dragCoeff * relSpeed + 0.85) * this._tmpVec.x * dt;
                vel.y += (netBuoyancyAcc - (dragCoeff * relSpeed + 0.45) * this._tmpVec.y) * dt;
                vel.z -= (dragCoeff * relSpeed + 0.85) * this._tmpVec.z * dt;

                pos.addScaledVector(vel, dt);

                if (pos.y <= floorY) {
                    pos.y = floorY;
                    vel.set(0, 0, 0);
                    f.grounded = true;
                }
            } else {
                // 停留在海床沙面上，隨底層微弱水流輕微滾動
                pos.y = floorY;
            }
        }
        return expiredIndices;
    }

    /**
     * 更新半進水漂浮海洋塑膠樽：浮力平衡彈簧阻尼 + 洋流漂移 + 波浪力矩搖晃 + 障礙物排斥
     */
    updateTrashItems(trashItems, dt, t) {
        for (let i = 0; i < trashItems.length; i++) {
            const item = trashItems[i];
            const pos = item.group.position;
            const vel = item.velocity;

            getOceanCurrent(pos.x, pos.y, pos.z, t + item.phase, this._tmpCurrent);

            // 垂直方向：圍繞各自殘留空氣量決定的中性浮力深度 eqY 產生阿基米德恢復力與水阻尼
            const dispY = item.eqY + Math.sin(t * 1.15 + item.phase) * 0.38 - pos.y;
            const ay = dispY * 1.85 - vel.y * 2.1;
            const ax = (this._tmpCurrent.x - vel.x) * 1.2;
            const az = (this._tmpCurrent.z - vel.z) * 1.2;

            vel.x += ax * dt;
            vel.y += ay * dt;
            vel.z += az * dt;

            // 防止漂出邊界
            const r = Math.hypot(pos.x, pos.z);
            if (r > PHYSICS_CONSTANTS.TANK_RADIUS - 4.0) {
                const pushIn = (r - (PHYSICS_CONSTANTS.TANK_RADIUS - 4.0)) * 0.9;
                vel.x -= (pos.x / r) * pushIn * dt;
                vel.z -= (pos.z / r) * pushIn * dt;
            }

            // 防止穿入沉船或海底礁石
            for (let o = 0; o < this.obstacles.length; o++) {
                const obs = this.obstacles[o];
                if (pos.y < obs.maxY + 1.2) {
                    const dx = pos.x - obs.x;
                    const dz = pos.z - obs.z;
                    const dist = Math.hypot(dx, dz) || 0.001;
                    const minDist = obs.radius + 1.2;
                    if (dist < minDist) {
                        const push = (minDist - dist) * 3.0;
                        vel.x += (dx / dist) * push * dt;
                        vel.z += (dz / dist) * push * dt;
                    }
                }
            }

            pos.addScaledVector(vel, dt);
            const minFloor = getSeabedHeight(pos.x, pos.z) + 1.2;
            if (pos.y < minFloor) {
                pos.y = minFloor;
                vel.y = Math.max(0, vel.y);
            }

            // 真實波浪力矩傾角（Pitch & Roll）與緩慢自轉
            item.group.rotation.x = item.baseTiltX + Math.sin(t * 1.3 + item.phase) * 0.16;
            item.group.rotation.z = item.baseTiltZ + Math.cos(t * 1.05 + item.phase * 1.3) * 0.18;
            item.group.rotation.y += item.spinSpeed * dt;
        }
    }

    /**
     * 更新 3D 氣泡群：尺寸相關終端上升速度 + 卡門渦街螺旋擺動 + 波義耳定律減壓膨脹
     */
    updateBubbles(bubbles, instancedMesh, dummy, dt, t) {
        for (let i = 0; i < bubbles.length; i++) {
            const b = bubbles[i];
            // 大氣泡浮力與表面積比更高，上升終端速度較快 (v_t ∝ sqrt(r))
            b.y += b.riseSpeed * dt;
            const wobbleX = Math.sin(t * b.wobbleFreq + b.phase) * b.wobbleAmp;
            const wobbleZ = Math.cos(t * b.wobbleFreq * 0.92 + b.phase) * b.wobbleAmp;

            if (b.y > PHYSICS_CONSTANTS.SURFACE_Y - 0.3) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 2.0 + Math.random() * 31.0;
                b.baseX = Math.cos(angle) * dist;
                b.baseZ = Math.sin(angle) * dist;
                b.y = getSeabedHeight(b.baseX, b.baseZ) + 0.25;
            }

            const expansion = getBubbleScaleFactor(b.y);
            const rScale = b.baseRadius * expansion;

            dummy.position.set(b.baseX + wobbleX, b.y, b.baseZ + wobbleZ);
            // 上升過程因水動力壓差微呈扁球體 (oblate ellipsoid)
            dummy.scale.set(rScale * 1.06, rScale * 0.92, rScale * 1.06);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * 更新所有海洋生物：Boids 群游 + 覓食導航 + 三維障礙物排斥 + 轉彎傾側角 (Banking) + Strouhal 推進相位
     */
    updateCreatures(creatures, foods, dt, t, onEatFood) {
        for (let i = 0; i < creatures.length; i++) {
            const c = creatures[i];
            const spec = c.spec;
            const pos = c.group.position;
            const vel = c.velocity;

            this._steer.set(0, 0, 0);
            let targetSpeed = spec.cruiseSpeed;

            // 1. 覓食行為（只限雜食／珊瑚礁魚類與海龜，藍鯨與雙髻鯊不爭搶顆粒魚糧）
            let chasingFood = false;
            if (spec.feedsOnPellets && foods.length > 0) {
                let bestFoodIdx = -1;
                let bestDistSq = 19.0 * 19.0;
                for (let fIdx = 0; fIdx < foods.length; fIdx++) {
                    const dSq = pos.distanceToSquared(foods[fIdx].mesh.position);
                    if (dSq < bestDistSq) {
                        bestDistSq = dSq;
                        bestFoodIdx = fIdx;
                    }
                }
                if (bestFoodIdx !== -1) {
                    const foodPos = foods[bestFoodIdx].mesh.position;
                    const dist = Math.sqrt(bestDistSq);
                    if (dist < Math.max(0.95, spec.size * 0.42)) {
                        onEatFood(bestFoodIdx, c);
                    } else {
                        this._diff.subVectors(foodPos, pos).normalize();
                        this._steer.addScaledVector(this._diff, 5.2);
                        targetSpeed = spec.maxSpeed;
                        chasingFood = true;
                    }
                }
            }

            // 2. 環礁巡游切線導航 + 自然漫遊擾動
            if (!chasingFood) {
                const radialDist = Math.hypot(pos.x, pos.z) || 0.01;
                // 順時針／逆時針柔和環游向量
                const tangentX = (-pos.z / radialDist) * c.orbitDir;
                const tangentZ = (pos.x / radialDist) * c.orbitDir;
                const radialErr = (c.preferredRadius - radialDist) * 0.14;

                this._steer.x += tangentX * 1.45 + (pos.x / radialDist) * radialErr + Math.sin(t * 0.7 + c.seed) * 0.35;
                this._steer.z += tangentZ * 1.45 + (pos.z / radialDist) * radialErr + Math.cos(t * 0.62 + c.seed * 1.7) * 0.35;

                // 深度分層舒適帶恢復力
                const [minD, maxD] = spec.depthRange;
                const idealY = c.preferredY + Math.sin(t * 0.55 + c.seed) * 0.65;
                if (pos.y < minD) {
                    this._steer.y += (minD - pos.y) * 2.4;
                } else if (pos.y > maxD) {
                    this._steer.y -= (pos.y - maxD) * 2.4;
                } else {
                    this._steer.y += (idealY - pos.y) * 0.65;
                }
            }

            // 3. Boids 同類群游（分離 Separation + 對齊 Alignment）
            const sepRadius = spec.size * 1.05 + 0.6;
            const alignRadius = spec.size * 3.4;
            let alignCount = 0;
            this._tmpVec.set(0, 0, 0);

            for (let j = 0; j < creatures.length; j++) {
                if (i === j) continue;
                const other = creatures[j];
                this._diff.subVectors(pos, other.group.position);
                const d = this._diff.length();
                const minSep = (spec.size + other.spec.size) * 0.48;

                if (d > 0.001 && d < Math.max(sepRadius, minSep)) {
                    this._steer.addScaledVector(this._diff.normalize(), (Math.max(sepRadius, minSep) - d) * 2.6);
                } else if (other.spec.id === spec.id && d < alignRadius) {
                    this._tmpVec.add(other.velocity);
                    alignCount++;
                }
            }
            if (alignCount > 0 && !chasingFood) {
                this._tmpVec.divideScalar(alignCount).normalize();
                this._steer.addScaledVector(this._tmpVec, 0.55);
            }

            // 4. 靜態障礙物（沉船、礁石）與邊界平滑排斥力場
            for (let o = 0; o < this.obstacles.length; o++) {
                const obs = this.obstacles[o];
                if (pos.y < obs.maxY + spec.size * 0.5) {
                    const dx = pos.x - obs.x;
                    const dz = pos.z - obs.z;
                    const dist = Math.hypot(dx, dz) || 0.001;
                    const safeDist = obs.radius + spec.size * 0.65 + 1.0;
                    if (dist < safeDist) {
                        const strength = ((safeDist - dist) / safeDist) * 9.5;
                        this._steer.x += (dx / dist) * strength;
                        this._steer.z += (dz / dist) * strength;
                        this._steer.y += 1.2; // 輕微向上游越障礙
                    }
                }
            }

            const distFromCenter = Math.hypot(pos.x, pos.z);
            if (distFromCenter > PHYSICS_CONSTANTS.TANK_RADIUS - 3.5) {
                const inward = (distFromCenter - (PHYSICS_CONSTANTS.TANK_RADIUS - 3.5)) * 2.2;
                this._steer.x -= (pos.x / distFromCenter) * inward;
                this._steer.z -= (pos.z / distFromCenter) * inward;
            }

            // 5. 依據物種質量與最大轉向率更新速度向量
            if (this._steer.lengthSq() > 0.0001) {
                const desiredDir = this._steer.normalize();
                const currentSpeed = vel.length() || spec.cruiseSpeed;
                const currentDir = this._tmpVec.copy(vel). divideScalar(currentSpeed);

                const lerpAlpha = Math.min(1.0, spec.turnRate * dt);
                currentDir.lerp(desiredDir, lerpAlpha).normalize();

                // 限制俯仰坡度，避免鯨魚或鯊魚垂直倒立
                const maxClimbY = chasingFood ? 0.58 : 0.28;
                currentDir.y = THREE.MathUtils.clamp(currentDir.y, -maxClimbY, maxClimbY);
                currentDir.normalize();

                const nextSpeed = THREE.MathUtils.lerp(currentSpeed, targetSpeed, Math.min(1.0, 2.4 * dt));
                vel.copy(currentDir).multiplyScalar(nextSpeed);
            }

            pos.addScaledVector(vel, dt);

            // 6. 海床與水面剛性安全邊界（絕不穿入沙地或飛出水面）
            const minClearance = getSeabedHeight(pos.x, pos.z) + Math.max(0.55, spec.size * 0.26);
            const maxCeiling = PHYSICS_CONSTANTS.SURFACE_Y - Math.max(1.2, spec.size * 0.28);
            if (pos.y < minClearance) {
                pos.y = minClearance;
                if (vel.y < 0) vel.y *= -0.3;
            } else if (pos.y > maxCeiling) {
                pos.y = maxCeiling;
                if (vel.y > 0) vel.y *= -0.3;
            }

            // 7. 計算平滑航向角 (Yaw)、俯仰角 (Pitch) 與流體轉彎傾側角 (Bank Roll)
            const speed = vel.length();
            const targetYaw = Math.atan2(vel.x, vel.z);
            let yawDelta = targetYaw - c.yaw;
            while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
            while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;

            c.yaw += yawDelta * Math.min(1.0, (spec.turnRate * 1.6) * dt);
            const targetPitch = -Math.asin(THREE.MathUtils.clamp(vel.y / (speed || 1), -0.55, 0.55));
            c.pitch = THREE.MathUtils.lerp(c.pitch, targetPitch, Math.min(1.0, 5.0 * dt));
            const targetBank = THREE.MathUtils.clamp(-yawDelta * 0.85, -0.36, 0.36);
            c.bank = THREE.MathUtils.lerp(c.bank, targetBank, Math.min(1.0, 4.5 * dt));

            c.group.rotation.order = 'YXZ';
            c.group.rotation.y = c.yaw;
            c.group.rotation.x = c.pitch;
            c.group.rotation.z = c.bank;

            // 8. 依據 Strouhal 定律 (f = St * U / A) 推進擺尾／拍鰭相位
            const strokeAmp = Math.max(0.32, spec.size * 0.22);
            const freqHz = (PHYSICS_CONSTANTS.STROUHAL_NUMBER * speed) / strokeAmp;
            c.swimPhase += dt * Math.max(0.85, freqHz) * Math.PI * 2;
        }
    }
}
