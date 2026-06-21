#!/usr/bin/env node
// Quoridor AI 训练脚本 - Q-Learning 自对弈
const fs = require('fs');

const GRID_SIZE = 9;

// 支持命令行参数：node train.js [episodes]
const customEpisodes = parseInt(process.argv[2]) || 20000;

// 训练配置
const CONFIG = {
  episodes: customEpisodes,  // 可通过命令行指定
  maxSteps: 200,
  alpha: 0.05,
  gamma: 0.95,
  epsilonStart: 1.0,
  epsilonEnd: 0.01,
  epsilonDecay: 0.9998,
  saveInterval: 2000,
  printInterval: 500,
  logFile: 'training.log',
  qTableFile: 'qtable.json'
};

// Q表
let qTable = {};

// 训练统计
let stats = {
  totalGames: 0,
  p0Wins: 0,
  p1Wins: 0,
  avgSteps: 0,
  stepsHistory: [],
  winRateHistory: []
};

// 训练状态（支持断点续训）
let trainingState = {
  epsilon: 1.0,
  episode: 0
};

// 加载训练状态
function loadTrainingState() {
  const stateFile = 'training_state.json';
  if (fs.existsSync(stateFile)) {
    try {
      trainingState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      console.log(`已加载训练状态: 第 ${trainingState.episode} 局, ε=${trainingState.epsilon.toFixed(4)}`);
    } catch (e) {
      console.log('训练状态加载失败，从头开始');
    }
  }
}

// 保存训练状态
function saveTrainingState() {
  fs.writeFileSync('training_state.json', JSON.stringify(trainingState));
}

// ============ 游戏逻辑 ============

function createGameState() {
  return {
    players: [
      { row: 0, col: 4, walls: 10 },
      { row: 8, col: 4, walls: 10 }
    ],
    currentPlayer: 0,
    walls: [],
    gameOver: false,
    winner: -1
  };
}

function getGoalRow(playerIndex) {
  return playerIndex === 0 ? 8 : 0;
}

function isBlocked(state, fromRow, fromCol, toRow, toCol) {
  for (const wall of state.walls) {
    if (wall.orientation === 'h') {
      if (fromCol === toCol) {
        const minRow = Math.min(fromRow, toRow);
        if (wall.row === minRow && (wall.col === fromCol || wall.col === fromCol - 1)) {
          return true;
        }
      }
    } else {
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

function isWallOverlapping(state, newWall) {
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
}

function canReachGoal(state, playerIndex) {
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
        if (!isBlocked(state, row, col, newRow, newCol)) {
          if (newRow === opponent.row && newCol === opponent.col) {
            const jumpRow = row + dr * 2;
            const jumpCol = col + dc * 2;
            const jumpKey = `${jumpRow},${jumpCol}`;
            if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE && !visited.has(jumpKey)) {
              if (!isBlocked(state, newRow, newCol, jumpRow, jumpCol)) {
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

function wouldBlockCompletely(state, wall) {
  state.walls.push(wall);
  const canP0 = canReachGoal(state, 0);
  const canP1 = canReachGoal(state, 1);
  state.walls.pop();
  return !canP0 || !canP1;
}

function findShortestPath(state, playerIndex) {
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
      if (isBlocked(state, row, col, newRow, newCol)) continue;

      if (newRow === opponent.row && newCol === opponent.col) {
        const jumpRow = newRow + dr;
        const jumpCol = newCol + dc;
        const jumpKey = `${jumpRow},${jumpCol}`;
        let straightBlocked = false;

        if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE && !visited.has(jumpKey)) {
          if (!isBlocked(state, newRow, newCol, jumpRow, jumpCol)) {
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
            if (isBlocked(state, opponent.row, opponent.col, sideRow, sideCol)) continue;
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
}

function getAllValidMoves(state, playerIndex) {
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
    if (isBlocked(state, player.row, player.col, newRow, newCol)) continue;

    if (newRow === opponent.row && newCol === opponent.col) {
      const jumpRow = newRow + dr;
      const jumpCol = newCol + dc;
      const jumpKey = `${jumpRow},${jumpCol}`;
      let straightBlocked = false;
      if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE
          && !isBlocked(state, newRow, newCol, jumpRow, jumpCol) && !seen.has(jumpKey)) {
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
          if (isBlocked(state, opponent.row, opponent.col, sideRow, sideCol)) continue;
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
}

// ============ AI 逻辑 ============

function getStateKey(state) {
  const p0 = state.players[0];
  const p1 = state.players[1];
  
  // 加入墙壁布局（关键信息）
  const wallSig = state.walls.map(w => `${w.row}${w.col}${w.orientation}`).sort().join(',');
  
  // 加入距离目标的步数（评估特征）
  const p0Goal = getGoalRow(0);
  const p1Goal = getGoalRow(1);
  const p0Dist = Math.abs(p0.row - p0Goal);
  const p1Dist = Math.abs(p1.row - p1Goal);
  
  // 加入剩余墙数（资源信息）
  const wallsLeft = `${p0.walls}-${p1.walls}`;
  
  // 组合状态 key
  return `${p0.row},${p0.col}-${p1.row},${p1.col}-d${p0Dist},${p1Dist}-w${wallsLeft}-${wallSig}`;
}

function getActionKey(action) {
  if (action.type === 'move') {
    return `move-${action.row}-${action.col}`;
  } else {
    return `wall-${action.wall.row}-${action.wall.col}-${action.wall.orientation}`;
  }
}

function getQValue(stateKey, actionKey) {
  const key = `${stateKey}|${actionKey}`;
  return qTable[key] || 0;
}

function setQValue(stateKey, actionKey, value) {
  const key = `${stateKey}|${actionKey}`;
  qTable[key] = value;
}

function collectPossibleActions(state, playerIndex) {
  const actions = [];
  const player = state.players[playerIndex];
  const aiPath = findShortestPath(state, playerIndex);

  // 移动选项
  const allMoves = getAllValidMoves(state, playerIndex);
  if (aiPath && aiPath.length > 0) {
    actions.push({ type: 'move', row: aiPath[0].row, col: aiPath[0].col });
  }
  // 添加其他移动选项
  for (const move of allMoves) {
    if (!actions.some(a => a.type === 'move' && a.row === move.row && a.col === move.col)) {
      actions.push(move);
    }
  }

  // 放墙选项
  if (player.walls > 0) {
    for (let row = 0; row < GRID_SIZE - 1; row++) {
      for (let col = 0; col < GRID_SIZE - 1; col++) {
        for (const orientation of ['h', 'v']) {
          const wall = { row, col, orientation };
          if (!isWallOverlapping(state, wall) && !wouldBlockCompletely(state, wall)) {
            actions.push({ type: 'wall', wall });
          }
        }
      }
    }
  }

  return actions;
}

function chooseAction(state, playerIndex, epsilon) {
  const actions = collectPossibleActions(state, playerIndex);
  if (actions.length === 0) return null;

  // ε-greedy 策略
  if (Math.random() < epsilon) {
    return actions[Math.floor(Math.random() * actions.length)];
  }

  // 选择 Q 值最高的动作
  const stateKey = getStateKey(state);
  let bestAction = actions[0];
  let bestQ = -Infinity;

  for (const action of actions) {
    const actionKey = getActionKey(action);
    const q = getQValue(stateKey, actionKey);
    if (q > bestQ) {
      bestQ = q;
      bestAction = action;
    }
  }

  return bestAction;
}

function executeAction(state, action, playerIndex) {
  if (action.type === 'move') {
    state.players[playerIndex].row = action.row;
    state.players[playerIndex].col = action.col;
  } else if (action.type === 'wall') {
    state.walls.push({ ...action.wall, player: playerIndex });
    state.players[playerIndex].walls--;
  }

  // 检查胜利
  if (state.players[playerIndex].row === getGoalRow(playerIndex)) {
    state.gameOver = true;
    state.winner = playerIndex;
  }

  // 切换玩家
  state.currentPlayer = playerIndex === 0 ? 1 : 0;
}

function calculateReward(state, playerIndex, winner) {
  if (winner === playerIndex) return 1.0;
  if (winner === 1 - playerIndex) return -1.0;

  // 中间奖励：基于路径差
  const myPath = findShortestPath(state, playerIndex);
  const oppPath = findShortestPath(state, 1 - playerIndex);
  if (myPath && oppPath) {
    return (oppPath.length - myPath.length) * 0.01;
  }
  return 0;
}

// ============ 训练主循环 ============

function train() {
  console.log('=== Quoridor AI 训练开始 ===');
  console.log(`配置: ${CONFIG.episodes} 局, 学习率=${CONFIG.alpha}, 折扣=${CONFIG.gamma}`);
  console.log('');

  // 加载已有 Q 表
  if (fs.existsSync(CONFIG.qTableFile)) {
    try {
      qTable = JSON.parse(fs.readFileSync(CONFIG.qTableFile, 'utf8'));
      console.log(`已加载 Q 表: ${Object.keys(qTable).length} 条目`);
    } catch (e) {
      console.log('Q 表加载失败，从头开始训练');
    }
  }

  // 加载训练状态（支持断点续训）
  loadTrainingState();
  let epsilon = trainingState.epsilon;
  let startEpisode = trainingState.episode + 1;
  
  // 如果指定了新局数，调整结束位置
  const endEpisode = startEpisode + CONFIG.episodes - 1;
  console.log(`从第 ${startEpisode} 局继续，目标: ${endEpisode} 局`);
  console.log(`当前 ε=${epsilon.toFixed(4)}`);
  console.log('');

  const startTime = Date.now();

  for (let episode = startEpisode; episode <= endEpisode; episode++) {
    const state = createGameState();
    let step = 0;
    const episodeHistory = []; // [(stateKey, actionKey, playerIndex), ...]

    while (!state.gameOver && step < CONFIG.maxSteps) {
      const currentPlayer = state.currentPlayer;
      const stateKey = getStateKey(state);

      // 选择动作
      const action = chooseAction(state, currentPlayer, epsilon);
      if (!action) break;

      const actionKey = getActionKey(action);

      // 执行动作
      executeAction(state, action, currentPlayer);

      // 记录经验
      episodeHistory.push({ stateKey, actionKey, playerIndex: currentPlayer });

      step++;
    }

    // 计算最终奖励并更新 Q 表（反向传播）
    const winner = state.winner;
    const discount = Math.pow(CONFIG.gamma, episodeHistory.length);

    for (let i = episodeHistory.length - 1; i >= 0; i--) {
      const { stateKey, actionKey, playerIndex } = episodeHistory[i];
      const reward = calculateReward(state, playerIndex, winner);

      // 蒙特卡洛回报（简化版）
      let returnVal = reward * discount;

      const oldQ = getQValue(stateKey, actionKey);
      const newQ = oldQ + CONFIG.alpha * (returnVal - oldQ);
      setQValue(stateKey, actionKey, newQ);
    }

    // 更新统计
    stats.totalGames++;
    if (winner === 0) stats.p0Wins++;
    if (winner === 1) stats.p1Wins++;
    stats.stepsHistory.push(step);
    if (stats.stepsHistory.length > 100) stats.stepsHistory.shift();

    // 衰减探索率
    epsilon = Math.max(CONFIG.epsilonEnd, epsilon * CONFIG.epsilonDecay);

    // 打印进度
    if (episode % CONFIG.printInterval === 0) {
      const avgSteps = stats.stepsHistory.reduce((a, b) => a + b, 0) / stats.stepsHistory.length;
      const p1WinRate = (stats.p1Wins / stats.totalGames * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const qSize = Object.keys(qTable).length;

      const logLine = `[${episode}/${endEpisode}] ε=${epsilon.toFixed(4)} | P1胜率=${p1WinRate}% | 平均步数=${avgSteps.toFixed(1)} | Q表=${qSize}条 | 耗时=${elapsed}s`;
      console.log(logLine);

      fs.appendFileSync(CONFIG.logFile, logLine + '\n');
    }

    // 保存 Q 表和训练状态
    if (episode % CONFIG.saveInterval === 0) {
      saveQTable();
      trainingState.epsilon = epsilon;
      trainingState.episode = episode;
      saveTrainingState();
    }
  }

  // 最终保存
  saveQTable();
  trainingState.epsilon = epsilon;
  trainingState.episode = endEpisode;
  saveTrainingState();

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('=== 训练完成 ===');
  console.log(`总耗时: ${totalTime}s`);
  console.log(`总局数: ${stats.totalGames}`);
  console.log(`Q 表条目: ${Object.keys(qTable).length}`);
}

function saveQTable() {
  // 压缩 Q 表：只保留绝对值 > 0.01 的条目（更严格的阈值）
  const compressed = {};
  for (const [key, value] of Object.entries(qTable)) {
    if (Math.abs(value) > 0.01) {
      compressed[key] = Math.round(value * 10000) / 10000;
    }
  }

  fs.writeFileSync(CONFIG.qTableFile, JSON.stringify(compressed));
  console.log(`Q 表已保存: ${Object.keys(compressed).length} 条目`);
}

// 运行训练
train();