// /play plus one /music command with subcommands: Discord allows 100 slash commands per bot and Sanad is close
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
const music = require('../../utils/music');

const COLOR = 0x5EF2D6;
const LOOP_NAMES = { off: 'مقفول', track: 'الأغنية', queue: 'القايمة كلها' };
const ok = text => new EmbedBuilder().setDescription(text).setColor(COLOR);
const bad = text => new EmbedBuilder().setDescription('❌ ' + text).setColor(Colors.Red);

async function answer(i, embed, ephemeral = false) {
  if (i.deferred || i.replied) return i.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  return i.reply({ embeds: [embed], ephemeral, allowedMentions: { parse: [] } });
}

// The controls need music playing, the member in the bot's room, and the right to steer it
function control(i) {
  const st = music.players.get(i.guild.id);
  if (!st?.current && !st?.queue.length) return { error: 'مفيش حاجة شغالة.' };
  const problem = music.check(i);
  if (problem) return { error: problem };
  if (!music.canControl(i, st)) return { error: 'اللي طلب الأغنية أو حد معاه صلاحية **Move Members** بس.' };
  return { st };
}

async function play(i) {
  await i.deferReply();
  try {
    const res = await music.play(i, i.options.getString('song', true));
    if (res.error) return answer(i, bad(res.error));
    if (res.playlist) return answer(i, ok('📃 اتضاف **' + res.added.length + '** أغنية من **' + res.playlist + '**'));
    const t = res.added[0];
    return answer(i, ok((res.startNow ? '▶️ بدأ التشغيل: ' : '➕ اتضافت للقايمة: ') + '**' + t.title + '**'
      + (t.seconds ? ' `' + music.fmt(t.seconds) + '`' : '')));
  } catch (err) {
    console.error('[MUSIC] /play:', err.message);
    return answer(i, bad('ماقدرتش أجيب الأغنية دي من يوتيوب. جرب اسم تاني أو لينك تاني.'));
  }
}

function queueEmbed(st) {
  const lines = st.queue.slice(0, 15).map((t, n) => '`' + (n + 1) + '.` ' + t.title + (t.seconds ? ' `' + music.fmt(t.seconds) + '`' : '') + ' • <@' + t.by + '>');
  const more = st.queue.length > 15 ? '\n… و ' + (st.queue.length - 15) + ' كمان' : '';
  return new EmbedBuilder()
    .setTitle('📃 القايمة')
    .setDescription((st.current ? '🎵 **دلوقتي:** ' + st.current.title + '\n\n' : '') + (lines.join('\n') || 'مفيش أغاني بعدها.') + more)
    .setFooter({ text: 'التكرار: ' + LOOP_NAMES[st.loop] + ' • الصوت: ' + st.volume + '%' })
    .setColor(COLOR);
}

function nowEmbed(st) {
  const t = st.current;
  const done = Math.floor((st.player.state.resource?.playbackDuration || 0) / 1000);
  const width = 16;
  const pos = t.seconds ? Math.min(width - 1, Math.floor((done / t.seconds) * width)) : 0;
  const paused = st.player.state.status === AudioPlayerStatus.Paused;
  return new EmbedBuilder()
    .setTitle((paused ? '⏸️ ' : '🎶 ') + t.title)
    .setURL(t.url)
    .setDescription('▬'.repeat(pos) + '🔘' + '▬'.repeat(width - pos - 1) + '\n`' + music.fmt(done) + ' / ' + music.fmt(t.seconds) + '`\nطلب: <@' + t.by + '>')
    .setColor(COLOR);
}

async function sub(i) {
  const name = i.options.getSubcommand();
  const st0 = music.players.get(i.guild.id);

  // Read-only views: anyone
  if (name === 'queue') {
    if (!st0?.current && !st0?.queue.length) return answer(i, bad('القايمة فاضية.'), true);
    return answer(i, queueEmbed(st0));
  }
  if (name === 'nowplaying') {
    if (!st0?.current) return answer(i, bad('مفيش حاجة شغالة.'), true);
    return answer(i, nowEmbed(st0));
  }

  if (name === 'remove') {
    const n = i.options.getInteger('number', true);
    const t = st0?.queue[n - 1];
    if (!t) return answer(i, bad('مفيش أغنية بالرقم ده.'), true);
    const problem = music.check(i);
    if (problem) return answer(i, bad(problem), true);
    if (t.by !== i.user.id && !music.canControl(i, { current: { by: null } })) return answer(i, bad('تقدر تشيل أغانيك إنت بس.'), true);
    st0.queue.splice(n - 1, 1);
    return answer(i, ok('🗑️ اتشالت: **' + t.title + '**'));
  }

  if (name === 'leave' && !st0) {
    if (!i.member.voice?.channel) return answer(i, bad('لازم تكون في روم صوتي.'), true);
    await music.leave(i.guild, 'leave');
    return answer(i, ok('👋 خرجت.'));
  }

  const { st, error } = control(i);
  if (error) return answer(i, bad(error), true);
  switch (name) {
    case 'skip':
      st.skipping = true;
      st.player.stop();
      return answer(i, ok('⏭️ اتخطت.'));
    case 'stop':
    case 'leave':
      await music.leave(i.guild, name);
      return answer(i, ok(name === 'stop' ? '⏹️ الموسيقى وقفت والقايمة اتمسحت.' : '👋 خرجت.'));
    case 'pause':
      return answer(i, ok(st.player.pause() ? '⏸️ وقفت مؤقتاً.' : 'ℹ️ مش شغالة أصلاً.'));
    case 'resume':
      st.autoPaused = false;
      return answer(i, ok(st.player.unpause() ? '▶️ كمّلت.' : 'ℹ️ مش متوقفة.'));
    case 'volume':
      st.volume = i.options.getInteger('percent', true);
      return answer(i, ok('🔊 الصوت بقى **' + st.volume + '%** من الأغنية الجاية.'));
    case 'loop':
      st.loop = i.options.getString('mode', true);
      return answer(i, ok('🔁 التكرار: **' + LOOP_NAMES[st.loop] + '**'));
    case 'shuffle':
      for (let n = st.queue.length - 1; n > 0; n--) {
        const k = Math.floor(Math.random() * (n + 1));
        [st.queue[n], st.queue[k]] = [st.queue[k], st.queue[n]];
      }
      return answer(i, ok('🔀 القايمة اتلخبطت (' + st.queue.length + ' أغنية).'));
    default:
      return answer(i, bad('أمر مش معروف.'), true);
  }
}

// Off unless the host sets MUSIC_ENABLED=1: YouTube streaming needs ~150 MB more RAM than the free plan leaves
// next to the bot, and running out of memory would kill the whole bot (protection included).
const ENABLED = process.env.MUSIC_ENABLED === '1';

module.exports = !ENABLED ? [] : [
  {
    data: new SlashCommandBuilder()
      .setName('play').setDescription('🎵 شغّل أغنية من يوتيوب (اسم أو لينك أو بلاي ليست)')
      .addStringOption(o => o.setName('song').setDescription('اسم الأغنية أو اللينك').setRequired(true).setMaxLength(300)),
    execute: play,
  },
  {
    data: new SlashCommandBuilder()
      .setName('music').setDescription('🎶 التحكم في الموسيقى')
      .addSubcommand(s => s.setName('skip').setDescription('⏭️ تخطي الأغنية الحالية'))
      .addSubcommand(s => s.setName('stop').setDescription('⏹️ وقف الموسيقى وامسح القايمة'))
      .addSubcommand(s => s.setName('pause').setDescription('⏸️ إيقاف مؤقت'))
      .addSubcommand(s => s.setName('resume').setDescription('▶️ كمّل التشغيل'))
      .addSubcommand(s => s.setName('queue').setDescription('📃 قايمة الأغاني'))
      .addSubcommand(s => s.setName('nowplaying').setDescription('🎶 اللي شغال دلوقتي'))
      .addSubcommand(s => s.setName('volume').setDescription('🔊 الصوت (بيتطبق من الأغنية الجاية)')
        .addIntegerOption(o => o.setName('percent').setDescription('من 10 لـ 150').setRequired(true).setMinValue(10).setMaxValue(150)))
      .addSubcommand(s => s.setName('loop').setDescription('🔁 التكرار')
        .addStringOption(o => o.setName('mode').setDescription('نوع التكرار').setRequired(true)
          .addChoices({ name: 'مقفول', value: 'off' }, { name: 'الأغنية', value: 'track' }, { name: 'القايمة كلها', value: 'queue' })))
      .addSubcommand(s => s.setName('shuffle').setDescription('🔀 لخبط ترتيب القايمة'))
      .addSubcommand(s => s.setName('remove').setDescription('🗑️ شيل أغنية من القايمة')
        .addIntegerOption(o => o.setName('number').setDescription('رقمها في القايمة').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('leave').setDescription('👋 وقف الموسيقى واخرج من الروم')),
    execute: sub,
  },
];
