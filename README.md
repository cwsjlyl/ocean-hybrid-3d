# 🌊 3D 奇妙海洋生態館（香港小二 iPad 互動學習升級版）

專為**香港小學二年級（P2）學生以 iPad 遊玩及學習**而設的 WebGL / Three.js 3D 海洋生態與環保教育互動網頁遊戲。支援離線開啟、GitHub Pages 直接部署及嵌入 Google Sites。

---

## ✨ 核心升級亮點

### 1. 🎨 Nintendo Switch 水準風格化 3D 畫質與 Blender 管線
- **全 3D 關節海洋生物建模**：將原本平面 2D 紙片魚全面升級為圓潤立體 3D 模型（小丑魚、綠海龜、T 字頭雙髻鯊、水平尾鰭藍鯨、藍刀鯛及粉紅珊瑚魚），並啟用專案內的 3D 漂浮膠樽（`bottle.glb` / `bottle-large.glb`）。
- **ACES Filmic 色調映射 + 程序化海底環境光（PMREM IBL）**：模擬《集合啦！動物森友會》博物館水族館的溫潤反射質感。
- **客製化 Fresnel 邊緣補光 Shader**：水下遠近生物輪廓清晰明亮。
- **3D 起伏海床地形 + 雙層反向焦散（Dual Caustics）+ 體積耶穌光柱（God Rays）+ 海底接觸陰影**。
- **Blender 自動化批次腳本**：提供 `tools/blender_switch_upgrade.py`，可於本機以 `blender --background --python tools/blender_switch_upgrade.py` 為所有 `.glb` 資產批次套用 Bevel 導角、Weighted Normals 與 Switch PBR 材質參數。

### 2. ⚖️ 嚴格物理參數與生物推進力學（`src/physics.js`）
- **獨立於螢幕刷新率之 $\Delta t$ 物理步進**：無論在 60Hz iPad 或 120Hz ProMotion iPad Pro 上，所有游速、下沉與氣泡物理完全一致。
- **真實海水阿基米德浮力與二次方阻力**：海水密度 $\rho_w = 1025\text{ kg/m}^3$、重力 $g = 9.81\text{ m/s}^2$、下沉魚糧密度 $\rho_p = 1180\text{ kg/m}^3$，自然收斂至真實終端沉降速度並停留在起伏海床表面。
- **波義耳定律（Boyle's Law）氣泡減壓膨脹**：3D 晶瑩氣泡（`InstancedMesh`）由海底升向水面時，隨靜水壓力 $P = P_0 + \rho g h$ 降低而真實膨脹 $R \propto P^{-1/3}$。
- **Strouhal 數（$St \approx 0.28$）推進力學與分類學特徵**：魚類與鯊魚左右擺尾、藍鯨（哺乳類）上下擺動水平尾鰭、綠海龜雙翼前肢拍動滑翔，並具備 Boids 群游與沉船／礁石 3D 避障（零穿模）。

### 3. 🗣️ 每題獨立粵語語音讀題及逐項讀選項（香港小二 iPad 專屬設計）
- **海洋小博士 10 題情境問答**：每題均提供 **「🔊 讀出題目及全部選項」**（朗讀時同步高亮對應選項）、**「🗣️ 只讀題目」**、**每個選項旁的獨立「🔊」朗讀掣**，以及 **「🔁 自動讀題」** 開關，照顧小二學生識字差異。
- **粵英雙語生物圖鑑**：點選生物即可解鎖圖鑑印章，支援香港粵語（`zh-HK`）介紹與英語（`en-US`）發音。
- **動態海水清澈度回饋**：清理漂浮膠樽後，海水混濁霧氣會即時變得清澈蔚藍！

---

## 📁 模組化專案結構

```text
├── index.html                      # 響應式 iPad 觸控介面、安全區域配置與無障礙語義結構
├── src/
│   ├── main.js                     # 主迴圈、iPad 觸控 Raycasting、狀態與鏡頭管理
│   ├── graphics.js                 # Switch 風格 PBR、PMREM 環境光、焦散、光柱與 3D 生物建模
│   ├── physics.js                  # 阿基米德浮力、波義耳氣泡膨脹、Boids 與 3D 避障物理
│   ├── audio-tts.js                # iPadOS Safari 粵英雙語 TTS 與零依賴 Web Audio 合成音效
│   └── quiz-data.js                # 香港小二海洋生物圖鑑資料與 10 題互動問答題庫
├── tools/
│   └── blender_switch_upgrade.py   # Blender 3.6+/4.x Python 批次 PBR 與導角優化腳本
├── assets/                         # 3D GLB 模型（沉船、寶箱、礁石、膠樽）與海草貼圖
└── vendor/three/                   # 內建 Three.js r160 核心與載入器（支援離線與免建置部署）
```

## 🚀 本機預覽與部署
1. **GitHub Pages**：在 Repository Settings -> Pages 選擇對應分支（合入 `main` 後選 `main` / root），即可直接透過網址在課室 iPad Safari 開啟或嵌入 Google Sites。
2. **本機測試**：於專案資料夾執行 `python3 -m http.server 8080`，瀏覽器開啟 `http://localhost:8080`。
