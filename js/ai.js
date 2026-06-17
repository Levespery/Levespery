// AI 人机对战系统
const AI = {
  // 记录对手历史位置，用于判断移动趋势
  opponentHistory: [],
  lastOpponentPath: null,

  // 训练数据
  trainingData: {
    games: 14,
    wins: 6,
    losses: 8,
    // 状态-动作值表 (Q-learning) - 预训练数据
    qTable: {"7,0-4,3-15|move-5-3":-0.1,"6,0-5,3-15|move-4-3":-0.109,"6,1-4,3-15|move-5-3":-0.10981,"5,1-3,3-15|move-4-3":-0.1098829,"5,1-2,3-14|move-3-3":-0.109889461,"4,1-1,3-14|move-2-3":-0.10989005149,"4,1-1,2-13|move-1-3":-0.1098901046341,"3,1-1,1-13|move-1-2":-0.109890109417069,"3,1-1,2-12|move-1-1":-0.109890109847536,"2,1-2,2-12|move-1-2":-0.109890109886278,"2,1-3,2-11|move-2-2":-0.109890109889765,"1,1-4,2-11|move-3-2":-0.109890109890079,"1,1-5,2-10|move-4-2":-0.109890109890107,"1,2-6,2-10|move-5-2":-0.10989010989011,"2,2-6,3-10|move-6-2":-0.10989010989011,"3,2-6,4-10|move-6-3":-0.10989010989011,"4,2-6,4-9|wall-2-1-v":-0.10989010989011,"5,2-6,4-8|wall-4-2-v":-0.10989010989011,"6,2-6,3-8|move-6-4":-0.10989010989011,"6,4-6,3-7|wall-4-1-v":-0.10989010989011,"7,4-6,4-7|move-6-3":-0.10989010989011,"7,3-6,4-6|wall-5-3-h":-0.10989010989011,"7,2-6,4-5|wall-6-1-v":-0.10989010989011,"7,3-6,4-4|wall-7-1-h":-0.10989010989011,"7,4-6,4-3|wall-6-4-v":-0.10989010989011,"5,4-7,4-3|move-6-4":-0.10989010989011,"4,4-7,4-2|wall-6-2-h":-0.10989010989011,"3,4-7,4-1|wall-6-5-h":-0.20879120879121,"2,4-7,4-0|wall-7-3-h":-0.21769230769231,"1,4-8,4-0|move-7-4":0.023693756706263,"2,4-7,4-0|move-6-4":0.16259478223768,"5,7-1,6-19|move-0-6":0.1,"5,6-1,7-19|move-1-6":0.109,"4,6-1,8-19|move-1-7":0.10981,"4,7-2,8-19|move-1-8":0.1098829,"4,8-3,8-19|move-2-8":0.109889461,"2,8-1,8-19|move-3-8":0.10989005149,"2,8-3,8-18|move-1-8":0.1098901046341,"1,8-3,7-18|move-3-8":0.109890109417069,"1,7-3,6-18|move-3-7":0.109890109847536,"1,6-3,5-18|move-3-6":-0.010989010992428,"0,6-2,5-18|move-3-5":0.109890109889765,"0,5-1,5-18|move-2-5":0.109890109890079,"0,5-2,5-17|move-1-5":0.109890109890107,"0,4-3,5-17|move-2-5":0.10989010989011,"0,4-3,6-16|move-3-5":0.10989010989011,"0,4-4,6-15|move-3-6":0.10989010989011,"0,3-5,6-15|move-4-6":0.10989010989011,"0,2-5,7-15|move-5-6":0.10989010989011,"0,1-5,8-15|move-5-7":0.20879120879121,"1,1-6,8-15|move-5-8":0.11879120879121,"1,1-6,7-14|move-6-8":0.11069120879121,"1,0-6,6-14|move-6-7":0.10996220879121,"2,0-6,5-14|move-6-6":0.10989659879121,"2,0-5,5-13|move-6-5":0.10989069389121,"2,0-6,5-12|move-5-5":0.10989016245021,"2,1-6,4-12|move-6-5":0.10989011462052,"2,2-5,4-12|move-6-4":0.10989011031585,"3,2-4,4-12|move-5-4":0.10989010992843,"4,2-4,4-11|wall-1-1-h":0.10989010989356,"4,3-4,4-10|wall-0-2-h":0.10989010989042,"5,3-4,4-9|wall-1-3-v":0.10989010989014,"5,3-4,4-7|wall-3-3-v":0.10989010989011,"5,3-4,4-5|wall-5-3-v":0.10989010989011,"5,2-4,4-4|wall-5-1-v":0.10989010989011,"5,1-4,4-3|wall-5-0-h":0.10989010989011,"5,2-5,4-3|move-4-4":0.10989010989011,"5,3-6,4-3|move-5-4":0.10989010989011,"5,4-6,4-2|wall-6-1-h":0.10989010989011,"4,4-6,4-1|wall-6-5-h":-0.010989010989011,"3,4-6,4-0|wall-6-3-h":0.18675100000000,"1,6-1,0-13|move-0-0":0.1,"1,5-2,0-13|move-1-0":0.109,"0,5-3,0-13|move-2-0":0.10981,"0,4-4,0-13|move-3-0":0.1098829,"0,3-4,1-13|move-4-0":0.109889461,"0,2-4,2-13|move-4-1":0.10989005149,"0,1-4,3-13|move-4-2":0.1098901046341,"1,1-4,4-13|move-4-3":0.10989010941707,"2,1-4,4-12|wall-2-7-h":0.10989010984754,"3,1-4,4-11|wall-1-6-h":0.10989010988628,"3,2-4,4-10|wall-1-1-v":0.10989010988977,"3,3-4,4-9|wall-1-2-h":0.10989010989008,"3,4-4,4-8|wall-1-4-h":0.10989010989011,"3,3-4,4-7|wall-0-0-v":0.10989010989011,"3,4-4,4-6|wall-2-0-v":0.10989010989011,"3,5-4,4-5|wall-2-5-v":0.10989010989011,"3,5-4,4-3|wall-3-5-h":0.10989010989011,"3,4-5,4-3|move-4-4":0.10989010989011,"3,4-6,4-2|move-5-4":0.10989010989011,"2,0-1,0-14|move-0-0":0.1,"3,0-2,0-14|move-1-0":0.109,"4,0-3,0-14|move-2-0":0.10981,"5,0-4,0-14|move-3-0":0.1098829,"6,0-5,0-14|move-4-0":0.109889461,"7,0-6,0-14|move-5-0":0.10989005149,"7,1-7,0-14|move-6-0":0.1098901046341,"6,1-7,1-14|move-7-0":0.10989010941707,"5,1-7,2-14|move-7-1":0.10989010984754,"5,2-6,2-14|move-7-2":0.10989010988628,"5,3-5,2-14|move-6-2":0.10989010988977,"4,3-5,3-14|move-5-2":0.10989010989008,"4,3-5,4-13|move-5-3":0.10989010989011,"4,2-4,4-13|move-5-4":0.10989010989011,"4,1-4,4-12|wall-4-1-h":0.10989010989011,"3,1-4,4-11|wall-3-0-v":0.10989010989011,"3,2-4,4-10|wall-1-0-v":0.10989010989011,"3,3-4,4-9|wall-1-1-h":0.10989010989011,"3,4-4,4-8|wall-1-3-h":0.10989010989011,"3,4-5,4-7|move-4-4":0.10989010989011,"4,4-5,4-6|wall-2-4-v":0.10989010989011,"6,4-5,4-5|wall-4-4-v":0.10989010989011,"6,4-5,4-3|wall-6-4-v":0.10989010989011,"6,4-5,4-1|wall-7-2-h":0.10989010989011,"4,4-5,4-0|wall-7-4-h":0.10989010989011,"3,4-6,4-0|move-5-4":0.010989010989011,"0,3-1,4-11|move-0-4":0.1,"0,4-2,4-11|move-1-4":0.109,"1,4-3,4-11|move-2-4":0.10981,"1,3-4,4-11|move-3-4":0.1098829,"1,2-4,4-10|wall-0-2-h":0.109889461,"1,3-4,4-9|wall-1-1-v":0.10989005149,"1,4-4,4-8|wall-0-4-v":0.1098901046341,"2,4-5,4-8|move-4-4":0.10989010941707,"3,4-5,4-7|wall-5-3-h":0.10989010984754,"3,3-6,4-7|move-5-4":0.10989010988628,"4,3-6,4-6|wall-2-4-v":0.10989010988977,"4,2-6,4-5|wall-4-3-v":0.10989010989008,"4,2-6,4-3|wall-3-1-v":0.10989010989011,"4,3-6,4-2|wall-4-2-h":0.10989010989011,"4,4-6,4-1|wall-4-4-v":-0.010989010989011,"2,2-1,8-20|move-0-8":0.1,"2,3-1,7-20|move-1-8":0.109,"3,3-1,6-20|move-1-7":0.2087119,"3,3-2,6-19|move-1-6":0.118784071,"3,4-3,6-19|move-2-6":0.110690566,"3,4-3,5-18|move-3-6":0.109962151,"3,6-3,4-18|move-3-5":0.109896594,"3,6-3,3-17|move-3-4":0.109890693,"3,7-2,3-17|move-3-3":0.109890162,"3,8-1,3-17|move-2-3":0.109890115,"3,8-1,2-16|move-1-3":0.10989011,"3,8-1,1-15|move-1-2":0.10989011,"3,8-2,1-14|move-1-1":0.10989011,"4,8-3,1-14|move-2-1":0.10989011,"5,8-4,1-14|move-3-1":0.10989011,"6,8-5,1-14|move-4-1":0.10989011,"6,7-6,1-14|move-5-1":0.10989011,"6,6-6,1-13|wall-5-0-v":0.10989011,"6,5-6,1-12|wall-6-0-h":0.10989011,"5,5-6,2-12|move-6-1":0.10989011,"5,6-5,2-12|move-6-2":0.10989011,"5,7-5,2-11|wall-5-6-h":0.10989011,"4,7-5,2-10|wall-4-7-v":0.10989011,"4,6-5,2-9|wall-3-6-h":0.10989011,"4,5-5,2-8|wall-2-1-v":0.10989011,"5,5-5,2-7|wall-4-4-v":0.10989011,"6,5-5,2-6|wall-6-4-v":0.10989011,"6,4-4,2-6|move-5-2":0.10989011,"6,4-4,3-5|move-4-2":0.10989011,"6,4-4,4-4|move-4-3":0.10989011,"6,4-5,4-3|move-4-4":0.10989011,"6,4-5,4-1|wall-7-5-h":0.10989011,"4,4-6,4-1|move-5-4":0.10989011},
    // 记录当前游戏的操作历史
    currentGameHistory: [],
    // 学习率
    learningRate: 0.1,
    // 折扣因子
    discountFactor: 0.9,
    // 探索率（随机尝试新策略的概率）
    explorationRate: 0.2
  },

  // 初始化训练数据（从本地存储加载）
  initTraining() {
    const saved = localStorage.getItem('quoridor_ai_training');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.trainingData = { ...this.trainingData, ...data };
        console.log('加载训练数据:', this.trainingData.games, '局游戏');
      } catch (e) {
        console.error('加载训练数据失败:', e);
      }
    }
  },

  // 保存训练数据到本地存储
  saveTraining() {
    try {
      localStorage.setItem('quoridor_ai_training', JSON.stringify(this.trainingData));
    } catch (e) {
      console.error('保存训练数据失败:', e);
    }
  },

  // 记录一步操作
  recordAction(stateKey, action) {
    this.trainingData.currentGameHistory.push({
      state: stateKey,
      action: action,
      reward: 0
    });
  },

  // 获取状态的特征 key
  getStateKey() {
    const p0 = gameState.players[0];
    const p1 = gameState.players[1];
    return `${p0.row},${p0.col}-${p1.row},${p1.col}-${gameState.walls.length}`;
  },

  // 获取 Q 值
  getQValue(stateKey, actionKey) {
    const key = `${stateKey}|${actionKey}`;
    return this.trainingData.qTable[key] || 0;
  },

  // 更新 Q 值
  updateQValue(stateKey, actionKey, reward) {
    const key = `${stateKey}|${actionKey}`;
    const oldValue = this.getQValue(stateKey, actionKey);
    const newValue = oldValue + this.trainingData.learningRate * (reward - oldValue);
    this.trainingData.qTable[key] = newValue;
  },

  // 游戏结束时学习
  learn(isWin) {
    const history = this.trainingData.currentGameHistory;
    const reward = isWin ? 1 : -1;

    // 从后往前更新 Q 值（时间差分学习）
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      const futureReward = i < history.length - 1
        ? this.getQValue(history[i + 1].state, history[i + 1].action) * this.trainingData.discountFactor
        : 0;

      this.updateQValue(entry.state, entry.action, reward + futureReward);
    }

    // 更新统计
    this.trainingData.games++;
    if (isWin) {
      this.trainingData.wins++;
    } else {
      this.trainingData.losses++;
    }

    // 清空当前游戏历史
    this.trainingData.currentGameHistory = [];

    // 保存训练数据
    this.saveTraining();

    console.log(`训练统计: ${this.trainingData.games}局, 胜率: ${(this.trainingData.wins / this.trainingData.games * 100).toFixed(1)}%`);
  },

  // 根据训练数据选择动作（带探索）
  chooseActionWithTraining(possibleActions, stateKey) {
    // 探索：随机尝试新策略
    if (Math.random() < this.trainingData.explorationRate) {
      return possibleActions[Math.floor(Math.random() * possibleActions.length)];
    }

    // 利用：选择 Q 值最高的动作
    let bestAction = possibleActions[0];
    let bestQValue = this.getQValue(stateKey, this.getActionKey(possibleActions[0]));

    for (const action of possibleActions) {
      const qValue = this.getQValue(stateKey, this.getActionKey(action));
      if (qValue > bestQValue) {
        bestQValue = qValue;
        bestAction = action;
      }
    }

    return bestAction;
  },

  // 获取动作的特征 key
  getActionKey(action) {
    if (action.type === 'move') {
      return `move-${action.row}-${action.col}`;
    } else {
      return `wall-${action.wall.row}-${action.wall.col}-${action.wall.orientation}`;
    }
  },

  // AI 思考并执行一步
  async makeMove() {
    if (gameState.gameOver) return;
    if (gameState.currentPlayer !== 1) return; // AI 是玩家 2

    console.log('AI 开始思考...');

    // 添加延迟让 AI 有"思考"的感觉
    await this.sleep(400 + Math.random() * 500);

    const bestAction = this.evaluate();
    console.log('AI 决定:', bestAction);

    if (bestAction) {
      if (bestAction.type === 'move') {
        this.executeMove(bestAction.row, bestAction.col);
      } else if (bestAction.type === 'wall') {
        this.executeWall(bestAction.wall);
      }
    } else {
      console.log('AI 没有找到有效动作，跳过回合');
      switchPlayer();
      showUndoButton();
      render();
    }
  },

  // 延迟函数
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // 评估最佳行动（智能策略 + 训练学习）
  evaluate() {
    const aiPlayer = gameState.players[1];
    const humanPlayer = gameState.players[0];

    // 计算双方最短路径
    const aiPath = this.findShortestPath(1);
    const humanPath = this.findShortestPath(0);

    // 记录对手历史
    this.opponentHistory.push({ row: humanPlayer.row, col: humanPlayer.col });
    if (this.opponentHistory.length > 10) {
      this.opponentHistory.shift();
    }

    // 收集所有可能的动作
    const possibleActions = this.collectPossibleActions(aiPath, humanPath);

    if (possibleActions.length === 0) {
      return this.findAnyValidMove();
    }

    // 使用训练数据选择动作
    const stateKey = this.getStateKey();
    const chosenAction = this.chooseActionWithTraining(possibleActions, stateKey);

    // 记录这个动作用于训练
    this.recordAction(stateKey, this.getActionKey(chosenAction));

    return chosenAction;
  },

  // 收集所有可能的动作
  collectPossibleActions(aiPath, humanPath) {
    const actions = [];
    const aiPlayer = gameState.players[1];

    // 如果 AI 能直接到达终点，就移动
    if (aiPath && aiPath.length <= 1) {
      actions.push({ type: 'move', row: aiPath[0].row, col: aiPath[0].col });
      return actions;
    }

    // 智能墙壁策略
    if (aiPlayer.walls > 0 && humanPath && aiPath) {
      // 紧急阻拦
      if (humanPath.length <= 3) {
        const wall = this.findBlockingWall(humanPath, aiPath);
        if (wall) actions.push({ type: 'wall', wall: wall });
      }

      // 路径压制
      if (humanPath.length < aiPath.length - 2) {
        const wall = this.findBestWall(humanPath, aiPath);
        if (wall) actions.push({ type: 'wall', wall: wall });
      }

      // 预判拦截
      if (this.isOpponentAdvancing() && humanPath.length <= 5) {
        const wall = this.findInterceptWall(humanPath, aiPath);
        if (wall) actions.push({ type: 'wall', wall: wall });
      }

      // 一般性放墙
      const wall = this.findBestWall(humanPath, aiPath);
      if (wall) actions.push({ type: 'wall', wall: wall });
    }

    // 移动选项
    if (aiPath && aiPath.length > 0) {
      actions.push({ type: 'move', row: aiPath[0].row, col: aiPath[0].col });
    }

    // 备用移动
    const anyMove = this.findAnyValidMove();
    if (anyMove) actions.push(anyMove);

    return actions;
  },

  // 智能墙壁决策
  smartWallDecision(humanPath, aiPath) {
    const humanPlayer = gameState.players[0];
    const aiPlayer = gameState.players[1];

    // 策略1：对手快到达终点时，紧急阻拦
    if (humanPath.length <= 3) {
      const wall = this.findBlockingWall(humanPath, aiPath);
      if (wall) return wall;
    }

    // 策略2：对手路径比自己短很多时，放置墙壁
    if (humanPath.length < aiPath.length - 2) {
      const wall = this.findBestWall(humanPath, aiPath);
      if (wall) return wall;
    }

    // 策略3：对手正在快速前进（连续向目标移动），提前设伏
    if (this.isOpponentAdvancing() && humanPath.length <= 5) {
      const wall = this.findInterceptWall(humanPath, aiPath);
      if (wall) return wall;
    }

    // 策略4：自己领先时，偶尔放置墙壁骚扰（20%概率）
    if (aiPath.length < humanPath.length && Math.random() < 0.2) {
      const wall = this.findBestWall(humanPath, aiPath);
      if (wall) return wall;
    }

    return null;
  },

  // 判断对手是否在快速前进
  isOpponentAdvancing() {
    if (this.opponentHistory.length < 3) return false;

    const recent = this.opponentHistory.slice(-3);
    // 检查是否连续向目标移动（玩家0的目标是第8行）
    let advancing = true;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].row <= recent[i-1].row) {
        advancing = false;
        break;
      }
    }
    return advancing;
  },

  // 找到阻拦墙壁（对手快到终点时紧急放置）
  findBlockingWall(humanPath, aiPath) {
    if (!humanPath || humanPath.length < 2) return null;

    // 在对手前方放置墙壁
    const targetPos = humanPath[0]; // 对手下一步要去的位置

    // 尝试在目标位置附近放置墙壁
    const wallPositions = [
      { row: targetPos.row, col: targetPos.col, orientation: 'h' },
      { row: targetPos.row, col: targetPos.col - 1, orientation: 'h' },
      { row: targetPos.row, col: targetPos.col, orientation: 'v' },
      { row: targetPos.row - 1, col: targetPos.col, orientation: 'v' }
    ];

    for (const wall of wallPositions) {
      if (this.isValidWall(wall)) {
        // 评估这个墙壁的效果
        gameState.walls.push(wall);
        const newPath = this.findShortestPath(0);
        gameState.walls.pop();

        if (newPath && newPath.length > humanPath.length + 1) {
          return wall;
        }
      }
    }

    return null;
  },

  // 找到拦截墙壁（预测对手移动路径）
  findInterceptWall(humanPath, aiPath) {
    if (!humanPath || humanPath.length < 3) return null;

    // 在对手路径的中间位置放置墙壁
    const midIndex = Math.floor(humanPath.length / 2);
    const targetPos = humanPath[midIndex];

    const wallPositions = [
      { row: targetPos.row, col: targetPos.col, orientation: 'h' },
      { row: targetPos.row, col: targetPos.col - 1, orientation: 'h' },
      { row: targetPos.row, col: targetPos.col, orientation: 'v' },
      { row: targetPos.row - 1, col: targetPos.col, orientation: 'v' }
    ];

    for (const wall of wallPositions) {
      if (this.isValidWall(wall)) {
        gameState.walls.push(wall);
        const newPath = this.findShortestPath(0);
        gameState.walls.pop();

        if (newPath && newPath.length > humanPath.length) {
          return wall;
        }
      }
    }

    return null;
  },

  // 检查墙壁是否有效
  isValidWall(wall) {
    return !isWallOverlapping(wall) && !wouldBlockCompletely(wall);
  },

  // 找到最短路径（BFS），支持跳跃
  findShortestPath(playerIndex) {
    const player = gameState.players[playerIndex];
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const opponent = gameState.players[opponentIndex];
    const goalRow = getGoalRow(playerIndex);

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
        if (isBlocked(row, col, newRow, newCol)) continue;

        // 检查目标位置是否有对手
        if (newRow === opponent.row && newCol === opponent.col) {
          // 尝试跳跃
          const jumpRow = newRow + dr;
          const jumpCol = newCol + dc;
          const jumpKey = `${jumpRow},${jumpCol}`;

          if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE && !visited.has(jumpKey)) {
            if (!isBlocked(newRow, newCol, jumpRow, jumpCol)) {
              visited.add(jumpKey);
              queue.push({
                row: jumpRow,
                col: jumpCol,
                path: [...path, { row: jumpRow, col: jumpCol }]
              });
            }
          }
        } else {
          visited.add(key);
          queue.push({
            row: newRow,
            col: newCol,
            path: [...path, { row: newRow, col: newCol }]
          });
        }
      }
    }

    return null; // 没有路径
  },

  // 找到最佳墙壁位置（优先阻拦对手关键路径）
  findBestWall(humanPath, aiPath) {
    if (!humanPath || humanPath.length <= 1) return null;

    let bestWall = null;
    let bestScore = -Infinity;

    // 遍历所有可能的墙壁位置
    for (let row = 0; row < GRID_SIZE - 1; row++) {
      for (let col = 0; col < GRID_SIZE - 1; col++) {
        // 尝试水平墙
        const hWall = { row, col, orientation: 'h' };
        if (!isWallOverlapping(hWall) && !wouldBlockCompletely(hWall)) {
          const score = this.evaluateWall(hWall, humanPath, aiPath);
          if (score > bestScore) {
            bestScore = score;
            bestWall = hWall;
          }
        }

        // 尝试垂直墙
        const vWall = { row, col, orientation: 'v' };
        if (!isWallOverlapping(vWall) && !wouldBlockCompletely(vWall)) {
          const score = this.evaluateWall(vWall, humanPath, aiPath);
          if (score > bestScore) {
            bestScore = score;
            bestWall = vWall;
          }
        }
      }
    }

    // 放墙条件：分数大于0就考虑
    if (bestScore > 0 && bestWall) {
      return bestWall;
    }

    return null;
  },

  // 评估墙壁效果（更智能的评分）
  evaluateWall(wall, humanPath, aiPath) {
    // 临时放置墙壁
    gameState.walls.push(wall);

    // 计算放置墙壁后双方的最短路径
    const newHumanPath = this.findShortestPath(0);
    const newAiPath = this.findShortestPath(1);

    // 移除临时墙壁
    gameState.walls.pop();

    // 如果完全堵死玩家，给高分
    if (!newHumanPath) return 100;

    // 计算路径变化
    const humanPathIncrease = newHumanPath.length - humanPath.length;

    // 如果墙壁会大大增加 AI 自己的路径，降低评分
    let aiPathPenalty = 0;
    if (aiPath && newAiPath) {
      aiPathPenalty = Math.max(0, newAiPath.length - aiPath.length - 1);
    }

    // 额外奖励：如果墙壁在玩家关键路径上
    let bonus = 0;
    if (humanPath.length <= 4 && humanPathIncrease > 0) {
      // 对手快到终点时，任何阻挡都有高价值
      bonus = humanPathIncrease * 2;
    }

    // 综合评分：增加玩家路径 - 自己路径损失 + 奖励
    return humanPathIncrease - aiPathPenalty + bonus;
  },

  // 找到任何有效移动（包括跳跃）
  findAnyValidMove() {
    const player = gameState.players[1];
    const opponent = gameState.players[0];
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
                return { type: 'move', row: jumpRow, col: jumpCol };
              }
            }
          } else {
            return { type: 'move', row: newRow, col: newCol };
          }
        }
      }
    }

    return null;
  },

  // 执行移动
  executeMove(row, col) {
    const player = gameState.players[1];
    const dr = row - player.row;
    const dc = col - player.col;
    const distance = Math.abs(dr) + Math.abs(dc);

    // 判断是否跳跃（距离为2表示跳过了对手）
    const isJump = distance === 2;

    // 保存历史
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

    // 设置 lastMoveBy
    gameState.lastMoveBy = 1;

    if (checkWin()) {
      gameState.gameOver = true;
      SoundManager.playWinSound();
      showWinMessage();
      render();
      return;
    }

    switchPlayer();
    showUndoButton();
    render();
  },

  // 执行放置墙壁
  executeWall(wall) {
    const player = gameState.players[1];

    // 保存历史
    saveMoveHistory('wall', {
      player: 1,
      wall: { ...wall }
    });

    gameState.walls.push({ ...wall, player: 1 });
    player.walls--;

    SoundManager.playWallSound();

    // 设置 lastMoveBy
    gameState.lastMoveBy = 1;

    switchPlayer();
    showUndoButton();
    gameState.hoverWall = null;
    render();
  }
};
