// ============ 将棋入门级 AI ============

const ShogiAI = {
  _thinking: false,

  // 棋子价值表
  pieceValues: {
    KING: 99999, ROOK: 1000, BISHOP: 800, GOLD: 500,
    SILVER: 400, KNIGHT: 300, LANCE: 300, PAWN: 100,
    DRAGON: 1500, HORSE: 1300
  },

  // AI 走棋
  async makeMove() {
    if (gameState.gameOver) return;
    if (gameState.currentPlayer !== 1) return;
    if (this._thinking) return;
    this._thinking = true;

    console.log('将棋 AI 开始思考...');

    try {
      await this.sleep(400 + Math.random() * 500);

      if (gameState.gameOver || gameState.currentPlayer !== 1) {
        this._thinking = false;
        return;
      }

      // 安全超时
      const safetyTimer = setTimeout(() => {
        if (this._thinking && gameState.currentPlayer === 1 && !gameState.gameOver) {
          console.warn('AI 思考超时，强制切换');
          this._thinking = false;
          switchPlayer();
          render();
        }
      }, 5000);

      const bestAction = this.evaluate();
      clearTimeout(safetyTimer);

      if (bestAction) {
        console.log('AI 决定:', bestAction);
        this.executeAction(bestAction);
      } else {
        console.log('AI 没有找到合法走法');
        switchPlayer();
        render();
      }
    } catch (error) {
      console.error('AI 执行出错:', error);
      if (gameState.currentPlayer === 1 && !gameState.gameOver) {
        switchPlayer();
        render();
      }
    } finally {
      this._thinking = false;
    }
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // 评估并选择最佳走法
  evaluate() {
    const allMoves = getAllLegalMoves(gameState, 1);
    if (allMoves.length === 0) return null;

    let bestScore = -Infinity;
    let bestMove = null;

    for (const move of allMoves) {
      const score = this.scoreMove(move);
      // 加入少量随机性
      const jitter = (Math.random() - 0.5) * 20;
      if (score + jitter > bestScore) {
        bestScore = score + jitter;
        bestMove = move;
      }
    }

    return bestMove;
  },

  // 评估单个走法的分数
  scoreMove(move) {
    let score = 0;

    if (move.type === 'drop') {
      // 打入：基础分 + 位置分
      score += this.pieceValues[move.pieceType] * 0.3;
      score += this.positionScore(move.toRow, move.toCol, move.pieceType, 1) * 0.5;

      // 打入到靠近对方王将的位置加分
      const kingPos = this.findKing(0);
      if (kingPos) {
        const dist = Math.abs(move.toRow - kingPos.row) + Math.abs(move.toCol - kingPos.col);
        score += Math.max(0, (12 - dist) * 15);
      }
    } else {
      // 移动
      const piece = gameState.board[move.fromRow][move.fromCol];
      if (!piece) return -9999;

      const capturedPiece = gameState.board[move.toRow][move.toCol];

      // 吃子加分
      if (capturedPiece) {
        score += this.pieceValues[capturedPiece.type] * 1.5;
      }

      // 向前移动加分（向对方阵地推进）
      const forward = piece.owner === 0 ? (move.fromRow - move.toRow) : (move.toRow - move.fromRow);
      score += forward * 10;

      // 位置分
      score += this.positionScore(move.toRow, move.toCol, piece.type, 1) * 0.3;

      // 升变加分
      if (move.promote) {
        score += 200;
      }

      // 靠近对方王将加分
      const kingPos = this.findKing(0);
      if (kingPos) {
        const dist = Math.abs(move.toRow - kingPos.row) + Math.abs(move.toCol - kingPos.col);
        score += Math.max(0, (12 - dist) * 8);
      }

      // 安全性：移动后如果会被对方吃，扣分
      const afterPiece = gameState.board[move.toRow][move.toCol];
      if (afterPiece && this.isSquareAttackedBy(move.toRow, move.toCol, 0)) {
        score -= this.pieceValues[piece.type] * 0.8;
      }
    }

    // 模拟走法后检查是否将军
    const testState = this.simulateMove(move);
    if (testState && isInCheck(testState.board, testState.captured, 0)) {
      score += 150; // 将军加分
    }

    // 防守：检查己方王是否安全，如果走完后己方被将军，扣分
    if (testState && isInCheck(testState.board, testState.captured, 1)) {
      score -= 300;
    }

    return score;
  },

  // 检查某个位置是否被对方攻击
  isSquareAttackedBy(row, col, attackerOwner) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const p = gameState.board[r][c];
        if (p && p.owner === attackerOwner) {
          const moves = getPieceMoves(gameState.board, r, c, p);
          if (moves.some(m => m.row === row && m.col === col)) {
            return true;
          }
        }
      }
    }
    return false;
  },

  // 模拟走法
  simulateMove(move) {
    const testBoard = gameState.board.map(r => r.map(c => c ? { ...c } : null));
    const testCaptured = {
      0: { ...gameState.captured[0] },
      1: { ...gameState.captured[1] }
    };

    if (move.type === 'drop') {
      testBoard[move.toRow][move.toCol] = { type: move.pieceType, owner: 1, promoted: false, originalType: move.pieceType };
      if (testCaptured[1][move.pieceType]) {
        testCaptured[1][move.pieceType]--;
        if (testCaptured[1][move.pieceType] <= 0) delete testCaptured[1][move.pieceType];
      }
    } else {
      const piece = testBoard[move.fromRow][move.fromCol];
      const captured = testBoard[move.toRow][move.toCol];

      if (captured) {
        // 吃子加入持子（还原为原始类型）
        const capturedType = captured.originalType || captured.type;
        if (!testCaptured[1][capturedType]) testCaptured[1][capturedType] = 0;
        testCaptured[1][capturedType]++;
      }

      testBoard[move.toRow][move.toCol] = {
        ...piece,
        type: move.promote ? PIECE_TYPES[piece.type].promoteTo : piece.type,
        promoted: move.promote || piece.promoted,
        originalType: piece.originalType || piece.type
      };
      testBoard[move.fromRow][move.fromCol] = null;
    }

    return { board: testBoard, captured: testCaptured };
  },

  // 位置评分（靠近中心和对方阵地加分）
  positionScore(row, col, type, owner) {
    let score = 0;

    // 中心加分
    const centerDist = Math.abs(row - 4) + Math.abs(col - 4);
    score += (8 - centerDist) * 3;

    // 靠近对方阵地加分
    if (owner === 1) {
      score += (8 - row) * 5;
    } else {
      score += row * 5;
    }

    return score;
  },

  // 找到指定玩家的王将位置
  findKing(owner) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const p = gameState.board[r][c];
        if (p && p.owner === owner && p.type === 'KING') {
          return { row: r, col: c };
        }
      }
    }
    return null;
  },

  // 执行走法
  executeAction(action) {
    if (action.type === 'drop') {
      executeDrop(action.pieceType, action.toRow, action.toCol);
    } else {
      // 检查是否需要升变
      const piece = gameState.board[action.fromRow][action.fromCol];
      if (action.promote) {
        executeMove(action.fromRow, action.fromCol, action.toRow, action.toCol, true);
      } else {
        executeMove(action.fromRow, action.fromCol, action.toRow, action.toCol, false);
      }
    }
  }
};
