// 音效管理
const SoundManager = {
  audioContext: null,
  initialized: false,

  init() {
    if (this.initialized && this.audioContext) return;
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.initialized = true;
      console.log('音效系统初始化成功');
    } catch (e) {
      console.error('音效初始化失败:', e);
    }
  },

  // 确保音频上下文可用
  ensureContext() {
    if (!this.audioContext) {
      this.init();
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().then(() => {
        console.log('音频上下文已恢复');
      });
    }
    return this.audioContext && this.audioContext.state === 'running';
  },

  // 棋子移动音效（清脆）
  playMoveSound() {
    if (!this.ensureContext()) return;

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, now);
      oscillator.frequency.exponentialRampToValueAtTime(600, now + 0.1);

      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      oscillator.start(now);
      oscillator.stop(now + 0.15);
    } catch (e) {
      console.error('播放移动音效失败:', e);
    }
  },

  // 墙壁放置音效（闷沉）
  playWallSound() {
    if (!this.ensureContext()) {
      console.warn('音频上下文不可用');
      return;
    }

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      oscillator.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, now);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(200, now);
      oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.2);

      gainNode.gain.setValueAtTime(1.5, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

      oscillator.start(now);
      oscillator.stop(now + 0.2);
      console.log('播放墙壁音效');
    } catch (e) {
      console.error('播放墙壁音效失败:', e);
    }
  },

  // 跳跃音效
  playJumpSound() {
    if (!this.ensureContext()) return;

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(400, now);
      oscillator.frequency.exponentialRampToValueAtTime(1000, now + 0.1);
      oscillator.frequency.exponentialRampToValueAtTime(600, now + 0.2);

      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      oscillator.start(now);
      oscillator.stop(now + 0.25);
    } catch (e) {
      console.error('播放跳跃音效失败:', e);
    }
  },

  // 胜利音效
  playWinSound() {
    if (!this.ensureContext()) return;

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6

      notes.forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, now + i * 0.15);

        gainNode.gain.setValueAtTime(0, now + i * 0.15);
        gainNode.gain.linearRampToValueAtTime(0.3, now + i * 0.15 + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.3);

        oscillator.start(now + i * 0.15);
        oscillator.stop(now + i * 0.15 + 0.3);
      });
    } catch (e) {
      console.error('播放胜利音效失败:', e);
    }
  },

  // 悔棋音效
  playUndoSound() {
    if (!this.ensureContext()) return;

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, now);
      oscillator.frequency.exponentialRampToValueAtTime(400, now + 0.15);

      gainNode.gain.setValueAtTime(0.2, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      oscillator.start(now);
      oscillator.stop(now + 0.15);
    } catch (e) {
      console.error('播放悔棋音效失败:', e);
    }
  },

  // 开局音效
  playStartSound() {
    // 直接初始化并播放，不检查状态
    if (!this.audioContext) {
      this.init();
    }

    // 确保音频上下文恢复
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    if (!this.audioContext) return;

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const notes = [523, 659, 784]; // C5, E5, G5

      notes.forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, now + i * 0.12);

        gainNode.gain.setValueAtTime(0, now + i * 0.12);
        gainNode.gain.linearRampToValueAtTime(0.3, now + i * 0.12 + 0.04);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.2);

        oscillator.start(now + i * 0.12);
        oscillator.stop(now + i * 0.12 + 0.2);
      });
    } catch (e) {
      console.error('播放开局音效失败:', e);
    }
  }
};

// 在用户交互后初始化音效系统
document.addEventListener('click', function initAudio() {
  SoundManager.init();
  document.removeEventListener('click', initAudio);
}, { once: true });

document.addEventListener('touchstart', function initAudio() {
  SoundManager.init();
  document.removeEventListener('touchstart', initAudio);
}, { once: true });
