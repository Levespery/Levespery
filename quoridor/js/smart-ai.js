// 预测型策略 AI - 分级难度
const SmartAI = {
  difficulty: 'hard',
  difficultyConfig: {
    easy: {
      predictDepth: 0,        // 不预判对手放墙
      wallProtect: false,     // 不保护咽喉点
      useQTable: false,       // 不使用 Q 表
      qTableWeight: 0,        // Q 表权重
      wallTiming: false,      // 不判断放墙时机
      altRouteCheck: false,   // 不检查备选路线
      repeatPenalty: false,   // 不检测重复移动
      wallStrategy: 'random'  // 随机放墙（不判断时机）
    },
    medium: {
      predictDepth: 1,        // 预判 1 步
      wallProtect: false,     // 不保护咽喉点
      useQTable: true,        // 使用部分 Q 表
      qTableWeight: 0.5,      // Q 表权重 50%
      wallTiming: true,       // 判断放墙时机
      altRouteCheck: false,   // 不检查备选路线
      repeatPenalty: true,    // 检测重复移动
      wallStrategy: 'react'   // 被动放墙（对手快赢时）
    },
    hard: {
      predictDepth: 2,        // 预判 2 步
      wallProtect: true,      // 保护咽喉点
      useQTable: true,        // 使用完整 Q 表
      qTableWeight: 1.0,      // Q 表权重 100%
      wallTiming: true,       // 判断放墙时机
      altRouteCheck: true,    // 检查备选路线
      repeatPenalty: true,    // 检测重复移动
      wallStrategy: 'active'  // 主动放墙
    }
  },
  qTable: null,

  setDifficulty(level) {
    this.difficulty = level;
    console.log('SmartAI 难度设置为:', level);
  },

  // 加载 Q 表
  loadQTable() {
    if (this.qTable !== null) return;
    try {
      if (window.Q_TABLE) {
        this.qTable = window.Q_TABLE;
        console.log('Q 表已加载:', Object.keys(this.qTable).length, '条目');
      } else {
        this.qTable = {};
      }
    } catch (e) {
      console.warn('Q 表加载失败:', e);
      this.qTable = {};
    }
  },

  // 获取 Q 值
  getQValue(stateKey, actionKey) {
    if (!this.qTable) this.loadQTable();
    const key = `${stateKey}|${actionKey}`;
    return this.qTable[key] || 0;
  },

  // 生成状态 key（与 train.js 保持一致）
  getStateKey(state) {
    const p0 = state.players[0];
    const p1 = state.players[1];
    
    // 加入墙壁布局
    const wallSig = state.walls.map(w => `${w.row}${w.col}${w.orientation}`).sort().join(',');
    
    // 加入距离目标的步数
    const p0Goal = getGoalRow(0);
    const p1Goal = getGoalRow(1);
    const p0Dist = Math.abs(p0.row - p0Goal);
    const p1Dist = Math.abs(p1.row - p1Goal);
    
    // 加入剩余墙数
    const wallsLeft = `${p0.walls}-${p1.walls}`;
    
    return `${p0.row},${p0.col}-${p1.row},${p1.col}-d${p0Dist},${p1Dist}-w${wallsLeft}-${wallSig}`;
  },

  // 生成动作 key
  getActionKey(action) {
    if (action.type === 'move') {
      return `move-${action.row}-${action.col}`;
    } else {
      return `wall-${action.wall.row}-${action.wall.col}-${action.wall.orientation}`;
    }
  },

  // 获取配置
  getConfig() {
    return this.difficultyConfig[this.difficulty] || this.difficultyConfig.hard;
  },

  // ==================== 移动决策 ====================

  // 评估移动（带威胁预判）
  evaluateMove(state, fromRow, fromCol, toRow, toCol) {
    const playerIndex = state.currentPlayer;
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const cfg = this.getConfig();

    // 1. 计算当前最短路径（用于判断是否在前进）
    const currentPath = this.findShortestPath(state, playerIndex);
    const currentDist = currentPath ? currentPath.length : 100;

    // 2. 计算移动后的最短路径
    const tempState = this.cloneState(state);
    tempState.players[playerIndex].row = toRow;
    tempState.players[playerIndex].col = toCol;
    const pathAfter = this.findShortestPath(tempState, playerIndex);
    if (!pathAfter) return -1000; // 无路可走

    const newDist = pathAfter.length;

    // 3. 模拟对手最佳放墙位置
    let worstCasePath = newDist;
    if (cfg.predictDepth >= 1) {
      const opponentWall = this.predictBestOpponentWall(tempState, opponentIndex, playerIndex);
      if (opponentWall) {
        const blockedState = this.cloneState(tempState);
        blockedState.walls.push({ ...opponentWall, player: opponentIndex });
        blockedState.players[opponentIndex].walls--;
        const pathAfterBlock = this.findShortestPath(blockedState, playerIndex);
        if (pathAfterBlock) {
          worstCasePath = Math.max(worstCasePath, pathAfterBlock.length);
        } else {
          worstCasePath = 100; // 被完全堵死
        }
      }
    }

    // 4. 方向性评分：向目标前进加分，远离扣分
    const directionBonus = (currentDist - newDist) * 20;

    // 5. 检查是否有备选路线（中等以上难度）
    let altBonus = 0;
    if (cfg.altRouteCheck) {
      const altRoutes = this.countAlternativeRoutes(tempState, playerIndex);
      altBonus = altRoutes >= 2 ? 5 : 0;
    }

    // 6. 重复惩罚（中等以上难度）
    let repeatPenalty = 0;
    if (cfg.repeatPenalty && moveHistory.length > 0) {
      const lastMove = moveHistory[moveHistory.length - 1];
      if (lastMove.type === 'move' && lastMove.data.player === playerIndex) {
        if (toRow === lastMove.data.fromRow && toCol === lastMove.data.fromCol) {
          repeatPenalty = -80;
        }
      }
    }

    // 7. 评分
    let score = directionBonus + altBonus + repeatPenalty;

    // 8. 最坏情况惩罚
    if (worstCasePath >= 100) score -= 500;

    // 9. Q 表加分（根据难度配置）
    if (cfg.useQTable) {
      const stateKey = this.getStateKey(state);
      const actionKey = this.getActionKey({ type: 'move', row: toRow, col: toCol });
      const qValue = this.getQValue(stateKey, actionKey);
      if (qValue !== 0) {
        score += qValue * 30 * cfg.qTableWeight;
      }
    }

    return score;
  },

  // 预测对手最佳放墙位置
  predictBestOpponentWall(state, opponentIndex, targetIndex) {
    const targetPath = this.findShortestPath(state, targetIndex);
    if (!targetPath || targetPath.length <= 1) return null;

    let bestWall = null;
    let bestScore = -Infinity;

    // 只在目标路径附近找墙（效率优化）
    const nearPath = this.getNearPathPositions(targetPath, 2);

    for (const pos of nearPath) {
      for (const orientation of ['h', 'v']) {
        const wall = { row: pos.row, col: pos.col, orientation };
        if (!this.isValidWall(state, wall)) continue;

        // 评估这个墙对目标的影响
        const blockedState = this.cloneState(state);
        blockedState.walls.push({ ...wall, player: opponentIndex });
        blockedState.players[opponentIndex].walls--;

        const newPath = this.findShortestPath(blockedState, targetIndex);
        if (!newPath) {
          // 完全堵死，最高分
          return wall;
        }

        const pathIncrease = newPath.length - targetPath.length;
        if (pathIncrease > bestScore) {
          bestScore = pathIncrease;
          bestWall = wall;
        }
      }
    }

    return bestScore > 0 ? bestWall : null;
  },

  // 获取路径附近的位置
  getNearPathPositions(path, radius) {
    const positions = new Set();
    for (const step of path) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const r = step.row + dr;
          const c = step.col + dc;
          if (r >= 0 && r < GRID_SIZE - 1 && c >= 0 && c < GRID_SIZE - 1) {
            positions.add(`${r},${c}`);
          }
        }
      }
    }
    return Array.from(positions).map(s => {
      const [r, c] = s.split(',').map(Number);
      return { row: r, col: c };
    });
  },

  // 统计备选路线数量
  countAlternativeRoutes(state, playerIndex) {
    const player = state.players[playerIndex];
    const goalRow = getGoalRow(playerIndex);
    const visited = new Set();
    const queue = [{ row: player.row, col: player.col, paths: 1 }];
    visited.add(`${player.row},${player.col}`);
    let routeCount = 0;

    while (queue.length > 0) {
      const { row, col, paths } = queue.shift();
      if (row === goalRow) {
        routeCount += paths;
        continue;
      }
      if (routeCount >= 3) break; // 足够了

      const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of directions) {
        const newRow = row + dr;
        const newCol = col + dc;
        const key = `${newRow},${newCol}`;
        if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE && !visited.has(key)) {
          if (!this.isBlocked(state, row, col, newRow, newCol)) {
            visited.add(key);
            queue.push({ row: newRow, col: newCol, paths });
          }
        }
      }
    }
    return routeCount;
  },

  // ==================== 墙壁决策 ====================

  // 评估墙壁放置（含时机判断）
  evaluateWall(state, wall) {
    const playerIndex = state.currentPlayer;
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const cfg = this.getConfig();

    // 1. 基础检查
    if (!this.isValidWall(state, wall)) return -1000;
    if (this.wouldBlockSelf(state, wall, playerIndex)) return -500;

    // 2. 计算对对手的影响
    const opponentPathBefore = this.findShortestPath(state, opponentIndex);
    const blockedState = this.cloneState(state);
    blockedState.walls.push({ ...wall, player: playerIndex });
    blockedState.players[playerIndex].walls--;
    const opponentPathAfter = this.findShortestPath(blockedState, opponentIndex);

    let opponentScore = 0;
    if (!opponentPathAfter) {
      opponentScore = 300;
    } else if (opponentPathBefore) {
      const pathIncrease = opponentPathAfter.length - opponentPathBefore.length;
      opponentScore = pathIncrease * 30;
      if (opponentPathBefore.length <= 3) {
        opponentScore *= 2;
      }
    }

    // 随机模式：只用基础评分
    if (cfg.wallStrategy === 'random') {
      return opponentScore;
    }

    // 被动模式：只在紧急情况放墙
    if (cfg.wallStrategy === 'react') {
      if (!opponentPathBefore || opponentPathBefore.length > 3) {
        return -1000;
      }
    }

    // 3. 时机判断（中等以上难度）
    let timingBonus = 0;
    if (cfg.wallTiming && opponentPathBefore && opponentPathBefore.length > 0) {
      const wallOnPath = this.findWallPositionOnPath(opponentPathBefore, wall);
      if (wallOnPath >= 0) {
        const stepsUntilWall = wallOnPath + 1;
        if (stepsUntilWall <= 2) {
          timingBonus = 80;
        } else if (stepsUntilWall <= 3) {
          timingBonus = 50;
        } else if (stepsUntilWall <= 4) {
          timingBonus = 20;
        }
      }
    }

    // 4. 对手备选路线（困难难度）
    let alternativesPenalty = 0;
    if (cfg.altRouteCheck && opponentPathAfter) {
      const altRoutes = this.countAlternativeRoutes(blockedState, opponentIndex);
      if (altRoutes >= 3) {
        alternativesPenalty = -30;
      } else if (altRoutes <= 1) {
        alternativesPenalty = 40;
      }
    }

    // 5. 计算对自己的影响
    const myPathBefore = this.findShortestPath(state, playerIndex);
    const myPathAfter = this.findShortestPath(blockedState, playerIndex);

    let selfPenalty = 0;
    if (!myPathAfter) {
      selfPenalty = -500;
    } else if (myPathBefore) {
      const myIncrease = myPathAfter.length - myPathBefore.length;
      selfPenalty = -myIncrease * 40;
    }

    // 6. 保护自己路径（咽喉点保护）
    let protectBonus = 0;
    if (cfg.wallProtect && myPathBefore) {
      const chokePoints = this.findChokePoints(state, playerIndex);
      for (const cp of chokePoints) {
        if (wall.row === cp.row && wall.col === cp.col) {
          protectBonus = 60;
          break;
        }
      }
    }

    // 7. 紧急封堵（对手快赢时）
    let emergencyBonus = 0;
    if (opponentPathBefore && opponentPathBefore.length <= 2) {
      emergencyBonus = 200;
    } else if (opponentPathBefore && opponentPathBefore.length <= 3) {
      emergencyBonus = 100;
    } else if (opponentPathBefore && opponentPathBefore.length <= 4) {
      emergencyBonus = 50;
    }

    // 8. Q 表加分（根据难度配置）
    let qBonus = 0;
    if (cfg.useQTable) {
      const stateKey = this.getStateKey(state);
      const actionKey = this.getActionKey({ type: 'wall', wall });
      const qValue = this.getQValue(stateKey, actionKey);
      if (qValue !== 0) {
        qBonus = qValue * 80 * cfg.qTableWeight;
      }
    }

    return opponentScore + timingBonus + alternativesPenalty + selfPenalty + protectBonus + emergencyBonus + qBonus;
  },

  // 找墙在路径上的位置（返回步数索引）
  findWallPositionOnPath(path, wall) {
    for (let i = 0; i < path.length; i++) {
      const step = path[i];
      // 检查墙是否在该步的移动方向上
      if (i < path.length - 1) {
        const nextStep = path[i + 1];
        const dr = nextStep.row - step.row;
        const dc = nextStep.col - step.col;
        
        // 水平墙阻挡垂直移动
        if (wall.orientation === 'h' && dc === 0) {
          const minRow = Math.min(step.row, nextStep.row);
          if (wall.row === minRow && (wall.col === step.col || wall.col === step.col - 1)) {
            return i;
          }
        }
        // 垂直墙阻挡水平移动
        if (wall.orientation === 'v' && dr === 0) {
          const minCol = Math.min(step.col, nextStep.col);
          if (wall.col === minCol && (wall.row === step.row || wall.row === step.row - 1)) {
            return i;
          }
        }
      }
    }
    return -1; // 墙不在路径上
  },

  // 找路径上的咽喉点（放墙后路径大幅增加的位置）
  findChokePoints(state, playerIndex) {
    const path = this.findShortestPath(state, playerIndex);
    if (!path || path.length <= 1) return [];

    const chokePoints = [];
    const nearPath = this.getNearPathPositions(path, 1);

    for (const pos of nearPath) {
      for (const orientation of ['h', 'v']) {
        const wall = { row: pos.row, col: pos.col, orientation };
        if (!this.isValidWall(state, wall)) continue;

        const testState = this.cloneState(state);
        testState.walls.push({ ...wall, player: playerIndex });
        const newPath = this.findShortestPath(testState, playerIndex);

        if (newPath && newPath.length > path.length + 2) {
          chokePoints.push({ row: pos.row, col: pos.col, impact: newPath.length - path.length });
        }
      }
    }

    // 按影响排序
    chokePoints.sort((a, b) => b.impact - a.impact);
    return chokePoints.slice(0, 3);
  },

  // 检查放墙是否会堵死自己
  wouldBlockSelf(state, wall, playerIndex) {
    const testState = this.cloneState(state);
    testState.walls.push(wall);
    testState.players[playerIndex].walls--;
    const path = this.findShortestPath(testState, playerIndex);
    return !path;
  },

  // ==================== 主决策函数 ====================

  // AI 思考并执行一步
  async makeMove() {
    if (gameState.gameOver) return;
    if (gameState.currentPlayer !== 1) return;

    if (this._thinking) return;
    this._thinking = true;

    console.log('SmartAI 开始思考...');

    try {
      // 短暂延迟模拟思考
      await this.sleep(200 + Math.random() * 300);

      if (gameState.gameOver || gameState.currentPlayer !== 1) {
        this._thinking = false;
        return;
      }

      const bestAction = this.decide();
      console.log('SmartAI 决定:', bestAction);

      if (bestAction) {
        if (bestAction.type === 'move') {
          this.executeMove(bestAction.row, bestAction.col);
        } else if (bestAction.type === 'wall') {
          this.executeWall(bestAction.wall);
        }
      } else {
        console.log('SmartAI 没有找到有效动作');
        switchPlayer();
        showUndoButton();
        render();
      }
    } catch (error) {
      console.error('SmartAI 执行出错:', error);
      if (gameState.currentPlayer === 1 && !gameState.gameOver) {
        switchPlayer();
        showUndoButton();
        render();
      }
    } finally {
      this._thinking = false;
    }
  },

  // 核心决策
  decide() {
    const state = this.cloneState(gameState);
    const playerIndex = 1; // AI 是玩家 1
    const player = state.players[playerIndex];
    const opponentIndex = 0;
    const opponent = state.players[opponentIndex];

    // 1. 评估所有移动
    const moves = this.getAllValidMoves(state, playerIndex);
    let bestMove = null;
    let bestMoveScore = -Infinity;

    for (const move of moves) {
      const score = this.evaluateMove(state, player.row, player.col, move.row, move.col);
      if (score > bestMoveScore) {
        bestMoveScore = score;
        bestMove = move;
      }
    }

    // 2. 评估墙壁放置（根据难度配置）
    let bestWall = null;
    let bestWallScore = -Infinity;
    const cfg = this.getConfig();

    // 评估墙壁放置
    if (player.walls > 0) {
      const wallCandidates = this.getWallCandidates(state, playerIndex);
      for (const wall of wallCandidates) {
        const score = this.evaluateWall(state, wall);
        if (score > bestWallScore) {
          bestWallScore = score;
          bestWall = wall;
        }
      }
    }

    // 3. 时机判断：是否现在放墙
    let shouldUseWall = false;
    const opponentPath = this.findShortestPath(state, opponentIndex);
    
    // 随机模式：不判断时机，有墙就放
    if (cfg.wallStrategy === 'random') {
      if (bestWall && bestWallScore > 0) {
        shouldUseWall = true;
      }
    }
    // 被动模式：只在紧急情况放墙
    else if (cfg.wallStrategy === 'react') {
      if (bestWall && opponentPath && opponentPath.length <= 3) {
        shouldUseWall = true;
      }
    }
    // 主动模式：智能判断时机
    else if (bestWall && opponentPath) {
      if (opponentPath.length <= 2) {
        shouldUseWall = true;
      } else if (bestWallScore >= 300) {
        shouldUseWall = true;
      } else if (bestWallScore >= 100) {
        const wallOnPath = this.findWallPositionOnPath(opponentPath, bestWall);
        if (wallOnPath >= 0 && wallOnPath <= 2) {
          shouldUseWall = true;
        }
      } else if (bestWallScore >= 75) {
        const blockedState = this.cloneState(state);
        blockedState.walls.push({ ...bestWall, player: playerIndex });
        const altRoutes = this.countAlternativeRoutes(blockedState, opponentIndex);
        if (altRoutes <= 1) {
          shouldUseWall = true;
        }
      }
    }

    // 4. 决策
    if (shouldUseWall && bestWallScore > bestMoveScore) {
      return { type: 'wall', wall: bestWall };
    }

    // 否则移动
    if (bestMove) {
      return { type: 'move', row: bestMove.row, col: bestMove.col };
    }

    return null;
  },

  // 获取墙壁候选（智能筛选）
  getWallCandidates(state, playerIndex) {
    const candidates = [];
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const opponentPath = this.findShortestPath(state, opponentIndex);
    const myPath = this.findShortestPath(state, playerIndex);
    const opponent = state.players[opponentIndex];

    // 1. 在对手路径前方找墙（最有效的位置）
    if (opponentPath && opponentPath.length > 0) {
      // 取对手路径的前 3 步，在这些位置附近找墙
      const targetSteps = opponentPath.slice(0, Math.min(3, opponentPath.length));
      for (const step of targetSteps) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const r = step.row + dr;
            const c = step.col + dc;
            if (r >= 0 && r < GRID_SIZE - 1 && c >= 0 && c < GRID_SIZE - 1) {
              candidates.push({ row: r, col: c, orientation: 'h' });
              candidates.push({ row: r, col: c, orientation: 'v' });
            }
          }
        }
      }
    }

    // 2. 在对手当前位置附近找墙（封堵近身）
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = opponent.row + dr;
        const c = opponent.col + dc;
        if (r >= 0 && r < GRID_SIZE - 1 && c >= 0 && c < GRID_SIZE - 1) {
          candidates.push({ row: r, col: c, orientation: 'h' });
          candidates.push({ row: r, col: c, orientation: 'v' });
        }
      }
    }

    // 3. 在自己路径的咽喉点找墙（保护）
    if (myPath) {
      const chokePoints = this.findChokePoints(state, playerIndex);
      for (const cp of chokePoints) {
        candidates.push({ row: cp.row, col: cp.col, orientation: 'h' });
        candidates.push({ row: cp.row, col: cp.col, orientation: 'v' });
      }
    }

    // 4. 去重
    const unique = [];
    const seen = new Set();
    for (const c of candidates) {
      const key = `${c.row},${c.col},${c.orientation}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(c);
      }
    }

    return unique;
  },

  // ==================== 工具函数 ====================

  // 克隆状态
  cloneState(state) {
    return {
      players: [
        { row: state.players[0].row, col: state.players[0].col, walls: state.players[0].walls },
        { row: state.players[1].row, col: state.players[1].col, walls: state.players[1].walls }
      ],
      currentPlayer: state.currentPlayer,
      walls: state.walls.map(w => ({ row: w.row, col: w.col, orientation: w.orientation, player: w.player })),
      gameOver: state.gameOver,
      winner: state.winner
    };
  },

  // 执行移动
  executeMove(row, col) {
    const player = gameState.players[1];
    const dr = row - player.row;
    const dc = col - player.col;
    const distance = Math.abs(dr) + Math.abs(dc);
    const isJump = distance === 2;

    saveMoveHistory('move', {
      player: 1,
      fromRow: player.row,
      fromCol: player.col,
      toRow: row,
      toCol: col
    });

    player.row = row;
    player.col = col;

    if (isJump) {
      SoundManager.playJumpSound();
    } else {
      SoundManager.playMoveSound();
    }

    gameState.lastMoveBy = 1;

    if (checkWin()) {
      gameState.gameOver = true;
      gameState.winner = 1;
      SoundManager.playWinSound();
      showWinMessage(1);
      render();
      return;
    }

    switchPlayer();
    showUndoButton();
    render();
  },

  // 执行放墙
  executeWall(wall) {
    const player = gameState.players[1];
    if (player.walls <= 0) return;

    if (isWallOverlapping(wall)) return;
    if (wouldBlockCompletely(wall)) return;

    saveMoveHistory('wall', {
      player: 1,
      wall: { ...wall }
    });

    gameState.walls.push({ ...wall, player: 1 });
    player.walls--;

    SoundManager.playWallSound();

    gameState.lastMoveBy = 1;

    switchPlayer();
    showUndoButton();
    gameState.hoverWall = null;
    render();
  },

  // 延迟
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // ==================== BFS 路径查找 ====================

  // 找最短路径
  findShortestPath(state, playerIndex) {
    const player = state.players[playerIndex];
    const goalRow = getGoalRow(playerIndex);
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const opponent = state.players[opponentIndex];

    const visited = new Set();
    const queue = [{ row: player.row, col: player.col, path: [] }];
    visited.add(`${player.row},${player.col}`);

    while (queue.length > 0) {
      const { row, col, path } = queue.shift();
      if (row === goalRow) return path;

      const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of directions) {
        const newRow = row + dr;
        const newCol = col + dc;
        const key = `${newRow},${newCol}`;

        if (newRow < 0 || newRow >= GRID_SIZE || newCol < 0 || newCol >= GRID_SIZE) continue;
        if (visited.has(key)) continue;
        if (this.isBlocked(state, row, col, newRow, newCol)) continue;

        if (newRow === opponent.row && newCol === opponent.col) {
          // 跳跃
          const jumpRow = newRow + dr;
          const jumpCol = newCol + dc;
          const jumpKey = `${jumpRow},${jumpCol}`;
          let straightBlocked = false;

          if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE && !visited.has(jumpKey)) {
            if (!this.isBlocked(state, newRow, newCol, jumpRow, jumpCol)) {
              visited.add(jumpKey);
              queue.push({ row: jumpRow, col: jumpCol, path: [...path, { row: jumpRow, col: jumpCol }] });
            } else {
              straightBlocked = true;
            }
          } else {
            straightBlocked = true;
          }

          if (straightBlocked) {
            for (const [sdr, sdc] of directions) {
              const sideRow = opponent.row + sdr;
              const sideCol = opponent.col + sdc;
              const sideKey = `${sideRow},${sideCol}`;
              if (sideRow < 0 || sideRow >= GRID_SIZE || sideCol < 0 || sideCol >= GRID_SIZE) continue;
              if (sideRow === row && sideCol === col) continue;
              if (this.isBlocked(state, opponent.row, opponent.col, sideRow, sideCol)) continue;
              if (visited.has(sideKey)) continue;
              visited.add(sideKey);
              queue.push({ row: sideRow, col: sideCol, path: [...path, { row: sideRow, col: sideCol }] });
            }
          }
        } else {
          visited.add(key);
          queue.push({ row: newRow, col: newCol, path: [...path, { row: newRow, col: newCol }] });
        }
      }
    }
    return null;
  },

  // 获取所有合法移动
  getAllValidMoves(state, playerIndex) {
    const player = state.players[playerIndex];
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const opponent = state.players[opponentIndex];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const moves = [];
    const seen = new Set();

    for (const [dr, dc] of directions) {
      const newRow = player.row + dr;
      const newCol = player.col + dc;
      const key = `${newRow},${newCol}`;

      if (newRow < 0 || newRow >= GRID_SIZE || newCol < 0 || newCol >= GRID_SIZE) continue;
      if (this.isBlocked(state, player.row, player.col, newRow, newCol)) continue;

      if (newRow === opponent.row && newCol === opponent.col) {
        const jumpRow = newRow + dr;
        const jumpCol = newCol + dc;
        const jumpKey = `${jumpRow},${jumpCol}`;
        let straightBlocked = false;
        if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE
            && !this.isBlocked(state, newRow, newCol, jumpRow, jumpCol) && !seen.has(jumpKey)) {
          seen.add(jumpKey);
          moves.push({ type: 'move', row: jumpRow, col: jumpCol });
        } else {
          straightBlocked = true;
        }
        if (straightBlocked) {
          for (const [sdr, sdc] of directions) {
            const sideRow = opponent.row + sdr;
            const sideCol = opponent.col + sdc;
            const sideKey = `${sideRow},${sideCol}`;
            if (sideRow < 0 || sideRow >= GRID_SIZE || sideCol < 0 || sideCol >= GRID_SIZE) continue;
            if (sideRow === player.row && sideCol === player.col) continue;
            if (this.isBlocked(state, opponent.row, opponent.col, sideRow, sideCol)) continue;
            if (!seen.has(sideKey)) {
              seen.add(sideKey);
              moves.push({ type: 'move', row: sideRow, col: sideCol });
            }
          }
        }
      } else {
        if (!seen.has(key)) {
          seen.add(key);
          moves.push({ type: 'move', row: newRow, col: newCol });
        }
      }
    }
    return moves;
  },

  // 检查墙壁是否阻挡
  isBlocked(state, fromRow, fromCol, toRow, toCol) {
    for (const wall of state.walls) {
      if (wall.orientation === 'h') {
        if (fromCol === toCol) {
          const minRow = Math.min(fromRow, toRow);
          if (wall.row === minRow && (wall.col === fromCol || wall.col === fromCol - 1)) return true;
        }
      } else {
        if (fromRow === toRow) {
          const minCol = Math.min(fromCol, toCol);
          if (wall.col === minCol && (wall.row === fromRow || wall.row === fromRow - 1)) return true;
        }
      }
    }
    return false;
  },

  // 检查墙壁是否有效
  isValidWall(state, wall) {
    if (wall.row < 0 || wall.row >= GRID_SIZE - 1 || wall.col < 0 || wall.col >= GRID_SIZE - 1) return false;
    return !this.isWallOverlapping(state, wall) && !this.wouldBlockCompletely(state, wall);
  },

  // 检查墙壁重叠
  isWallOverlapping(state, newWall) {
    for (const wall of state.walls) {
      if (wall.row === newWall.row && wall.col === newWall.col) return true;
      if (wall.orientation === newWall.orientation) {
        if (wall.orientation === 'h') {
          if (wall.row === newWall.row && wall.col <= newWall.col + 1 && newWall.col <= wall.col + 1) return true;
        } else {
          if (wall.col === newWall.col && wall.row <= newWall.row + 1 && newWall.row <= wall.row + 1) return true;
        }
      }
    }
    return false;
  },

  // 检查是否完全堵死
  wouldBlockCompletely(state, wall) {
    const testState = this.cloneState(state);
    testState.walls.push(wall);
    const canP0 = this.canReachGoal(testState, 0);
    const canP1 = this.canReachGoal(testState, 1);
    return !canP0 || !canP1;
  },

  // BFS 检查能否到达目标
  canReachGoal(state, playerIndex) {
    const player = state.players[playerIndex];
    const goalRow = getGoalRow(playerIndex);
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const opponent = state.players[opponentIndex];
    const visited = new Set();
    const queue = [{ row: player.row, col: player.col }];
    visited.add(`${player.row},${player.col}`);

    while (queue.length > 0) {
      const { row, col } = queue.shift();
      if (row === goalRow) return true;

      const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of directions) {
        const newRow = row + dr;
        const newCol = col + dc;
        const key = `${newRow},${newCol}`;
        if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE && !visited.has(key)) {
          if (!this.isBlocked(state, row, col, newRow, newCol)) {
            if (newRow === opponent.row && newCol === opponent.col) {
              const jumpRow = row + dr * 2;
              const jumpCol = col + dc * 2;
              const jumpKey = `${jumpRow},${jumpCol}`;
              if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE && !visited.has(jumpKey)) {
                if (!this.isBlocked(state, newRow, newCol, jumpRow, jumpCol)) {
                  visited.add(jumpKey);
                  queue.push({ row: jumpRow, col: jumpCol });
                }
              }
            } else {
              visited.add(key);
              queue.push({ row: newRow, col: newCol });
            }
          }
        }
      }
    }
    return false;
  }
};
