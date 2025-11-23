// =============================
// ULTIMATE TETRIS 2025 - ALL FEATURES
// Sound + Mobile + High Score + Everything!
// =============================

const BLOCK_SIZE = 30;
const COLS = 10;
const ROWS = 20;

const HOLD_CANVAS = document.getElementById('hold-canvas');
const GAME_CANVAS = document.getElementById('game-canvas');
const NEXT_CANVASES = document.querySelectorAll('.next-canvas');

const holdCtx = HOLD_CANVAS.getContext('2d');
const ctx = GAME_CANVAS.getContext('2d');
const nextCtxs = Array.from(NEXT_CANVASES).map(c => c.getContext('2d'));

// Canvas scaling
HOLD_CANVAS.width = HOLD_CANVAS.height = 120;
GAME_CANVAS.width = COLS * BLOCK_SIZE;
GAME_CANVAS.height = ROWS * BLOCK_SIZE;
NEXT_CANVASES.forEach(c => { c.width = 160; c.height = 100; });

// Tetriminos & Colors
const PIECES = [
  [[1,1,1,1]], [[1,1],[1,1]], [[0,1,0],[1,1,1]],
  [[0,1,1],[1,1,0]], [[1,1,0],[0,1,1]], [[1,0,0],[1,1,1]], [[0,0,1],[1,1,1]]
];
const COLORS = ['#00f0f0','#ffff00','#a000f0','#00f000','#f00000','#0000f0','#f0a000'];

// Sounds
const sounds = {
  drop: new Audio('https://assets.codepen.io/21542/tetris-drop.mp3'),
  clear: new Audio('https://assets.codepen.io/21542/tetris-clear.mp3'),
  rotate: new Audio('https://assets.codepen.io/21542/tetris-rotate.mp3'),
  gameover: new Audio('https://assets.codepen.io/21542/tetris-gameover.mp3'),
  bgm: new Audio('https://assets.codepen.io/21542/tetris-bgm.mp3')
};
sounds.bgm.loop = true;
sounds.bgm.volume = 0.3;

// High Score
let highScore = localStorage.getItem('tetrisHighScore') || 0;
document.getElementById('score').parentNode.insertAdjacentHTML('afterend', 
  `<p>High Score: <span id="highscore">${highScore}</span></p>`);

class Piece {
  constructor() {
    this.type = Math.floor(Math.random() * PIECES.length);
    this.shape = PIECES[this.type].map(r => [...r]);
    this.color = COLORS[this.type];
    this.x = Math.floor(COLS/2) - Math.floor(this.shape[0].length/2);
    this.y = 0;
  }
  rotate() {
    const rotated = this.shape[0].map((_, i) => this.shape.map(row => row[i]).reverse());
    this.shape = rotated;
  }
}

// Game state
let board = Array(ROWS).fill().map(() => Array(COLS).fill(0));
let currentPiece = new Piece();
let holdPiece = null;
let canHold = true;
let nextQueue = Array(6).fill().map(() => new Piece());
let score = 0, lines = 0, level = 1;
let dropCounter = 0, dropInterval = 1000, lastTime = 0;
let gameOver = false, paused = false;

// DOM Elements
const $ = id => document.getElementById(id);
const $class = cls => document.querySelector('.' + cls);
const scoreEl = $('score');
const linesEl = $('lines');
const levelEl = $('level');
const highScoreEl = $('highscore');

// Update UI
function updateScore() {
  scoreEl.textContent = score;
  linesEl.textContent = lines;
  levelEl.textContent = level;
  if (score > highScore) {
    highScore = score;
    highScoreEl.textContent = highScore;
    localStorage.setItem('tetrisHighScore', highScore);
  }
}

// Draw
function drawBlock(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x*BLOCK_SIZE, y*BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(x*BLOCK_SIZE, y*BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  ctx.shadowBlur = 15;
  ctx.shadowColor = color;
  ctx.fillRect(x*BLOCK_SIZE + 4, y*BLOCK_SIZE + 4, BLOCK_SIZE - 8, BLOCK_SIZE - 8);
  ctx.shadowBlur = 0;
}

function drawBoard() {
  ctx.clearRect(0, 0, GAME_CANVAS.width, GAME_CANVAS.height);
  board.forEach((row,y) => row.forEach((v,x) => v && drawBlock(ctx, x, y, v)));
  currentPiece.shape.forEach((row,dy) => {
    row.forEach((v,dx) => {
      if (v && currentPiece.y + dy >= 0) {
        drawBlock(ctx, currentPiece.x + dx, currentPiece.y + dy, currentPiece.color);
      }
    });
  });
}

function drawHold() {
  holdCtx.clearRect(0,0,120,120);
  if (holdPiece) {
    const ox = (4 - holdPiece.shape[0].length)/2;
    const oy = (4 - holdPiece.shape.length)/2;
    holdPiece.shape.forEach((r,y) => r.forEach((v,x) => v && drawBlock(holdCtx, x+ox, y+oy, holdPiece.color)));
  }
}

function drawNext() {
  nextCtxs.forEach((ctx,i) => {
    ctx.clearRect(0,0,160,100);
    const p = nextQueue[i];
    const ox = (4 - p.shape[0].length)/2 + 0.5;
    const oy = (4 - p.shape.length)/2;
    p.shape.forEach((r,y) => r.forEach((v,x) => v && drawBlock(ctx, x+ox, y+oy, p.color)));
  });
}

// Collision & Game Logic
function collides(p) {
  return p.shape.some((r,dy) => r.some((v,dx) => {
    if (!v) return false;
    const x = p.x + dx, y = p.y + dy;
    return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x]);
  }));
}

function merge() {
  currentPiece.shape.forEach((r,dy) => r.forEach((v,dx) => {
    if (v && currentPiece.y + dy >= 0) {
      board[currentPiece.y + dy][currentPiece.x + dx] = currentPiece.color;
    }
  }));
  sounds.drop.play();
}

function clearLines() {
  let cleared = 0;
  board = board.filter(row => {
    if (row.every(v => v)) { cleared++; return false; }
    return true;
  });
  while (board.length < ROWS) board.unshift(Array(COLS).fill(0));
  
  if (cleared) {
    sounds.clear.play();
    lines += cleared;
    score += [100,300,500,800][cleared-1] * level;
    level = Math.floor(lines/10) + 1;
    dropInterval = Math.max(50, 1000 - (level-1)*90);
    updateScore();
  }
}

function hold() {
  if (!canHold) return;
  if (!holdPiece) {
    holdPiece = {...currentPiece, shape: currentPiece.shape.map(r=>[...r])};
    nextPiece();
  } else {
    [currentPiece, holdPiece] = [holdPiece, currentPiece];
    currentPiece.x = Math.floor(COLS/2) - Math.floor(currentPiece.shape[0].length/2);
    currentPiece.y = 0;
  }
  canHold = false;
  drawHold();
}

function nextPiece() {
  currentPiece = nextQueue.shift();
  nextQueue.push(new Piece());
  canHold = true;
  drawNext();
  if (collides(currentPiece)) {
    gameOver = true;
    sounds.bgm.pause();
    sounds.gameover.play();
    $('gameover-overlay').classList.remove('hidden');
  }
}

// Game Loop
function update(time = 0) {
  if (gameOver || paused) return;
  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;
  if (dropCounter > dropInterval) {
    currentPiece.y++;
    if (collides(currentPiece)) {
      currentPiece.y--;
      merge();
      clearLines();
      nextPiece();
    }
    dropCounter = 0;
  }
  drawBoard();
  requestAnimationFrame(update);
}

// Controls - Keyboard
document.addEventListener('keydown', e => {
  if (gameOver || paused) return;
  switch(e.key) {
    case 'ArrowLeft': currentPiece.x--; if(collides(currentPiece)) currentPiece.x++; break;
    case 'ArrowRight': currentPiece.x++; if(collides(currentPiece)) currentPiece.x--; break;
    case 'ArrowDown': currentPiece.y++; if(collides(currentPiece)) { currentPiece.y--; merge(); clearLines(); nextPiece(); } break;
    case 'ArrowUp':
      currentPiece.rotate();
      sounds.rotate.play();
      if(collides(currentPiece)) for(let i=0;i<3;i++){ currentPiece.rotate(); if(!collides(currentPiece)) break; }
      break;
    case ' ': // Hard drop
      while(!collides({...currentPiece, y: currentPiece.y + 1})) { currentPiece.y++; score += 2; }
      merge(); clearLines(); nextPiece(); updateScore();
      break;
    case 'c': case 'C': hold(); drawHold(); break;
    case 'Escape': paused = !paused; $('pause-overlay').classList.toggle('hidden', !paused);
                   paused ? sounds.bgm.pause() : sounds.bgm.play(); break;
  }
  drawBoard();
});

// Mobile Touch Controls
let touchStartX, touchStartY;
GAME_CANVAS.addEventListener('touchstart', e => {
  e.preventDefault();
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, {passive: false});

GAME_CANVAS.addEventListener('touchend', e => {
  e.preventDefault();
  if (!touchStartX || !touchStartY) return;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (Math.max(absX, absY) > 30) {
    if (absX > absY) {
      currentPiece.x += dx > 0 ? 1 : -1;
      if (collides(currentPiece)) currentPiece.x -= dx > 0 ? 1 : -1;
    } else if (dy > 0) {
      currentPiece.y++;
      if (collides(currentPiece)) { currentPiece.y--; merge(); clearLines(); nextPiece(); }
    }
  } else {
    // Tap = rotate
    currentPiece.rotate();
    sounds.rotate.play();
    if(collides(currentPiece)) for(let i=0;i<3;i++){ currentPiece.rotate(); if(!collides(currentPiece)) break; }
  }
  if (e.touches.length === 0) { touchStartX = null; touchStartY = null; }
  drawBoard();
});

// Double tap = hard drop
let lastTap = 0;
GAME_CANVAS.addEventListener('touchend', () => {
  const now = Date.now();
  if (now - lastTap < 300) {
    while(!collides({...currentPiece, y: currentPiece.y + 1})) { currentPiece.y++; score += 2; }
    merge(); clearLines(); nextPiece(); updateScore();
  }
  lastTap = now;
});

// Start Game
$class('start-screen').addEventListener('click', startGame);
document.addEventListener('keydown', e => e.key === ' ' && $class('start-screen').classList.contains('hidden') === false && startGame());

function startGame() {
  $class('start-screen').classList.add('hidden');
  resetGame();
  sounds.bgm.currentTime = 0;
  sounds.bgm.play();
  startCountdown();
}

function resetGame() {
  board = Array(ROWS).fill().map(() => Array(COLS).fill(0));
  score = lines = 0; level = 1; dropInterval = 1000;
  nextQueue = Array(6).fill().map(() => new Piece());
  currentPiece = nextQueue.shift();
  nextQueue.push(new Piece());
  holdPiece = null; canHold = true;
  gameOver = paused = false;
  $('gameover-overlay').classList.add('hidden');
  $('pause-overlay').classList.add('hidden');
  updateScore();
  drawBoard(); drawHold(); drawNext();
}

function startCountdown() {
  const el = $('countdown');
  el.classList.remove('hidden');
  let count = 3;
  el.textContent = count;
  const timer = setInterval(() => {
    count--;
    if (count > 0) el.textContent = count;
    else { el.classList.add('hidden'); clearInterval(timer); update(); }
  }, 900);
}

// Init
drawHold(); drawNext(); updateScore();