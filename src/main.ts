import Phaser from 'phaser';
import './styles.css';
import { GameScene, type Difficulty, type HudState, type LevelClearState, type ResultState } from './game/GameScene';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">LXY</div>
        <div>
          <h1>坦克防线</h1>
          <p>浪尖大学社区 · 像素守卫行动</p>
        </div>
      </div>
      <div class="top-actions">
        <button class="icon-button" id="sound-button" type="button" aria-label="切换音效" title="切换音效">🔊</button>
        <button class="icon-button" id="pause-button" type="button" aria-label="暂停游戏" title="暂停游戏">Ⅱ</button>
        <button class="icon-button" id="fullscreen-button" type="button" aria-label="全屏" title="全屏">⛶</button>
      </div>
    </header>

    <section class="layout">
      <article class="game-card" id="game-card">
        <div class="hud" aria-live="polite">
          <div class="hud-group">
            <div class="stat-chip">
              <span class="stat-label">装甲</span>
              <strong class="stat-value health" id="hud-health" aria-label="当前装甲 5，共 5">♥ 05 / 05</strong>
            </div>
            <div class="stat-chip">
              <span class="stat-label">核心</span>
              <strong class="stat-value" id="hud-base">05</strong>
            </div>
          </div>
          <div class="hud-group center">
            <div class="stat-chip">
              <span class="stat-label" id="hud-level-name">关卡 · 边境巡防</span>
              <strong class="stat-value accent" id="hud-wave">01 / 06</strong>
            </div>
            <div class="stat-chip">
              <span class="stat-label">敌军</span>
              <strong class="stat-value" id="hud-enemies">00</strong>
            </div>
          </div>
          <div class="hud-group right">
            <div class="stat-chip">
              <span class="stat-label">得分</span>
              <strong class="stat-value" id="hud-score">000000</strong>
            </div>
            <div class="stat-chip">
              <span class="stat-label">连击</span>
              <strong class="stat-value accent" id="hud-combo">×1.0</strong>
            </div>
          </div>
        </div>

        <div class="canvas-wrap">
          <div id="game-root" aria-label="坦克防线游戏画面"></div>
          <div class="game-overlay" id="game-overlay">
            <section class="overlay-panel" id="overlay-content">
              <p class="eyebrow">WAVECREST COMMUNITY // LXY</p>
              <h2>坦克防线</h2>
              <p class="subtitle">守住浪尖核心，改写战场路线。</p>
              <p class="mission-line">六个独立关卡正在等待。每次清关可三选一技能，最终关只出现一只潮汐巨兽。</p>
              <div class="start-controls">
                <select id="difficulty" aria-label="选择难度">
                  <option value="easy">轻松巡防</option>
                  <option value="normal" selected>标准防线</option>
                  <option value="hard">极限警戒</option>
                </select>
                <button class="primary-button" id="start-button" type="button">启动防线</button>
              </div>
              <div class="pixel-divider"></div>
              <div class="key-help">
                <span><kbd>WASD</kbd>移动</span>
                <span><kbd>SPACE</kbd>射击</span>
                <span><kbd>Q</kbd>技能</span>
                <span><kbd>P</kbd>暂停</span>
              </div>
            </section>
          </div>
        </div>
      </article>

      <aside class="side-panel">
        <section class="side-card">
          <h3>战术模块</h3>
          <div class="skill-stack">
            <div class="pickup-receipt hidden" id="pickup-receipt">
              <span class="receipt-label">最近拾取</span>
              <div class="receipt-main">
                <span class="receipt-icon" id="receipt-icon">✦</span>
                <div>
                  <strong id="receipt-name">技能名称</strong>
                  <p id="receipt-operation">操作说明</p>
                </div>
              </div>
            </div>
            <div class="skill-card" id="ammo-card">
              <span class="skill-icon" id="ammo-icon">•</span>
              <span class="skill-status" id="ammo-status">默认弹药 · 无限</span>
              <strong id="ammo-name">标准炮弹</strong>
              <p class="skill-description" id="ammo-description">稳定可靠，无特殊效果</p>
              <p class="skill-operation" id="ammo-operation"><kbd>SPACE</kbd> 按住连续发射</p>
            </div>
            <div class="skill-card" id="active-card">
              <span class="skill-icon" id="active-icon">Q</span>
              <span class="skill-status" id="active-status">主动技能槽为空</span>
              <strong id="active-name">等待拾取</strong>
              <p class="skill-description" id="active-description">拾取紫色战术箱获得主动技能</p>
              <p class="skill-operation" id="active-operation"><kbd>Q</kbd> 轻按释放，无需长按</p>
            </div>
            <div class="resonance-card">
              <div class="resonance-head">
                <strong>LXY 浪尖共鸣</strong>
                <span id="resonance-value">0%</span>
              </div>
              <div class="resonance-track"><span id="resonance-fill"></span></div>
              <p>击毁敌人蓄能；满值自动清弹、控场并修复核心</p>
            </div>
          </div>
        </section>

        <section class="side-card">
          <h3>本次任务</h3>
          <ol class="mission-list">
            <li>保护底部的浪尖核心</li>
            <li>依次完成六个独立关卡</li>
            <li>利用 LXY 砖墙改变路线</li>
            <li>清关后从三项技能中选择一项</li>
          </ol>
        </section>

        <section class="side-card community-badge">
          <span class="cn">浪尖大学社区</span>
          <span class="en">LXY DEFENSE NETWORK</span>
        </section>
      </aside>
    </section>

    <p class="footer-note">原创程序化像素美术 · 首版仅含音效 · 最佳体验 1280×720 以上</p>
  </main>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
`;

const requireElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const overlay = requireElement<HTMLDivElement>('#game-overlay');
const overlayContent = requireElement<HTMLElement>('#overlay-content');
const difficultySelect = requireElement<HTMLSelectElement>('#difficulty');
const startButton = requireElement<HTMLButtonElement>('#start-button');
const soundButton = requireElement<HTMLButtonElement>('#sound-button');
const pauseButton = requireElement<HTMLButtonElement>('#pause-button');
const fullscreenButton = requireElement<HTMLButtonElement>('#fullscreen-button');
const toast = requireElement<HTMLDivElement>('#toast');

const hudHealth = requireElement<HTMLElement>('#hud-health');
const hudBase = requireElement<HTMLElement>('#hud-base');
const hudWave = requireElement<HTMLElement>('#hud-wave');
const hudLevelName = requireElement<HTMLElement>('#hud-level-name');
const hudEnemies = requireElement<HTMLElement>('#hud-enemies');
const hudScore = requireElement<HTMLElement>('#hud-score');
const hudCombo = requireElement<HTMLElement>('#hud-combo');
const ammoCard = requireElement<HTMLElement>('#ammo-card');
const ammoIcon = requireElement<HTMLElement>('#ammo-icon');
const ammoName = requireElement<HTMLElement>('#ammo-name');
const ammoDescription = requireElement<HTMLElement>('#ammo-description');
const activeCard = requireElement<HTMLElement>('#active-card');
const activeIcon = requireElement<HTMLElement>('#active-icon');
const activeName = requireElement<HTMLElement>('#active-name');
const activeDescription = requireElement<HTMLElement>('#active-description');
const resonanceValue = requireElement<HTMLElement>('#resonance-value');
const resonanceFill = requireElement<HTMLElement>('#resonance-fill');
const pickupReceipt = requireElement<HTMLElement>('#pickup-receipt');
const receiptIcon = requireElement<HTMLElement>('#receipt-icon');
const receiptName = requireElement<HTMLElement>('#receipt-name');
const receiptOperation = requireElement<HTMLElement>('#receipt-operation');
const ammoStatus = requireElement<HTMLElement>('#ammo-status');
const ammoOperation = requireElement<HTMLElement>('#ammo-operation');
const activeStatus = requireElement<HTMLElement>('#active-status');
const activeOperation = requireElement<HTMLElement>('#active-operation');

let toastTimer = 0;
let muted = localStorage.getItem('tank-defense-muted') === 'true';

const showToast = (message: string): void => {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1800);
};

const setOverlay = (content: string, visible: boolean): void => {
  if (content) overlayContent.innerHTML = content;
  overlay.classList.toggle('hidden', !visible);
};

const focusGameCanvas = (): void => {
  window.requestAnimationFrame(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas');
    if (!canvas) return;
    canvas.tabIndex = 0;
    canvas.focus({ preventScroll: true });
  });
};

const renderResult = (result: ResultState): void => {
  overlayContent.classList.remove('reward-panel');
  const victory = result.outcome === 'victory';
  setOverlay(
    `
      <p class="eyebrow">${victory ? 'SECTOR SECURED' : 'DEFENSE BREACHED'}</p>
      <h2>${victory ? '防线守住了' : '核心失守'}</h2>
      <p class="subtitle">${victory ? '浪尖大学社区恢复安全。' : '调整战术，再守一次。'}</p>
      <p class="mission-line">得分 ${result.score.toString().padStart(6, '0')} · 击毁 ${result.kills} · 最高连击 ×${result.maxCombo.toFixed(1)}</p>
      <div class="start-controls">
        <button class="ghost-button" id="result-home" type="button">返回简报</button>
        <button class="primary-button" id="result-restart" type="button">再次出击</button>
      </div>
    `,
    true,
  );

  requireElement<HTMLButtonElement>('#result-restart').addEventListener('click', () => {
    setOverlay('', false);
    window.dispatchEvent(new CustomEvent('tank-defense:start', { detail: { difficulty: difficultySelect.value as Difficulty } }));
    focusGameCanvas();
  });

  requireElement<HTMLButtonElement>('#result-home').addEventListener('click', () => {
    window.location.reload();
  });
};

const renderLevelClear = (state: LevelClearState): void => {
  overlayContent.classList.add('reward-panel');
  const repairText = [state.repairedPlayer ? '装甲 +1' : '', state.repairedBase ? '核心 +1' : '']
    .filter(Boolean)
    .join(' · ') || '装甲与核心状态良好';
  setOverlay(
    `
      <p class="eyebrow">LEVEL ${state.level} / ${state.totalLevels} CLEAR</p>
      <h2>关卡完成</h2>
      <p class="subtitle">「${state.levelName}」已肃清，下一关：${state.nextLevelName}</p>
      <div class="clear-summary">
        <span>清关奖励 +${state.bonusScore} 分</span>
        <span>${repairText}</span>
      </div>
      <h3 class="reward-heading">选择一项技能进入下一关</h3>
      <div class="reward-grid">
        ${state.choices.map((choice) => `
          <button class="reward-card ${choice.category}" type="button" data-reward-kind="${choice.kind}">
            <span class="reward-icon">${choice.icon}</span>
            <span class="reward-type">${choice.category === 'ammo' ? '特殊弹药' : '主动技能'}</span>
            <strong>${choice.name}</strong>
            <span class="reward-description">${choice.description}</span>
            <span class="reward-operation">${choice.operation}</span>
            <span class="reward-select">选择并进入下一关</span>
          </button>
        `).join('')}
      </div>
    `,
    true,
  );

  document.querySelectorAll<HTMLButtonElement>('[data-reward-kind]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.dataset.rewardKind;
      if (!kind) return;
      setOverlay('', false);
      overlayContent.classList.remove('reward-panel');
      window.dispatchEvent(new CustomEvent('tank-defense:reward', { detail: { kind } }));
      focusGameCanvas();
    });
  });
};

const updateHud = (hud: HudState): void => {
  const maxHp = Math.max(1, Math.round(hud.maxHp));
  const currentHp = Math.max(0, Math.min(maxHp, Math.round(hud.hp)));
  hudHealth.textContent = `♥ ${currentHp.toString().padStart(2, '0')} / ${maxHp.toString().padStart(2, '0')}`;
  hudHealth.setAttribute('aria-label', `当前装甲 ${currentHp}，最大装甲 ${maxHp}`);
  hudBase.textContent = hud.baseHp.toString().padStart(2, '0');
  hudWave.textContent = `${hud.level.toString().padStart(2, '0')} / ${hud.totalLevels.toString().padStart(2, '0')}`;
  hudLevelName.textContent = `关卡 · ${hud.levelName}`;
  hudEnemies.textContent = hud.enemies.toString().padStart(2, '0');
  hudScore.textContent = hud.score.toString().padStart(6, '0');
  hudCombo.textContent = `×${hud.combo.toFixed(1)}`;
  resonanceValue.textContent = `${Math.round(hud.resonance)}%`;
  resonanceFill.style.width = `${Math.max(0, Math.min(100, hud.resonance))}%`;

  ammoName.textContent = hud.ammo.name;
  ammoDescription.textContent = `${hud.ammo.description}${hud.ammo.shots >= 0 ? ` · ${hud.ammo.shots} 发` : ''}`;
  ammoIcon.textContent = hud.ammo.icon;
  ammoStatus.textContent = hud.ammo.status;
  ammoOperation.textContent = hud.ammo.operation;
  ammoCard.classList.toggle('ready', hud.ammo.shots !== 0);

  activeName.textContent = hud.active.name;
  activeDescription.textContent = hud.active.description;
  activeIcon.textContent = hud.active.icon;
  activeStatus.textContent = hud.active.status;
  activeOperation.textContent = hud.active.operation;
  activeCard.classList.toggle('ready', hud.active.ready);
  activeCard.classList.toggle('cooldown', !hud.active.ready);
  activeCard.style.setProperty('--cooldown-progress', String(hud.active.cooldownProgress));

  pickupReceipt.classList.toggle('hidden', !hud.latestPickup);
  pickupReceipt.classList.toggle('fresh', Boolean(hud.latestPickup?.fresh));
  pickupReceipt.classList.toggle('ammo', hud.latestPickup?.category === 'ammo');
  if (hud.latestPickup) {
    receiptIcon.textContent = hud.latestPickup.icon;
    receiptName.textContent = hud.latestPickup.name;
    receiptOperation.textContent = hud.latestPickup.operation;
  }
};

startButton.addEventListener('click', () => {
  setOverlay('', false);
  window.scrollTo({ top: 0, behavior: 'instant' });
  window.dispatchEvent(new CustomEvent('tank-defense:start', { detail: { difficulty: difficultySelect.value as Difficulty } }));
  startButton.blur();
  focusGameCanvas();
});

window.addEventListener('keydown', (event) => {
  if (!overlay.classList.contains('hidden')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || event.code === 'Space') event.preventDefault();
  if (event.code === 'Space') window.dispatchEvent(new CustomEvent('tank-defense:fire'));
}, { passive: false });

soundButton.textContent = muted ? '🔇' : '🔊';
soundButton.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('tank-defense-muted', String(muted));
  soundButton.textContent = muted ? '🔇' : '🔊';
  window.dispatchEvent(new CustomEvent('tank-defense:mute', { detail: { muted } }));
  showToast(muted ? '音效已关闭' : '音效已开启');
});

pauseButton.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('tank-defense:pause'));
});

fullscreenButton.addEventListener('click', async () => {
  const gameCard = requireElement<HTMLElement>('#game-card');
  if (!document.fullscreenElement) {
    await gameCard.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
});

window.addEventListener('tank-defense:hud', (event) => {
  updateHud((event as CustomEvent<HudState>).detail);
});

window.addEventListener('tank-defense:toast', (event) => {
  showToast((event as CustomEvent<{ message: string }>).detail.message);
});

window.addEventListener('tank-defense:result', (event) => {
  renderResult((event as CustomEvent<ResultState>).detail);
});

window.addEventListener('tank-defense:level-clear', (event) => {
  renderLevelClear((event as CustomEvent<LevelClearState>).detail);
});

window.addEventListener('tank-defense:paused', (event) => {
  const paused = (event as CustomEvent<{ paused: boolean }>).detail.paused;
  pauseButton.textContent = paused ? '▶' : 'Ⅱ';
  showToast(paused ? '防线已暂停' : '防线恢复运行');
});

window.addEventListener('blur', () => {
  window.dispatchEvent(new CustomEvent('tank-defense:pause', { detail: { force: true } }));
});

new Phaser.Game({
  type: Phaser.AUTO,
  width: 832,
  height: 832,
  parent: 'game-root',
  backgroundColor: '#0b1520',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
});
