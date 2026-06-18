// ============ 将棋游戏状态 + 棋盘渲染 + 点击处理 ============

// 游戏常量
const CELL_SIZE = 63;
const GRID_OFFSET = 12;
const PIECE_RADIUS = 22;
const PROMOTE_THRESHOLD = 10;

// 颜色定义
const COLORS = {
  board: '#f5e6c8',
  boardLine: '#8b7355',
  grid: '#6b5b3e',
  selectedCell: 'rgba(76, 175, 80, 0.4)',
  validMove: 'rgba(100, 100, 100, 0.4)',
  validCapture: 'rgba(244, 67, 54, 0.3)',
  lastMove: 'rgba(255, 234, 167, 0.5)',
  checkHighlight: 'rgba(244, 67, 54, 0.4)',
  dropPreview: 'rgba(33, 150, 243, 0.3)'
};

// 游戏状态
let gameState = null;

// UI 状态
let selectedPiece = null; // { row, col } or null
let selectedCapturedType = null; // 持子中选中的棋子类型
let validMoves = []; // 当前选中棋子的合法走法
let lastMove = null; // { fromRow, fromCol, toRow, toCol }
let promotionPending = null; // 待确认升变的走法
let promotionState = null; // { fromRow, fromCol, toRow, toCol, promotePiece, originalPiece }
let perspectiveFlipped = false; // 视角翻转（后手时翻转棋盘）

// 画布
let canvas, ctx;

// 历史记录（用于悔棋）
let moveHistory = [];

// 视角转换
function visualRow(logicalRow) {
  return perspectiveFlipped ? (GRID_SIZE - 1 - logicalRow) : logicalRow;
}

function visualCol(logicalCol) {
  return perspectiveFlipped ? (GRID_SIZE - 1 - logicalCol) : logicalCol;
}

function logicalRow(visRow) {
  return perspectiveFlipped ? (GRID_SIZE - 1 - visRow) : visRow;
}

function logicalCol(visCol) {
  return perspectiveFlipped ? (GRID_SIZE - 1 - visCol) : visCol;
}

// 初始化游戏
function initGame(initialState, isOnline) {
  console.log('将棋游戏初始化, 在线模式:', isOnline);

  document.getElementById('home-container').style.display = 'none';
  document.getElementById('join-room-container').style.display = 'none';
  document.getElementById('waiting-container').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';

  // 设置视角
  if (isOnline) {
    document.getElementById('room-info').style.display = 'flex';
    document.getElementById('current-room-name').textContent = multiplayerState.roomName;
    document.getElementById('player-role').textContent =
      `你是${multiplayerState.myPlayerIndex === 0 ? '玉将' : '王将'}`;
    document.getElementById('player-role').style.color =
      multiplayerState.myPlayerIndex === 0 ? '#1a1a1a' : '#999';
    perspectiveFlipped = multiplayerState.myPlayerIndex === 1;
  } else if (aiMode) {
    document.getElementById('room-info').style.display = 'none';
    perspectiveFlipped = false; // 人机模式，玉将在下方，始终朝向对手
  } else {
    document.getElementById('room-info').style.display = 'none';
    perspectiveFlipped = false; // 本地双人，先手在下方
  }

  // 初始化游戏状态
  if (initialState) {
    gameState = {
      board: initialState.board || createInitialBoard(),
      captured: initialState.captured || createInitialCaptured(),
      currentPlayer: initialState.currentPlayer || 0,
      gameOver: initialState.gameOver || false,
      winner: initialState.winner,
      lastMoveBy: initialState.lastMoveBy !== undefined ? initialState.lastMoveBy : -1,
      moveHistory: initialState.moveHistory || []
    };
  } else {
    gameState = createInitialState();
  }

  // 初始化画布（DPI 适配，文字更清晰）
  canvas = document.getElementById('gameCanvas');
  const dpr = window.devicePixelRatio || 1;
  const LOGICAL_SIZE = 591;
  canvas.width = LOGICAL_SIZE * dpr;
  canvas.height = LOGICAL_SIZE * dpr;
  canvas.style.width = LOGICAL_SIZE + 'px';
  canvas.style.height = LOGICAL_SIZE + 'px';
  ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = false;

  // 清除旧监听器
  canvas.removeEventListener('click', handleClick);
  canvas.removeEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('mousemove', handleMouseMove);

  // 重置 UI 状态
  selectedPiece = null;
  selectedCapturedType = null;
  validMoves = [];
  lastMove = null;
  moveHistory = [];
  promotionState = null;
  opponentLeftNotified = false;

  // 隐藏悔棋按钮
  hideUndoButton();

  // 播放开局音效
  SoundManager.playStartSound();

  updateTurnIndicator();
  render();

  // 在线模式：订阅房间
  if (isOnline) {
    subscribeToRoom();
  }

  // AI 模式：如果 AI 先手
  if (aiMode && gameState.currentPlayer === 1) {
    setTimeout(() => ShogiAI.makeMove(), 500);
  }
}

// 更新回合指示器
function updateTurnIndicator() {
  const indicator = document.getElementById('turn-indicator');
  if (!indicator || !gameState) return;

  if (multiplayerState.isOnline) {
    if (gameState.currentPlayer === multiplayerState.myPlayerIndex) {
      indicator.textContent = '轮到你了！';
      indicator.style.background = '#c8e6c9';
    } else {
      indicator.textContent = '对方思考中…';
      indicator.style.background = '#ffeaa7';
    }
  } else if (aiMode) {
    if (gameState.currentPlayer === 0) {
      indicator.textContent = '轮到你了！';
      indicator.style.background = '#c8e6c9';
    } else {
      indicator.textContent = 'AI 思考中…';
      indicator.style.background = '#ffeaa7';
    }
  } else {
    const name = gameState.currentPlayer === 0 ? '玉将' : '王将';
    indicator.textContent = `轮到：${name}`;
    indicator.style.background = '#ffeaa7';
  }
}

// 显示/隐藏悔棋按钮
function showUndoButton() {
  const btn = document.getElementById('undo-btn');
  if (!btn) return;
  if (gameState.lastMoveBy >= 0 && gameState.lastMoveBy !== gameState.currentPlayer && !gameState.gameOver) {
    btn.style.display = 'inline-block';
  } else {
    btn.style.display = 'none';
  }
}

function hideUndoButton() {
  const btn = document.getElementById('undo-btn');
  if (btn) btn.style.display = 'none';
}

// 显示持子面板（用棋子UI显示）
function updateCapturedPieces() {
  if (!gameState) return;
  for (let player = 0; player < 2; player++) {
    const listId = player === 0 ? 'captured-black-list' : 'captured-white-list';
    const list = document.getElementById(listId);
    if (!list) continue;

    const captured = gameState.captured[player] || {};
    let html = '';
    // 按价值排序显示
    const order = ['DRAGON', 'HORSE', 'ROOK', 'BISHOP', 'GOLD', 'SILVER', 'KNIGHT', 'LANCE', 'PAWN'];
    for (const type of order) {
      const count = captured[type] || 0;
      if (count <= 0) continue;
      // 使用 PIECE_CHARS 显示单字
      const char = PIECE_CHARS[type] || '';
      const selected = (player === gameState.currentPlayer && selectedCapturedType === type) ? ' selected' : '';
      const ownerClass = player === 0 ? ' owner-black' : ' owner-white';
      html += `<div class="captured-item${selected}" onclick="selectCapturedPiece('${type}', ${player})"><div class="captured-piece${ownerClass}">${char}</div>${count > 1 ? `<span class="captured-count">×${count}</span>` : ''}</div>`;
    }
    list.innerHTML = html;
  }
}

// 选择持子中的棋子
function selectCapturedPiece(type, player) {
  if (gameState.gameOver) return;
  if (gameState.currentPlayer !== player) return;
  if (multiplayerState.isOnline && gameState.currentPlayer !== multiplayerState.myPlayerIndex) return;
  if (aiMode && gameState.currentPlayer !== 0) return;

  selectedPiece = null;
  validMoves = [];

  if (selectedCapturedType === type) {
    selectedCapturedType = null;
  } else {
    selectedCapturedType = type;
    // 计算合法打入位置（只调用一次 getAllLegalMoves）
    const allMoves = getAllLegalMoves(gameState, player);
    validMoves = allMoves
      .filter(m => m.type === 'drop' && m.pieceType === type)
      .map(m => ({ row: m.toRow, col: m.toCol, isDrop: true, pieceType: type }));
  }

  updateCapturedPieces();
  render();
}

// 处理画布点击
function handleClick(e) {
  if (!gameState || gameState.gameOver) return;

  // 人机模式下检查是否轮到玩家
  if (aiMode && gameState.currentPlayer !== 0) return;
  // 在线模式下检查是否轮到自己
  if (multiplayerState.isOnline && gameState.currentPlayer !== multiplayerState.myPlayerIndex) return;

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (610 / rect.width);
  const y = (e.clientY - rect.top) * (610 / rect.height);

  // 升变选择中：检测点击的是升变后棋子还是原棋子
  if (promotionState) {
    handlePromotionClick(x, y);
    return;
  }

  const visCol = Math.floor((x - GRID_OFFSET) / CELL_SIZE);
  const visRow = Math.floor((y - GRID_OFFSET) / CELL_SIZE);

  if (visRow < 0 || visRow >= GRID_SIZE || visCol < 0 || visCol >= GRID_SIZE) return;

  const row = logicalRow(visRow);
  const col = logicalCol(visCol);

  // 如果有持子选中，尝试打入
  if (selectedCapturedType) {
    const dropMove = validMoves.find(m => m.row === row && m.col === col && m.isDrop);
    if (dropMove) {
      executeDrop(selectedCapturedType, row, col);
      return;
    } else {
      // 点击其他位置，取消选择
      selectedCapturedType = null;
      validMoves = [];
    updateCapturedPieces();
    render();
      return;
    }
  }

  // 如果有棋子选中，尝试移动
  if (selectedPiece) {
    const move = validMoves.find(m => m.row === row && m.col === col);
    if (move) {
      // 检查是否需要升变选择
      const piece = gameState.board[selectedPiece.row][selectedPiece.col];
      if (canPromote(piece.type) && !piece.promoted) {
        const inEnemy = isInEnemyTerritory(selectedPiece.row, piece.owner) || isInEnemyTerritory(row, piece.owner);
        const must = mustPromote(row, piece.type, piece.owner);
        if (must) {
          executeMove(selectedPiece.row, selectedPiece.col, row, col, true);
          return;
        }
        if (inEnemy) {
          // 进入升变选择：棋盘变暗，显示升变后棋子
          const promotedType = PIECE_TYPES[piece.type].promoteTo;
          const promotePiece = { type: promotedType, owner: piece.owner, promoted: true, originalType: piece.originalType || piece.type };
          const originalPiece = { ...piece };
          promotionState = {
            fromRow: selectedPiece.row, fromCol: selectedPiece.col,
            toRow: row, toCol: col,
            promotePiece, originalPiece
          };
          selectedPiece = null;
          validMoves = [];
          render();
          return;
        }
      }
      executeMove(selectedPiece.row, selectedPiece.col, row, col, false);
      return;
    }
  }

  // 选择棋子
  const piece = gameState.board[row][col];
  if (piece && piece.owner === gameState.currentPlayer) {
    selectedPiece = { row, col };
    selectedCapturedType = null;

    // 只获取当前棋子的走法（不调用 getAllLegalMoves）
    const rawMoves = getPieceMoves(gameState.board, row, col, piece);
    validMoves = [];
    for (const m of rawMoves) {
      if (wouldBeInCheck(gameState.board, gameState.captured, row, col, m.row, m.col, piece.owner, 'move')) continue;
      // 检查升变
      const must = mustPromote(m.row, piece.type, piece.owner);
      if (must) {
        validMoves.push({ row: m.row, col: m.col, isCapture: m.isCapture, promote: true });
      } else if (canPromote(piece.type) && !piece.promoted && (isInEnemyTerritory(row, piece.owner) || isInEnemyTerritory(m.row, piece.owner))) {
        validMoves.push({ row: m.row, col: m.col, isCapture: m.isCapture, promote: false });
        validMoves.push({ row: m.row, col: m.col, isCapture: m.isCapture, promote: true });
      } else {
        validMoves.push({ row: m.row, col: m.col, isCapture: m.isCapture, promote: false });
      }
    }

    updateCapturedPieces();
    render();
  } else {
    // 取消选择
    selectedPiece = null;
    validMoves = [];
    render();
  }
}

// 处理鼠标移动（悬停高亮）
function handleMouseMove(e) {
  // 暂时不需要复杂的悬停效果
}

// 执行移动
function executeMove(fromRow, fromCol, toRow, toCol, promote) {
  const piece = gameState.board[fromRow][fromCol];
  if (!piece) return;

  // 保存历史
  saveMoveHistory({
    type: 'move',
    fromRow, fromCol, toRow, toCol,
    piece: { ...piece },
    capturedPiece: gameState.board[toRow][toCol] ? { ...gameState.board[toRow][toCol] } : null,
    promoted: piece.promoted,
    boardHash: boardHash(gameState.board, gameState.captured)
  });

  // 执行移动
  const capturedPiece = gameState.board[toRow][toCol];
  if (capturedPiece) {
    // 吃子：加入持子（升变后的棋子被吃后还原为普通状态）
    const originalType = capturedPiece.originalType || capturedPiece.type;
    if (!gameState.captured[gameState.currentPlayer][originalType]) {
      gameState.captured[gameState.currentPlayer][originalType] = 0;
    }
    gameState.captured[gameState.currentPlayer][originalType]++;
  }

  // 移动棋子
  gameState.board[toRow][toCol] = {
    ...piece,
    type: promote ? PIECE_TYPES[piece.type].promoteTo : piece.type,
    promoted: promote || piece.promoted,
    originalType: piece.originalType || piece.type
  };
  gameState.board[fromRow][fromCol] = null;

  lastMove = { fromRow, fromCol, toRow, toCol };
  gameState.lastMoveBy = gameState.currentPlayer;

  // 播放音效
  if (promote && !piece.promoted) {
    SoundManager.playStartSound(); // 升变音效
    const fromName = PIECE_FULL_NAMES[piece.type] || PIECE_CHARS[piece.type] || '';
    const toName = PROMOTED_NAMES[piece.type] || '';
    showToast(`${fromName} 升变为 ${toName}！`);
  } else if (capturedPiece) {
    SoundManager.playWallSound(); // 吃子音效
  } else {
    SoundManager.playMoveSound(); // 落子音效
  }

  // 检查将死
  const opp = opponent(gameState.currentPlayer);
  if (isCheckmate(gameState, opp)) {
    gameState.gameOver = true;
    gameState.winner = gameState.currentPlayer;
    // 先显示绝杀提示，5秒后显示结算
    showToast('绝杀！', 3000);
    SoundManager.playWinSound();
    render();
    setTimeout(() => {
      const winnerName = gameState.currentPlayer === 0 ? '玉将' : '王将';
      showWinMessage(`${winnerName}绝杀获胜！`);
    }, 3000);
    return;
  }

  // 检查将军
  if (isInCheck(gameState.board, gameState.captured, opp)) {
    showToast('将军！');
    SoundManager.playUndoSound(); // 用悔棋音效代替将军音效
  }

  // 切换玩家
  switchPlayer();
  render();

  // AI 走棋
  if (aiMode && gameState.currentPlayer === 1 && !gameState.gameOver) {
    setTimeout(() => ShogiAI.makeMove(), 500);
  }

  // 在线同步
  if (multiplayerState.isOnline) {
    syncGameState();
  }
}

// 执行打入
function executeDrop(pieceType, toRow, toCol) {
  const player = gameState.currentPlayer;

  // 保存历史
  saveMoveHistory({
    type: 'drop',
    pieceType,
    toRow, toCol,
    boardHash: boardHash(gameState.board, gameState.captured)
  });

  // 从持子中移除
  gameState.captured[player][pieceType]--;
  if (gameState.captured[player][pieceType] <= 0) {
    delete gameState.captured[player][pieceType];
  }

  // 放置棋子
  gameState.board[toRow][toCol] = { type: pieceType, owner: player, promoted: false, originalType: pieceType };

  lastMove = { fromRow: -1, fromCol: -1, toRow, toCol };
  gameState.lastMoveBy = player;

  // 清除选择
  selectedPiece = null;
  selectedCapturedType = null;
  validMoves = [];

  // 播放音效
  SoundManager.playMoveSound();

  // 检查将死
  const opp = opponent(player);
  if (isCheckmate(gameState, opp)) {
    gameState.gameOver = true;
    gameState.winner = player;
    showToast('绝杀！', 3000);
    SoundManager.playWinSound();
    updateCapturedPieces();
    render();
    setTimeout(() => {
      const winnerName = player === 0 ? '玉将' : '王将';
      showWinMessage(`${winnerName}绝杀获胜！`);
    }, 3000);
    return;
  }

  // 检查将军
  if (isInCheck(gameState.board, gameState.captured, opp)) {
    showToast('将军！');
    SoundManager.playUndoSound();
  }

  switchPlayer();
  updateCapturedPieces();
  render();

  // AI 走棋
  if (aiMode && gameState.currentPlayer === 1 && !gameState.gameOver) {
    setTimeout(() => ShogiAI.makeMove(), 500);
  }

  // 在线同步
  if (multiplayerState.isOnline) {
    syncGameState();
  }
}

// 处理升变选择点击
function handlePromotionClick(x, y) {
  if (!promotionState) return;
  const { toRow, toCol, promotePiece, originalPiece } = promotionState;
  const vr = visualRow(toRow);
  const vc = visualCol(toCol);
  const cx = GRID_OFFSET + vc * CELL_SIZE + CELL_SIZE / 2;
  const cy = GRID_OFFSET + vr * CELL_SIZE + CELL_SIZE / 2;

  // 升变后棋子位置（右侧偏移）
  const promoteCx = cx + CELL_SIZE * 0.8;
  const promoteCy = cy;

  // 检测点击升变后棋子
  const distPromote = Math.sqrt((x - promoteCx) ** 2 + (y - promoteCy) ** 2);
  if (distPromote < PIECE_RADIUS * 1.3) {
    // 选择升变
    const { fromRow, fromCol, toRow, toCol } = promotionState;
    promotionState = null;
    executeMove(fromRow, fromCol, toRow, toCol, true);
    return;
  }

  // 检测点击原棋子位置（棋盘上的目标位置）
  const distOriginal = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  if (distOriginal < CELL_SIZE * 0.6) {
    // 选择不升变
    const { fromRow, fromCol, toRow, toCol } = promotionState;
    promotionState = null;
    executeMove(fromRow, fromCol, toRow, toCol, false);
    return;
  }

  // 点击其他区域，不做任何操作
}

// 绘制升变选择UI（棋盘变暗 + 两个棋子选项）
function drawPromotionUI() {
  if (!promotionState) return;
  const { toRow, toCol, promotePiece, originalPiece } = promotionState;
  const vr = visualRow(toRow);
  const vc = visualCol(toCol);
  const cx = GRID_OFFSET + vc * CELL_SIZE + CELL_SIZE / 2;
  const cy = GRID_OFFSET + vr * CELL_SIZE + CELL_SIZE / 2;

  // 棋盘变暗
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, 591, 591);

  // 目标位置高亮
  ctx.fillStyle = 'rgba(255, 234, 167, 0.3)';
  ctx.fillRect(
    GRID_OFFSET + vc * CELL_SIZE,
    GRID_OFFSET + vr * CELL_SIZE,
    CELL_SIZE, CELL_SIZE
  );

  // 原棋子（左侧，目标位置上）
  drawPieceShape(cx, cy, originalPiece);

  // 升变后棋子（右侧）
  const promoteCx = cx + CELL_SIZE * 0.8;
  drawPieceShape(promoteCx, cy, promotePiece);

  // 升变后棋子外发光提示
  ctx.save();
  ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(promoteCx, cy, PIECE_RADIUS * 1.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// 切换玩家
function switchPlayer() {
  gameState.lastMoveBy = gameState.currentPlayer;
  gameState.currentPlayer = opponent(gameState.currentPlayer);
  selectedPiece = null;
  selectedCapturedType = null;
  validMoves = [];
  updateTurnIndicator();
  showUndoButton();
  updateCapturedPieces();
}

// 保存历史
function saveMoveHistory(entry) {
  moveHistory.push(entry);
  if (moveHistory.length > 100) moveHistory.shift();
}

// 悔棋
function undoMove() {
  if (moveHistory.length === 0 || gameState.gameOver) return;
  if (multiplayerState.isOnline) return;

  // AI 模式：悔两步（AI 的一步 + 玩家的一步）
  const stepsToUndo = aiMode ? 2 : 1;
  if (moveHistory.length < stepsToUndo) return;

  for (let i = 0; i < stepsToUndo; i++) {
    const lastEntry = moveHistory.pop();

    if (lastEntry.type === 'move') {
      gameState.board[lastEntry.fromRow][lastEntry.fromCol] = lastEntry.piece;
      gameState.board[lastEntry.toRow][lastEntry.toCol] = lastEntry.capturedPiece || null;

      if (lastEntry.capturedPiece) {
        const mover = lastEntry.piece.owner;
        const capturedType = lastEntry.capturedPiece.originalType || lastEntry.capturedPiece.type;
        if (gameState.captured[mover][capturedType]) {
          gameState.captured[mover][capturedType]--;
          if (gameState.captured[mover][capturedType] <= 0) {
            delete gameState.captured[mover][capturedType];
          }
        }
      }
    } else if (lastEntry.type === 'drop') {
      gameState.board[lastEntry.toRow][lastEntry.toCol] = null;
      const dropPlayer = opponent(gameState.currentPlayer);
      if (!gameState.captured[dropPlayer][lastEntry.pieceType]) {
        gameState.captured[dropPlayer][lastEntry.pieceType] = 0;
      }
      gameState.captured[dropPlayer][lastEntry.pieceType]++;
    }

    gameState.currentPlayer = opponent(gameState.currentPlayer);
  }

  gameState.lastMoveBy = gameState.currentPlayer;

  SoundManager.playUndoSound();
  selectedPiece = null;
  selectedCapturedType = null;
  validMoves = [];
  lastMove = null;

  updateTurnIndicator();
  showUndoButton();
  updateCapturedPieces();
  render();
}

// 重置游戏（在线模式新对手加入时）
function resetGame() {
  gameState = createInitialState();
  if (multiplayerState.isOnline) {
    gameState.hostColor = multiplayerState.isHost ? multiplayerState.myPlayerIndex : (1 - multiplayerState.myPlayerIndex);
    gameState.player2Joined = true;
    gameState.hostActive = true;
    gameState.guestActive = true;
  }
  selectedPiece = null;
  selectedCapturedType = null;
  validMoves = [];
  lastMove = null;
  promotionState = null;
  moveHistory = [];
  opponentLeftNotified = false;
  hideUndoButton();
  updateTurnIndicator();
  updateCapturedPieces();
  render();
}

// 显示胜利消息
function showWinMessage(message) {
  const modal = document.getElementById('win-modal');
  const msgEl = document.getElementById('win-message');
  msgEl.textContent = message;
  modal.classList.add('show');
}

// 显示 Toast
function showToast(msg, duration = 3000) {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ============ 渲染 ============

function render() {
  if (!ctx || !gameState) return;

  ctx.clearRect(0, 0, 591, 591);
  drawBoard();
  drawLastMove();
  drawSelectedCell();
  drawValidMoveDots();
  drawPieces();
  drawCaptureDots();
  drawCheckHighlight();
  drawPromotionUI();
}

// 绘制棋盘
function drawBoard() {
  // 背景
  ctx.fillStyle = COLORS.board;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 网格线
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;

  for (let i = 0; i <= GRID_SIZE; i++) {
    const x = GRID_OFFSET + i * CELL_SIZE;
    const y = GRID_OFFSET + i * CELL_SIZE;

    ctx.beginPath();
    ctx.moveTo(x, GRID_OFFSET);
    ctx.lineTo(x, GRID_OFFSET + GRID_SIZE * CELL_SIZE);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(GRID_OFFSET, y);
    ctx.lineTo(GRID_OFFSET + GRID_SIZE * CELL_SIZE, y);
    ctx.stroke();
  }
}

// 绘制上一步高亮
function drawLastMove() {
  if (!lastMove) return;

  ctx.fillStyle = COLORS.lastMove;
  const cells = [
    [lastMove.fromRow, lastMove.fromCol],
    [lastMove.toRow, lastMove.toCol]
  ];
  for (const [r, c] of cells) {
    if (r < 0) continue;
    const vr = visualRow(r);
    const vc = visualCol(c);
    ctx.fillRect(
      GRID_OFFSET + vc * CELL_SIZE,
      GRID_OFFSET + vr * CELL_SIZE,
      CELL_SIZE, CELL_SIZE
    );
  }
}

// 绘制选中格子
function drawSelectedCell() {
  if (!selectedPiece) return;

  ctx.fillStyle = COLORS.selectedCell;
  const vr = visualRow(selectedPiece.row);
  const vc = visualCol(selectedPiece.col);
  ctx.fillRect(
    GRID_OFFSET + vc * CELL_SIZE,
    GRID_OFFSET + vr * CELL_SIZE,
    CELL_SIZE, CELL_SIZE
  );
}

// 绘制合法走法点（普通移动 + 打入）
function drawValidMoveDots() {
  for (const move of validMoves) {
    if (move.isCapture) continue; // 吃子点单独绘制
    const vr = visualRow(move.row);
    const vc = visualCol(move.col);
    const x = GRID_OFFSET + vc * CELL_SIZE + CELL_SIZE / 2;
    const y = GRID_OFFSET + vr * CELL_SIZE + CELL_SIZE / 2;

    if (move.isDrop) {
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(33, 150, 243, 0.3)';
      ctx.fill();
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(100, 100, 100, 0.4)';
      ctx.fill();
    }
  }
}

// 绘制吃子预览（小红点，在棋子上方显示）
function drawCaptureDots() {
  for (const move of validMoves) {
    if (!move.isCapture) continue;
    const vr = visualRow(move.row);
    const vc = visualCol(move.col);
    const x = GRID_OFFSET + vc * CELL_SIZE + CELL_SIZE / 2;
    const y = GRID_OFFSET + vr * CELL_SIZE + CELL_SIZE / 2;

    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200, 40, 40, 0.85)';
    ctx.fill();
  }
}

// 绘制将军高亮
function drawCheckHighlight() {
  if (!gameState || gameState.gameOver) return;

  const currentPlayer = gameState.currentPlayer;
  if (isInCheck(gameState.board, gameState.captured, currentPlayer)) {
    // 找到被将军的王将
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const p = gameState.board[r][c];
        if (p && p.owner === currentPlayer && p.type === 'KING') {
          const vr = visualRow(r);
          const vc = visualCol(c);
          ctx.fillStyle = COLORS.checkHighlight;
          ctx.fillRect(
            GRID_OFFSET + vc * CELL_SIZE,
            GRID_OFFSET + vr * CELL_SIZE,
            CELL_SIZE, CELL_SIZE
          );
          break;
        }
      }
    }
  }
}

// 绘制棋子（五角形 + 汉字）
function drawPieces() {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const piece = gameState.board[r][c];
      if (!piece) continue;

      const vr = visualRow(r);
      const vc = visualCol(c);
      const cx = GRID_OFFSET + vc * CELL_SIZE + CELL_SIZE / 2;
      const cy = GRID_OFFSET + vr * CELL_SIZE + CELL_SIZE / 2;

      drawPieceShape(cx, cy, piece);
    }
  }
}

// 绘制单个棋子（五角形 + 文字）
function drawPieceShape(cx, cy, piece) {
  const isOwner0 = piece.owner === 0;
  const shouldRotate = perspectiveFlipped ? isOwner0 : !isOwner0;

  // 角行、飛車、王将/玉将、龍王、龍馬 1.2倍，其余棋子 1.1倍
  const isMajor = piece.type === 'ROOK' || piece.type === 'BISHOP' || piece.type === 'KING' || piece.type === 'DRAGON' || piece.type === 'HORSE';
  const baseRadius = isMajor ? PIECE_RADIUS * 1.2 : PIECE_RADIUS * 1.1;

  ctx.save();
  ctx.translate(cx, cy);
  if (shouldRotate) {
    ctx.rotate(Math.PI);
  }

  // 五角形：顶角120°，更窄
  const h = baseRadius * 1.0;
  const w = baseRadius * 0.55;  // 侧顶点半宽（更窄）
  const sideY = -h * 0.6;
  const w2 = baseRadius * 0.65; // 底部半宽（更窄）
  const bottomY = h * 0.7;

  ctx.beginPath();
  ctx.moveTo(0, -h);            // 顶点（105°角）
  ctx.lineTo(w, sideY);         // 右侧顶点
  ctx.lineTo(w2, bottomY);      // 右下角（75°角）
  ctx.lineTo(-w2, bottomY);     // 左下角（75°角）
  ctx.lineTo(-w, sideY);        // 左侧顶点
  ctx.closePath();

  // 木色渐变
  const gradient = ctx.createLinearGradient(-w, 0, w, 0);
  if (isOwner0) {
    gradient.addColorStop(0, '#c8a878');
    gradient.addColorStop(0.35, '#d4bc8e');
    gradient.addColorStop(0.5, '#dcc8a0');
    gradient.addColorStop(0.65, '#d4bc8e');
    gradient.addColorStop(1, '#b89860');
  } else {
    gradient.addColorStop(0, '#b89060');
    gradient.addColorStop(0.35, '#d0b080');
    gradient.addColorStop(0.5, '#d8b890');
    gradient.addColorStop(0.65, '#d0b080');
    gradient.addColorStop(1, '#a88050');
  }
  ctx.fillStyle = gradient;
  ctx.fill();

  // 边框
  ctx.strokeStyle = isOwner0 ? '#7a5c14' : '#6a4c10';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 汉字（更大更清晰）
  const displayName = getPieceDisplayName(piece);
  // 升变后的棋子（龍、馬）用红色
  const isPromotedChar = piece.promoted && (piece.type === 'DRAGON' || piece.type === 'HORSE');
  ctx.fillStyle = isPromotedChar ? '#cc0000' : (isOwner0 ? '#1a0a00' : '#0a0500');
  const fontSize = isMajor ? (baseRadius * 1.05) : (baseRadius * 0.95);
  ctx.font = `bold ${Math.round(fontSize)}px "KaiTi", "楷体", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.scale(1, 1.1);
  ctx.fillText(displayName, 0, 1);
  ctx.restore();

  ctx.restore();
}
