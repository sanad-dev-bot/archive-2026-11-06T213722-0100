const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { FONT } = require('./fonts');
const { textFor } = require('./i18n');


const ROBOT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>'
  + '<linearGradient id="head" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D9D2FF"/></linearGradient>'
  + '</defs>'
  + '<path d="M180 560 A332 332 0 0 1 844 560" fill="none" stroke="#2B1B6B" stroke-width="46" stroke-linecap="round"/>'
  + '<line x1="512" y1="290" x2="512" y2="150" stroke="#EDE9FF" stroke-width="20" stroke-linecap="round"/>'
  + '<circle cx="512" cy="128" r="38" fill="#FFFFFF"/>'
  + '<rect x="214" y="280" width="596" height="530" rx="160" fill="url(#head)"/>'
  + '<rect x="132" y="445" width="124" height="240" rx="56" fill="#FF5C7A"/>'
  + '<rect x="768" y="445" width="124" height="240" rx="56" fill="#FF5C7A"/>'
  + '<rect x="282" y="382" width="460" height="226" rx="106" fill="#1B1445"/>'
  + '<path d="M332 478 H468 A68 68 0 0 1 332 478 Z" fill="#5EF2D6"/>'
  + '<path d="M556 478 H692 A68 68 0 0 1 556 478 Z" fill="#5EF2D6"/>'
  + '<path d="M438 692 Q520 748 600 672" fill="none" stroke="#2B1B6B" stroke-width="24" stroke-linecap="round"/>'
  + '</svg>';

const TEXT = {
  tickets: ['الدعم الفني', 'سند معاك لحد ما مشكلتك تتحل'],
  verify: ['التحقق', 'خطوة واحدة وتدخل السيرفر'],
  rules: ['القوانين', 'عشان السيرفر يفضل مكان حلو للكل'],
  about: ['سند', 'دايمًا في ضهرك'],
  apply: ['فريق الإدارة', 'قدّم وكن جزء من الفريق'],
};

async function drawScene() {
  const W = 1100; const H = 400; const cx = 840; const cy = 200; const r = 240;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2E1C7A'); sky.addColorStop(1, '#160E3D');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const sun = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  sun.addColorStop(0, '#FFD166'); sun.addColorStop(0.55, '#FF7E67'); sun.addColorStop(1, '#E23E8C');
  ctx.fillStyle = sun; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = '#1E1350';
  [[0.34, 0.045], [0.5, 0.06], [0.66, 0.075], [0.84, 0.09]].forEach(([f, t]) => ctx.fillRect(cx - r, cy + r * f, r * 2, r * t));
  ctx.restore();

  const robot = await loadImage(Buffer.from(ROBOT));
  ctx.drawImage(robot, cx - 190, 15, 380, 380);
  return { canvas, ctx };
}

async function buildBanner(kind, lang = 'ar') {
  const { canvas, ctx } = await drawScene();

  const [title, sub] = TEXT[kind].map(text => textFor(lang, text));
  ctx.textAlign = 'center';
  ctx.direction = lang === 'en' ? 'ltr' : 'rtl';
  ctx.fillStyle = '#FFFFFF';
  const setFitted = (text, size, family = FONT.bold) => {
    ctx.font = size + 'px ' + family;
    const width = ctx.measureText(text).width;
    if (width > 580) ctx.font = Math.floor(size * 580 / width) + 'px ' + family;
  };
  setFitted(title, 86);
  ctx.fillText(title, 310, 200);
  ctx.fillStyle = '#BDB3FF';
  setFitted(sub, 32, FONT.medium);
  ctx.fillText(sub, 310, 275);

  return { attachment: canvas.toBuffer('image/png'), name: 'banner.png' };
}

// The card fonts cover Arabic and Latin only; styled letters normalize to plain ones
function cardName(member) {
  const clean = value => value.normalize('NFKC').replace(/[^\p{Script=Arabic}\p{Script=Latin}\p{N} ._'-]/gu, '').replace(/\s+/g, ' ').trim();
  return clean(member.displayName) || clean(member.user.username) || 'Member';
}

function drawWelcomeBackground(ctx, W, H, side) {
  const sky = ctx.createLinearGradient(0, 0, W, H);
  sky.addColorStop(0, '#120B34'); sky.addColorStop(0.6, '#24166A'); sky.addColorStop(1, '#3A1F7E');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  const glow = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  glow(side(210), 240, 420, 'rgba(94,242,214,0.20)');
  glow(side(1010), 240, 420, 'rgba(255,92,122,0.24)');

  const cx = side(1000); const cy = 250; const r = 182;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const sun = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  sun.addColorStop(0, '#FFD166'); sun.addColorStop(0.55, '#FF7E67'); sun.addColorStop(1, '#E23E8C');
  ctx.fillStyle = sun; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = '#24166A';
  [[0.34, 0.045], [0.5, 0.06], [0.66, 0.075], [0.84, 0.09]].forEach(([f, t]) => ctx.fillRect(cx - r, cy + r * f, r * 2, r * t));
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(18, 18, W - 36, H - 36, 30); ctx.stroke();
}

async function drawWelcomeAvatar(ctx, member, x, y, r) {
  const ring = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  ring.addColorStop(0, '#5EF2D6'); ring.addColorStop(0.5, '#FFD166'); ring.addColorStop(1, '#FF5C7A');
  ctx.save();
  ctx.shadowColor = 'rgba(94,242,214,0.55)';
  ctx.shadowBlur = 36;
  ctx.fillStyle = ring;
  ctx.beginPath(); ctx.arc(x, y, r + 9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#120B34';
  ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill();
  const avatar = await loadImage(member.displayAvatarURL({ extension: 'png', size: 256 })).catch(() => null);
  if (!avatar) return;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(avatar, x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

async function buildWelcomeCard(member, position, lang = 'ar') {
  const W = 1200; const H = 480;
  const english = lang === 'en';
  // Arabic reads right to left, so the whole layout mirrors
  const side = x => (english ? x : W - x);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawWelcomeBackground(ctx, W, H, side);
  const robot = await loadImage(Buffer.from(ROBOT));
  ctx.drawImage(robot, side(1000) - 165, 90, 330, 330);
  await drawWelcomeAvatar(ctx, member, side(205), 240, 125);

  const X = side(375);
  const MAX_WIDTH = 440;
  ctx.textAlign = english ? 'left' : 'right';
  ctx.direction = english ? 'ltr' : 'rtl';
  ctx.textBaseline = 'alphabetic';
  const write = (text, size, y, color, family) => {
    ctx.fillStyle = color;
    ctx.font = size + 'px ' + family;
    const width = ctx.measureText(text).width;
    if (width > MAX_WIDTH) ctx.font = Math.floor(size * MAX_WIDTH / width) + 'px ' + family;
    ctx.fillText(text, X, y);
  };

  const greeting = textFor(lang, 'نورت السيرفر');
  write(english ? greeting.toUpperCase() : greeting, english ? 24 : 32, 158, '#5EF2D6', FONT.bold);
  write(cardName(member), 68, 238, '#FFFFFF', FONT.bold);
  write(member.guild.name, 28, 288, '#BDB3FF', FONT.medium);

  const badge = textFor(lang, 'العضو رقم ' + position);
  ctx.font = '24px ' + FONT.bold;
  const badgeWidth = ctx.measureText(badge).width + 44;
  const badgeX = english ? X : X - badgeWidth;
  ctx.fillStyle = '#FFD166';
  ctx.beginPath(); ctx.roundRect(badgeX, 318, badgeWidth, 50, 25); ctx.fill();
  ctx.fillStyle = '#1B1445';
  ctx.fillText(badge, english ? X + 22 : X - 22, 352);

  return { attachment: canvas.toBuffer('image/png'), name: 'welcome.png' };
}

module.exports = { buildBanner, buildWelcomeCard };
