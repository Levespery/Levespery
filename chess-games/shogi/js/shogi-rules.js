// ============ 将棋规则引擎 ============

const GRID_SIZE = 9;

// 棋子类型定义
const PIECE_TYPES = {
  KING:    { name: '王将', promoteTo: null,     value: 99999 },
  ROOK:    { name: '飛車', promoteTo: 'DRAGON', value: 1000 },
  BISHOP:  { name: '角行', promoteTo: 'HORSE',  value: 800 },
  GOLD:    { name: '金将', promoteTo: null,      value: 500 },
  SILVER:  { name: '銀将', promoteTo: 'GOLD',   value: 400 },
  KNIGHT:  { name: '桂马', promoteTo: 'GOLD',   value: 300 },
  LANCE:   { name: '香车', promoteTo: 'GOLD',   value: 300 },
  PAWN:    { name: '步兵', promoteTo: 'GOLD',   value: 100 },
  DRAGON:  { name: '龙王', promoteTo: null,      value: 1500 },
  HORSE:   { name: '龙马', promoteTo: null,      value: 1300 }
};

// 棋子显示用单字（棋盘上刻的字）
const PIECE_CHARS = {
  KING: '王', ROOK: '飛', BISHOP: '角', GOLD: '金',
  SILVER: '銀', KNIGHT: '桂', LANCE: '香', PAWN: '步',
  DRAGON: '龍', HORSE: '馬'
};

// 升变后的显示字（棋子上刻的字）
const PROMOTED_CHARS = {
  ROOK: '龍', BISHOP: '馬', SILVER: '成',
  KNIGHT: '成', LANCE: '成', PAWN: 'と',
  DRAGON: '龍', HORSE: '馬'
};

// 棋子全名（用于升变提示）
const PIECE_FULL_NAMES = {
  ROOK: '飛車', BISHOP: '角行', SILVER: '銀將',
  KNIGHT: '桂馬', LANCE: '香車', PAWN: '步兵'
};

// 升变后的规范名称（用于提示）
const PROMOTED_NAMES = {
  ROOK: '龍王', BISHOP: '龍馬', SILVER: '成銀',
  KNIGHT: '成桂', LANCE: '成香', PAWN: '成步'
};

// 初始布局：[row, col, type, owner]  owner: 0=先手(下方), 1=后手(上方)
const INITIAL_LAYOUT = [
  // 后手（上方，row 0-2）
  [0, 0, 'LANCE', 1],  [0, 1, 'KNIGHT', 1], [0, 2, 'SILVER', 1],
  [0, 3, 'GOLD', 1],   [0, 4, 'KING', 1],   [0, 5, 'GOLD', 1],
  [0, 6, 'SILVER', 1], [0, 7, 'KNIGHT', 1], [0, 8, 'LANCE', 1],
  [1, 1, 'ROOK', 1],   [1, 7, 'BISHOP', 1],
  [2, 0, 'PAWN', 1], [2, 1, 'PAWN', 1], [2, 2, 'PAWN', 1],
  [2, 3, 'PAWN', 1], [2, 4, 'PAWN', 1], [2, 5, 'PAWN', 1],
  [2, 6, 'PAWN', 1], [2, 7, 'PAWN', 1], [2, 8, 'PAWN', 1],

  // 先手（下方，row 6-8）
  [6, 0, 'PAWN', 0], [6, 1, 'PAWN', 0], [6, 2, 'PAWN', 0],
  [6, 3, 'PAWN', 0], [6, 4, 'PAWN', 0], [6, 5, 'PAWN', 0],
  [6, 6, 'PAWN', 0], [6, 7, 'PAWN', 0], [6, 8, 'PAWN', 0],
  [7, 1, 'BISHOP', 0], [7, 7, 'ROOK', 0],
  [8, 0, 'LANCE', 0],  [8, 1, 'KNIGHT', 0], [8, 2, 'SILVER', 0],
  [8, 3, 'GOLD', 0],   [8, 4, 'KING', 0],   [8, 5, 'GOLD', 0],
  [8, 6, 'SILVER', 0], [8, 7, 'KNIGHT', 0], [8, 8, 'LANCE', 0]
];

// 初始持子
const INITIAL_CAPTURED = { 0: {}, 1: {} };

// 获取棋子移动偏移量（根据 owner 方向翻转）
function getMoveOffsets(type, promoted, owner) {
  const key = promoted ? (type === 'ROOK' ? 'DRAGON' : type === 'BISHOP' ? 'HORSE' : 'GOLD') : type;
  const dir = owner === 0 ? -1 : 1; // 先手向上(-1)，后手向下(+1)

  switch (key) {
    case 'KING':
      return [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    case 'GOLD':
      return [[dir,0],[dir,-1],[dir,1],[0,-1],[0,1],[-dir,0]];
    case 'SILVER':
      return [[dir,0],[dir,-1],[dir,1],[-dir,-1],[-dir,1]];
    case 'KNIGHT':
      return [[dir*2,-1],[dir*2,1]];
    case 'DRAGON':
      return [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    case 'HORSE':
      return [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
    default:
      return [];
  }
}

// 创建初始棋盘
function createInitialBoard() {
  const board = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  for (const [row, col, type, owner] of INITIAL_LAYOUT) {
    board[row][col] = { type, owner, promoted: false };
  }
  return board;
}

// 创建初始持子
function createInitialCaptured() {
  return { 0: {}, 1: {} };
}

// 创建初始游戏状态
function createInitialState() {
  return {
    board: createInitialBoard(),
    captured: createInitialCaptured(),
    currentPlayer: 0,
    gameOver: false,
    winner: null,
    lastMoveBy: -1,
    moveHistory: []
  };
}

// 获取敌方编号
function opponent(player) {
  return player === 0 ? 1 : 0;
}

// 判断是否在敌阵中（先手敌阵 row 0-2，后手敌阵 row 6-8）
function isInEnemyTerritory(row, owner) {
  if (owner === 0) return row <= 2;
  return row >= 6;
}

// 判断棋子是否可以升变
function canPromote(type) {
  const info = PIECE_TYPES[type];
  return info && info.promoteTo !== null;
}

// 判断是否必须升变（到达底线）
function mustPromote(row, type, owner) {
  if (type === 'KNIGHT') {
    return owner === 0 ? row <= 1 : row >= 7;
  }
  if (type === 'LANCE') {
    return owner === 0 ? row === 0 : row === 8;
  }
  if (type === 'PAWN') {
    return owner === 0 ? row === 0 : row === 8;
  }
  return false;
}

// 升变
function promotePiece(piece) {
  if (!piece || !canPromote(piece.type)) return piece;
  return { ...piece, type: PIECE_TYPES[piece.type].promoteTo, promoted: true };
}

// 获取棋子显示用单字
function getPieceDisplayName(piece) {
  if (!piece) return '';
  if (piece.promoted) return PROMOTED_CHARS[piece.type] || PIECE_CHARS[piece.type];
  // 王将/玉将按 owner 区分：先手(0)=玉，后手(1)=王
  if (piece.type === 'KING') {
    return piece.owner === 0 ? '玉' : '王';
  }
  return PIECE_CHARS[piece.type] || '';
}

// 检查棋盘是否在范围内
function inBounds(row, col) {
  return row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;
}

// 滑动走法（直线或斜线任意格）
function getSlidingMoves(board, row, col, directions, owner) {
  const moves = [];
  for (const [dr, dc] of directions) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      if (board[r][c]) {
        if (board[r][c].owner !== owner) {
          moves.push({ row: r, col: c, isCapture: true });
        }
        break;
      }
      moves.push({ row: r, col: c, isCapture: false });
      r += dr;
      c += dc;
    }
  }
  return moves;
}

// 获取单个棋子的合法走法（不含打入）
function getPieceMoves(board, row, col, piece) {
  const { type, owner, promoted } = piece;
  const moves = [];

  switch (type) {
    case 'KING': {
      const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
      for (const [dr, dc] of dirs) {
        const r = row + dr;
        const c = col + dc;
        if (inBounds(r, c)) {
          if (!board[r][c] || board[r][c].owner !== owner) {
            moves.push({ row: r, col: c, isCapture: board[r][c] && board[r][c].owner !== owner });
          }
        }
      }
      break;
    }
    case 'ROOK':
    case 'DRAGON': {
      const straightDirs = [[-1,0],[1,0],[0,-1],[0,1]];
      const m = getSlidingMoves(board, row, col, straightDirs, owner);
      moves.push(...m);
      if (promoted) {
        const diagDirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
        for (const [dr, dc] of diagDirs) {
          const r = row + dr;
          const c = col + dc;
          if (inBounds(r, c) && (!board[r][c] || board[r][c].owner !== owner)) {
            moves.push({ row: r, col: c, isCapture: board[r][c] && board[r][c].owner !== owner });
          }
        }
      }
      break;
    }
    case 'BISHOP':
    case 'HORSE': {
      const diagDirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
      const m = getSlidingMoves(board, row, col, diagDirs, owner);
      moves.push(...m);
      if (promoted) {
        const straightDirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dr, dc] of straightDirs) {
          const r = row + dr;
          const c = col + dc;
          if (inBounds(r, c) && (!board[r][c] || board[r][c].owner !== owner)) {
            moves.push({ row: r, col: c, isCapture: board[r][c] && board[r][c].owner !== owner });
          }
        }
      }
      break;
    }
    case 'GOLD': {
      const dir = owner === 0 ? -1 : 1;
      const dirs = [[dir,0],[dir,-1],[dir,1],[0,-1],[0,1],[-dir,0]];
      for (const [dr, dc] of dirs) {
        const r = row + dr;
        const c = col + dc;
        if (inBounds(r, c) && (!board[r][c] || board[r][c].owner !== owner)) {
          moves.push({ row: r, col: c, isCapture: board[r][c] && board[r][c].owner !== owner });
        }
      }
      break;
    }
    case 'SILVER': {
      const dir = owner === 0 ? -1 : 1;
      const dirs = [[dir,0],[dir,-1],[dir,1],[-dir,-1],[-dir,1]];
      for (const [dr, dc] of dirs) {
        const r = row + dr;
        const c = col + dc;
        if (inBounds(r, c) && (!board[r][c] || board[r][c].owner !== owner)) {
          moves.push({ row: r, col: c, isCapture: board[r][c] && board[r][c].owner !== owner });
        }
      }
      break;
    }
    case 'KNIGHT': {
      const dir = owner === 0 ? -1 : 1;
      const dirs = [[dir*2,-1],[dir*2,1]];
      for (const [dr, dc] of dirs) {
        const r = row + dr;
        const c = col + dc;
        if (inBounds(r, c) && (!board[r][c] || board[r][c].owner !== owner)) {
          moves.push({ row: r, col: c, isCapture: board[r][c] && board[r][c].owner !== owner });
        }
      }
      break;
    }
    case 'LANCE': {
      const dir = owner === 0 ? -1 : 1;
      let r = row + dir;
      while (inBounds(r, col)) {
        if (board[r][col]) {
          if (board[r][col].owner !== owner) {
            moves.push({ row: r, col: col, isCapture: true });
          }
          break;
        }
        moves.push({ row: r, col: col, isCapture: false });
        r += dir;
      }
      break;
    }
    case 'PAWN': {
      const dir = owner === 0 ? -1 : 1;
      const r = row + dir;
      if (inBounds(r, col) && (!board[r][col] || board[r][col].owner !== owner)) {
        moves.push({ row: r, col: col, isCapture: board[r][col] && board[r][col].owner !== owner });
      }
      break;
    }
  }

  // 如果棋子在敌阵中且可以升变，也为未升变的棋子生成升变走法
  // 升变走法和普通走法走同样的位置，只是标记为升变
  // 这在 UI 层处理，这里返回的是位置

  return moves;
}

// 检查是否二步（同一列不能有两个自己的未升变步兵）
function hasDoublePawn(board, col, owner) {
  for (let r = 0; r < GRID_SIZE; r++) {
    const p = board[r][col];
    if (p && p.owner === owner && p.type === 'PAWN' && !p.promoted) {
      return true;
    }
  }
  return false;
}

// 模拟移动并检查是否被将军
function wouldBeInCheck(board, captured, fromRow, fromCol, toRow, toCol, owner, moveType) {
  // 模拟移动
  const testBoard = board.map(r => r.map(c => c ? { ...c } : null));

  if (moveType === 'drop') {
    // 打入：在目标位置放置棋子（棋子已由调用方放到 testBoard 上）
    // 这里不需要额外操作，因为 tempBoard 已经有棋子了
  } else {
    // 普通移动
    testBoard[toRow][toCol] = testBoard[fromRow][fromCol];
    testBoard[fromRow][fromCol] = null;
  }

  // 找到王将位置
  let kingRow = -1, kingCol = -1;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (testBoard[r][c] && testBoard[r][c].owner === owner && testBoard[r][c].type === 'KING') {
        kingRow = r;
        kingCol = c;
        break;
      }
    }
    if (kingRow >= 0) break;
  }

  if (kingRow < 0) return true; // 王将不在棋盘上（不应发生）

  // 检查对方所有棋子是否能攻击王将
  const opp = opponent(owner);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (testBoard[r][c] && testBoard[r][c].owner === opp) {
        const moves = getPieceMoves(testBoard, r, c, testBoard[r][c]);
        for (const m of moves) {
          if (m.row === kingRow && m.col === kingCol) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

// 获取玩家所有合法走法（含打入）
function getAllLegalMoves(state, player) {
  const { board, captured } = state;
  const legalMoves = [];

  // 1. 棋盘上的棋子移动
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.owner === player) {
        const moves = getPieceMoves(board, r, c, piece);
        for (const m of moves) {
          // 检查移动后是否被将军
          if (!wouldBeInCheck(board, captured, r, c, m.row, m.col, player, 'move')) {
            // 检查是否需要强制升变
            const must = mustPromote(m.row, piece.type, player);
            if (must) {
              legalMoves.push({ type: 'move', fromRow: r, fromCol: c, toRow: m.row, toCol: m.col, promote: true });
            } else if (canPromote(piece.type) && (isInEnemyTerritory(r, player) || isInEnemyTerritory(m.row, player))) {
              // 可以升变也可以不升变
              legalMoves.push({ type: 'move', fromRow: r, fromCol: c, toRow: m.row, toCol: m.col, promote: false });
              legalMoves.push({ type: 'move', fromRow: r, fromCol: c, toRow: m.row, toCol: m.col, promote: true });
            } else {
              legalMoves.push({ type: 'move', fromRow: r, fromCol: c, toRow: m.row, toCol: m.col, promote: false });
            }
          }
        }
      }
    }
  }

  // 2. 打入（持子放入棋盘）
  const playerCaptured = captured[player] || {};
  for (const pieceType of Object.keys(playerCaptured)) {
    const count = playerCaptured[pieceType];
    if (count <= 0) continue;

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (board[r][c]) continue; // 位置已有棋子

        // 步兵特殊规则
        if (pieceType === 'PAWN') {
          // 二步禁止
          if (hasDoublePawn(board, c, player)) continue;
          // 打入后必须能到达的位置（步兵不能在第1行打入，如果先手）
          if (player === 0 && r === 0) continue;
          if (player === 1 && r === 8) continue;
        }

        // 桂马：不能在前两行打入
        if (pieceType === 'KNIGHT') {
          if (player === 0 && r <= 1) continue;
          if (player === 1 && r >= 7) continue;
        }

        // 香车：不能在第1行打入
        if (pieceType === 'LANCE') {
          if (player === 0 && r === 0) continue;
          if (player === 1 && r === 8) continue;
        }

        // 模拟打入后是否被将军
        const tempBoard = board.map(row => row.map(c => c ? { ...c } : null));
        tempBoard[r][c] = { type: pieceType, owner: player, promoted: false };

        // 检查打入后是否被将军
        if (!wouldBeInCheck(tempBoard, captured, -1, -1, r, c, player, 'drop')) {
          // 打步诘禁止：打入步兵不能直接将死
          if (pieceType === 'PAWN') {
            const opp = opponent(player);
            const oppState = { board: tempBoard, captured: captured };
            const oppMoves = getAllLegalMovesForCheck(oppState, opp);
            if (oppMoves.length === 0) continue; // 对方无合法走法 = 将死 = 禁止
          }

          legalMoves.push({ type: 'drop', pieceType, toRow: r, toCol: c });
        }
      }
    }
  }

  return legalMoves;
}

// 简化版：仅检查是否有合法走法（用于将死检测，避免递归）
function getAllLegalMovesForCheck(state, player) {
  const { board, captured } = state;
  const legalMoves = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.owner === player) {
        const moves = getPieceMoves(board, r, c, piece);
        for (const m of moves) {
          if (!wouldBeInCheck(board, captured, r, c, m.row, m.col, player, 'move')) {
            legalMoves.push({ fromRow: r, fromCol: c, toRow: m.row, toCol: m.col });
          }
        }
      }
    }
  }

  // 打入检查（简化：不检查打步诘以避免递归）
  const playerCaptured = captured[player] || {};
  for (const pieceType of Object.keys(playerCaptured)) {
    if (playerCaptured[pieceType] <= 0) continue;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (board[r][c]) continue;
        if (pieceType === 'PAWN' && hasDoublePawn(board, c, player)) continue;
        if (pieceType === 'PAWN' && player === 0 && r === 0) continue;
        if (pieceType === 'PAWN' && player === 1 && r === 8) continue;
        if (pieceType === 'KNIGHT' && player === 0 && r <= 1) continue;
        if (pieceType === 'KNIGHT' && player === 1 && r >= 7) continue;
        if (pieceType === 'LANCE' && player === 0 && r === 0) continue;
        if (pieceType === 'LANCE' && player === 1 && r === 8) continue;

        const tempBoard = board.map(row => row.map(c => c ? { ...c } : null));
        tempBoard[r][c] = { type: pieceType, owner: player, promoted: false };
        if (!wouldBeInCheck(tempBoard, captured, -1, -1, r, c, player, 'drop')) {
          legalMoves.push({ toRow: r, toCol: c });
        }
      }
    }
  }

  return legalMoves;
}

// 检查是否被将军
function isInCheck(board, captured, player) {
  // 找到王将位置
  let kingRow = -1, kingCol = -1;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (board[r][c] && board[r][c].owner === player && board[r][c].type === 'KING') {
        kingRow = r;
        kingCol = c;
        break;
      }
    }
    if (kingRow >= 0) break;
  }

  if (kingRow < 0) return false;

  // 检查对方所有棋子是否能攻击王将
  const opp = opponent(player);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (board[r][c] && board[r][c].owner === opp) {
        const moves = getPieceMoves(board, r, c, board[r][c]);
        for (const m of moves) {
          if (m.row === kingRow && m.col === kingCol) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

// 检查将死
function isCheckmate(state, player) {
  if (!isInCheck(state.board, state.captured, player)) return false;
  const legalMoves = getAllLegalMoves(state, player);
  return legalMoves.length === 0;
}

// 检查千日手（重复局面）- 简化版：检查最近的局面是否重复
function isRepetition(moveHistory) {
  if (moveHistory.length < 8) return false;
  const last = moveHistory[moveHistory.length - 1];
  const secondLast = moveHistory[moveHistory.length - 5];
  if (!last || !secondLast) return false;
  return last.boardHash === secondLast.boardHash;
}

// 计算棋盘哈希（用于局面检测）
function boardHash(board, captured) {
  let hash = '';
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const p = board[r][c];
      if (p) {
        hash += `${r}${c}${p.type[0]}${p.owner}${p.promoted ? 'P' : ''}`;
      }
    }
  }
  // 持子也参与哈希
  for (let player = 0; player < 2; player++) {
    for (const [type, count] of Object.entries(captured[player] || {})) {
      if (count > 0) hash += `C${player}${type[0]}${count}`;
    }
  }
  return hash;
}
