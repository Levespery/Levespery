// 游戏常量
const GRID_SIZE = 9;
const CELL_SIZE = 50;
const GRID_OFFSET = 45;
const WALL_THICKNESS = 8;
const PLAYER_RADIUS = 18;

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
  hoverWall: null
};

// 画布和上下文
let canvas, ctx;

// 初始化游戏
function init() {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('mousemove', handleMouseMove);

  updateModeHint();
  render();
}

// 处理点击事件
function handleClick(e) {
  if (gameState.gameOver) return;

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);

  // 先尝试放置墙壁
  const wall = getWallFromClick(x, y);
  if (wall) {
    handleWallClick(wall);
    return;
  }

  // 否则尝试移动棋子
  handleMoveClick(x, y);
}

// 处理鼠标移动（用于墙壁预览）
function handleMouseMove(e) {
  if (gameState.gameOver) return;

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);

  updateHoverWall(x, y);
  render();
}

// 处理移动点击
function handleMoveClick(x, y) {
  const col = Math.floor((x - GRID_OFFSET) / CELL_SIZE);
  const row = Math.floor((y - GRID_OFFSET) / CELL_SIZE);

  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return;

  const player = gameState.players[gameState.currentPlayer];
  const dr = row - player.row;
  const dc = col - player.col;

  // 检查是否移动1格
  if (Math.abs(dr) + Math.abs(dc) !== 1) return;

  // 检查是否有墙阻挡
  if (isBlocked(player.row, player.col, row, col)) return;

  // 移动玩家
  player.row = row;
  player.col = col;

  // 检查是否获胜
  if (checkWin()) {
    gameState.gameOver = true;
    showWinMessage();
    render();
    return;
  }

  // 切换玩家
  switchPlayer();
  render();
}

// 处理墙壁点击
function handleWallClick(wall) {
  const player = gameState.players[gameState.currentPlayer];
  if (player.walls <= 0) return;

  // 检查墙壁是否重叠
  if (isWallOverlapping(wall)) return;

  // 检查是否完全封死对手
  if (wouldBlockCompletely(wall)) return;

  // 放置墙壁
  gameState.walls.push({ ...wall, player: gameState.currentPlayer });
  player.walls--;

  // 切换玩家
  switchPlayer();
  gameState.hoverWall = null;
  render();
}

// 更新悬停墙壁预览
function updateHoverWall(x, y) {
  const player = gameState.players[gameState.currentPlayer];
  if (player.walls <= 0) {
    gameState.hoverWall = null;
    return;
  }

  gameState.hoverWall = getWallFromClick(x, y);
}

// 从点击位置获取墙壁信息
function getWallFromClick(x, y) {
  // 计算相对于网格的位置
  const relX = x - GRID_OFFSET;
  const relY = y - GRID_OFFSET;

  // 检测是否在水平墙壁区域（两行之间）
  const rowGap = relY / CELL_SIZE;
  const rowInt = Math.floor(rowGap);
  const rowFrac = rowGap - rowInt;

  // 检测是否在垂直墙壁区域（两列之间）
  const colGap = relX / CELL_SIZE;
  const colInt = Math.floor(colGap);
  const colFrac = colGap - colInt;

  // 判断是水平墙还是垂直墙
  if (rowFrac > 0.7 && rowFrac < 1.0 && colInt >= 0 && colInt < GRID_SIZE - 1 && rowInt >= 0 && rowInt < GRID_SIZE - 1) {
    // 水平墙壁
    return { row: rowInt, col: colInt, orientation: 'h' };
  }

  if (colFrac > 0.7 && colFrac < 1.0 && colInt >= 0 && colInt < GRID_SIZE - 1 && rowInt >= 0 && rowInt < GRID_SIZE - 1) {
    // 垂直墙壁
    return { row: rowInt, col: colInt, orientation: 'v' };
  }

  return null;
}

// 检查墙壁是否重叠
function isWallOverlapping(newWall) {
  for (const wall of gameState.walls) {
    if (wall.row === newWall.row && wall.col === newWall.col && wall.orientation === newWall.orientation) {
      return true;
    }

    // 检查交叉重叠
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
  const goalRow = playerIndex === 0 ? 8 : 0;

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
  const goalRow = gameState.currentPlayer === 0 ? 8 : 0;
  return player.row === goalRow;
}

// 切换玩家
function switchPlayer() {
  gameState.currentPlayer = gameState.currentPlayer === 0 ? 1 : 0;
  updateTurnIndicator();
  updateModeHint();
}

// 更新回合指示器
function updateTurnIndicator() {
  const indicator = document.getElementById('turn-indicator');
  indicator.textContent = `轮到: 玩家 ${gameState.currentPlayer + 1}`;
}

// 更新模式提示
function updateModeHint() {
  const hint = document.getElementById('mode-hint');
  const player = gameState.players[gameState.currentPlayer];
  hint.textContent = `可以放置墙壁 (${player.walls}个) 或 移动棋子`;
}

// 更新墙壁数量显示
function updateWallCounts() {
  document.getElementById('walls1').textContent = gameState.players[0].walls;
  document.getElementById('walls2').textContent = gameState.players[1].walls;
}

// 显示胜利消息
function showWinMessage() {
  const modal = document.getElementById('win-modal');
  const message = document.getElementById('win-message');
  message.textContent = `玩家 ${gameState.currentPlayer + 1} 获胜！`;
  modal.classList.add('show');
}

// 重置游戏
function resetGame() {
  gameState = {
    players: [
      { row: 0, col: 4, walls: 10 },
      { row: 8, col: 4, walls: 10 }
    ],
    currentPlayer: 0,
    walls: [],
    gameOver: false,
    hoverWall: null
  };

  document.getElementById('win-modal').classList.remove('show');
  updateTurnIndicator();
  updateWallCounts();
  updateModeHint();
  render();
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

  // 绘制当前玩家高亮行
  const highlightRow = gameState.currentPlayer === 0 ? 0 : GRID_SIZE - 1;
  ctx.fillStyle = COLORS.turnHighlight;
  ctx.fillRect(GRID_OFFSET, GRID_OFFSET + highlightRow * CELL_SIZE, GRID_SIZE * CELL_SIZE, CELL_SIZE);

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

  // 绘制目标区域（灰色底线）
  ctx.fillStyle = COLORS.goal;
  ctx.fillRect(GRID_OFFSET, GRID_OFFSET, GRID_SIZE * CELL_SIZE, CELL_SIZE);

  ctx.fillStyle = COLORS.goal;
  ctx.fillRect(GRID_OFFSET, GRID_OFFSET + (GRID_SIZE - 1) * CELL_SIZE, GRID_SIZE * CELL_SIZE, CELL_SIZE);
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

    if (wall.orientation === 'h') {
      const x = GRID_OFFSET + wall.col * CELL_SIZE;
      const y = GRID_OFFSET + (wall.row + 1) * CELL_SIZE - WALL_THICKNESS / 2;
      drawRoundedWall(x, y, CELL_SIZE * 2, WALL_THICKNESS, isPlayer1);
    } else {
      const x = GRID_OFFSET + (wall.col + 1) * CELL_SIZE - WALL_THICKNESS / 2;
      const y = GRID_OFFSET + wall.row * CELL_SIZE;
      drawRoundedWall(x, y, WALL_THICKNESS, CELL_SIZE * 2, isPlayer1);
    }
  }
}

// 绘制悬停墙壁预览
function drawHoverWall() {
  if (!gameState.hoverWall) return;

  const wall = gameState.hoverWall;
  const isPlayer1 = gameState.currentPlayer === 0;

  if (wall.orientation === 'h') {
    const x = GRID_OFFSET + wall.col * CELL_SIZE;
    const y = GRID_OFFSET + (wall.row + 1) * CELL_SIZE - WALL_THICKNESS / 2;
    drawRoundedWall(x, y, CELL_SIZE * 2, WALL_THICKNESS, isPlayer1, true);
  } else {
    const x = GRID_OFFSET + (wall.col + 1) * CELL_SIZE - WALL_THICKNESS / 2;
    const y = GRID_OFFSET + wall.row * CELL_SIZE;
    drawRoundedWall(x, y, WALL_THICKNESS, CELL_SIZE * 2, isPlayer1, true);
  }
}

// 绘制有效移动位置（小圆点）
function drawValidMoves() {
  if (gameState.gameOver) return;

  const player = gameState.players[gameState.currentPlayer];
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (const [dr, dc] of directions) {
    const newRow = player.row + dr;
    const newCol = player.col + dc;

    if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE) {
      if (!isBlocked(player.row, player.col, newRow, newCol)) {
        const x = GRID_OFFSET + newCol * CELL_SIZE + CELL_SIZE / 2;
        const y = GRID_OFFSET + newRow * CELL_SIZE + CELL_SIZE / 2;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.validMove;
        ctx.fill();
      }
    }
  }
}

// 绘制玩家
function drawPlayers() {
  for (let i = 0; i < 2; i++) {
    const player = gameState.players[i];
    const x = GRID_OFFSET + player.col * CELL_SIZE + CELL_SIZE / 2;
    const y = GRID_OFFSET + player.row * CELL_SIZE + CELL_SIZE / 2;

    // 绘制阴影
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fill();

    // 绘制玩家棋子
    ctx.beginPath();
    ctx.arc(x, y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? COLORS.player1 : COLORS.player2;
    ctx.fill();
    ctx.strokeStyle = i === 0 ? '#555' : '#999';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制玩家编号
    ctx.fillStyle = i === 0 ? '#fff' : '#333';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(i + 1, x, y);
  }
}
