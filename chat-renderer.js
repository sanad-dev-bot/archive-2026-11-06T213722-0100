const path = require('node:path');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');

GlobalFonts.registerFromPath(path.join(__dirname, 'assets', 'DejaVuSans.ttf'), 'Guard Sans');
GlobalFonts.registerFromPath(path.join(__dirname, 'assets', 'DejaVuSans-Bold.ttf'), 'Guard Sans Bold');

function wrapChatText(ctx, text, maxWidth, maxLines = 12) {
  const lines = [];
  let current = '';
  for (const part of String(text || '').replace(/\r/g, '').split(/(\n)|\s+/).filter(Boolean)) {
    if (part === '\n') {
      if (current) lines.push(current);
      current = '';
      continue;
    }
    const next = current ? `${current} ${part}` : part;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(1, lines[maxLines - 1].length - 1))}…`;
  }
  return lines.length ? lines : [' '];
}

async function renderChatScreenshot(message, bannedWord) {
  const width = 1000;
  const pad = 42;
  const content = String(message.content || '[رسالة بدون نص]').slice(0, 1200);
  const measureCanvas = createCanvas(width, 100);
  const measure = measureCanvas.getContext('2d');
  measure.font = '25px "Guard Sans"';
  measure.direction = 'rtl';
  const lines = wrapChatText(measure, content, width - pad * 2, 12);
  const height = 222 + lines.length * 42;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Dark Discord-like channel header and chat background.
  ctx.fillStyle = '#313338';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, width, 76);
  ctx.fillStyle = '#b5bac1';
  ctx.font = '34px "Guard Sans"';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillText('#', 30, 51);
  ctx.fillStyle = '#f2f3f5';
  ctx.font = '22px "Guard Sans Bold"';
  ctx.fillText(String(message.channel?.name || 'عام').slice(0, 50), 62, 34);
  ctx.fillStyle = '#949ba4';
  ctx.font = '15px "Guard Sans"';
  ctx.fillText(String(message.guild.name).slice(0, 70), 62, 59);

  // Message separator, real user avatar when reachable, otherwise a clear initial fallback.
  ctx.fillStyle = '#ed4245';
  ctx.fillRect(24, 99, 4, height - 124);
  const hue = [...String(message.author.id)].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
  let avatarImage = null;
  try {
    const avatarUrl = message.author.displayAvatarURL?.({ extension: 'png', size: 128 });
    if (avatarUrl) {
      const response = await fetch(avatarUrl, { signal: AbortSignal.timeout(1500) });
      if (response.ok) avatarImage = await loadImage(Buffer.from(await response.arrayBuffer()));
    }
  } catch { /* Use the local initials avatar if the CDN is unreachable. */ }
  ctx.save();
  ctx.beginPath();
  ctx.arc(67, 128, 25, 0, Math.PI * 2);
  ctx.clip();
  if (avatarImage) {
    ctx.drawImage(avatarImage, 42, 103, 50, 50);
  } else {
    ctx.fillStyle = `hsl(${hue},55%,48%)`;
    ctx.fillRect(42, 103, 50, 50);
    ctx.fillStyle = '#fff';
    ctx.font = '21px "Guard Sans Bold"';
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.fillText(String(message.author.username || 'عضو').slice(0, 1), 67, 136);
  }
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillStyle = '#f2f3f5';
  ctx.font = '19px "Guard Sans Bold"';
  ctx.fillText(String(message.member?.displayName || message.author.username).slice(0, 60), 108, 122);
  ctx.fillStyle = '#969ba4';
  ctx.font = '14px "Guard Sans"';
  ctx.fillText(new Date(message.createdTimestamp || Date.now()).toLocaleString('en-US'), 108, 145);

  // Render the exact message, with Arabic shaping and RTL support.
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#dbdee1';
  ctx.font = '25px "Guard Sans"';
  lines.forEach((line, i) => ctx.fillText(line, width - pad, 191 + i * 42));

  // Clear moderation footer, separate from the original message.
  ctx.fillStyle = '#f23f43';
  ctx.font = '17px "Guard Sans Bold"';
  ctx.fillText(`الكلمة المحظورة: ${String(bannedWord).slice(0, 70)}`, width - pad, height - 46);
  ctx.fillText('تم حذف الرسالة', width - pad, height - 18);
  return canvas.toBuffer('image/png');
}

module.exports = renderChatScreenshot;
