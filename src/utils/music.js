// Music player: YouTube via @distube/ytdl-core, encoded to Opus by the system ffmpeg (no Opus work in JS,
// the host has 25% of one CPU). One player per server. Shares the voice connection with /setvoice:
// music moves Sanad to the listener's room, and when the queue ends Sanad goes back to its stay room.
const prism = require('prism-media');
const {
  AudioPlayerStatus, NoSubscriberBehavior, StreamType, VoiceConnectionStatus,
  createAudioPlayer, createAudioResource, entersState, getVoiceConnection, joinVoiceChannel,
} = require('@discordjs/voice');
const { EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');
const { getGuildConfig } = require('./storage');

// Loaded only when music is actually used: the YouTube library needs ~120 MB of native memory, more than the
// current host can spare next to the bot (see ENABLED in src/commands/music/music.js)
let ytInstance = null;
const ytProxy = new Proxy({}, {
  get(_, key) {
    if (!ytInstance) ytInstance = new (require('@distube/ytdl-core').Ytdl)();
    const value = ytInstance[key];
    return typeof value === 'function' ? value.bind(ytInstance) : value;
  },
});
const yt = ytProxy;
const COLOR = 0x5EF2D6;
const MAX_QUEUE = 100;
const MAX_PER_USER = 25;
const MAX_SECONDS = 3 * 60 * 60;
const IDLE_MS = 2 * 60_000;
const MAX_PLAYERS = Number(process.env.MUSIC_MAX_SERVERS) || 3;

const players = new Map(); // guildId -> state

const YT_RE = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;

function fmt(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + r : m + ':' + r;
}

function toTrack(v, user) {
  return { title: v.title || 'بدون اسم', url: v.url, seconds: Number(v.lengthSeconds) || 0, live: Boolean(v.isLive), by: user.id };
}

// A link, a playlist link, or words to search for
async function resolve(query, user) {
  const q = query.trim();
  if (YT_RE.test(q)) {
    const list = q.match(/[?&]list=([\w-]+)/)?.[1];
    if (list && !/[?&]v=/.test(q)) {
      const pl = await yt.getPlaylist('https://www.youtube.com/playlist?list=' + list);
      return { tracks: (pl.videos || []).slice(0, MAX_PER_USER).map(v => toTrack(v, user)), playlist: pl.title };
    }
    const info = await yt.getInfo(q);
    const d = info.videoDetails;
    return { tracks: [toTrack({ ...d, url: 'https://www.youtube.com/watch?v=' + d.id, isLive: d.isLiveContent }, user)] };
  }
  const found = await yt.search(q, { limit: 1 });
  return { tracks: found.length ? [toTrack(found[0], user)] : [] };
}

function stateOf(guild) {
  let st = players.get(guild.id);
  if (st) return st;
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  st = { guild, player, queue: [], current: null, volume: 80, loop: 'off', text: null, idleTimer: null, streams: [] };
  player.on(AudioPlayerStatus.Idle, () => {
    cleanupStreams(st);
    if (st.stopped) return;
    const finished = st.current;
    // A song that ended within seconds failed (YouTube refused it): it is not looped, and three in a row stop the queue
    const failed = finished && !st.skipping && Date.now() - (st.startedAt || 0) < 5000;
    st.failures = failed ? (st.failures || 0) + 1 : 0;
    if (finished && !failed && st.loop === 'track' && !st.skipping) st.queue.unshift(finished);
    else if (finished && !failed && st.loop === 'queue') st.queue.push(finished);
    st.skipping = false;
    st.current = null;
    if (st.failures >= 3) {
      st.queue = [];
      st.failures = 0;
      say(st, '⚠️ يوتيوب رفض كذا أغنية ورا بعض، فوقفت القايمة. جرب تاني كمان شوية.');
    }
    playNext(st).catch(err => console.error('[MUSIC]', err.message));
  });
  player.on('error', err => {
    console.error('[MUSIC] player:', err.message);
    say(st, '⚠️ حصلت مشكلة في الأغنية دي، هشغّل اللي بعدها.');
  });
  players.set(guild.id, st);
  return st;
}

function cleanupStreams(st) {
  for (const s of st.streams) s.destroy?.();
  st.streams = [];
}

async function say(st, text) {
  await st.text?.send({ embeds: [new EmbedBuilder().setDescription(text).setColor(COLOR)], allowedMentions: { parse: [] } }).catch(() => {});
}

function botChannelId(guild) {
  return guild.members.me?.voice?.channelId || null;
}

// Joins (or moves the shared connection to) the listener's room
async function connect(st, channel) {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (err) {
    connection.destroy(); // never leave a half-open connection behind
    throw err;
  }
  // /setvoice or a reconnect can destroy the shared connection: then this player is finished too
  if (st.connection !== connection) {
    st.connection = connection;
    connection.once(VoiceConnectionStatus.Destroyed, () => {
      if (players.get(channel.guild.id) !== st) return;
      st.stopped = true;
      clearTimeout(st.idleTimer);
      st.player.stop(true);
      cleanupStreams(st);
      players.delete(channel.guild.id);
    });
  }
  connection.subscribe(st.player);
  return connection;
}

async function playNext(st) {
  clearTimeout(st.idleTimer);
  const track = st.queue.shift();
  if (!track) {
    st.idleTimer = setTimeout(() => leave(st.guild, 'idle').catch(() => {}), IDLE_MS);
    return say(st, '✅ القايمة خلصت.');
  }
  st.current = track;
  try {
    if (!track.seconds) {
      const d = (await yt.getInfo(track.url)).videoDetails;
      track.seconds = Number(d.lengthSeconds) || 0;
      track.live = Boolean(d.isLiveContent) && !track.seconds;
    }
    if (track.live) throw new Error('البث المباشر مش مدعوم');
    if (track.seconds > MAX_SECONDS) throw new Error('الأغنية أطول من 3 ساعات');

    const source = await yt.download(track.url, { quality: 'highestaudio', filter: { hasAudio: true, hasVideo: false } });
    // prism-media adds the output ('pipe:1') itself
    const ffmpeg = new prism.FFmpeg({
      args: ['-analyzeduration', '0', '-loglevel', '0', '-i', '-', '-vn', '-af', 'volume=' + (st.volume / 100),
        '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', '-ac', '2', '-f', 'ogg'],
    });
    source.on('error', err => { console.error('[MUSIC] source:', err.message); ffmpeg.destroy(); });
    ffmpeg.on('error', () => {});
    source.pipe(ffmpeg);
    st.streams = [source, ffmpeg];

    const connection = getVoiceConnection(st.guild.id);
    connection?.subscribe(st.player);
    st.player.play(createAudioResource(ffmpeg, { inputType: StreamType.OggOpus, metadata: track }));
    st.startedAt = Date.now();
    await say(st, '🎵 شغال دلوقتي: **[' + track.title.replace(/[[\]]/g, '') + '](' + track.url + ')** `' + fmt(track.seconds) + '` • طلب <@' + track.by + '>');
  } catch (err) {
    console.error('[MUSIC] play:', err.message);
    cleanupStreams(st);
    st.current = null;
    st.failures = (st.failures || 0) + 1;
    if (st.failures >= 3) {
      st.queue = [];
      st.failures = 0;
      await say(st, '⚠️ يوتيوب رفض كذا أغنية ورا بعض، فوقفت القايمة. جرب تاني كمان شوية.');
    } else {
      await say(st, '⚠️ ماقدرتش أشغّل **' + track.title + '**: ' + (err.message || 'خطأ') + '. هشغّل اللي بعدها.');
    }
    return playNext(st);
  }
  return null;
}

// Stops music. Goes back to the /setvoice room if there is one, otherwise leaves.
async function leave(guild, why) {
  const st = players.get(guild.id);
  if (st) {
    clearTimeout(st.idleTimer);
    st.stopped = true;
    st.queue = [];
    st.current = null;
    st.player.stop(true);
    cleanupStreams(st);
    players.delete(guild.id);
    if (why === 'idle') await say(st, '👋 مفيش حاجة شغالة من دقيقتين، خرجت.');
  }
  const stay = getGuildConfig(guild.id).stay_voice_channel;
  const connection = getVoiceConnection(guild.id);
  if (!connection) return;
  const stayRoom = stay && guild.channels.cache.get(stay);
  if (stayRoom) {
    connection.rejoin({ channelId: stayRoom.id, selfDeaf: true, selfMute: true });
  } else {
    connection.destroy();
  }
}

// ── Command helpers ─────────────────────────────────────────────────────────
function check(i, { needSameRoom = true } = {}) {
  const room = i.member.voice?.channel;
  if (!room) return 'لازم تكون في روم صوتي.';
  const botRoom = botChannelId(i.guild);
  const st = players.get(i.guild.id);
  if (needSameRoom && st?.current && botRoom && botRoom !== room.id) return 'البوت شغال في <#' + botRoom + '>، تعالى هناك.';
  return null;
}

// Skip/stop/volume: whoever asked for the song, a DJ (Move Members / Manage Channels), or anyone alone with the bot
function canControl(i, st) {
  if (!st?.current) return true;
  if (st.current.by === i.user.id) return true;
  if (i.member.permissions.has(P.MoveMembers) || i.member.permissions.has(P.ManageChannels)) return true;
  const room = i.member.voice?.channel;
  return Boolean(room) && room.members.filter(m => !m.user.bot).size <= 2;
}

async function play(i, query) {
  const problem = check(i);
  if (problem) return { error: problem };
  const room = i.member.voice.channel;
  const me = i.guild.members.me;
  if (!room.permissionsFor(me)?.has([P.Connect, P.Speak])) return { error: 'ماعنديش صلاحية أدخل أو أتكلم في <#' + room.id + '>.' };

  // Sanad is public but runs on 256 MB / a quarter CPU: only a few servers can stream at once
  if (!players.has(i.guild.id) && players.size >= MAX_PLAYERS) {
    return { error: 'في سيرفرات كتير بتشغّل موسيقى دلوقتي. جرب كمان شوية.' };
  }
  const existing = players.get(i.guild.id);
  const mine = existing ? existing.queue.filter(t => t.by === i.user.id).length : 0;
  if (existing && existing.queue.length >= MAX_QUEUE) return { error: 'القايمة مليانة (' + MAX_QUEUE + ').' };
  if (mine >= MAX_PER_USER) return { error: 'عندك ' + MAX_PER_USER + ' أغنية في القايمة بالفعل.' };

  // Look the song up first, so a failed search never leaves an empty player holding a slot
  const { tracks, playlist } = await resolve(query, i.user);
  if (!tracks.length) return { error: 'مالقيتش حاجة بالاسم ده.' };

  const st = stateOf(i.guild);
  const room2 = Math.min(MAX_QUEUE - st.queue.length, MAX_PER_USER - mine);
  const added = tracks.slice(0, room2);

  st.text = i.channel;
  try {
    if (botChannelId(i.guild) !== room.id || !getVoiceConnection(i.guild.id)) await connect(st, room);
    else getVoiceConnection(i.guild.id).subscribe(st.player);
  } catch (err) {
    if (!st.current && !st.queue.length) players.delete(i.guild.id);
    console.error('[MUSIC] connect:', err.message);
    return { error: 'ماقدرتش أدخل الروم الصوتي، جرب تاني.' };
  }

  st.queue.push(...added);
  const startNow = !st.current && st.player.state.status === AudioPlayerStatus.Idle;
  if (startNow) await playNext(st);
  return { added, playlist, startNow };
}

module.exports = { players, play, leave, check, canControl, fmt, stateOf, playNext, MAX_QUEUE };
