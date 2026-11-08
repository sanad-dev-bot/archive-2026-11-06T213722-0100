require('./fonts');
const { textFor } = require('./i18n');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

const WIDTH = 1500;
const HEIGHT = 1050;
const XP_PER_LEVEL = 150;

const FONT_REGULAR = path.join(process.cwd(), 'assets', 'fonts', 'Tajawal-Medium.ttf');
const FONT_BOLD = path.join(process.cwd(), 'assets', 'fonts', 'Tajawal-ExtraBold.ttf');
try {
  if (GlobalFonts?.registerFromPath) {
    GlobalFonts.registerFromPath(FONT_REGULAR, 'Sanad Arabic Medium');
    GlobalFonts.registerFromPath(FONT_BOLD, 'Sanad Arabic Bold');
  }
} catch {}

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
function font(size, bold = false) {
  return `${size}px "Sanad Arabic ${bold ? 'Bold' : 'Medium'}"`;
}

// The Arabic font in this project intentionally contains Arabic + digits,
// but not Latin punctuation such as @, _, / and common username characters.
// Draw mixed strings in small runs so those characters never become squares.
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
function measureMixed(ctx, text, size, bold = false) {
  let w = 0;
  for (const r of mixedRuns(text)) {
    ctx.font = r.arabic ? font(size, bold) : `${size}px "Sanad Latin ${bold ? 'Bold' : 'Medium'}"`;
    w += ctx.measureText(r.text).width;
  }
  return w;
}
function drawMixed(ctx, text, x, y, size, bold = false, align = 'left') {
  const runs = mixedRuns(text);
  const total = measureMixed(ctx, text, size, bold);
  let cursor = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  ctx.textAlign = 'left';
  for (const r of runs) {
    ctx.font = r.arabic ? font(size, bold) : `${size}px "Sanad Latin ${bold ? 'Bold' : 'Medium'}"`;
    ctx.fillText(r.text, cursor, y);
    cursor += ctx.measureText(r.text).width;
  }
  return total;
}
function drawAvatar(ctx, member) {
  const size = 370, x = 70, y = 90;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  return loadImage(member.user.displayAvatarURL({ extension: 'png', size: 512 }))
    .then(img => ctx.drawImage(img, x, y, size, size))
    .catch(() => { ctx.fillStyle = '#5865f2'; ctx.fillRect(x, y, size, size); })
    .finally(() => ctx.restore());
}
function drawProgress(ctx, x, y, w, h, progress) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = '#2b2f37';
  ctx.fill();
  const fillW = Math.max(12, w * clamp(progress, 0, 1));
  roundRect(ctx, x, y, fillW, h, h / 2);
  ctx.fillStyle = '#dfe7f2';
  ctx.fill();
}
function drawIcon(ctx, type, cx, cy) {
  ctx.save();
  ctx.strokeStyle = '#f4f6fa';
  ctx.fillStyle = 'transparent';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (type === 'chat') {
    roundRect(ctx, cx - 45, cy - 38, 90, 65, 15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 18, cy + 27); ctx.lineTo(cx - 35, cy + 50); ctx.lineTo(cx - 2, cy + 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 20, cy - 8); ctx.lineTo(cx + 25, cy - 8); ctx.moveTo(cx - 20, cy + 10); ctx.lineTo(cx + 15, cy + 10); ctx.stroke();
  } else if (type === 'voice') {
    roundRect(ctx, cx - 18, cy - 52, 36, 72, 18); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy + 8, 38, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + 46); ctx.lineTo(cx, cy + 65); ctx.moveTo(cx - 25, cy + 65); ctx.lineTo(cx + 25, cy + 65); ctx.stroke();
  } else if (type === 'trophy') {
    roundRect(ctx, cx - 27, cy - 35, 54, 50, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 27, cy - 20); ctx.lineTo(cx - 55, cy - 20); ctx.arc(cx - 55, cy - 2, 18, -Math.PI / 2, Math.PI / 2); ctx.lineTo(cx - 27, cy + 2); ctx.moveTo(cx + 27, cy - 20); ctx.lineTo(cx + 55, cy - 20); ctx.arc(cx + 55, cy - 2, 18, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(cx + 27, cy + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + 15); ctx.lineTo(cx, cy + 42); ctx.moveTo(cx - 27, cy + 55); ctx.lineTo(cx + 27, cy + 55); ctx.moveTo(cx, cy + 42); ctx.lineTo(cx - 18, cy + 55); ctx.moveTo(cx, cy + 42); ctx.lineTo(cx + 18, cy + 55); ctx.stroke();
  } else if (type === 'calendar') {
    roundRect(ctx, cx - 50, cy - 42, 100, 92, 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 50, cy - 12); ctx.lineTo(cx + 50, cy - 12); ctx.moveTo(cx - 28, cy - 58); ctx.lineTo(cx - 28, cy - 30); ctx.moveTo(cx + 28, cy - 58); ctx.lineTo(cx + 28, cy - 30); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy + 20, 8, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawPanel(ctx, x, y, w, h, title, value, iconType) {
  roundRect(ctx, x, y, w, h, 28);
  ctx.fillStyle = '#1b1f26';
  ctx.fill();
  ctx.strokeStyle = '#3c424d';
  ctx.lineWidth = 2;
  ctx.stroke();

  drawIcon(ctx, iconType, x + 95, y + h / 2);

  ctx.strokeStyle = '#4a4f59';
  ctx.beginPath();
  ctx.moveTo(x + 185, y + 38);
  ctx.lineTo(x + 185, y + h - 38);
  ctx.stroke();

  ctx.fillStyle = '#aeb6c3';
  drawMixed(ctx, title, x + 225, y + 62, 25, true, 'left');
  ctx.fillStyle = '#f4f6fa';
  drawMixed(ctx, value, x + 225, y + 128, 42, true, 'left');
}

async function createProfileCard({ member, xp, position = 1, lang = 'ar' }) {
  const T = text => textFor(lang, text);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#171a20';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  roundRect(ctx, 24, 24, WIDTH - 48, HEIGHT - 48, 32);
  ctx.fillStyle = '#1b1f26';
  ctx.fill();
  ctx.strokeStyle = '#303641';
  ctx.lineWidth = 2;
  ctx.stroke();

  await drawAvatar(ctx, member);
  ctx.beginPath();
  ctx.arc(255, 275, 188, 0, Math.PI * 2);
  ctx.strokeStyle = '#dfe7f2';
  ctx.lineWidth = 6;
  ctx.stroke();

  const totalXp = Math.max(0, Number(xp?.xp ?? xp?.textXp) || 0);
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const currentXp = Math.floor(totalXp % XP_PER_LEVEL);
  const progress = currentXp / XP_PER_LEVEL;
  const messages = Number(xp?.messages) || 0;
  const voiceMinutes = Math.floor((Number(xp?.voiceXp) || 0) / 5);

  const left = 470;
  ctx.fillStyle = '#f4f6fa';
  const serverName = String(member.guild?.name || 'Server').slice(0, 28);
  drawMixed(ctx, serverName, left, 125, 50, true, 'left');
  ctx.fillStyle = '#aeb6c3';
  drawMixed(ctx, '@' + member.user.username, left, 170, 23, false, 'left');

  roundRect(ctx, left, 205, 210, 68, 18);
  ctx.fillStyle = '#4c4e55';
  ctx.fill();
  ctx.fillStyle = '#f4f6fa';
  drawMixed(ctx, T(`المستوى ${level}`), left + 22, 248, 27, true, 'left');

  drawProgress(ctx, left, 310, 900, 38, progress);
  ctx.fillStyle = '#f4f6fa';
  ctx.font = font(25, true);
  drawMixed(ctx, `${currentXp} / ${XP_PER_LEVEL} XP`, left, 382, 25, true, 'left');
  drawMixed(ctx, `${Math.round(progress * 100)}%`, left + 900, 382, 25, true, 'right');

  drawPanel(ctx, 60, 555, 650, 210, T('الرسائل'), String(messages), 'chat');
  drawPanel(ctx, 790, 555, 650, 210, T('وقت الصوت'), T(`${voiceMinutes} دقيقة`), 'voice');
  drawPanel(ctx, 60, 805, 650, 185, T('الترتيب'), `#${position}`, 'trophy');

  const joined = member.joinedAt
    ? member.joinedAt.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }).replaceAll('-', '/')
    : 'Unknown';
  drawPanel(ctx, 790, 805, 650, 185, T('تاريخ الانضمام'), joined, 'calendar');

  return canvas.toBuffer('image/png');
}

module.exports = { createProfileCard };
