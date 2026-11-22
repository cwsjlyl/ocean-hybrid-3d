/**
 * iPadOS Safari 專屬優化粵英雙語語音合成（Web Speech API）及零音檔程序化音效管理器
 */
export class AudioTTSManager {
    constructor() {
        this.soundEnabled = true;
        this.audioCtx = null;
        this.voices = [];
        this.zhHKVoice = null;
        this.enVoice = null;
        this.speakingSessionId = 0;

        this._initSpeechVoices();
    }

    _initSpeechVoices() {
        if (!('speechSynthesis' in window)) return;

        const loadVoices = () => {
            const list = window.speechSynthesis.getVoices() || [];
            if (!list.length) return;
            this.voices = list;

            // 優先選擇香港粵語語音（如 iPadOS Sin-ji / Siri 粵語）
            this.zhHKVoice =
                list.find((v) => /zh[-_]?HK|yue/i.test(v.lang)) ||
                list.find((v) => /Cantonese|Hong Kong|香港|粵/i.test(v.name)) ||
                list.find((v) => /zh[-_]?TW/i.test(v.lang)) ||
                list.find((v) => /^zh/i.test(v.lang)) ||
                null;

            // 清晰英語發音語音
            this.enVoice =
                list.find((v) => /Samantha|Karen|Daniel|Moira/i.test(v.name)) ||
                list.find((v) => /en[-_]?(GB|US|HK|AU)/i.test(v.lang)) ||
                list.find((v) => /^en/i.test(v.lang)) ||
                null;
        };

        loadVoices();
        window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    }

    /**
     * 於首次觸控解鎖 iPad Web Audio API
     */
    unlockAudio() {
        if (!this.audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) this.audioCtx = new Ctx();
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }
    }

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        if (!this.soundEnabled) this.stopSpeech();
        return this.soundEnabled;
    }

    stopSpeech() {
        this.speakingSessionId++;
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        if (this._onSpeechStateChange) {
            this._onSpeechStateChange(false, -1);
        }
    }

    onSpeechStateChange(fn) {
        this._onSpeechStateChange = fn;
    }

    /**
     * 朗讀單段粵語文字（適合小二學生的溫和清晰語速）
     */
    speakCantonese(text, onDone = null) {
        if (!('speechSynthesis' in window)) return;
        this.stopSpeech();
        const session = ++this.speakingSessionId;

        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'zh-HK';
        if (this.zhHKVoice) utter.voice = this.zhHKVoice;
        utter.rate = 0.92;
        utter.pitch = 1.04;

        this._onSpeechStateChange?.(true, -1);
        utter.onend = () => {
            if (this.speakingSessionId === session) {
                this._onSpeechStateChange?.(false, -1);
                onDone?.();
            }
        };
        utter.onerror = () => {
            if (this.speakingSessionId === session) {
                this._onSpeechStateChange?.(false, -1);
            }
        };
        window.speechSynthesis.speak(utter);
    }

    /**
     * 朗讀英語單詞或短句
     */
    speakEnglish(text) {
        if (!('speechSynthesis' in window)) return;
        this.stopSpeech();
        const session = ++this.speakingSessionId;

        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'en-US';
        if (this.enVoice) utter.voice = this.enVoice;
        utter.rate = 0.85;
        utter.pitch = 1.02;

        this._onSpeechStateChange?.(true, -1);
        utter.onend = () => {
            if (this.speakingSessionId === session) {
                this._onSpeechStateChange?.(false, -1);
            }
        };
        window.speechSynthesis.speak(utter);
    }

    /**
     * 問答功能：只讀題目
     */
    speakQuestionOnly(quizItem) {
        this.speakCantonese(`問題：${quizItem.question}`);
    }

    /**
     * 問答功能：單獨讀出某一個選項（例如「選項 A：海葵」）
     */
    speakSingleOption(optionIndex, optionText) {
        const letters = ['A', 'B', 'C'];
        if (!('speechSynthesis' in window)) return;
        this.stopSpeech();
        const session = ++this.speakingSessionId;

        const utter = new SpeechSynthesisUtterance(`選項 ${letters[optionIndex]}：${optionText}`);
        utter.lang = 'zh-HK';
        if (this.zhHKVoice) utter.voice = this.zhHKVoice;
        utter.rate = 0.92;
        utter.pitch = 1.04;

        this._onSpeechStateChange?.(true, optionIndex);
        utter.onend = () => {
            if (this.speakingSessionId === session) {
                this._onSpeechStateChange?.(false, -1);
            }
        };
        utter.onerror = () => {
            if (this.speakingSessionId === session) {
                this._onSpeechStateChange?.(false, -1);
            }
        };
        window.speechSynthesis.speak(utter);
    }

    /**
     * 問答功能：依序讀出「完整題目 + 選項 A + 選項 B + 選項 C」，並同步高亮當前朗讀的選項！
     */
    speakQuestionAndAllOptions(quizItem) {
        if (!('speechSynthesis' in window)) return;
        this.stopSpeech();
        const session = ++this.speakingSessionId;
        const letters = ['A', 'B', 'C'];

        const segments = [
            { text: `問題：${quizItem.question}`, highlightIdx: -1 },
            ...quizItem.options.map((opt, idx) => ({
                text: `選項 ${letters[idx]}：${opt}`,
                highlightIdx: idx
            }))
        ];

        let cursor = 0;
        const playNext = () => {
            if (this.speakingSessionId !== session) return;
            if (cursor >= segments.length) {
                this._onSpeechStateChange?.(false, -1);
                return;
            }
            const seg = segments[cursor++];
            const utter = new SpeechSynthesisUtterance(seg.text);
            utter.lang = 'zh-HK';
            if (this.zhHKVoice) utter.voice = this.zhHKVoice;
            utter.rate = 0.91;
            utter.pitch = 1.04;

            this._onSpeechStateChange?.(true, seg.highlightIdx);
            utter.onend = () => {
                if (this.speakingSessionId !== session) return;
                setTimeout(playNext, 180);
            };
            utter.onerror = () => {
                if (this.speakingSessionId === session) {
                    this._onSpeechStateChange?.(false, -1);
                }
            };
            window.speechSynthesis.speak(utter);
        };

        playNext();
    }

    /**
     * 程序化任天堂風輕快音效（零外部 MP3 載入延遲）
     */
    playSfx(type) {
        if (!this.soundEnabled) return;
        this.unlockAudio();
        if (!this.audioCtx) return;

        const now = this.audioCtx.currentTime;

        const tone = (freq, startOffset, duration, wave = 'sine', gainPeak = 0.12, slideTo = null) => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = wave;
            osc.frequency.setValueAtTime(freq, now + startOffset);
            if (slideTo) {
                osc.frequency.exponentialRampToValueAtTime(slideTo, now + startOffset + duration);
            }
            gain.gain.setValueAtTime(0.001, now + startOffset);
            gain.gain.linearRampToValueAtTime(gainPeak, now + startOffset + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0008, now + startOffset + duration);
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.start(now + startOffset);
            osc.stop(now + startOffset + duration + 0.02);
        };

        if (type === 'bubble') {
            tone(420, 0, 0.14, 'sine', 0.11, 780);
        } else if (type === 'feed') {
            tone(520, 0, 0.1, 'triangle', 0.1, 360);
            tone(680, 0.07, 0.12, 'sine', 0.09, 920);
        } else if (type === 'clean') {
            tone(587.33, 0, 0.11, 'triangle', 0.13);
            tone(783.99, 0.08, 0.12, 'triangle', 0.13);
            tone(1046.5, 0.16, 0.22, 'sine', 0.15);
        } else if (type === 'correct') {
            tone(523.25, 0, 0.11, 'triangle', 0.14);
            tone(659.25, 0.09, 0.11, 'triangle', 0.14);
            tone(783.99, 0.18, 0.12, 'triangle', 0.14);
            tone(1046.5, 0.27, 0.3, 'sine', 0.16);
        } else if (type === 'retry') {
            tone(392.0, 0, 0.14, 'sine', 0.1);
            tone(329.63, 0.13, 0.2, 'sine', 0.1);
        }
    }
}
