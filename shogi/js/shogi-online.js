// ============ 将棋在线对战框架（复用路墙棋模式） ============

// Supabase 配置（共用同一个项目）
const SUPABASE_URL = 'https://grdbmpokcrtbzibliopc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Vv4Bu44IZU2qmE0pH48OUA_2mHx5rNJ';

let supabaseClient = null;
let supabaseReady = false;

function initSupabase() {
  try {
    if (window.supabase && window.supabase.createClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      supabaseReady = true;
      return true;
    }
  } catch (e) {
    console.error('Supabase 初始化失败:', e);
  }
  return false;
}

// 联机状态
let multiplayerState = {
  isOnline: false,
  isHost: false,
  myPlayerIndex: 0,
  roomName: null,
  roomId: null,
  subscription: null,
  listSubscription: null
};

// 人机对战状态
let aiMode = false;

// 缓存游戏状态
let cachedGameState = null;

// 心跳
let heartbeatTimer = null;
const HEARTBEAT_INTERVAL = 10000;
const HEARTBEAT_TIMEOUT = 25000;

// 对手离开通知标志
let opponentLeftNotified = false;

// 对手离开倒计时
let opponentWaitCountdown = null;
let opponentLeftTime = 0;

// 加入房间防重复
let joiningRoom = false;

// ============ 页面初始化 ============

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(async () => {
    initSupabase();
    setTimeout(() => {
      if (supabaseReady) {
        fetchRoomList();
        subscribeRoomList();
      }
    }, 200);
    setTimeout(async () => {
      if (supabaseReady) {
        const reconnected = await attemptReconnect();
        if (!reconnected) cleanupStaleRooms();
      }
    }, 500);
  }, 100);
});

// ============ 房间管理 ============

function showCreateRoom() {
  document.getElementById('home-container').style.display = 'none';
  document.getElementById('create-room-container').style.display = 'block';
  document.getElementById('room-name-input').value = '';
  document.getElementById('room-name-input').focus();
}

function cancelCreateRoom() {
  document.getElementById('create-room-container').style.display = 'none';
  document.getElementById('home-container').style.display = 'block';
}

function showJoinRoom() {
  document.getElementById('home-container').style.display = 'none';
  document.getElementById('join-room-container').style.display = 'block';
  fetchRoomList();
}

function cancelJoinRoom() {
  document.getElementById('join-room-container').style.display = 'none';
  document.getElementById('home-container').style.display = 'block';
}

async function confirmCreateRoom() {
  const roomName = document.getElementById('room-name-input').value.trim();
  if (!roomName) { alert('请输入房间名称'); return; }
  if (roomName.length > 20) { alert('房间名称不能超过20个字符'); return; }

  // 检查重名
  try {
    const { data: existing } = await supabaseClient
      .from('shogi_rooms').select('id, game_state, created_at')
      .eq('room_name', roomName);
    if (existing && existing.length > 0) {
      const now = Date.now();
      const active = existing.some(r => {
        const gs = r.game_state || {};
        const age = now - new Date(r.created_at).getTime();
        return !(gs.hostActive === false && gs.guestActive === false) && age < 5 * 60 * 1000;
      });
      if (active) { alert('房间名称已被使用'); return; }
    }
  } catch (e) { console.error('检查房间名失败:', e); }

  const hostColor = Math.random() < 0.5 ? 0 : 1;
  const initialGameState = createInitialState();
  initialGameState.hostColor = hostColor;
  initialGameState.player2Joined = false;
  initialGameState.hostActive = true;
  initialGameState.guestActive = false;

  try {
    const { data, error } = await supabaseClient
      .from('shogi_rooms')
      .insert({ room_name: roomName, game_state: initialGameState })
      .select().single();

    if (error) {
      alert('创建房间失败: ' + error.message);
      return;
    }

    multiplayerState = {
      isOnline: true, isHost: true,
      myPlayerIndex: hostColor, roomName: roomName,
      roomId: data.id, subscription: null, listSubscription: null
    };

    showWaitingRoom(roomName);
    subscribeToRoom(data.id);
    saveRoomState();
    startHeartbeat();
  } catch (error) {
    alert('创建房间失败: ' + (error.message || '请检查网络'));
  }
}

async function joinRoomByName(roomId, roomName) {
  if (joiningRoom) return;
  if (!supabaseClient) { alert('联机服务未初始化'); return; }
  joiningRoom = true;

  unsubscribeRoomList();

  try {
    const { data, error } = await supabaseClient
      .from('shogi_rooms').select('*').eq('id', roomId).single();

    if (error || !data) { alert('房间不存在'); joiningRoom = false; return; }
    if (data.game_state.player2Joined) { alert('房间已满'); joiningRoom = false; return; }

    const isHostless = data.game_state.hostActive === false;
    const newHostColor = Math.random() < 0.5 ? 0 : 1;
    const joinerColor = isHostless ? newHostColor : (1 - (data.game_state.hostColor || 0));

    multiplayerState = {
      isOnline: true, isHost: isHostless,
      myPlayerIndex: joinerColor, roomName: roomName,
      roomId: data.id, subscription: null, listSubscription: null
    };

    const updatedState = createInitialState();
    updatedState.hostColor = isHostless ? newHostColor : data.game_state.hostColor;
    updatedState.player2Joined = true;
    updatedState.guestActive = true;
    updatedState.hostActive = true;

    await supabaseClient.from('shogi_rooms')
      .update({ game_state: updatedState }).eq('id', data.id);

    cachedGameState = { ...updatedState };
    initGame(updatedState, true);
    subscribeToRoom(data.id);
    saveRoomState();
    startHeartbeat();

    joiningRoom = false;
  } catch (error) {
    joiningRoom = false;
    alert('加入房间失败: ' + (error.message || '请检查网络'));
  }
}

function showWaitingRoom(roomName) {
  document.getElementById('home-container').style.display = 'none';
  document.getElementById('create-room-container').style.display = 'none';
  document.getElementById('waiting-container').style.display = 'block';
  document.getElementById('game-container').style.display = 'none';
  document.getElementById('room-name-text').textContent = roomName;

  // 更新玩家位置状态
  const hostColor = multiplayerState.myPlayerIndex;
  const blackSlot = document.getElementById('slot-black-status');
  const whiteSlot = document.getElementById('slot-white-status');

  if (hostColor === 0) { // 玉将
    blackSlot.textContent = '已就位';
    blackSlot.style.color = '#00b894';
    whiteSlot.textContent = '等待中';
    whiteSlot.style.color = '#636e72';
  } else { // 王将
    whiteSlot.textContent = '已就位';
    whiteSlot.style.color = '#00b894';
    blackSlot.textContent = '等待中';
    blackSlot.style.color = '#636e72';
  }
}

// ============ 房间列表 ============

async function fetchRoomList() {
  if (!supabaseReady || !supabaseClient) return;

  try {
    const { data, error } = await supabaseClient
      .from('shogi_rooms')
      .select('id, room_name, game_state, created_at')
      .order('created_at', { ascending: false }).limit(50);

    if (error) { console.error('获取房间列表失败:', error); return; }

    const now = Date.now();
    const ROOM_EXPIRE_MS = 5 * 60 * 1000;
    const activeRooms = [];
    const staleIds = [];

    for (const room of data) {
      const gs = room.game_state || {};
      const age = now - new Date(room.created_at).getTime();
      const bothInactive = gs.hostActive === false && gs.guestActive === false;
      const hostLeftWithGuest = gs.hostActive === false && gs.player2Joined;
      const noActiveField = gs.hostActive === undefined && age > ROOM_EXPIRE_MS;
      const waitingExpired = !gs.player2Joined && gs.hostActive !== false && age > ROOM_EXPIRE_MS;
      const hostLeftWaiting = gs.hostActive === false && !gs.player2Joined && age > 1 * 60 * 1000;

      if ((bothInactive && age > ROOM_EXPIRE_MS) || hostLeftWithGuest || noActiveField || waitingExpired || hostLeftWaiting) {
        staleIds.push(room.id);
      } else {
        activeRooms.push(room);
      }
    }

    if (staleIds.length > 0) {
      for (const id of staleIds) {
        supabaseClient.from('shogi_rooms').delete().eq('id', id).then(() => {});
      }
    }

    renderRoomList(activeRooms);
  } catch (error) { console.error('获取房间列表错误:', error); }
}

function renderRoomList(rooms) {
  const roomList = document.getElementById('room-list');
  if (!roomList) return;
  if (!rooms || rooms.length === 0) {
    roomList.innerHTML = '<p class="room-list-empty">目前无房间</p>';
    return;
  }

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

  roomList.innerHTML = html || '<p class="room-list-empty">暂无可用房间</p>';
}

function subscribeRoomList() {
  if (!supabaseReady || !supabaseClient) return;
  multiplayerState.listSubscription = supabaseClient
    .channel('shogi-room-list')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shogi_rooms' }, () => {
      fetchRoomList();
    }).subscribe();
}

function unsubscribeRoomList() {
  if (multiplayerState.listSubscription) {
    supabaseClient.removeChannel(multiplayerState.listSubscription);
    multiplayerState.listSubscription = null;
  }
}

// ============ 广播同步 ============

function subscribeToRoom(roomId) {
  const channel = supabaseClient.channel(`shogi-room-${roomId}`, {
    config: { presence: { key: multiplayerState.isHost ? 'host' : 'guest' } }
  });

  channel
    .on('broadcast', { event: 'state_update' }, ({ payload }) => {
      handleGameStateUpdate(payload.state);
    })
    .on('broadcast', { event: 'room_deleted' }, () => {
      if (multiplayerState.isOnline && !multiplayerState.isHost) {
        showToast('对手已离开房间');
        showOpponentLeftModal();
      }
    })
    .on('broadcast', { event: 'guest_left' }, () => {
      if (multiplayerState.isOnline && multiplayerState.isHost) {
        showToast('对手已离开房间');
        if (!gameState || !gameState.gameOver) showOpponentLeftModal();
      }
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      if (multiplayerState.isOnline) {
        const isOpponent = (multiplayerState.isHost && key === 'guest') || (!multiplayerState.isHost && key === 'host');
        if (isOpponent) {
          showToast('对手已离开房间');
          stopHeartbeat();
          if (!gameState || !gameState.gameOver) showOpponentLeftModal();
        }
      }
    })
    .on('presence', { event: 'join' }, ({ key }) => {
      const isOpponent = (multiplayerState.isHost && key === 'guest') || (!multiplayerState.isHost && key === 'host');
      if (isOpponent && multiplayerState.isOnline) {
        document.getElementById('opponent-left-modal').classList.remove('show');
        cancelOpponentWait();
        showToast('对手已加入');
        if (multiplayerState.isHost && cachedGameState && !cachedGameState.player2Joined) {
          resetGame();
          syncGameState();
        }
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString(), role: multiplayerState.isHost ? 'host' : 'guest' });
        if (!multiplayerState.isHost && cachedGameState) {
          setTimeout(() => {
            channel.send({ type: 'broadcast', event: 'state_update', payload: { state: cachedGameState } });
          }, 300);
        }
      }
    });

  multiplayerState.subscription = channel;
}

function handleGameStateUpdate(newState) {
  const oldState = cachedGameState ? { ...cachedGameState } : null;
  cachedGameState = { ...newState };

  if (multiplayerState.isHost) cachedGameState.guestLastHeartbeat = Date.now();
  else cachedGameState.hostLastHeartbeat = Date.now();

  const imHost = multiplayerState.isHost;
  const opponentLeft = imHost ? (newState.guestActive === false) : (newState.hostActive === false);

  if (opponentLeft && newState.player2Joined && !opponentLeftNotified) {
    opponentLeftNotified = true;
    stopHeartbeat();
    if (newState.gameOver) { showToast('对手已离开房间'); }
    else { showToast('对手已离开房间'); showOpponentLeftModal(); return; }
  }

  if (oldState && newState.player2Joined) {
    const opponentWasOffline = imHost ? (oldState.guestActive === false) : (oldState.hostActive === false);
    const opponentNowOnline = imHost ? (newState.guestActive === true) : (newState.hostActive === true);
    if (opponentWasOffline && opponentNowOnline) {
      opponentLeftNotified = false;
      document.getElementById('opponent-left-modal').classList.remove('show');
      cancelOpponentWait();
      showToast('对方已回来，游戏继续');
      if (gameState) updateTurnIndicator();
      reassertActive();
    }
  }

  if (newState.player2Joined && document.getElementById('waiting-container').style.display !== 'none') {
    initGame(newState, true);
    return;
  }

  if (!gameState) return;

  const wasGameOver = gameState.gameOver;
  const oldBoard = gameState.board.map(r => r.map(c => c ? { ...c } : null));
  const oldCaptured = {
    0: { ...(gameState.captured[0] || {}) },
    1: { ...(gameState.captured[1] || {}) }
  };

  // 更新游戏状态
  gameState.board = newState.board;
  gameState.captured = newState.captured;
  gameState.currentPlayer = newState.currentPlayer;
  gameState.gameOver = newState.gameOver;
  gameState.winner = newState.winner;
  gameState.lastMoveBy = newState.lastMoveBy !== undefined ? newState.lastMoveBy : -1;
  lastMove = newState.lastMove || null;

  updateTurnIndicator();
  showUndoButton();
  updateCapturedPieces();
  render();

  // 对方走棋音效
  if (oldState && newState.player2Joined && oldState.currentPlayer !== newState.currentPlayer) {
    const myIndex = multiplayerState.myPlayerIndex;
    const movedByOpponent = newState.lastMoveBy !== undefined && newState.lastMoveBy !== myIndex;
    if (movedByOpponent && newState.lastMove) {
      const { toRow, toCol } = newState.lastMove;
      const newPiece = newState.board[toRow] && newState.board[toRow][toCol];
      const oldPiece = oldBoard[toRow] && oldBoard[toRow][toCol];

      if (newPiece && newPiece.promoted && oldPiece && !oldPiece.promoted) {
        SoundManager.playStartSound();
        const fromName = PIECE_FULL_NAMES[oldPiece.type] || PIECE_CHARS[oldPiece.type] || '';
        const toName = PROMOTED_NAMES[oldPiece.type] || '';
        showToast(`${fromName} 升变为 ${toName}！`);
      } else if (newPiece && !newPiece.promoted && oldPiece && oldPiece.type !== newPiece.type) {
        SoundManager.playStartSound();
        const fromName = PIECE_FULL_NAMES[oldPiece.type] || PIECE_CHARS[oldPiece.type] || '';
        const toName = PROMOTED_NAMES[oldPiece.type] || '';
        showToast(`${fromName} 升变为 ${toName}！`);
      } else if (newPiece && oldPiece && oldPiece.owner !== newPiece.owner) {
        SoundManager.playWallSound();
      } else {
        SoundManager.playMoveSound();
      }
    }
  }

  if (newState.gameOver && !wasGameOver) {
    SoundManager.playWinSound();
    const winnerName = newState.winner === 0 ? '玉将' : '王将';
    showWinMessage(`${winnerName}获胜！`);
  }
}

function syncGameState() {
  if (!multiplayerState.isOnline) return;

  const stateToSync = {
    board: gameState.board,
    captured: gameState.captured,
    currentPlayer: gameState.currentPlayer,
    gameOver: gameState.gameOver,
    winner: gameState.winner,
    lastMoveBy: gameState.lastMoveBy,
    lastMove: lastMove,
    hostColor: multiplayerState.isHost ? multiplayerState.myPlayerIndex : (1 - multiplayerState.myPlayerIndex),
    player2Joined: true,
    hostActive: true,
    guestActive: true,
    lastHeartbeat: Date.now()
  };

  if (multiplayerState.subscription) {
    multiplayerState.subscription.send({ type: 'broadcast', event: 'state_update', payload: { state: stateToSync } });
  }

  supabaseClient.from('shogi_rooms')
    .update({ game_state: stateToSync }).eq('id', multiplayerState.roomId)
    .then(() => { cachedGameState = { ...stateToSync }; })
    .catch(err => console.error('同步状态失败:', err));
}

// ============ 离开房间 ============

function _leaveRoomImmediate() {
  if (!multiplayerState.isOnline || !multiplayerState.roomId) {
    returnToLobby();
    return;
  }

  if (multiplayerState.subscription) {
    try {
      multiplayerState.subscription.send({
        type: 'broadcast',
        event: multiplayerState.isHost ? 'room_deleted' : 'guest_left',
        payload: {}
      });
    } catch (_) {}
  }

  if (multiplayerState.subscription) {
    try { supabaseClient.removeChannel(multiplayerState.subscription); } catch (_) {}
    multiplayerState.subscription = null;
  }

  const roomId = multiplayerState.roomId;
  const isHost = multiplayerState.isHost;

  stopHeartbeat();
  returnToLobby();

  if (isHost) {
    const gs = cachedGameState ? { ...cachedGameState } : {};
    gs.hostActive = false;
    gs.player2Joined = false;
    gs.guestActive = false;
    gs.lastHeartbeat = Date.now();
    supabaseClient.from('shogi_rooms').update({ game_state: gs }).eq('id', roomId)
      .then(() => setTimeout(() => { try { fetchRoomList(); } catch (_) {} }, 500))
      .catch(err => console.error('房主离开重置出错:', err));
  } else {
    const gs = cachedGameState ? { ...cachedGameState } : {};
    gs.guestActive = false;
    gs.player2Joined = false;
    gs.lastHeartbeat = Date.now();
    supabaseClient.from('shogi_rooms').update({ game_state: gs }).eq('id', roomId)
      .then(() => setTimeout(() => { try { fetchRoomList(); } catch (_) {} }, 500))
      .catch(err => console.error('Guest更新失败:', err));
  }
}

function cancelWaiting() { _leaveRoomImmediate(); }
function leaveGame() { _leaveRoomImmediate(); }

function leaveRoomSync() {
  if (!multiplayerState.isOnline || !multiplayerState.roomId) return;
  const roomId = multiplayerState.roomId;
  const now = Date.now();

  if (multiplayerState.isHost) {
    const stateToSend = cachedGameState ? { ...cachedGameState } : {};
    stateToSend.hostActive = false;
    stateToSend.player2Joined = false;
    stateToSend.guestActive = false;
    stateToSend.lastHeartbeat = now;
    try {
      fetch(`${SUPABASE_URL}/rest/v1/shogi_rooms?id=eq.${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ game_state: stateToSend }),
        keepalive: true
      }).catch(() => {});
    } catch (_) {}
  } else if (cachedGameState) {
    const stateToSend = { ...cachedGameState, guestActive: false, player2Joined: false, lastHeartbeat: now };
    try {
      fetch(`${SUPABASE_URL}/rest/v1/shogi_rooms?id=eq.${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ game_state: stateToSend }),
        keepalive: true
      }).catch(() => {});
    } catch (_) {}
  }
  clearSavedRoomState();
}

function returnToLobby() {
  stopHeartbeat();
  cancelOpponentWait();
  clearSavedRoomState();
  try { unsubscribeRoomList(); } catch (_) {}
  try { subscribeRoomList(); } catch (_) {}
  try { fetchRoomList(); } catch (_) {}
  setTimeout(() => { try { fetchRoomList(); } catch (_) {} }, 1000);

  multiplayerState = {
    isOnline: false, isHost: false, myPlayerIndex: 0,
    roomName: null, roomId: null, subscription: null, listSubscription: multiplayerState.listSubscription
  };

  document.getElementById('win-modal').classList.remove('show');
  document.getElementById('opponent-left-modal').classList.remove('show');
  document.getElementById('restart-notify').style.display = 'none';
  document.getElementById('home-container').style.display = 'block';
  document.getElementById('create-room-container').style.display = 'none';
  document.getElementById('join-room-container').style.display = 'none';
  document.getElementById('waiting-container').style.display = 'none';
  document.getElementById('game-container').style.display = 'none';
}

// ============ 心跳 ============

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!multiplayerState.isOnline || !multiplayerState.roomId || !cachedGameState) {
      stopHeartbeat(); return;
    }
    const now = Date.now();
    const field = multiplayerState.isHost ? 'hostActive' : 'guestActive';

    fetch(`${SUPABASE_URL}/rest/v1/shogi_rooms?id=eq.${multiplayerState.roomId}&select=game_state`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    })
    .then(r => r.json())
    .then(rows => {
      if (!rows || !rows.length || !rows[0].game_state) return;
      const dbState = rows[0].game_state;
      dbState[field] = true;
      dbState.lastHeartbeat = now;
      Object.assign(cachedGameState, dbState);
      return fetch(`${SUPABASE_URL}/rest/v1/shogi_rooms?id=eq.${multiplayerState.roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ game_state: dbState })
      });
    }).catch(() => {});

    if (cachedGameState.player2Joined) {
      const opponentHeartbeat = multiplayerState.isHost ? cachedGameState.guestLastHeartbeat : cachedGameState.hostLastHeartbeat;
      if (opponentHeartbeat && (now - opponentHeartbeat > HEARTBEAT_TIMEOUT)) {
        const opponentField = multiplayerState.isHost ? 'guestActive' : 'hostActive';
        cachedGameState[opponentField] = false;
        showToast('对手已离线');
        showOpponentLeftModal();
      }
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function reassertActive() {
  if (!multiplayerState.isOnline || !multiplayerState.roomId || !cachedGameState) return;
  const field = multiplayerState.isHost ? 'hostActive' : 'guestActive';
  cachedGameState[field] = true;
  cachedGameState.lastHeartbeat = Date.now();
  fetch(`${SUPABASE_URL}/rest/v1/shogi_rooms?id=eq.${multiplayerState.roomId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ game_state: cachedGameState }),
    keepalive: true
  }).catch(() => {});
  startHeartbeat();
}

// ============ 对手离开弹窗 ============

function showOpponentLeftModal() {
  document.getElementById('win-modal').classList.remove('show');
  document.getElementById('restart-notify').style.display = 'none';
  opponentLeftTime = Date.now();
  document.getElementById('opponent-left-title').textContent = '对方已离开';
  document.getElementById('opponent-left-desc').textContent = '你的对手已离开房间';
  document.getElementById('opponent-left-waiting').style.display = 'none';
  document.getElementById('opponent-left-buttons').innerHTML = `
    <button class="btn btn-restart" onclick="startWaitingForOpponent()">等待对手</button>
    <button class="btn" onclick="leaveGame()">返回大厅</button>
  `;
  document.getElementById('opponent-left-modal').classList.add('show');
  _startOpponentLeftCountdown();
}

function _startOpponentLeftCountdown() {
  cancelOpponentWait();
  const countdownEl = document.getElementById('opponent-left-countdown');
  const elapsed = Math.floor((Date.now() - opponentLeftTime) / 1000);
  let remaining = Math.max(30 - elapsed, 0);
  countdownEl.textContent = remaining;
  if (remaining <= 0) { showOpponentOffline(); return; }
  opponentWaitCountdown = setInterval(() => {
    remaining--;
    countdownEl.textContent = remaining;
    if (remaining <= 0) { clearInterval(opponentWaitCountdown); opponentWaitCountdown = null; showOpponentOffline(); }
  }, 1000);
}

function startWaitingForOpponent() {
  document.getElementById('opponent-left-waiting').style.display = 'block';
  document.getElementById('opponent-left-buttons').innerHTML = `<button class="btn" onclick="leaveGame()">返回大厅</button>`;
  if (multiplayerState.isHost && multiplayerState.roomId && supabaseClient) {
    supabaseClient.from('shogi_rooms').select('game_state').eq('id', multiplayerState.roomId).single()
      .then(({ data: room }) => {
        if (!room) return;
        const gs = { ...room.game_state };
        gs.hostActive = true; gs.guestActive = false; gs.lastHeartbeat = Date.now();
        supabaseClient.from('shogi_rooms').update({ game_state: gs }).eq('id', multiplayerState.roomId);
        cachedGameState = gs;
      }).catch(() => {});
  }
}

function showOpponentOffline() {
  document.getElementById('opponent-left-title').textContent = '对方已离线';
  document.getElementById('opponent-left-desc').textContent = '对手已长时间未响应';
  document.getElementById('opponent-left-waiting').style.display = 'none';
  document.getElementById('opponent-left-buttons').innerHTML = `<button class="btn" onclick="leaveGame()">返回大厅</button>`;
}

function cancelOpponentWait() {
  if (opponentWaitCountdown) { clearInterval(opponentWaitCountdown); opponentWaitCountdown = null; }
}

// ============ localStorage 重连 ============

const ROOM_STATE_KEY = 'shogi_room_state';

function saveRoomState() {
  if (!multiplayerState.isOnline || !multiplayerState.roomId) { clearSavedRoomState(); return; }
  try {
    localStorage.setItem(ROOM_STATE_KEY, JSON.stringify({
      roomId: multiplayerState.roomId, roomName: multiplayerState.roomName,
      isHost: multiplayerState.isHost, myPlayerIndex: multiplayerState.myPlayerIndex, savedAt: Date.now()
    }));
  } catch (_) {}
}

function loadSavedRoomState() {
  try {
    const saved = localStorage.getItem(ROOM_STATE_KEY);
    if (!saved) return null;
    const state = JSON.parse(saved);
    if (Date.now() - state.savedAt > 5 * 60 * 1000) { clearSavedRoomState(); return null; }
    return state;
  } catch (_) { return null; }
}

function clearSavedRoomState() {
  try { localStorage.removeItem(ROOM_STATE_KEY); } catch (_) {}
}

async function attemptReconnect() {
  const saved = loadSavedRoomState();
  if (!saved || !supabaseReady || !supabaseClient) return false;
  try {
    const { data: room, error } = await supabaseClient.from('shogi_rooms').select('*').eq('id', saved.roomId).single();
    if (error || !room) { clearSavedRoomState(); return false; }
    const gs = room.game_state || {};
    if (gs.gameOver) { clearSavedRoomState(); return false; }

    const field = saved.isHost ? 'hostActive' : 'guestActive';
    gs[field] = true; gs.lastHeartbeat = Date.now();

    multiplayerState = {
      isOnline: true, isHost: saved.isHost, myPlayerIndex: saved.myPlayerIndex,
      roomName: saved.roomName, roomId: saved.roomId, subscription: null, listSubscription: multiplayerState.listSubscription
    };

    await supabaseClient.from('shogi_rooms').update({ game_state: gs }).eq('id', saved.roomId);
    subscribeToRoom(saved.roomId);
    initGame(gs, true);
    showToast('重连成功！');
    saveRoomState();
    startHeartbeat();
    return true;
  } catch (err) { clearSavedRoomState(); return false; }
}

// ============ 过期房间清理 ============

async function cleanupStaleRooms() {
  if (!supabaseReady || !supabaseClient) return;
  try {
    const { data: rooms } = await supabaseClient.from('shogi_rooms')
      .select('id, game_state, created_at').order('created_at', { ascending: false }).limit(100);
    if (!rooms) return;
    const now = Date.now();
    const staleIds = [];
    for (const room of rooms) {
      const gs = room.game_state || {};
      const age = now - new Date(room.created_at).getTime();
      const bothInactive = gs.hostActive === false && gs.guestActive === false;
      const hostLeftWithGuest = gs.hostActive === false && gs.player2Joined;
      const noActiveField = gs.hostActive === undefined && gs.guestActive === undefined && age > 5 * 60 * 1000;
      const waitingExpired = !gs.player2Joined && gs.hostActive !== false && age > 5 * 60 * 1000;
      const hostLeftWaiting = gs.hostActive === false && !gs.player2Joined && age > 1 * 60 * 1000;
      const heartbeatExpired = gs.player2Joined && (now - (gs.lastHeartbeat || 0) > 60000);
      if ((bothInactive && age > 5 * 60 * 1000) || hostLeftWithGuest || noActiveField || waitingExpired || hostLeftWaiting || heartbeatExpired) {
        staleIds.push(room.id);
      }
    }
    for (const id of staleIds) {
      supabaseClient.from('shogi_rooms').delete().eq('id', id).then(() => {}).catch(() => {});
    }
  } catch (_) {}
}

setInterval(() => { if (supabaseReady) cleanupStaleRooms(); }, 120000);

// ============ 浏览器事件 ============

window.addEventListener('beforeunload', () => leaveRoomSync());
window.addEventListener('pagehide', () => leaveRoomSync());

let leaveTimer = null;
document.addEventListener('visibilitychange', () => {
  if (!multiplayerState.isOnline) return;
  if (document.visibilityState === 'hidden') {
    leaveTimer = setTimeout(() => { leaveRoomSync(); leaveTimer = null; }, 10000);
  } else {
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    reassertActive();
  }
});

// ============ 本地模式入口 ============

function startLocalPlay() {
  multiplayerState.isOnline = false;
  aiMode = false;
  initGame(null, false);
}

function startAIPlay() {
  multiplayerState.isOnline = false;
  aiMode = true;
  initGame(null, false);
}
