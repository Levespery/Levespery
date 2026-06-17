// 游戏常量
const GRID_SIZE = 9;
const CELL_SIZE = 60;
const GRID_OFFSET = 15;
const WALL_THICKNESS = 10;
const PLAYER_RADIUS = 22;

// 颜色定义
const COLORS = {
  board: '#ffffff',
  grid: '#e0e0e0',
  player1: '#1a1a1a',
  player2: '#ffffff',
  wall1: '#1a1a1a',
  wall2: '#ffffff',
  wallBorder1: '#000000',
  wallBorder2: '#999999',
  wallHover1: 'rgba(26, 26, 26, 0.4)',
  wallHover2: 'rgba(255, 255, 255, 0.6)',
  goal: 'rgba(180, 180, 180, 0.3)',
  turnHighlight: 'rgba(255, 234, 167, 0.6)',
  validMove: 'rgba(100, 100, 100, 0.5)',
};

// 游戏状态
let gameState = {
  players: [
    { row: 0, col: 4, walls: 10 },
    { row: 8, col: 4, walls: 10 }
  ],
  currentPlayer: 0,
  walls: [],
  gameOver: false,
  hoverWall: null,
  lastMoveBy: -1,  // 记录最后一步是谁下的（用于同步悔棋按钮）
  positionsSwapped: false // AI/本地再来一局时交换起始位置和目标行
};

// 悔棋历史记录
let moveHistory = [];

// 移动锁 - 防止在线模式下快速连续点击导致棋子重叠
let isMoving = false;

// 画布和上下文
let canvas, ctx;

// 视角翻转 - 当玩家是白色方（playerIndex=1）时翻转棋盘，使其从自己的视角看（棋子向上走）
let perspectiveFlipped = false;

// 将逻辑行号转换为视觉行号
function visualRow(logicalRow) {
  return perspectiveFlipped ? (GRID_SIZE - 1 - logicalRow) : logicalRow;
}

// 将逻辑列号转换为视觉列号
function visualCol(logicalCol) {
  return perspectiveFlipped ? (GRID_SIZE - 1 - logicalCol) : logicalCol;
}

// 将视觉行号转换为逻辑行号
function logicalRow(visRow) {
  return perspectiveFlipped ? (GRID_SIZE - 1 - visRow) : visRow;
}

// 将视觉列号转换为逻辑列号
function logicalCol(visCol) {
  return perspectiveFlipped ? (GRID_SIZE - 1 - visCol) : visCol;
}

// 获取玩家的目标行（考虑 positionsSwapped）
function getGoalRow(playerIndex) {
  const normalGoal = playerIndex === 0 ? 8 : 0;
  return gameState.positionsSwapped ? (8 - normalGoal) : normalGoal;
}

// 获取玩家的起始行（考虑 positionsSwapped）
function getStartRow(playerIndex) {
  const normalStart = playerIndex === 0 ? 0 : 8;
  return gameState.positionsSwapped ? (8 - normalStart) : normalStart;
}

// 初始化游戏
function init() {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('mousemove', handleMouseMove);

  updateModeHint();
  render();
}

// 检测是否是移动设备
function isMobileDevice() {
  return window.innerWidth <= 768 || 'ontouchstart' in window;
}

// 处理点击事件
function handleClick(e) {
  if (gameState.gameOver) return;

  // 如果正在拖动，完全忽略点击
  if (typeof dragState !== 'undefined' && dragState.isDragging) {
    return;
  }

  // 在线模式下检查是否轮到自己
  if (multiplayerState.isOnline && gameState.currentPlayer !== multiplayerState.myPlayerIndex) {
    return;
  }

  // 人机模式下检查是否轮到玩家
  if (aiMode && gameState.currentPlayer !== 0) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);

  // 电脑端：先尝试放置墙壁，再尝试移动
  if (!isMobileDevice()) {
    const wall = getWallFromClick(x, y);
    if (wall) {
      handleWallClick(wall);
      if (multiplayerState.isOnline) {
        syncGameState();
      }
      // 人机模式：玩家操作后触发 AI
      if (aiMode && !gameState.gameOver) {
        setTimeout(() => AI.makeMove(), 100);
      }
      return;
    }
  }

  // 移动棋子
  handleMoveClick(x, y);
  if (multiplayerState.isOnline) {
    syncGameState();
  }
  // 人机模式：玩家操作后触发 AI
  if (aiMode && !gameState.gameOver) {
    setTimeout(() => AI.makeMove(), 100);
  }
}

// 处理鼠标移动（用于墙壁预览）
function handleMouseMove(e) {
  if (gameState.gameOver) return;

  // 拖动时不处理鼠标移动，由拖动逻辑处理预览
  if (typeof dragState !== 'undefined' && dragState.isDragging) return;

  // 手机端不显示点击放置预览
  if (isMobileDevice()) return;

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);

  updateHoverWall(x, y);
  render();
}

// 处理移动点击
function handleMoveClick(x, y) {
  const visCol = Math.floor((x - GRID_OFFSET) / CELL_SIZE);
  const visRow = Math.floor((y - GRID_OFFSET) / CELL_SIZE);

  if (visRow < 0 || visRow >= GRID_SIZE || visCol < 0 || visCol >= GRID_SIZE) return;

  // 将视觉坐标转换为逻辑坐标
  const row = logicalRow(visRow);
  const col = logicalCol(visCol);

  const player = gameState.players[gameState.currentPlayer];
  const dr = row - player.row;
  const dc = col - player.col;
  const distance = Math.abs(dr) + Math.abs(dc);

  if (distance < 1 || distance > 2) return;

  const opponentIndex = gameState.currentPlayer === 0 ? 1 : 0;
  const opponent = gameState.players[opponentIndex];

  // 不允许移动到对手所在的格子
  if (row === opponent.row && col === opponent.col) return;

  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);
  let isJump = false;

  if (distance === 1) {
    if (isBlocked(player.row, player.col, row, col)) return;
  } else if ((absDr === 2 && absDc === 0) || (absDr === 0 && absDc === 2)) {
    // 直线跳跃
    const midRow = player.row + dr / 2;
    const midCol = player.col + dc / 2;
    if (midRow !== opponent.row || midCol !== opponent.col) return;
    if (isBlocked(player.row, player.col, midRow, midCol)) return;
    if (isBlocked(midRow, midCol, row, col)) return;
    isJump = true;
  } else {
    return;
  }

  // 保存历史记录（用于悔棋）
  saveMoveHistory('move', {
    player: gameState.currentPlayer,
    fromRow: player.row,
    fromCol: player.col,
    toRow: row,
    toCol: col
  });

  // 移动玩家
  player.row = row;
  player.col = col;

  console.log(`玩家${gameState.currentPlayer}移动到:(${row},${col})`);

  // 播放音效
  if (isJump) {
    SoundManager.playJumpSound();
  } else {
    SoundManager.playMoveSound();
  }

  // 检查是否获胜
  if (checkWin()) {
    gameState.gameOver = true;
    gameState.winner = gameState.currentPlayer;
    SoundManager.playWinSound();
    showWinMessage(gameState.currentPlayer);
    render();
    return;
  }

  // 切换玩家
  switchPlayer();

  // 显示悔棋按钮（在切换玩家后，这样在线模式能正确判断）
  showUndoButton();

  render();
}

// 处理墙壁点击
function handleWallClick(wall) {
  const player = gameState.players[gameState.currentPlayer];
  if (player.walls <= 0) return;

  // 检查墙壁是否重叠
  if (isWallOverlapping(wall)) {
    console.log('墙壁重叠，无法放置');
    return;
  }

  // 检查是否完全封死对手
  if (wouldBlockCompletely(wall)) {
    console.log('会封死对手，无法放置');
    return;
  }

  // 保存历史记录（用于悔棋）
  saveMoveHistory('wall', {
    player: gameState.currentPlayer,
    wall: { ...wall }
  });

  // 放置墙壁
  gameState.walls.push({ ...wall, player: gameState.currentPlayer });
  player.walls--;

  // 播放音效
  SoundManager.playWallSound();

  // 切换玩家
  switchPlayer();

  // 显示悔棋按钮（在切换玩家后）
  showUndoButton();

  gameState.hoverWall = null;
  render();
}

// 更新悬停墙壁预览
function updateHoverWall(x, y) {
  // 手机端不显示预览
  if (isMobileDevice()) {
    gameState.hoverWall = null;
    return;
  }

  const player = gameState.players[gameState.currentPlayer];
  if (player.walls <= 0) {
    gameState.hoverWall = null;
    return;
  }

  gameState.hoverWall = getWallFromClick(x, y);
}

// 从点击位置获取墙壁信息（点击检测范围小）
function getWallFromClick(x, y) {
  return getWallFromPosition(x, y, 0.15, null);
}

// 从拖动位置获取墙壁信息（拖动检测范围大，指定方向）
function getWallFromDrag(x, y, orientation) {
  return getWallFromPosition(x, y, 0.4, orientation);
}

// 通用墙壁检测函数 - 检测格子边缘
function getWallFromPosition(x, y, threshold, orientation) {
  const relX = x - GRID_OFFSET;
  const relY = y - GRID_OFFSET;

  // 边界检查 - 使用画布实际尺寸，允许扩展区域
  const maxRelX = GRID_SIZE * CELL_SIZE;
  const maxRelY = canvas ? canvas.height - GRID_OFFSET : GRID_SIZE * CELL_SIZE;
  if (relX < 0 || relX > maxRelX || relY < 0 || relY > maxRelY) {
    return null;
  }

  // 只检测水平墙
  if (orientation === null || orientation === 'h') {
    for (let visRow = 0; visRow < GRID_SIZE - 1; visRow++) {
      const edgeY = (visRow + 1) * CELL_SIZE;
      if (Math.abs(relY - edgeY) < CELL_SIZE * threshold) {
        const visCol = Math.floor(relX / CELL_SIZE);
        if (visCol >= 0 && visCol < GRID_SIZE - 1) {
          // 将视觉坐标转换为逻辑坐标（使用两个相邻视觉行/列的最小逻辑值）
          const logicalWallRow = Math.min(logicalRow(visRow), logicalRow(visRow + 1));
          const logicalWallCol = Math.min(logicalCol(visCol), logicalCol(visCol + 1));
          return { row: logicalWallRow, col: logicalWallCol, orientation: 'h' };
        }
      }
    }
  }

  // 只检测垂直墙
  if (orientation === null || orientation === 'v') {
    for (let visCol = 0; visCol < GRID_SIZE - 1; visCol++) {
      const edgeX = (visCol + 1) * CELL_SIZE;
      if (Math.abs(relX - edgeX) < CELL_SIZE * threshold) {
        const visRow = Math.floor(relY / CELL_SIZE);
        if (visRow >= 0 && visRow < GRID_SIZE - 1) {
          // 将视觉坐标转换为逻辑坐标（使用两个相邻视觉行/列的最小逻辑值）
          const logicalWallRow = Math.min(logicalRow(visRow), logicalRow(visRow + 1));
          const logicalWallCol = Math.min(logicalCol(visCol), logicalCol(visCol + 1));
          return { row: logicalWallRow, col: logicalWallCol, orientation: 'v' };
        }
      }
    }
  }

  return null;
}

// 检查墙壁是否重叠
function isWallOverlapping(newWall) {
  for (const wall of gameState.walls) {
    // 完全相同的位置和方向
    if (wall.row === newWall.row && wall.col === newWall.col && wall.orientation === newWall.orientation) {
      return true;
    }

    // 同方向相邻墙壁重叠
    if (wall.orientation === newWall.orientation) {
      if (wall.orientation === 'h') {
        // 水平墙：检查相邻列
        if (wall.row === newWall.row && Math.abs(wall.col - newWall.col) === 1) {
          return true;
        }
      } else {
        // 垂直墙：检查相邻行
        if (wall.col === newWall.col && Math.abs(wall.row - newWall.row) === 1) {
          return true;
        }
      }
    }

    // 不同方向交叉重叠
    if (wall.orientation !== newWall.orientation) {
      if (wall.row === newWall.row && wall.col === newWall.col) return true;
    }
  }
  return false;
}

// 检查移动是否被墙阻挡
function isBlocked(fromRow, fromCol, toRow, toCol) {
  for (const wall of gameState.walls) {
    if (wall.orientation === 'h') {
      // 水平墙阻挡上下移动
      if (fromCol === toCol) {
        const minRow = Math.min(fromRow, toRow);
        if (wall.row === minRow && (wall.col === fromCol || wall.col === fromCol - 1)) {
          return true;
        }
      }
    } else {
      // 垂直墙阻挡左右移动
      if (fromRow === toRow) {
        const minCol = Math.min(fromCol, toCol);
        if (wall.col === minCol && (wall.row === fromRow || wall.row === fromRow - 1)) {
          return true;
        }
      }
    }
  }
  return false;
}

// 检查放置墙壁后是否完全封死对手
function wouldBlockCompletely(wall) {
  // 临时添加墙壁
  gameState.walls.push(wall);

  // 检查两个玩家是否都能到达目标
  const canP1Reach = canReachGoal(0);
  const canP2Reach = canReachGoal(1);

  // 移除临时墙壁
  gameState.walls.pop();

  return !canP1Reach || !canP2Reach;
}

// 检查玩家是否能到达目标（BFS）
function canReachGoal(playerIndex) {
  const player = gameState.players[playerIndex];
  const goalRow = getGoalRow(playerIndex);

  const visited = new Set();
  const queue = [{ row: player.row, col: player.col }];
  visited.add(`${player.row},${player.col}`);

  while (queue.length > 0) {
    const { row, col } = queue.shift();

    if (row === goalRow) return true;

    // 尝试四个方向
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      const key = `${newRow},${newCol}`;

      if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE && !visited.has(key)) {
        if (!isBlocked(row, col, newRow, newCol)) {
          visited.add(key);
          queue.push({ row: newRow, col: newCol });
        }
      }
    }
  }

  return false;
}

// 检查是否获胜
function checkWin() {
  const player = gameState.players[gameState.currentPlayer];
  const goalRow = getGoalRow(gameState.currentPlayer);
  const isWin = player.row === goalRow;
  console.log(`检查胜利: 玩家${gameState.currentPlayer}, 位置:(${player.row},${player.col}), 目标行:${goalRow}, 胜利:${isWin}`);
  return isWin;
}

// 切换玩家
function switchPlayer() {
  // 记录最后一步是谁下的（用于同步悔棋按钮）
  gameState.lastMoveBy = gameState.currentPlayer;
  gameState.currentPlayer = gameState.currentPlayer === 0 ? 1 : 0;
  updateTurnIndicator();
  updateModeHint();
}

// 更新回合指示器
function updateTurnIndicator() {
  const indicator = document.getElementById('turn-indicator');

  if (multiplayerState.isOnline) {
    // 在线模式：根据是否轮到自己显示不同提示
    if (gameState.currentPlayer === multiplayerState.myPlayerIndex) {
      indicator.textContent = '轮到你了！';
      indicator.style.background = '#c8e6c9';
    } else {
      indicator.textContent = '对方思考中…';
      indicator.style.background = '#ffeaa7';
    }
  } else if (aiMode) {
    // 人机模式
    if (gameState.currentPlayer === 0) {
      indicator.textContent = '轮到你了！';
      indicator.style.background = '#c8e6c9';
    } else {
      indicator.textContent = 'AI 思考中…';
      indicator.style.background = '#ffeaa7';
    }
  } else {
    // 本地双人模式
    const name = gameState.currentPlayer === 0 ? '黑方' : '白方';
    indicator.textContent = `轮到：${name}玩家`;
    indicator.style.background = '#ffeaa7';
  }
}

// 更新模式提示
function updateModeHint() {
  // 更新墙壁选择器显示
  const wallSelector = document.getElementById('wall-selector');
  if (wallSelector) {
    const player = gameState.players[gameState.currentPlayer];
    wallSelector.style.display = player.walls > 0 ? 'flex' : 'none';
  }
}

// 更新墙壁数量显示
function updateWallCounts() {
  document.getElementById('walls1').textContent = gameState.players[0].walls;
  document.getElementById('walls2').textContent = gameState.players[1].walls;
}

// 显示胜利消息
function showWinMessage(winnerIndex) {
  console.log('显示胜利消息，当前玩家:', gameState.currentPlayer);
  const modal = document.getElementById('win-modal');
  const message = document.getElementById('win-message');

  if (aiMode) {
    // 人机模式
    if (gameState.currentPlayer === 0) {
      message.textContent = '你赢了！';
    } else {
      message.textContent = '你输了！';
    }
  } else if (multiplayerState.isOnline && winnerIndex !== undefined) {
    // 在线模式：使用传入的胜者信息
    const isMyWin = winnerIndex === multiplayerState.myPlayerIndex;
    message.textContent = isMyWin ? '你赢了！' : '你输了！';
  } else {
    // 本地模式
    const winner = gameState.currentPlayer === 0 ? '黑方' : '白方';
    message.textContent = `${winner}获胜！`;
  }

  modal.classList.add('show');
  console.log('胜利弹窗已显示');
}

// 保存移动历史
function saveMoveHistory(type, data) {
  moveHistory.push({
    type: type,
    data: data,
    timestamp: Date.now()
  });
  // 只保留最近10步
  if (moveHistory.length > 10) {
    moveHistory.shift();
  }
}

// 显示悔棋按钮
function showUndoButton() {
  const undoBtn = document.getElementById('undo-btn');
  if (!undoBtn) return;

  // 最后一步不是当前玩家下的（说明刚下完，轮到对手）
  if (gameState.lastMoveBy >= 0 && gameState.lastMoveBy !== gameState.currentPlayer) {
    undoBtn.style.display = 'inline-block';
  } else {
    undoBtn.style.display = 'none';
  }
}

// 隐藏悔棋按钮
function hideUndoButton() {
  const undoBtn = document.getElementById('undo-btn');
  if (undoBtn) {
    undoBtn.style.display = 'none';
  }
}

// 悔棋
function undoMove() {
  if (moveHistory.length === 0) return;

  // 人机模式：需要撤回两步（AI的一步和玩家的一步）
  if (aiMode) {
    if (moveHistory.length < 2) return;

    // 撤回 AI 的操作
    const aiMove = moveHistory.pop();
    if (aiMove.type === 'move') {
      gameState.players[1].row = aiMove.data.fromRow;
      gameState.players[1].col = aiMove.data.fromCol;
    } else if (aiMove.type === 'wall') {
      gameState.walls.pop();
      gameState.players[1].walls++;
    }

    // 撤回玩家的操作
    const playerMove = moveHistory.pop();
    if (playerMove.type === 'move') {
      gameState.players[0].row = playerMove.data.fromRow;
      gameState.players[0].col = playerMove.data.fromCol;
    } else if (playerMove.type === 'wall') {
      gameState.walls.pop();
      gameState.players[0].walls++;
    }

    gameState.currentPlayer = 0;
  } else {
    // 本地/在线模式
    const lastMove = moveHistory.pop();
    const playerIndex = lastMove.data.player;

    if (lastMove.type === 'move') {
      gameState.players[playerIndex].row = lastMove.data.fromRow;
      gameState.players[playerIndex].col = lastMove.data.fromCol;
    } else if (lastMove.type === 'wall') {
      gameState.walls.pop();
      gameState.players[playerIndex].walls++;
    }

    gameState.currentPlayer = playerIndex;
    gameState.lastMoveBy = -1;
  }

  SoundManager.playUndoSound();

  updateTurnIndicator();
  updateWallCounts();
  updateModeHint();
  hideUndoButton();
  render();

  // 在线模式：同步悔棋状态
  if (multiplayerState.isOnline) {
    syncGameState();
  }
}

// 重置游戏
function resetGame() {
  const swapped = gameState.positionsSwapped || false;
  gameState = {
    players: [
      { row: swapped ? 8 : 0, col: 4, walls: 10 },
      { row: swapped ? 0 : 8, col: 4, walls: 10 }
    ],
    currentPlayer: 0,
    walls: [],
    gameOver: false,
    hoverWall: null,
    lastMoveBy: -1,
    positionsSwapped: swapped
  };

  moveHistory = [];
  hideUndoButton();

  document.getElementById('win-modal').classList.remove('show');
  document.getElementById('restart-notify').style.display = 'none';

  // 重置再来一局状态
  restartRequested = false;
  const restartBtn = document.getElementById('btn-restart');
  if (restartBtn) restartBtn.textContent = '再来一局';

  updateTurnIndicator();
  updateWallCounts();
  updateModeHint();
  render();

  // 在线模式：同步重置状态
  if (multiplayerState.isOnline) {
    syncGameState();
  }
}

// 渲染游戏
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBoard();
  drawWalls();
  drawHoverWall();
  drawValidMoves();
  drawPlayers();
  updateWallCounts();
}

// 绘制棋盘
function drawBoard() {
  // 绘制背景
  ctx.fillStyle = COLORS.board;
  ctx.fillRect(GRID_OFFSET - 10, GRID_OFFSET - 10, GRID_SIZE * CELL_SIZE + 20, GRID_SIZE * CELL_SIZE + 20);

  // 绘制当前玩家高亮行（起始行位置）
  const highlightVisRow = visualRow(getStartRow(gameState.currentPlayer));
  ctx.fillStyle = COLORS.turnHighlight;
  ctx.fillRect(GRID_OFFSET, GRID_OFFSET + highlightVisRow * CELL_SIZE, GRID_SIZE * CELL_SIZE, CELL_SIZE);

  // 绘制网格线
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;

  for (let i = 0; i <= GRID_SIZE; i++) {
    // 垂直线
    ctx.beginPath();
    ctx.moveTo(GRID_OFFSET + i * CELL_SIZE, GRID_OFFSET);
    ctx.lineTo(GRID_OFFSET + i * CELL_SIZE, GRID_OFFSET + GRID_SIZE * CELL_SIZE);
    ctx.stroke();

    // 水平线
    ctx.beginPath();
    ctx.moveTo(GRID_OFFSET, GRID_OFFSET + i * CELL_SIZE);
    ctx.lineTo(GRID_OFFSET + GRID_SIZE * CELL_SIZE, GRID_OFFSET + i * CELL_SIZE);
    ctx.stroke();
  }

  // 绘制目标区域（灰色底线）- 使用视觉坐标
  const goalVisRow0 = visualRow(getGoalRow(0));  // 玩家0的目标行在视觉上的位置
  const goalVisRow8 = visualRow(getGoalRow(1));  // 玩家1的目标行在视觉上的位置
  ctx.fillStyle = COLORS.goal;
  ctx.fillRect(GRID_OFFSET, GRID_OFFSET + goalVisRow0 * CELL_SIZE, GRID_SIZE * CELL_SIZE, CELL_SIZE);

  ctx.fillStyle = COLORS.goal;
  ctx.fillRect(GRID_OFFSET, GRID_OFFSET + goalVisRow8 * CELL_SIZE, GRID_SIZE * CELL_SIZE, CELL_SIZE);
}

// 绘制圆角墙壁
function drawRoundedWall(x, y, width, height, isPlayer1, isHover = false) {
  const radius = Math.min(width, height) / 2;

  // 绘制阴影
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // 绘制墙壁主体
  ctx.fillStyle = isHover
    ? (isPlayer1 ? COLORS.wallHover1 : COLORS.wallHover2)
    : (isPlayer1 ? COLORS.wall1 : COLORS.wall2);

  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();

  ctx.restore();

  // 绘制边框
  ctx.strokeStyle = isPlayer1 ? COLORS.wallBorder1 : COLORS.wallBorder2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.stroke();
}

// 绘制墙壁
function drawWalls() {
  for (const wall of gameState.walls) {
    const isPlayer1 = wall.player === 0;
    // 计算相邻逻辑行列的视觉坐标，用 min/max 找到正确的视觉位置
    const vRow0 = visualRow(wall.row);
    const vRow1 = visualRow(wall.row + 1);
    const vCol0 = visualCol(wall.col);
    const vCol1 = visualCol(wall.col + 1);

    if (wall.orientation === 'h') {
      // 水平墙：在两行之间的边界，跨两列
      const x = GRID_OFFSET + Math.min(vCol0, vCol1) * CELL_SIZE;
      const y = GRID_OFFSET + Math.max(vRow0, vRow1) * CELL_SIZE - WALL_THICKNESS / 2;
      drawRoundedWall(x, y, CELL_SIZE * 2, WALL_THICKNESS, isPlayer1);
    } else {
      // 垂直墙：在两列之间的边界，跨两行
      const x = GRID_OFFSET + Math.max(vCol0, vCol1) * CELL_SIZE - WALL_THICKNESS / 2;
      const y = GRID_OFFSET + Math.min(vRow0, vRow1) * CELL_SIZE;
      drawRoundedWall(x, y, WALL_THICKNESS, CELL_SIZE * 2, isPlayer1);
    }
  }
}

// 绘制悬停墙壁预览
function drawHoverWall() {
  if (!gameState.hoverWall) return;

  const wall = gameState.hoverWall;
  const isPlayer1 = gameState.currentPlayer === 0;
  const vRow0 = visualRow(wall.row);
  const vRow1 = visualRow(wall.row + 1);
  const vCol0 = visualCol(wall.col);
  const vCol1 = visualCol(wall.col + 1);

  if (wall.orientation === 'h') {
    const x = GRID_OFFSET + Math.min(vCol0, vCol1) * CELL_SIZE;
    const y = GRID_OFFSET + Math.max(vRow0, vRow1) * CELL_SIZE - WALL_THICKNESS / 2;
    drawRoundedWall(x, y, CELL_SIZE * 2, WALL_THICKNESS, isPlayer1, true);
  } else {
    const x = GRID_OFFSET + Math.max(vCol0, vCol1) * CELL_SIZE - WALL_THICKNESS / 2;
    const y = GRID_OFFSET + Math.min(vRow0, vRow1) * CELL_SIZE;
    drawRoundedWall(x, y, WALL_THICKNESS, CELL_SIZE * 2, isPlayer1, true);
  }
}

// 绘制有效移动位置（小圆点）
function drawValidMoves() {
  if (gameState.gameOver) return;

  // 只在自己的回合显示可移动路径
  if (multiplayerState.isOnline && gameState.currentPlayer !== multiplayerState.myPlayerIndex) return;
  if (aiMode && gameState.currentPlayer !== 0) return;

  const player = gameState.players[gameState.currentPlayer];
  const opponentIndex = gameState.currentPlayer === 0 ? 1 : 0;
  const opponent = gameState.players[opponentIndex];
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (const [dr, dc] of directions) {
    const newRow = player.row + dr;
    const newCol = player.col + dc;

    if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE) {
      if (!isBlocked(player.row, player.col, newRow, newCol)) {
        if (newRow === opponent.row && newCol === opponent.col) {
          // 尝试跳跃
          const jumpRow = newRow + dr;
          const jumpCol = newCol + dc;

          if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE) {
            if (!isBlocked(newRow, newCol, jumpRow, jumpCol)) {
              const x = GRID_OFFSET + visualCol(jumpCol) * CELL_SIZE + CELL_SIZE / 2;
              const y = GRID_OFFSET + visualRow(jumpRow) * CELL_SIZE + CELL_SIZE / 2;
              ctx.beginPath();
              ctx.arc(x, y, 8, 0, Math.PI * 2);
              ctx.fillStyle = COLORS.validMove;
              ctx.fill();
            }
          }
        } else {
          // 普通移动位置
          const x = GRID_OFFSET + visualCol(newCol) * CELL_SIZE + CELL_SIZE / 2;
          const y = GRID_OFFSET + visualRow(newRow) * CELL_SIZE + CELL_SIZE / 2;
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.validMove;
          ctx.fill();
        }
      }
    }
  }
}

// 绘制玩家
function drawPlayers() {
  for (let i = 0; i < 2; i++) {
    const player = gameState.players[i];
    const x = GRID_OFFSET + visualCol(player.col) * CELL_SIZE + CELL_SIZE / 2;
    const y = GRID_OFFSET + visualRow(player.row) * CELL_SIZE + CELL_SIZE / 2;

    // 绘制阴影
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fill();

    // 绘制玩家棋子（纯色，带渐变效果）
    const gradient = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, PLAYER_RADIUS);
    if (i === 0) {
      // 黑棋：深灰到黑色渐变
      gradient.addColorStop(0, '#4a4a4a');
      gradient.addColorStop(1, '#1a1a1a');
    } else {
      // 白棋：白色到浅灰渐变
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(1, '#d0d0d0');
    }

    ctx.beginPath();
    ctx.arc(x, y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // 边框
    ctx.strokeStyle = i === 0 ? '#000' : '#aaa';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 高光点
    ctx.beginPath();
    ctx.arc(x - 7, y - 7, 4, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)';
    ctx.fill();
  }
}
