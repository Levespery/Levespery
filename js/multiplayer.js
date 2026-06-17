// Supabase 配置
const SUPABASE_URL = 'https://grdbmpokcrtbzibliopc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Vv4Bu44IZU2qmE0pH48OUA_2mHx5rNJ';

// 初始化 Supabase 客户端
let supabaseClient = null;
let supabaseReady = false;

function initSupabase() {
  console.log('正在初始化 Supabase...');
  console.log('window.supabase:', typeof window.supabase);

  try {
    if (window.supabase && window.supabase.createClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      supabaseReady = true;
      console.log('Supabase 初始化成功');
      return true;
    } else {
      console.error('Supabase SDK 未加载，请检查 supabase.min.js 文件');
      alert('联机服务加载失败，请刷新页面重试');
      return false;
    }
  } catch (error) {
    console.error('Supabase 初始化失败:', error);
    alert('联机服务初始化失败: ' + error.message);
    return false;
  }
}

// 页面加载后初始化
window.addEventListener('DOMContentLoaded', () => {
  // 延迟一点确保 SDK 已加载
  setTimeout(async () => {
    initSupabase();
    // 初始化完成后获取房间列表并订阅
    setTimeout(() => {
      if (supabaseReady) {
        fetchRoomList();
        subscribeRoomList();
      }
    }, 200);

    // 尝试断线重连
    setTimeout(async () => {
      if (supabaseReady) {
        const reconnected = await attemptReconnect();
        if (!reconnected) {
          // 重连失败，清理过期房间
          cleanupStaleRooms();
        }
      }
    }, 500);
  }, 100);
});

// 联机状态
let multiplayerState = {
  isOnline: false,
  isHost: false,
  myPlayerIndex: 0,
  roomName: null,      // 改自 roomCode
  roomId: null,
  subscription: null,
  listSubscription: null  // 新增：房间列表订阅
};

// 人机对战状态
let aiMode = false;

// 对手离开提示标志（防止重复提示）
let opponentLeftNotified = false;

// 缓存最新游戏状态，供 leaveRoomSync（浏览器关闭时的同步请求）使用
let cachedGameState = null;

// 心跳定时器
let heartbeatTimer = null;
const HEARTBEAT_INTERVAL = 10000; // 10秒心跳间隔
const HEARTBEAT_TIMEOUT = 25000;  // 25秒无心跳认为对方离线

// #region agent log
const _DBG = 'http://127.0.0.1:7337/ingest/6c759ce4-4672-4e6a-ac30-de089d8ba20c';
const _SID = '6c759ce4-4672-4e6a-ac30-de089d8ba20c';
function _dbg(loc, msg, data) {
  fetch(_DBG, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': _SID },
    body: JSON.stringify({ sessionId: _SID, location: loc, message: msg, data: data || {}, timestamp: Date.now() })
  }).catch(() => {});
}
// #endregion

// 创建房间
async function createRoom() {
  console.log('点击创建房间');
  console.log('supabaseReady:', supabaseReady);
  console.log('supabaseClient:', supabaseClient);

  if (!supabaseReady || !supabaseClient) {
    alert('联机服务未加载，请刷新页面重试');
    return;
  }

  // 显示创建房间界面
  showCreateRoom();
}

// 显示创建房间界面
function showCreateRoom() {
  document.getElementById('room-container').style.display = 'none';
  document.getElementById('create-room-container').style.display = 'block';
  document.getElementById('room-name-input').value = '';
  document.getElementById('room-name-input').focus();
}

// 取消创建房间
function cancelCreateRoom() {
  document.getElementById('create-room-container').style.display = 'none';
  document.getElementById('room-container').style.display = 'block';
}

// 显示加入房间界面
function showJoinRoom() {
  document.getElementById('room-container').style.display = 'none';
  document.getElementById('join-room-container').style.display = 'block';
  fetchRoomList();
}

// 取消加入房间
function cancelJoinRoom() {
  document.getElementById('join-room-container').style.display = 'none';
  document.getElementById('room-container').style.display = 'block';
}

// 确认创建房间
async function confirmCreateRoom() {
  const roomName = document.getElementById('room-name-input').value.trim();
  
  if (!roomName) {
    alert('请输入房间名称');
    return;
  }

  if (roomName.length > 20) {
    alert('房间名称不能超过20个字符');
    return;
  }

  console.log('创建房间:', roomName);

  // 检查房间名称是否与任何活跃房间重复
  try {
    const { data: existingRooms } = await supabaseClient
      .from('rooms')
      .select('id, room_name, game_state, created_at')
      .eq('room_name', roomName);

    if (existingRooms && existingRooms.length > 0) {
      const now = Date.now();
      const ROOM_EXPIRE_MS = 5 * 60 * 1000;
      // 只检查未过期的活跃房间
      const activeDuplicate = existingRooms.some(r => {
        const gs = r.game_state || {};
        const age = now - new Date(r.created_at).getTime();
        const bothInactive = gs.hostActive === false && gs.guestActive === false;
        const expired = !gs.player2Joined && age > ROOM_EXPIRE_MS;
        return !bothInactive && !expired;
      });
      if (activeDuplicate) {
        alert('房间名称已被使用，请使用其他名称');
        return;
      }
    }
  } catch (checkErr) {
    console.error('检查房间名称失败:', checkErr);
  }

  // 随机分配颜色：hostColor 为房主的棋子颜色 (0=黑, 1=白)
  const hostColor = Math.random() < 0.5 ? 0 : 1;

  const initialGameState = {
    players: [
      { row: 0, col: 4, walls: 10 },
      { row: 8, col: 4, walls: 10 }
    ],
    currentPlayer: 0,
    walls: [],
    gameOver: false,
    hostColor: hostColor,
    player2Joined: false,
    hostActive: true,
    guestActive: false
  };

  try {
    const { data, error } = await supabaseClient
      .from('rooms')
      .insert({
        room_name: roomName,
        game_state: initialGameState
      })
      .select()
      .single();

    if (error) {
      console.error('数据库错误:', error);
      if (error.code === '23505') { // 唯一约束冲突
        alert('房间名称已存在，请使用其他名称');
      } else {
        alert('创建房间失败: ' + error.message);
      }
      return;
    }

    console.log('房间创建成功:', data);

    multiplayerState = {
      isOnline: true,
      isHost: true,
      myPlayerIndex: hostColor,
      roomName: roomName,
      roomId: data.id,
      subscription: null,
      listSubscription: null
    };

    showWaitingRoom(roomName);
    subscribeToRoom(data.id);

    // 保存房间状态到 localStorage（支持断线重连）
    saveRoomState();

    // 启动心跳
    startHeartbeat();

  } catch (error) {
    console.error('创建房间失败:', error);
    alert('创建房间失败: ' + (error.message || '请检查 Supabase 配置'));
  }
}

// 加入房间防重复点击
let joiningRoom = false;

// 加入房间
async function joinRoomByName(roomId, roomName) {
  if (joiningRoom) return;
  if (!supabaseClient) {
    alert('联机服务未初始化，请刷新页面重试');
    return;
  }
  joiningRoom = true;

  console.log('加入房间:', roomName, 'ID:', roomId);

  // 先取消房间列表订阅，防止旧回调干扰加入流程
  unsubscribeRoomList();

  try {
    const { data, error } = await supabaseClient
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (error || !data) {
      console.error('查询错误:', error);
      alert('房间不存在');
      return;
    }

    console.log('找到房间:', data);

    // 检查房间是否已满
    if (data.game_state.player2Joined) {
      alert('房间已满，无法加入');
      return;
    }

    // 根据 hostColor 计算加入者的颜色
    const hostColor = data.game_state.hostColor !== undefined ? data.game_state.hostColor : 0;
    const joinerColor = 1 - hostColor;

    multiplayerState = {
      isOnline: true,
      isHost: false,
      myPlayerIndex: joinerColor,
      roomName: roomName,
      roomId: data.id,
      subscription: null,
      listSubscription: null
    };

    // 更新游戏状态，重置棋盘并标记玩家已加入
    const updatedState = {
      players: [
        { row: 0, col: 4, walls: 10 },
        { row: 8, col: 4, walls: 10 }
      ],
      currentPlayer: 0,
      walls: [],
      gameOver: false,
      positionsSwapped: false,
      lastMoveBy: -1,
      hostColor: data.game_state.hostColor,
      player2Joined: true,
      guestActive: true,
      hostActive: true,
      guestLastHeartbeat: Date.now(),
      lastHeartbeat: Date.now()
    };

    await supabaseClient
      .from('rooms')
      .update({ game_state: updatedState })
      .eq('id', data.id);

    // 设置缓存状态，供广播使用
    cachedGameState = { ...updatedState };

    startGame(updatedState, true);
    subscribeToRoom(data.id);

    // 保存房间状态到 localStorage（支持断线重连）
    saveRoomState();

    // 启动心跳
    startHeartbeat();

    joiningRoom = false;
  } catch (error) {
    joiningRoom = false;
    console.error('加入房间失败:', error);
    alert('加入房间失败: ' + (error.message || '请检查网络连接'));
  }
}

// 获取房间列表
async function fetchRoomList() {
  if (!supabaseReady || !supabaseClient) {
    console.log('Supabase 未就绪，跳过获取房间列表');
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('rooms')
      .select('id, room_name, game_state, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('获取房间列表失败:', error);
      return;
    }

    const now = Date.now();
    const ROOM_EXPIRE_MS = 5 * 60 * 1000; // 5分钟过期
    const activeRooms = [];
    const staleIds = [];

    for (const room of data) {
      const gs = room.game_state || {};
      const createdAt = new Date(room.created_at).getTime();
      const age = now - createdAt;

      // 判断房间是否需要清理：
      // 1. 双方都不在线
      // 2. 房主已离开（guest 留下的孤儿房间）
      // 3. 无 active 字段的旧房间超过5分钟
      // 4. 等待中的房间超过5分钟
      const bothInactive = gs.hostActive === false && gs.guestActive === false;
      const hostLeft = gs.hostActive === false && gs.player2Joined;
      const noActiveField = gs.hostActive === undefined && gs.guestActive === undefined && age > ROOM_EXPIRE_MS;
      const waitingExpired = !gs.player2Joined && gs.hostActive !== false && age > ROOM_EXPIRE_MS;

      if (bothInactive || hostLeft || noActiveField || waitingExpired) {
        staleIds.push(room.id);
      } else {
        activeRooms.push(room);
      }
    }

    // 异步清理过期房间（不阻塞渲染）
    if (staleIds.length > 0) {
      console.log(`清理 ${staleIds.length} 个过期房间`);
      for (const id of staleIds) {
        supabaseClient.from('rooms').delete().eq('id', id).then(() => {});
      }
    }

    renderRoomList(activeRooms);
  } catch (error) {
    console.error('获取房间列表错误:', error);
  }
}

// 渲染房间列表
function renderRoomList(rooms) {
  const roomList = document.getElementById('room-list');
  if (!roomList) return;

  if (!rooms || rooms.length === 0) {
    roomList.innerHTML = '<p class="room-list-empty">目前无房间</p>';
    return;
  }

  // 分离等待中、游戏中、对手已离开的房间
  const waitingRooms = rooms.filter(r => !r.game_state.player2Joined);
  const playingRooms = rooms.filter(r => r.game_state.player2Joined && r.game_state.guestActive !== false);
  const guestLeftRooms = rooms.filter(r => r.game_state.player2Joined && r.game_state.guestActive === false);

  let html = '';

  if (waitingRooms.length > 0) {
    html += waitingRooms.map(room => `
    <div class="room-item">
      <span class="room-item-name">${room.room_name}</span>
      <span class="room-item-status">等待中</span>
      <button class="room-item-join" onclick="joinRoomByName('${room.id}', '${room.room_name}')">加入</button>
    </div>
  `).join('');
  }

  if (guestLeftRooms.length > 0) {
    html += guestLeftRooms.map(room => `
    <div class="room-item">
      <span class="room-item-name">${room.room_name}</span>
      <span class="room-item-status" style="color:#e17055">对手已离开</span>
      <button class="room-item-join" onclick="joinRoomByName('${room.id}', '${room.room_name}')">加入</button>
    </div>
  `).join('');
  }

  if (playingRooms.length > 0) {
    html += playingRooms.map(room => `
    <div class="room-item">
      <span class="room-item-name">${room.room_name}</span>
      <span class="room-item-status" style="color:#e17055">游戏中</span>
    </div>
  `).join('');
  }

  if (!html) {
    html = '<p class="room-list-empty">暂无可用房间</p>';
  }

  roomList.innerHTML = html;
}

// 订阅房间列表变化
function subscribeRoomList() {
  if (!supabaseReady || !supabaseClient) return;

  multiplayerState.listSubscription = supabaseClient
    .channel('room-list')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'rooms'
      },
      () => {
        // 房间列表变化时重新获取
        fetchRoomList();
      }
    )
    .subscribe();
}

// 取消订阅房间列表
function unsubscribeRoomList() {
  if (multiplayerState.listSubscription) {
    supabaseClient.removeChannel(multiplayerState.listSubscription);
    multiplayerState.listSubscription = null;
  }
}

// 订阅房间变化（使用 Broadcast + Presence，不依赖 postgres_changes）
function subscribeToRoom(roomId) {
  const channel = supabaseClient.channel(`room-${roomId}`, {
    config: { presence: { key: multiplayerState.isHost ? 'host' : 'guest' } }
  });

  channel
    .on('broadcast', { event: 'state_update' }, ({ payload }) => {
      // #region agent log
      _dbg('multiplayer.js:subscribeToRoom', 'broadcast:state_update', { currentPlayer: payload.state?.currentPlayer, gameOver: payload.state?.gameOver });
      // #endregion
      handleGameStateUpdate(payload.state);
    })
    .on('broadcast', { event: 'room_deleted' }, () => {
      // #region agent log
      _dbg('multiplayer.js:subscribeToRoom', 'broadcast:room_deleted', {});
      // #endregion
      if (multiplayerState.isOnline && !multiplayerState.isHost) {
        showToast('对手已离开房间');
        showOpponentLeftModal();
      }
    })
    .on('broadcast', { event: 'guest_left' }, () => {
      // #region agent log
      _dbg('multiplayer.js:subscribeToRoom', 'broadcast:guest_left', {});
      // #endregion
      if (multiplayerState.isOnline && multiplayerState.isHost) {
        showToast('对手已离开房间');
        if (!gameState || !gameState.gameOver) {
          showOpponentLeftModal();
        }
      }
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      // #region agent log
      _dbg('multiplayer.js:subscribeToRoom', 'presence:leave', { key });
      // #endregion
      if (multiplayerState.isOnline) {
        const isOpponent = (multiplayerState.isHost && key === 'guest') || (!multiplayerState.isHost && key === 'host');
        if (isOpponent) {
          showToast('对手已离开房间');
          stopHeartbeat();
          if (!gameState || !gameState.gameOver) {
            showOpponentLeftModal();
          }
        }
      }
    })
    .on('presence', { event: 'join' }, ({ key }) => {
      // #region agent log
      _dbg('multiplayer.js:subscribeToRoom', 'presence:join', { key });
      // #endregion
      const isOpponent = (multiplayerState.isHost && key === 'guest') || (!multiplayerState.isHost && key === 'host');
      if (isOpponent && multiplayerState.isOnline) {
        document.getElementById('opponent-left-modal').classList.remove('show');
        cancelOpponentWait();
        showToast('对手已加入');

        // 如果是房主，检查是否需要重置游戏状态（新玩家加入）
        if (multiplayerState.isHost && cachedGameState && !cachedGameState.player2Joined) {
          // 新玩家加入，重置游戏
          resetGame();
          syncGameState();
        }
      }
    })
    .subscribe(async (status) => {
      // #region agent log
      _dbg('multiplayer.js:subscribeToRoom', 'subscribe status', { status });
      // #endregion
      if (status === 'SUBSCRIBED') {
        await channel.track({
          online_at: new Date().toISOString(),
          role: multiplayerState.isHost ? 'host' : 'guest'
        });

        // 订阅成功后，如果是加入者，发送广播通知房主
        if (!multiplayerState.isHost && cachedGameState) {
          setTimeout(() => {
            channel.send({
              type: 'broadcast',
              event: 'state_update',
              payload: { state: cachedGameState }
            });
          }, 300);
        }
      }
    });

  multiplayerState.subscription = channel;
}

// 处理游戏状态更新（来自 Broadcast，不含自己的操作）
function handleGameStateUpdate(newState) {

  // #region agent log
  _dbg('multiplayer.js:handleGameStateUpdate', '收到更新', { gameOver: newState.gameOver, currentPlayer: newState.currentPlayer, hostActive: newState.hostActive, guestActive: newState.guestActive, player2Joined: newState.player2Joined });
  // #endregion

  // 缓存最新状态
  const oldState = cachedGameState ? { ...cachedGameState } : null;
  cachedGameState = { ...newState };

  // 更新对方心跳时间
  if (multiplayerState.isHost) {
    cachedGameState.guestLastHeartbeat = Date.now();
  } else {
    cachedGameState.hostLastHeartbeat = Date.now();
  }

  // ── 对手离开/回来检测（在 gameState 空检查之前，确保即使未初始化也能响应）──
  const imHost = multiplayerState.isHost;
  const opponentLeft = imHost ? (newState.guestActive === false) : (newState.hostActive === false);

  if (opponentLeft && newState.player2Joined && !opponentLeftNotified) {
    opponentLeftNotified = true;
    // 停止心跳，防止过期状态覆盖对手的离开标记
    stopHeartbeat();
    if (newState.gameOver) {
      // 游戏已结束，对手离开：只显示 toast，不阻断胜负流程
      showToast('对手已离开房间');
    } else {
      // 游戏进行中：显示 toast + 弹窗
      showToast('对手已离开房间');
      showOpponentLeftModal();
      return;
    }
  }

  // 检测对方回来了（之前离开，现在重新在线）
  if (oldState && newState.player2Joined) {
    const opponentWasOffline = imHost
      ? (oldState.guestActive === false)
      : (oldState.hostActive === false);
    const opponentNowOnline = imHost
      ? (newState.guestActive === true)
      : (newState.hostActive === true);
    if (opponentWasOffline && opponentNowOnline) {
      opponentLeftNotified = false;
      document.getElementById('opponent-left-modal').classList.remove('show');
      cancelOpponentWait();
      showToast('对方已回来，游戏继续');
      if (gameState) {
        updateTurnIndicator();
      }
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
      reassertActive();
    }
  }

  // 如果玩家加入，房主自动进入游戏
  if (newState.player2Joined && document.getElementById('waiting-container').style.display !== 'none') {
    console.log('玩家2已加入，房主进入游戏');
    startGame(newState, true);
    return;
  }

  // ── 以下为游戏中的状态同步，必须有 gameState ──
  if (!gameState) return;

  // 在更新 gameState 之前保存旧的 gameOver 状态
  const wasGameOver = gameState.gameOver;

  // 检测再来一局请求
  if (newState.restartRequest !== undefined && newState.restartRequest !== multiplayerState.myPlayerIndex) {
    showRestartNotify();
    return;
  }

  // 如果游戏状态是新局（gameOver=false 且之前是 game over），说明对方同意了再来一局
  if (!newState.gameOver && gameState.gameOver) {
    document.getElementById('win-modal').classList.remove('show');
    document.getElementById('restart-notify').style.display = 'none';
    restartRequested = false;
    const restartBtn = document.getElementById('btn-restart');
    if (restartBtn) restartBtn.textContent = '再来一局';

    // 再来一局时更新颜色分配
    if (newState.hostColor !== undefined) {
      const myColor = multiplayerState.isHost ? newState.hostColor : (1 - newState.hostColor);
      multiplayerState.myPlayerIndex = myColor;
      perspectiveFlipped = (myColor === 0) !== (newState.positionsSwapped || false);
      document.getElementById('player-role').textContent =
        `你是${myColor === 0 ? '黑' : '白'}方`;
      document.getElementById('player-role').style.color =
        myColor === 0 ? '#1a1a1a' : '#999';
    }

    // 对方同意后播放开局音效
    SoundManager.playStartSound();
  }

  // 检测对方悔棋（lastMoveBy 变为 -1）
  const opponentUndone = newState.lastMoveBy === -1 && gameState.lastMoveBy >= 0;

  // 更新游戏状态
  gameState.players = newState.players;
  gameState.currentPlayer = newState.currentPlayer;
  gameState.walls = newState.walls;
  gameState.gameOver = newState.gameOver;
  gameState.winner = newState.winner;
  gameState.lastMoveBy = newState.lastMoveBy !== undefined ? newState.lastMoveBy : -1;
  if (newState.positionsSwapped !== undefined) {
    gameState.positionsSwapped = newState.positionsSwapped;
  }

  // 对方悔棋提示
  if (opponentUndone) {
    const indicator = document.getElementById('turn-indicator');
    if (newState.currentPlayer === multiplayerState.myPlayerIndex) {
      // 轮到自己了
      indicator.textContent = '轮到你了';
      indicator.style.background = '#c8e6c9';
    } else {
      // 轮到对方
      indicator.textContent = '悔棋，轮到对方了';
      indicator.style.background = '#fff3cd';
    }
    SoundManager.playUndoSound();
  }

  // 同步显示悔棋按钮
  showUndoButton();

  // 更新界面（对方悔棋时不更新回合指示器，保留悔棋提示）
  if (!opponentUndone) {
    updateTurnIndicator();
  }
  updateWallCounts();
  updateModeHint();
  render();

  // 检测对手操作并播放音效
  if (oldState && !opponentUndone) {
    // 对方放墙
    const oldWalls = oldState.walls ? oldState.walls.length : 0;
    const newWalls = newState.walls ? newState.walls.length : 0;
    if (newWalls > oldWalls) {
      SoundManager.playWallSound();
    }
    // 对方移动棋子
    const oldPlayers = oldState.players || [];
    const newPlayers = newState.players || [];
    let movedPlayerIdx = -1;
    for (let i = 0; i < newPlayers.length; i++) {
      if (oldPlayers[i] &&
        (oldPlayers[i].row !== newPlayers[i].row || oldPlayers[i].col !== newPlayers[i].col)) {
        movedPlayerIdx = i;
        break;
      }
    }
    if (movedPlayerIdx >= 0) {
      const oldP = oldPlayers[movedPlayerIdx];
      const newP = newPlayers[movedPlayerIdx];
      const dist = Math.abs(newP.row - oldP.row) + Math.abs(newP.col - oldP.col);
      if (dist >= 2) {
        SoundManager.playJumpSound();
      } else {
        SoundManager.playMoveSound();
      }
    }
  }

  // 检查游戏结束
  if (newState.gameOver && !wasGameOver) {
    SoundManager.playWinSound();
    showWinMessage(newState.winner);
  }
}

// 显示再来一局通知
function showRestartNotify() {
  const notify = document.getElementById('restart-notify');
  if (notify) {
    notify.style.display = 'block';
  }
}

// 对方离开倒计时
let opponentWaitTimer = null;
let opponentWaitCountdown = null;
let opponentLeftTime = 0;

// 显示对方已离开弹窗
function showOpponentLeftModal() {
  // 关闭再来一局界面（如果有）
  document.getElementById('win-modal').classList.remove('show');
  document.getElementById('restart-notify').style.display = 'none';
  restartRequested = false;
  const restartBtn = document.getElementById('btn-restart');
  if (restartBtn) restartBtn.textContent = '再来一局';

  // 记录对手离开时间，开始30秒倒计时
  opponentLeftTime = Date.now();

  // 重置弹窗状态 - 直接显示倒计时和两个按钮
  document.getElementById('opponent-left-title').textContent = '对方已离开';
  document.getElementById('opponent-left-desc').textContent = '你的对手已离开房间';
  document.getElementById('opponent-left-waiting').style.display = 'none';
  document.getElementById('opponent-left-buttons').innerHTML = `
    <button class="btn btn-restart" onclick="startWaitingForOpponent()">等待对手</button>
    <button class="btn" onclick="leaveGame()">返回大厅</button>
  `;

  document.getElementById('opponent-left-modal').classList.add('show');

  // 立即开始倒计时
  _startOpponentLeftCountdown();
}

// 内部：启动倒计时（从剩余时间开始）
function _startOpponentLeftCountdown() {
  cancelOpponentWait();

  const countdownEl = document.getElementById('opponent-left-countdown');
  const elapsed = Math.floor((Date.now() - opponentLeftTime) / 1000);
  let remaining = Math.max(30 - elapsed, 0);
  countdownEl.textContent = remaining;

  if (remaining <= 0) {
    showOpponentOffline();
    return;
  }

  opponentWaitCountdown = setInterval(() => {
    remaining--;
    countdownEl.textContent = remaining;

    if (remaining <= 0) {
      clearInterval(opponentWaitCountdown);
      opponentWaitCountdown = null;
      showOpponentOffline();
    }
  }, 1000);
}

// 开始等待对手（30秒倒计时）
function startWaitingForOpponent() {
  // 切换到等待状态 - 显示倒计时和加载动画
  document.getElementById('opponent-left-waiting').style.display = 'block';
  document.getElementById('opponent-left-buttons').innerHTML = `
    <button class="btn" onclick="leaveGame()">返回大厅</button>
  `;

  // 房主：保持游戏界面，声明自己仍在线
  if (multiplayerState.isHost && multiplayerState.roomId && supabaseClient) {
    const indicator = document.getElementById('turn-indicator');
    indicator.textContent = '等待对手返回...';
    indicator.style.background = '#fff3cd';

    supabaseClient
      .from('rooms')
      .select('game_state')
      .eq('id', multiplayerState.roomId)
      .single()
      .then(({ data: room }) => {
        if (!room) return;
        const gs = { ...room.game_state };
        gs.hostActive = true;
        gs.guestActive = false;
        gs.lastHeartbeat = Date.now();
        delete gs.restartRequest;
        supabaseClient
          .from('rooms')
          .update({ game_state: gs })
          .eq('id', multiplayerState.roomId);
        cachedGameState = gs;
      })
      .catch(() => {});
  }

  // 倒计时已在 showOpponentLeftModal 中启动，此处无需重复
}

// 显示对方已离线（只有返回大厅选项）
function showOpponentOffline() {
  document.getElementById('opponent-left-title').textContent = '对方已离线';
  document.getElementById('opponent-left-desc').textContent = '对手已长时间未响应';
  document.getElementById('opponent-left-waiting').style.display = 'none';
  document.getElementById('opponent-left-buttons').innerHTML = `
    <button class="btn" onclick="leaveGame()">返回大厅</button>
  `;
}

// 取消等待
function cancelOpponentWait() {
  if (opponentWaitCountdown) {
    clearInterval(opponentWaitCountdown);
    opponentWaitCountdown = null;
  }
}

// 临时 toast 提示（自动消失）
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

// 同步游戏状态到服务器（Broadcast 广播 + DB 持久化）
async function syncGameState() {
  if (!multiplayerState.isOnline) return;

  // #region agent log
  _dbg('multiplayer.js:syncGameState', '同步状态', { gameOver: gameState.gameOver, currentPlayer: gameState.currentPlayer });
  // #endregion
  const stateToSync = {
    players: gameState.players,
    currentPlayer: gameState.currentPlayer,
    walls: gameState.walls,
    gameOver: gameState.gameOver,
    winner: gameState.winner,
    lastMoveBy: gameState.lastMoveBy,
    hostColor: multiplayerState.isHost ? multiplayerState.myPlayerIndex : (1 - multiplayerState.myPlayerIndex),
    positionsSwapped: gameState.positionsSwapped || false,
    player2Joined: true,
    hostActive: true,
    guestActive: true,
    lastHeartbeat: Date.now()
  };

  // 1) 通过 Broadcast 实时发送给对手（不回传给自己）
  if (multiplayerState.subscription) {
    multiplayerState.subscription.send({
      type: 'broadcast',
      event: 'state_update',
      payload: { state: stateToSync }
    });
  }

  // 2) 同时写入 DB 供持久化和重连恢复
  try {
    const { error } = await supabaseClient
      .from('rooms')
      .update({ game_state: stateToSync })
      .eq('id', multiplayerState.roomId);

    if (error) {
      console.error('同步状态失败:', error);
    } else {
      cachedGameState = { ...stateToSync };
    }
  } catch (error) {
    console.error('同步状态错误:', error);
  }
}

// 显示等待房间
function showWaitingRoom(roomName) {
  document.getElementById('room-container').style.display = 'none';
  document.getElementById('create-room-container').style.display = 'none';
  document.getElementById('waiting-container').style.display = 'block';
  document.getElementById('game-container').style.display = 'none';
  document.getElementById('room-name-text').textContent = roomName;
  
  // 更新玩家位置状态
  const hostColor = multiplayerState.myPlayerIndex;
  const blackSlot = document.getElementById('slot-black-status');
  const whiteSlot = document.getElementById('slot-white-status');
  
  if (hostColor === 0) { // 房主是黑方
    blackSlot.textContent = '已就位';
    blackSlot.style.color = '#00b894';
    whiteSlot.textContent = '等待中';
    whiteSlot.style.color = '#636e72';
  } else { // 房主是白方
    whiteSlot.textContent = '已就位';
    whiteSlot.style.color = '#00b894';
    blackSlot.textContent = '等待中';
    blackSlot.style.color = '#636e72';
  }
}

// 开始游戏
function startGame(initialState, isOnline) {
  console.log('开始游戏, 在线模式:', isOnline);

  opponentLeftNotified = false;

  document.getElementById('room-container').style.display = 'none';
  document.getElementById('join-room-container').style.display = 'none';
  document.getElementById('waiting-container').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';

  // 显示墙壁选择器
  const wallSelector = document.getElementById('wall-selector');
  if (wallSelector) {
    wallSelector.style.display = 'flex';
    console.log('墙壁选择器已显示');
  }

  // 隐藏悔棋按钮
  hideUndoButton();

  if (isOnline) {
    document.getElementById('room-info').style.display = 'flex';
    document.getElementById('current-room-name').textContent = multiplayerState.roomName;
    document.getElementById('player-role').textContent =
      `你是${multiplayerState.myPlayerIndex === 0 ? '黑' : '白'}方`;
    document.getElementById('player-role').style.color =
      multiplayerState.myPlayerIndex === 0 ? '#1a1a1a' : '#999';
    perspectiveFlipped = (multiplayerState.myPlayerIndex === 0) !== (gameState.positionsSwapped || false);
  } else {
    perspectiveFlipped = false;
  }

  if (initialState) {
    gameState.players = initialState.players;
    gameState.currentPlayer = initialState.currentPlayer;
    gameState.walls = initialState.walls || [];
    gameState.gameOver = initialState.gameOver || false;
    if (initialState.positionsSwapped !== undefined) {
      gameState.positionsSwapped = initialState.positionsSwapped;
    }
  }

  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  // 移除旧的事件监听器
  canvas.removeEventListener('click', handleClick);
  canvas.removeEventListener('click', handleOnlineClick);

  // 添加新的事件监听器
  if (isOnline) {
    canvas.addEventListener('click', handleOnlineClick);
  } else {
    canvas.addEventListener('click', handleClick);
  }
  canvas.addEventListener('mousemove', handleMouseMove);

  // 播放开局音效
  SoundManager.playStartSound();

  updateTurnIndicator();
  updateWallCounts();
  updateModeHint();
  render();

  // 初始化拖动功能
  initWallDrag();
}

// 处理在线模式点击
async function handleOnlineClick(e) {
  if (gameState.gameOver) return;

  // 检查移动锁 - 防止快速连续点击导致棋子重叠
  if (isMoving) {
    console.log('移动进行中，忽略点击');
    return;
  }

  // 检查是否轮到自己
  if (gameState.currentPlayer !== multiplayerState.myPlayerIndex) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);

  // 设置移动锁
  isMoving = true;

  try {
    // 电脑端：先尝试放置墙壁，再尝试移动
    if (!isMobileDevice()) {
      const wall = getWallFromClick(x, y);
      if (wall) {
        handleWallClick(wall);
        await syncGameState();
        return;
      }
    }

    // 移动棋子
    handleMoveClick(x, y);
    await syncGameState();
  } finally {
    // 释放移动锁
    isMoving = false;
  }
}

// 本地双人对战
function startLocalPlay() {
  console.log('启动本地对战');
  multiplayerState.isOnline = false;
  aiMode = false;
  document.getElementById('room-container').style.display = 'none';
  document.getElementById('create-room-container').style.display = 'none';
  document.getElementById('join-room-container').style.display = 'none';
  document.getElementById('waiting-container').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';
  document.getElementById('room-info').style.display = 'none';

  // 显示墙壁选择器
  const wallSelector = document.getElementById('wall-selector');
  if (wallSelector) {
    wallSelector.style.display = 'flex';
  }

  // 初始化游戏
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('mousemove', handleMouseMove);

  // 重置游戏状态
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

  moveHistory = [];
  hideUndoButton();

  // 播放开局音效
  SoundManager.playStartSound();

  updateTurnIndicator();
  updateWallCounts();
  updateModeHint();
  render();

  // 初始化拖动功能
  initWallDrag();
}

// 人机对战
function startAIPlay() {
  console.log('启动人机对战');
  multiplayerState.isOnline = false;
  aiMode = true;
  document.getElementById('room-container').style.display = 'none';
  document.getElementById('create-room-container').style.display = 'none';
  document.getElementById('join-room-container').style.display = 'none';
  document.getElementById('waiting-container').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';
  document.getElementById('room-info').style.display = 'none';

  // 初始化 AI 训练数据
  AI.initTraining();

  // 显示墙壁选择器
  const wallSelector = document.getElementById('wall-selector');
  if (wallSelector) {
    wallSelector.style.display = 'flex';
  }

  // 重置视角和位置交换状态
  perspectiveFlipped = true;

  // 初始化游戏
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('mousemove', handleMouseMove);

  // 重置游戏状态
  gameState = {
    players: [
      { row: 0, col: 4, walls: 10 },
      { row: 8, col: 4, walls: 10 }
    ],
    currentPlayer: 0,
    walls: [],
    gameOver: false,
    hoverWall: null,
    positionsSwapped: false
  };

  moveHistory = [];
  hideUndoButton();

  // 播放开局音效
  SoundManager.playStartSound();

  updateTurnIndicator();
  updateWallCounts();
  updateModeHint();
  render();

  // 初始化拖动功能
  initWallDrag();
}


// 离开房间（统一逻辑）
async function leaveRoom() {
  if (!multiplayerState.isOnline || !multiplayerState.roomId) {
    returnToLobby();
    return;
  }

  // 取消房间订阅
  if (multiplayerState.subscription) {
    supabaseClient.removeChannel(multiplayerState.subscription);
    multiplayerState.subscription = null;
  }

  const roomId = multiplayerState.roomId;
  const isHost = multiplayerState.isHost;

  try {
    // 先读取当前房间状态
    const { data: room } = await supabaseClient
      .from('rooms')
      .select('game_state')
      .eq('id', roomId)
      .single();

    if (room) {
      const gs = { ...room.game_state };
      if (isHost) {
        gs.hostActive = false;
      } else {
        gs.guestActive = false;
        // 加入者离开时重置为等待状态，让房间可被新玩家加入
        if (gs.player2Joined) {
          gs.player2Joined = false;
        }
      }

      // 双方都不在线则删除房间，否则单次写入更新
      if (!gs.hostActive && !gs.guestActive) {
        await supabaseClient.from('rooms').delete().eq('id', roomId);
        console.log('双方离开，房间已删除:', roomId);
      } else {
        await supabaseClient.from('rooms').update({ game_state: gs }).eq('id', roomId);
      }
    }
  } catch (err) {
    console.error('离开房间处理出错:', err);
  } finally {
    // 无论数据库操作是否成功，始终返回大厅
    returnToLobby();
  }
}

// 同步离开状态（浏览器关闭时使用，同步请求）
function leaveRoomSync() {
  if (!multiplayerState.isOnline || !multiplayerState.roomId) return;

  const roomId = multiplayerState.roomId;
  const now = Date.now();

  if (multiplayerState.isHost) {
    // 房主关闭浏览器：直接删除房间
    try {
      fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        },
        keepalive: true
      }).catch(() => {});
    } catch (_) {}
  } else if (cachedGameState) {
    // 加入者关闭浏览器：只标记自己离开
    const stateToSend = { ...cachedGameState, guestActive: false, player2Joined: false, lastHeartbeat: now };
    delete stateToSend.restartRequest;

    try {
      fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ game_state: stateToSend }),
        keepalive: true
      }).catch(() => {}) ;
    } catch (_) {}
  }

  // 清除 localStorage 中的房间状态
  clearSavedRoomState();
}

// 重新声明在线状态（从后台切回时使用）
function reassertActive() {
  if (!multiplayerState.isOnline || !multiplayerState.roomId || !cachedGameState) return;

  const field = multiplayerState.isHost ? 'hostActive' : 'guestActive';
  const now = Date.now();
  cachedGameState[field] = true;
  cachedGameState.lastHeartbeat = now;

  fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${multiplayerState.roomId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ game_state: cachedGameState }),
    keepalive: true
  }).catch(() => {});

  // 重新启动心跳
  startHeartbeat();
}

// ============ 心跳机制 ============

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!multiplayerState.isOnline || !multiplayerState.roomId || !cachedGameState) {
      stopHeartbeat();
      return;
    }

    const now = Date.now();
    const field = multiplayerState.isHost ? 'hostActive' : 'guestActive';
    cachedGameState[field] = true;
    cachedGameState.lastHeartbeat = now;

    // 发送心跳到数据库
    fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${multiplayerState.roomId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ game_state: cachedGameState })
    }).catch(() => {});

    // 检查对方心跳是否超时
    if (cachedGameState.player2Joined) {
      const opponentHeartbeat = multiplayerState.isHost
        ? cachedGameState.guestLastHeartbeat
        : cachedGameState.hostLastHeartbeat;

      if (opponentHeartbeat && (now - opponentHeartbeat > HEARTBEAT_TIMEOUT)) {
        // 对方心跳超时，标记离线
        const opponentField = multiplayerState.isHost ? 'guestActive' : 'hostActive';
        cachedGameState[opponentField] = false;
        showToast('对手已离线');
        showOpponentLeftModal();
      }
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ============ localStorage 房间状态持久化 ============

const ROOM_STATE_KEY = 'levesper_room_state';

function saveRoomState() {
  if (!multiplayerState.isOnline || !multiplayerState.roomId) {
    clearSavedRoomState();
    return;
  }

  const state = {
    roomId: multiplayerState.roomId,
    roomName: multiplayerState.roomName,
    isHost: multiplayerState.isHost,
    myPlayerIndex: multiplayerState.myPlayerIndex,
    savedAt: Date.now()
  };

  try {
    localStorage.setItem(ROOM_STATE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function loadSavedRoomState() {
  try {
    const saved = localStorage.getItem(ROOM_STATE_KEY);
    if (!saved) return null;

    const state = JSON.parse(saved);
    // 超过 5 分钟的保存状态无效
    if (Date.now() - state.savedAt > 5 * 60 * 1000) {
      clearSavedRoomState();
      return null;
    }
    return state;
  } catch (_) {
    return null;
  }
}

function clearSavedRoomState() {
  try {
    localStorage.removeItem(ROOM_STATE_KEY);
  } catch (_) {}
}

// ============ 断线重连 ============

async function attemptReconnect() {
  const saved = loadSavedRoomState();
  if (!saved) return false;
  if (!supabaseReady || !supabaseClient) return false;

  console.log('尝试断线重连:', saved.roomName);

  try {
    const { data: room, error } = await supabaseClient
      .from('rooms')
      .select('*')
      .eq('id', saved.roomId)
      .single();

    if (error || !room) {
      console.log('房间已不存在，无法重连');
      clearSavedRoomState();
      return false;
    }

    const gs = room.game_state || {};

    // 检查房间是否还有效
    if (gs.gameOver) {
      console.log('游戏已结束，无法重连');
      clearSavedRoomState();
      return false;
    }

    // 恢复在线状态
    const field = saved.isHost ? 'hostActive' : 'guestActive';
    gs[field] = true;
    gs.lastHeartbeat = Date.now();

    // 重新加入 Presence
    multiplayerState = {
      isOnline: true,
      isHost: saved.isHost,
      myPlayerIndex: saved.myPlayerIndex,
      roomName: saved.roomName,
      roomId: saved.roomId,
      subscription: null,
      listSubscription: multiplayerState.listSubscription
    };

    // 更新数据库
    await supabaseClient
      .from('rooms')
      .update({ game_state: gs })
      .eq('id', saved.roomId);

    // 订阅房间
    subscribeToRoom(saved.roomId);

    // 开始游戏
    startGame(gs, true);

    showToast('重连成功！');

    // 保存状态
    saveRoomState();

    // 启动心跳
    startHeartbeat();

    return true;
  } catch (err) {
    console.error('重连失败:', err);
    clearSavedRoomState();
    return false;
  }
}

// ============ 主动房间清理 ============

async function cleanupStaleRooms() {
  if (!supabaseReady || !supabaseClient) return;

  try {
    const { data: rooms } = await supabaseClient
      .from('rooms')
      .select('id, game_state, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!rooms) return;

    const now = Date.now();
    const ROOM_EXPIRE_MS = 5 * 60 * 1000;
    const staleIds = [];

    for (const room of rooms) {
      const gs = room.game_state || {};
      const age = now - new Date(room.created_at).getTime();

      const bothInactive = gs.hostActive === false && gs.guestActive === false;
      const hostLeft = gs.hostActive === false && gs.player2Joined;
      const noActiveField = gs.hostActive === undefined && gs.guestActive === undefined && age > ROOM_EXPIRE_MS;
      const waitingExpired = !gs.player2Joined && gs.hostActive !== false && age > ROOM_EXPIRE_MS;

      // 心跳超时检测
      const lastHeartbeat = gs.lastHeartbeat || 0;
      const heartbeatExpired = gs.player2Joined && (now - lastHeartbeat > 60000); // 60秒无心跳

      if (bothInactive || hostLeft || noActiveField || waitingExpired || heartbeatExpired) {
        staleIds.push(room.id);
      }
    }

    if (staleIds.length > 0) {
      console.log(`清理 ${staleIds.length} 个过期房间`);
      for (const id of staleIds) {
        supabaseClient.from('rooms').delete().eq('id', id).then(() => {}).catch(() => {});
      }
    }
  } catch (_) {}
}

// 返回大厅（UI 层面）
function returnToLobby() {
  // 停止心跳
  stopHeartbeat();

  // 取消对手等待倒计时
  cancelOpponentWait();

  // 清除保存的房间状态
  clearSavedRoomState();

  try { unsubscribeRoomList(); } catch (_) {}
  try { subscribeRoomList(); } catch (_) {}
  try { fetchRoomList(); } catch (_) {}

  // 延迟再次获取房间列表，确保异步数据库操作已完成
  setTimeout(() => { try { fetchRoomList(); } catch (_) {} }, 1000);

  multiplayerState = {
    isOnline: false,
    isHost: false,
    myPlayerIndex: 0,
    roomName: null,
    roomId: null,
    subscription: null,
    listSubscription: multiplayerState.listSubscription
  };

  document.getElementById('win-modal').classList.remove('show');
  document.getElementById('opponent-left-modal').classList.remove('show');
  document.getElementById('restart-notify').style.display = 'none';
  document.getElementById('room-container').style.display = 'block';
  document.getElementById('create-room-container').style.display = 'none';
  document.getElementById('join-room-container').style.display = 'none';
  document.getElementById('waiting-container').style.display = 'none';
  document.getElementById('game-container').style.display = 'none';
}

// 浏览器关闭/页面隐藏时离开房间
let leaveTimer = null;

window.addEventListener('beforeunload', () => {
  leaveRoomSync();
});

window.addEventListener('pagehide', () => {
  leaveRoomSync();
});

document.addEventListener('visibilitychange', () => {
  if (!multiplayerState.isOnline) return;

  if (document.visibilityState === 'hidden') {
    // 防抖：隐藏超过 10 秒才标记离开（避免切换应用误触发）
    leaveTimer = setTimeout(() => {
      leaveRoomSync();
      leaveTimer = null;
    }, 10000);
  } else {
    // 切回前台：取消离开计时器，重新声明在线
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    reassertActive();
  }
});

// 定期清理过期房间（每 2 分钟）
setInterval(() => {
  if (supabaseReady) {
    cleanupStaleRooms();
  }
}, 120000);

// 内部：切换UI + 异步清理数据库（不阻塞UI）
function _leaveRoomImmediate() {
  _dbg('multiplayer.js:_leaveRoomImmediate', '进入', { isOnline: multiplayerState.isOnline, roomId: multiplayerState.roomId, isHost: multiplayerState.isHost });

  if (!multiplayerState.isOnline || !multiplayerState.roomId) {
    returnToLobby();
    return;
  }

  // 广播房间删除/离开通知（对手通过此事件知道对方离开）
  if (multiplayerState.subscription) {
    try {
      multiplayerState.subscription.send({
        type: 'broadcast',
        event: multiplayerState.isHost ? 'room_deleted' : 'guest_left',
        payload: {}
      });
    } catch (_) {}
  }

  // 取消订阅（会自动清除 Presence 状态）
  if (multiplayerState.subscription) {
    try { supabaseClient.removeChannel(multiplayerState.subscription); } catch (_) {}
    multiplayerState.subscription = null;
  }

  const roomId = multiplayerState.roomId;
  const isHost = multiplayerState.isHost;

  // 立即切换UI到大厅（保证一定执行）
  returnToLobby();

  // 异步清理数据库（不阻塞UI）
  if (isHost) {
    // 房主离开：直接删除房间，guest 通过 DELETE 事件收到通知
    _dbg('multiplayer.js:_leaveRoomImmediate', '房主DELETE房间', { roomId });
    supabaseClient.from('rooms').delete().eq('id', roomId)
      .then(() => _dbg('multiplayer.js:_leaveRoomImmediate', '房主DELETE完成', { roomId }))
      .catch(err => { console.error('删除房间出错:', err); _dbg('multiplayer.js:_leaveRoomImmediate', '房主DELETE失败', { roomId, err: String(err) }); });
  } else {
    // 加入者离开：标记自己离开
    _dbg('multiplayer.js:_leaveRoomImmediate', 'Guest查询房间', { roomId });
    supabaseClient
      .from('rooms')
      .select('game_state')
      .eq('id', roomId)
      .single()
      .then(({ data: room, error }) => {
        if (error || !room) { _dbg('multiplayer.js:_leaveRoomImmediate', 'Guest:房间已不存在', { roomId }); return; }
        const gs = { ...room.game_state };
        gs.guestActive = false;
        gs.player2Joined = false;
        // 如果房主也已离开，直接删除房间
        if (gs.hostActive === false) {
          _dbg('multiplayer.js:_leaveRoomImmediate', 'Guest:房主已离线,删除房间', { roomId });
          supabaseClient.from('rooms').delete().eq('id', roomId)
            .catch(err => console.error('删除房间出错:', err));
        } else {
          // 房主仍在，重置 player2Joined 让房间可被新玩家加入
          _dbg('multiplayer.js:_leaveRoomImmediate', 'Guest:房主在线,标记离开', { roomId });
          supabaseClient.from('rooms').update({ game_state: gs }).eq('id', roomId)
            .then(() => {
              // DB 更新完成后再刷新房间列表
              setTimeout(() => { try { fetchRoomList(); } catch (_) {} }, 500);
            })
            .catch(err => console.error('离开房间清理出错:', err));
        }
      })
      .catch(err => { console.error('离开房间清理出错:', err); _dbg('multiplayer.js:_leaveRoomImmediate', 'Guest查询失败', { roomId, err: String(err) }); });
  }
}

// 取消等待
function cancelWaiting() {
  _leaveRoomImmediate();
}

// 离开游戏
function leaveGame() {
  _leaveRoomImmediate();
}

// 请求再来一局
let restartRequested = false;

function requestRestart() {
  const notify = document.getElementById('restart-notify');

  if (multiplayerState.isOnline) {
    // 只有对方发了请求（notify 可见）时才允许确认开始新局
    if (notify && notify.style.display === 'block') {
      notify.style.display = 'none';
      restartRequested = false;

      // 在线模式：交换颜色和视角
      multiplayerState.myPlayerIndex = 1 - multiplayerState.myPlayerIndex;
      gameState.positionsSwapped = !gameState.positionsSwapped;
      perspectiveFlipped = (multiplayerState.myPlayerIndex === 0) !== (gameState.positionsSwapped || false);
      document.getElementById('player-role').textContent =
        `你是${multiplayerState.myPlayerIndex === 0 ? '黑' : '白'}方`;
      document.getElementById('player-role').style.color =
        multiplayerState.myPlayerIndex === 0 ? '#1a1a1a' : '#999';

      resetGame();
      syncGameState();
      SoundManager.playStartSound();
    } else if (!restartRequested) {
      // 自己还没发过请求，发送请求并等待对方确认
      restartRequested = true;
      notifyRestart();
      document.getElementById('btn-restart').textContent = '等待对方确认...';
    }
    // 自己已发过请求且对方还没回应，什么都不做
  } else {
    // 人机模式：切换起始位置和视角
    if (aiMode) {
      gameState.positionsSwapped = !gameState.positionsSwapped;
      perspectiveFlipped = !perspectiveFlipped;
    }
    resetGame();
    SoundManager.playStartSound();
  }
}

// 通知对方再来一局
async function notifyRestart() {
  if (!multiplayerState.isOnline || !supabaseClient) return;

  try {
    const { error } = await supabaseClient
      .from('rooms')
      .update({ game_state: { ...gameState, restartRequest: multiplayerState.myPlayerIndex, player2Joined: true, hostActive: true, guestActive: true, lastHeartbeat: Date.now() } })
      .eq('id', multiplayerState.roomId);

    if (error) console.error('发送再来一局通知失败:', error);
  } catch (e) {
    console.error('发送通知错误:', e);
  }
}

// 拖动放墙功能
let dragState = {
  isDragging: false,
  wallType: null,
  startX: 0,
  startY: 0,
  lastValidWall: null,
  lastRenderTime: 0
};

function initWallDrag() {
  const wallH = document.getElementById('wall-h');
  const wallV = document.getElementById('wall-v');

  if (!wallH || !wallV) return;

  // 鼠标/触摸事件
  wallH.addEventListener('mousedown', (e) => startDrag(e, 'h'));
  wallV.addEventListener('mousedown', (e) => startDrag(e, 'v'));
  wallH.addEventListener('touchstart', (e) => startDrag(e, 'h'), { passive: false });
  wallV.addEventListener('touchstart', (e) => startDrag(e, 'v'), { passive: false });

  document.addEventListener('mousemove', onDrag);
  document.addEventListener('touchmove', onDrag, { passive: false });
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
}

function startDrag(e, wallType) {
  e.preventDefault();
  e.stopPropagation();

  // 检查是否轮到自己
  const isMyTurn = multiplayerState.isOnline
    ? gameState.currentPlayer === multiplayerState.myPlayerIndex
    : aiMode ? gameState.currentPlayer === 0 : true;

  if (!isMyTurn) return;

  const player = gameState.players[gameState.currentPlayer];
  if (player.walls <= 0) return;

  // 完全重置拖动状态
  dragState = {
    isDragging: true,
    wallType: wallType,
    startX: 0,
    startY: 0,
    lastValidWall: null,
    lastRenderTime: 0
  };
  gameState.hoverWall = null;

  const pos = getEventPos(e);
  dragState.startX = pos.x;
  dragState.startY = pos.y;
}

function onDrag(e) {
  if (!dragState.isDragging) return;
  e.preventDefault();
  e.stopPropagation();

  // 节流
  const now = Date.now();
  if (now - dragState.lastRenderTime < 16) return;
  dragState.lastRenderTime = now;

  const pos = getEventPos(e);
  const canvasRect = canvas.getBoundingClientRect();

  // 隐藏浮动预览（不使用虚影）
  const preview = document.getElementById('drag-preview');
  if (preview) preview.style.display = 'none';

  // 检查是否在棋盘范围内
  const isInBoard = pos.x >= canvasRect.left && pos.x <= canvasRect.right &&
                    pos.y >= canvasRect.top && pos.y <= canvasRect.bottom;

  if (!isInBoard) {
    if (gameState.hoverWall) {
      gameState.hoverWall = null;
      dragState.lastValidWall = null;
      render();
    }
    return;
  }

  // 计算画布坐标（手机端上移一格，避免手指遮挡）
  const offsetY = isMobileDevice() ? CELL_SIZE : 0;
  const canvasX = (pos.x - canvasRect.left) * (canvas.width / canvasRect.width);
  const canvasY = ((pos.y - offsetY) - canvasRect.top) * (canvas.height / canvasRect.height);

  // 检测墙壁位置
  const wall = getWallFromDrag(canvasX, canvasY, dragState.wallType);

  if (wall && wall.orientation === dragState.wallType) {
    const validWall = { row: wall.row, col: wall.col, orientation: dragState.wallType };
    if (!gameState.hoverWall || gameState.hoverWall.row !== validWall.row || gameState.hoverWall.col !== validWall.col) {
      gameState.hoverWall = validWall;
      dragState.lastValidWall = validWall;
      render();
    }
  } else if (dragState.lastValidWall) {
    if (!gameState.hoverWall || gameState.hoverWall.row !== dragState.lastValidWall.row || gameState.hoverWall.col !== dragState.lastValidWall.col) {
      gameState.hoverWall = dragState.lastValidWall;
      render();
    }
  } else {
    if (gameState.hoverWall) {
      gameState.hoverWall = null;
      render();
    }
  }
}

function endDrag(e) {
  if (!dragState.isDragging) return;

  // 记录是否成功放置
  let placed = false;

  // 检查是否轮到自己
  const isMyTurn = multiplayerState.isOnline
    ? gameState.currentPlayer === multiplayerState.myPlayerIndex
    : aiMode ? gameState.currentPlayer === 0 : true;

  if (isMyTurn && dragState.lastValidWall && dragState.lastValidWall.orientation === dragState.wallType) {
    // 使用最后有效的墙壁位置进行放置
    handleWallClick(dragState.lastValidWall);
    placed = true;
    if (multiplayerState.isOnline) {
      syncGameState();
    }
    // 人机模式：玩家操作后触发 AI
    if (aiMode && !gameState.gameOver) {
      setTimeout(() => AI.makeMove(), 100);
    }
  }

  // 隐藏浮动预览
  const preview = document.getElementById('drag-preview');
  if (preview) preview.style.display = 'none';

  // 清除拖动状态
  dragState.isDragging = false;
  dragState.wallType = null;
  dragState.lastValidWall = null;
  gameState.hoverWall = null;
  render();
}

function getEventPos(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

// 页面加载后初始化拖动功能
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    initWallDrag();
  }, 200);
});
