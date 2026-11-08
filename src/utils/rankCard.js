require('./fonts');
const { textFor } = require('./i18n');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

const WIDTH = 1500;
const HEIGHT = 450;
const XP_PER_LEVEL = 150;
const FONT_REGULAR = path.join(process.cwd(), 'assets', 'fonts', 'Tajawal-Medium.ttf');
const FONT_BOLD = path.join(process.cwd(), 'assets', 'fonts', 'Tajawal-ExtraBold.ttf');
try {
  GlobalFonts.registerFromPath(FONT_REGULAR, 'Sanad Arabic Medium');
  GlobalFonts.registerFromPath(FONT_BOLD, 'Sanad Arabic Bold');
} catch {}

function arFont(size, bold = false) {
  return `${size}px "Sanad Arabic ${bold ? 'Bold' : 'Medium'}"`;
}
function isArabicChar(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f) || (c >= 0x08a0 && c <= 0x08ff) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff);
}
function mixedRuns(text) {
  const runs = [];
  let current = '';
  let arabic = null;
  for (const ch of String(text)) {
    const a = isArabicChar(ch);
    if (current && a !== arabic) { runs.push({ text: current, arabic }); current = ''; }
    current += ch;
    arabic = a;
  }
  if (current) runs.push({ text: current, arabic });
  return runs;
}
function mixedWidth(ctx, text, size, bold = false) {
  let width = 0;
  for (const run of mixedRuns(text)) {
    ctx.font = run.arabic ? arFont(size, bold) : `${size}px "Sanad Latin ${bold ? 'Bold' : 'Medium'}"`;
    width += ctx.measureText(run.text).width;
  }
  return width;
}
function drawMixed(ctx, text, x, y, size, bold = false, align = 'left') {
  const total = mixedWidth(ctx, text, size, bold);
  let cursor = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  ctx.textAlign = 'left';
  for (const run of mixedRuns(text)) {
    ctx.font = run.arabic ? arFont(size, bold) : `${size}px "Sanad Latin ${bold ? 'Bold' : 'Medium'}"`;
    ctx.fillText(run.text, cursor, y);
    cursor += ctx.measureText(run.text).width;
  }
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
function drawBar(ctx, x, y, w, h, progress) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = '#2b2f37'; ctx.fill();
  const fillW = Math.max(8, w * clamp(progress, 0, 1));
  roundRect(ctx, x, y, fillW, h, h / 2);
  ctx.fillStyle = '#dfe7f2'; ctx.fill();
}
function drawChatIcon(ctx, x, y) {
  ctx.save(); ctx.strokeStyle = '#dfe7f2'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  roundRect(ctx, x, y - 28, 34, 26, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 9, y - 2); ctx.lineTo(x + 3, y + 9); ctx.stroke(); ctx.restore();
}
function drawVoiceIcon(ctx, x, y) {
  ctx.save(); ctx.strokeStyle = '#dfe7f2'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  roundRect(ctx, x + 10, y - 38, 14, 40, 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + 17, y + 4, 19, 0, Math.PI); ctx.moveTo(x + 17, y + 23); ctx.lineTo(x + 17, y + 36); ctx.moveTo(x + 3, y + 36); ctx.lineTo(x + 31, y + 36); ctx.stroke(); ctx.restore();
}
function drawTrophy(ctx, cx, cy) {
  ctx.save(); ctx.strokeStyle = '#f1f4f8'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  roundRect(ctx, cx - 13, cy - 17, 26, 29, 5); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 13, cy - 9); ctx.lineTo(cx - 27, cy - 9); ctx.arc(cx - 27, cy - 1, 8, -Math.PI / 2, Math.PI / 2); ctx.lineTo(cx - 13, cy + 3);
  ctx.moveTo(cx + 13, cy - 9); ctx.lineTo(cx + 27, cy - 9); ctx.arc(cx + 27, cy - 1, 8, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(cx + 13, cy + 3);
  ctx.moveTo(cx, cy + 12); ctx.lineTo(cx, cy + 25); ctx.moveTo(cx - 14, cy + 31); ctx.lineTo(cx + 14, cy + 31); ctx.stroke(); ctx.restore();
}

async function createRankCard({ member, textXp = 0, voiceXp = 0, position = 1, lang = 'ar' }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#171a20'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  roundRect(ctx, 24, 24, WIDTH - 48, HEIGHT - 48, 32);
  ctx.fillStyle = '#1b1f26'; ctx.fill();

  const avatarSize = 300, ax = 62, ay = 75;
  ctx.save(); ctx.beginPath(); ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2); ctx.clip();
  try { const avatar = await loadImage(member.user.displayAvatarURL({ extension: 'png', size: 512 })); ctx.drawImage(avatar, ax, ay, avatarSize, avatarSize); }
  catch { ctx.fillStyle = '#5865f2'; ctx.fillRect(ax, ay, avatarSize, avatarSize); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2); ctx.strokeStyle = '#91a5c1'; ctx.lineWidth = 6; ctx.stroke();

  const left = 425, barW = 1005;
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#f4f6fa';
  drawMixed(ctx, String(member.guild?.name || 'Server').slice(0, 28), left, 112, 48, true);
  ctx.fillStyle = '#9ca7b7'; drawMixed(ctx, '@' + member.user.username, left, 156, 30);

  roundRect(ctx, 1280, 66, 160, 62, 18); ctx.fillStyle = '#252b35'; ctx.fill(); ctx.strokeStyle = '#65748a'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#f1f4f8'; drawMixed(ctx, `#${position}`, 1360, 103, 30, true, 'center');

  function drawXPRow(y, kind, label, xp) {
    const safeXp = Math.max(0, Number(xp) || 0);
    const level = Math.floor(safeXp / XP_PER_LEVEL) + 1;
    const current = Math.floor(safeXp % XP_PER_LEVEL);
    const progress = current / XP_PER_LEVEL;
    ctx.fillStyle = '#dfe7f2';
    if (kind === 'chat') drawChatIcon(ctx, left, y); else drawVoiceIcon(ctx, left, y);
    drawMixed(ctx, label, left + 42, y, 31, true);
    drawMixed(ctx, `Lv. ${level}  •  ${current} / ${XP_PER_LEVEL} XP`, left + barW, y, 29, true, 'right');
    drawBar(ctx, left, y + 18, barW, 25, progress);
  }
  drawXPRow(205, 'chat', textFor(lang, 'اللفل الكتابي'), textXp);
  drawXPRow(320, 'voice', textFor(lang, 'اللفل الصوتي'), voiceXp);
  return canvas.toBuffer('image/png');
}
module.exports = { createRankCard, XP_PER_LEVEL };
