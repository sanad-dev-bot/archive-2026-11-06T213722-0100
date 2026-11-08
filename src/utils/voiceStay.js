const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { getGuildConfig, setGuildConfig, deleteGuildConfigKey } = require('./storage');

const reconnectTimers = new Map();

function getTargetChannel(guild) {
  const cfg = getGuildConfig(guild.id);
  if (!cfg.stay_voice_channel) return null;
  const ch = guild.channels.cache.get(cfg.stay_voice_channel);
  if (!ch || !ch.isVoiceBased?.()) return null;
  return ch;
}

async function connectToVoice(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isVoiceBased?.()) {
    throw new Error('لم يتم العثور على الروم الصوتي.');
  }

  const me = guild.members.me || await guild.members.fetchMe();
  const perms = channel.permissionsFor(me);
  if (!perms?.has('Connect')) throw new Error('البوت لا يملك صلاحية الدخول للروم الصوتي.');

  const old = getVoiceConnection(guild.id);
  if (old) old.destroy();

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: true,
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      const current = getGuildConfig(guild.id);
      if (current.stay_voice_channel === channel.id) scheduleReconnect(guild, channel.id);
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    const current = getGuildConfig(guild.id);
    if (current.stay_voice_channel === channel.id) scheduleReconnect(guild, channel.id);
  });

  return channel;
}

function scheduleReconnect(guild, channelId) {
  if (reconnectTimers.has(guild.id)) return;
  const timer = setTimeout(async () => {
    reconnectTimers.delete(guild.id);
    const cfg = getGuildConfig(guild.id);
    if (cfg.stay_voice_channel !== channelId) return;
    try { await connectToVoice(guild, channelId); }
    catch (err) { console.error(`[VOICE STAY] ${guild.id}:`, err.message); scheduleReconnect(guild, channelId); }
  }, 5_000);
  reconnectTimers.set(guild.id, timer);
}

async function setStayVoice(guild, channelId) {
  setGuildConfig(guild.id, 'stay_voice_channel', channelId);
  return connectToVoice(guild, channelId);
}

function clearStayVoice(guild) {
  deleteGuildConfigKey(guild.id, 'stay_voice_channel');
  const timer = reconnectTimers.get(guild.id);
  if (timer) clearTimeout(timer);
  reconnectTimers.delete(guild.id);
  const connection = getVoiceConnection(guild.id);
  if (connection) connection.destroy();
}

async function restoreStayVoices(client) {
  for (const guild of client.guilds.cache.values()) {
    const channel = getTargetChannel(guild);
    if (!channel) {
      const cfg = getGuildConfig(guild.id);
      if (cfg.stay_voice_channel) deleteGuildConfigKey(guild.id, 'stay_voice_channel');
      continue;
    }
    try { await connectToVoice(guild, channel.id); }
    catch (err) { console.error(`[VOICE STAY] ${guild.name}:`, err.message); }
  }
}

module.exports = { setStayVoice, clearStayVoice, restoreStayVoices, getTargetChannel };
