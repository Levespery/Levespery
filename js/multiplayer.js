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
  setTimeout(() => {
    initSupabase();
  }, 100);
});

// 联机状态
let multiplayerState = {
  isOnline: false,
  isHost: false,
  myPlayerIndex: 0,
  roomCode: null,
  roomId: null,
  subscription: null
};

// 生成随机房间号
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 创建房间
async function createRoom() {
  console.log('点击创建房间');
  console.log('supabaseReady:', supabaseReady);
  console.log('supabaseClient:', supabaseClient);

  if (!supabaseReady || !supabaseClient) {
    alert('联机服务未加载，请刷新页面重试');
    return;
  }

  const roomCode = generateRoomCode();
  console.log('创建房间:', roomCode);

  const initialGameState = {
    players: [
      { row: 0, col: 4, walls: 10 },
      { row: 8, col: 4, walls: 10 }
    ],
    currentPlayer: 0,
    walls: [],
    gameOver: false
  };

  try {
    const { data, error } = await supabaseClient
      .from('rooms')
      .insert({
        room_code: roomCode,
        game_state: initialGameState
      })
      .select()
      .single();

    if (error) {
      console.error('数据库错误:', error);
      throw error;
    }

    console.log('房间创建成功:', data);

    multiplayerState = {
      isOnline: true,
      isHost: true,
      myPlayerIndex: 0,
      roomCode: roomCode,
      roomId: data.id,
      subscription: null
    };

    showWaitingRoom(roomCode);
    subscribeToRoom(data.id);

  } catch (error) {
    console.error('创建房间失败:', error);
    alert('创建房间失败: ' + (error.message || '请检查 Supabase 配置'));
  }
}

// 加入房间
async function joinRoom() {
  if (!supabaseClient) {
    alert('联机服务未初始化，请刷新页面重试');
    return;
  }

  const input = document.getElementById('room-code-input');
  const roomCode = input.value.trim().toUpperCase();

  if (!roomCode || roomCode.length < 4) {
    alert('请输入有效的房间号');
    return;
  }

  console.log('加入房间:', roomCode);

  try {
    const { data, error } = await supabaseClient
      .from('rooms')
      .select('*')
      .eq('room_code', roomCode)
      .single();

    if (error || !data) {
      console.error('查询错误:', error);
      alert('房间不存在，请检查房间号');
      return;
    }

    console.log('找到房间:', data);

    multiplayerState = {
      isOnline: true,
      isHost: false,
      myPlayerIndex: 1,
      roomCode: roomCode,
      roomId: data.id,
      subscription: null
    };

    // 更新游戏状态，标记玩家已加入
    const updatedState = {
      ...data.game_state,
      player2Joined: true
    };

    await supabaseClient
      .from('rooms')
      .update({ game_state: updatedState })
      .eq('id', data.id);

    startGame(updatedState, true);
    subscribeToRoom(data.id);

  } catch (error) {
    console.error('加入房间失败:', error);
    alert('加入房间失败: ' + (error.message || '请检查网络连接'));
  }
}

// 订阅房间变化
function subscribeToRoom(roomId) {
  multiplayerState.subscription = supabaseClient
    .channel(`room-${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`
      },
      (payload) => {
        handleGameStateUpdate(payload.new.game_state);
      }
    )
    .subscribe();
}

// 处理游戏状态更新
function handleGameStateUpdate(newState) {
  console.log('收到状态更新:', newState);

  // 如果玩家加入，房主自动进入游戏
  if (newState.player2Joined && document.getElementById('waiting-container').style.display !== 'none') {
    console.log('玩家2已加入，房主进入游戏');
    startGame(newState, true);
    return;
  }

  if (!gameState) return;

  // 更新游戏状态
  gameState.players = newState.players;
  gameState.currentPlayer = newState.currentPlayer;
  gameState.walls = newState.walls;
  gameState.gameOver = newState.gameOver;

  // 清空历史记录（对方操作后不能悔棋）
  moveHistory = [];
  hideUndoButton();

  // 更新界面
  updateTurnIndicator();
  updateWallCounts();
  updateModeHint();
  render();

  // 检查游戏结束
  if (newState.gameOver) {
    SoundManager.playWinSound();
    showWinMessage();
  }
}

// 同步游戏状态到服务器
async function syncGameState() {
  if (!multiplayerState.isOnline) return;

  try {
    const stateToSync = {
      players: gameState.players,
      currentPlayer: gameState.currentPlayer,
      walls: gameState.walls,
      gameOver: gameState.gameOver
    };

    const { error } = await supabaseClient
      .from('rooms')
      .update({ game_state: stateToSync })
      .eq('id', multiplayerState.roomId);

    if (error) {
      console.error('同步状态失败:', error);
    }
  } catch (error) {
    console.error('同步状态错误:', error);
  }
}

// 显示等待房间
function showWaitingRoom(roomCode) {
  document.getElementById('room-container').style.display = 'none';
  document.getElementById('waiting-container').style.display = 'block';
  document.getElementById('game-container').style.display = 'none';
  document.getElementById('room-code-text').textContent = roomCode;
}

// 开始游戏
function startGame(initialState, isOnline) {
  console.log('开始游戏, 在线模式:', isOnline);

  document.getElementById('room-container').style.display = 'none';
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
    document.getElementById('current-room-code').textContent = multiplayerState.roomCode;
    document.getElementById('player-role').textContent =
      `你是：玩家 ${multiplayerState.myPlayerIndex + 1} (${multiplayerState.myPlayerIndex === 0 ? '黑' : '白'})`;
  }

  if (initialState) {
    gameState.players = initialState.players;
    gameState.currentPlayer = initialState.currentPlayer;
    gameState.walls = initialState.walls || [];
    gameState.gameOver = initialState.gameOver || false;
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

  updateTurnIndicator();
  updateWallCounts();
  updateModeHint();
  render();

  // 初始化拖动功能
  initWallDrag();
  console.log('拖动功能已初始化');
}

// 处理在线模式点击
function handleOnlineClick(e) {
  if (gameState.gameOver) return;

  // 检查是否轮到自己
  if (gameState.currentPlayer !== multiplayerState.myPlayerIndex) {
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
      syncGameState();
      return;
    }
  }

  // 移动棋子
  handleMoveClick(x, y);
  syncGameState();
}

// 本地双人对战
function startLocalPlay() {
  console.log('启动本地对战');
  multiplayerState.isOnline = false;
  document.getElementById('room-container').style.display = 'none';
  document.getElementById('waiting-container').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';
  document.getElementById('room-info').style.display = 'none';

  // 显示墙壁选择器
  const wallSelector = document.getElementById('wall-selector');
  if (wallSelector) {
    wallSelector.style.display = 'flex';
    console.log('本地对战：墙壁选择器已显示');
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

  updateTurnIndicator();
  updateWallCounts();
  updateModeHint();
  render();

  // 初始化拖动功能
  initWallDrag();
  console.log('本地对战：拖动功能已初始化');
}

// 复制房间号
function copyRoomCode() {
  const roomCode = document.getElementById('room-code-text').textContent;
  navigator.clipboard.writeText(roomCode).then(() => {
    alert('房间号已复制！');
  }).catch(() => {
    // 降级方案
    const textArea = document.createElement('textarea');
    textArea.value = roomCode;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    alert('房间号已复制！');
  });
}

// 取消等待
function cancelWaiting() {
  if (multiplayerState.subscription) {
    supabaseClient.removeChannel(multiplayerState.subscription);
  }

  if (multiplayerState.roomId && multiplayerState.isHost) {
    supabaseClient.from('rooms').delete().eq('id', multiplayerState.roomId);
  }

  multiplayerState = {
    isOnline: false,
    isHost: false,
    myPlayerIndex: 0,
    roomCode: null,
    roomId: null,
    subscription: null
  };

  document.getElementById('room-container').style.display = 'block';
  document.getElementById('waiting-container').style.display = 'none';
  document.getElementById('game-container').style.display = 'none';
}

// 离开游戏
function leaveGame() {
  if (multiplayerState.subscription) {
    supabaseClient.removeChannel(multiplayerState.subscription);
  }

  if (multiplayerState.isOnline && multiplayerState.isHost && multiplayerState.roomId) {
    supabaseClient.from('rooms').delete().eq('id', multiplayerState.roomId);
  }

  multiplayerState = {
    isOnline: false,
    isHost: false,
    myPlayerIndex: 0,
    roomCode: null,
    roomId: null,
    subscription: null
  };

  document.getElementById('win-modal').classList.remove('show');
  document.getElementById('room-container').style.display = 'block';
  document.getElementById('waiting-container').style.display = 'none';
  document.getElementById('game-container').style.display = 'none';
}

// 拖动放墙功能
let dragState = {
  isDragging: false,
  wallType: null,
  ghost: null,
  startX: 0,
  startY: 0
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
  const player = gameState.players[gameState.currentPlayer];
  if (player.walls <= 0) return;

  dragState.isDragging = true;
  dragState.wallType = wallType;

  // 创建拖动预览
  const ghost = document.createElement('div');
  ghost.className = `wall-ghost ${wallType === 'h' ? 'horizontal' : 'vertical'}`;
  document.body.appendChild(ghost);
  dragState.ghost = ghost;

  // 更新位置
  const pos = getEventPos(e);
  dragState.startX = pos.x;
  dragState.startY = pos.y;
  updateGhostPosition(pos.x, pos.y);
}

function onDrag(e) {
  if (!dragState.isDragging) return;
  e.preventDefault();

  const pos = getEventPos(e);
  updateGhostPosition(pos.x, pos.y);

  // 在画布上显示墙壁预览
  const canvasRect = canvas.getBoundingClientRect();
  const canvasX = (pos.x - canvasRect.left) * (canvas.width / canvasRect.width);
  const canvasY = (pos.y - canvasRect.top) * (canvas.height / canvasRect.height);

  const wall = getWallFromClick(canvasX, canvasY);
  if (wall && wall.orientation === dragState.wallType) {
    gameState.hoverWall = wall;
  } else {
    gameState.hoverWall = null;
  }
  render();
}

function endDrag(e) {
  if (!dragState.isDragging) return;

  // 在线模式下检查是否轮到自己
  if (multiplayerState.isOnline && gameState.currentPlayer !== multiplayerState.myPlayerIndex) {
    // 清理 ghost 元素
    if (dragState.ghost) {
      dragState.ghost.remove();
      dragState.ghost = null;
    }
    dragState.isDragging = false;
    dragState.wallType = null;
    gameState.hoverWall = null;
    render();
    return;
  }

  const pos = getEventPos(e);
  const canvasRect = canvas.getBoundingClientRect();
  const canvasX = (pos.x - canvasRect.left) * (canvas.width / canvasRect.width);
  const canvasY = (pos.y - canvasRect.top) * (canvas.height / canvasRect.height);

  // 尝试放置墙壁
  const wall = getWallFromClick(canvasX, canvasY);
  if (wall && wall.orientation === dragState.wallType) {
    handleWallClick(wall);
    if (multiplayerState.isOnline) {
      syncGameState();
    }
  }

  // 清理 ghost 元素
  if (dragState.ghost) {
    dragState.ghost.remove();
    dragState.ghost = null;
  }

  dragState.isDragging = false;
  dragState.wallType = null;
  gameState.hoverWall = null;
  render();
}

function updateGhostPosition(x, y) {
  if (dragState.ghost) {
    dragState.ghost.style.left = (x - 50) + 'px';
    dragState.ghost.style.top = (y - 8) + 'px';
  }
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
