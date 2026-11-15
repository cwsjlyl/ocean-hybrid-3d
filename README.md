# 3D 海洋探索館

香港小學程度教育遊戲：3D 海底環境 + 2.5D 高清生物立牌。可離線開啟，亦可放上 GitHub Pages，再用網址嵌入 Google Sites。

## 點樣玩
- 拖曳旋轉鏡頭（唔會穿入沙地）
- 「點擊探索」：點海洋生物，睇中英文介紹同聽英文發音
- 「投餵魚糧」：點一下投糧，魚會游過來
- 點漂浮膠樽清理海洋，計已清理數量

## 本機試玩
用本機伺服器開啟（ES Module 同模型檔唔適合直接雙擊）：

```bash
python3 -m http.server 8080
```

然後用 Chrome／Edge／Safari 打開 `http://localhost:8080/`。

課堂建議用 iPad Safari 全螢幕；已鎖定像素比 ≤ 2、關閉即時陰影，方便舊款 iPad。

## 嵌入 Google Sites
1. 發佈到 GitHub Pages 後，複製網址（例如 `https://帳戶名.github.io/ocean-hybrid-3d/`）
2. Google Sites → 插入 → 嵌入 → 依網址 → 貼上
3. 調校嵌入框高度後發布
4. 唔好把整份程式碼貼入「嵌入程式碼」

## 素材同授權（全部免費）
- 3D 沉船、寶箱、木桶、岩石：Kenney Pirate Kit 2.1（CC0）
- 2D 熱帶魚、海草：Kenney Fish Pack 2.0（CC0）
- 小丑魚、綠海龜、雙髻鯊、藍鯨、膠樽立牌：為課堂辨識而繪製的同風格平面圖
- 遊戲引擎：Three.js r160（MIT），已放在 `vendor/`，唔依賴外網 CDN

支援：可註明 Kenney（www.kenney.nl），並非必須。
