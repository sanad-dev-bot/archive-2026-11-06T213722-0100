const fs = require('fs');
const path = require('path');
const {
  MessagePayload, ChatInputCommandInteraction, MessageComponentInteraction,
  MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction,
} = require('discord.js');
const { getGuildConfig } = require('./storage');

const ARABIC = /[؀-ۿ]/;
const LOCALES_DIR = path.join(__dirname, '..', 'locales', 'en');
const statics = new Map();
const patterns = [];

function compilePattern(key, value) {
  const order = [];
  // "{0} days" must not swallow a member's sentence that happens to end in that word
  const numeric = /^\{0\} [\u0600-\u06FF]+$/.test(key);
  const source = key.split(/\{(\d+)\}/).map((part, n) => {
    if (n % 2) { order.push(part); return numeric ? '([\\d.,]+)' : '([\\s\\S]+?)'; }
    return part.replace(/[.*+?^$|()[\]\\{}]/g, '\\$&');
  }).join('');
  return { regex: new RegExp('^' + source + '$'), order, value, weight: key.length };
}

function loadTables() {
  const files = fs.existsSync(LOCALES_DIR) ? fs.readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json')) : [];
  for (const file of files) {
    try {
      const table = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf8'));
      for (const [key, value] of Object.entries(table)) {
        if (/\{\d+\}/.test(key)) patterns.push(compilePattern(key, value));
        else statics.set(key, value);
      }
    } catch (err) {
      console.error('[I18N] Failed to load ' + file + ':', err.message);
    }
  }
  patterns.sort((a, b) => b.weight - a.weight);
  console.log('[I18N] ' + statics.size + ' strings, ' + patterns.length + ' patterns');
}

function translateLine(line) {
  const text = line.trim();
  if (!ARABIC.test(text)) return line;
  const heading = text.match(/^(#{1,3} (?:\S+ )?)(.+)$/);
  if (heading && statics.has(heading[2])) return line.replace(text, () => heading[1] + statics.get(heading[2]));
  const exact = statics.get(text);
  if (exact !== undefined) return line.replace(text, () => exact);
  for (const { regex, order, value } of patterns) {
    const match = text.match(regex);
    if (!match) continue;
    const filled = value.replace(/\{(\d+)\}/g, (slot, id) => {
      const at = order.indexOf(id);
      if (at < 0) return slot;
      return statics.get(match[at + 1]) ?? match[at + 1];
    });
    return line.replace(text, () => filled);
  }
  return line;
}

function translate(text) {
  if (typeof text !== 'string' || !ARABIC.test(text)) return text;
  const whole = translateLine(text);
  if (whole !== text || !text.includes('\n')) return whole;
  return text.split('\n').map(translateLine).join('\n');
}

const SKIP_KEYS = new Set(['custom_id', 'url', 'id', 'emoji', 'allowed_mentions', 'attachments', 'message_reference', 'nonce', 'sticker_ids', 'timestamp', 'proxy_url', 'icon_url']);

function walk(node) {
  if (Array.isArray(node)) { node.forEach((item, n) => { node[n] = typeof item === 'string' ? translate(item) : walk(item); }); return node; }
  if (!node || typeof node !== 'object') return node;
  for (const [key, value] of Object.entries(node)) {
    if (SKIP_KEYS.has(key)) continue;
    // A select option or text input value is data; an embed field value is text
    if (key === 'value' && !('name' in node)) continue;
    if (typeof value === 'string') node[key] = translate(value);
    else walk(value);
  }
  return node;
}

// Translations can run longer than the Arabic and Discord rejects oversized fields
function fitLimits(node) {
  if (Array.isArray(node)) { node.forEach(fitLimits); return; }
  if (!node || typeof node !== 'object') return;
  if (typeof node.label === 'string') node.label = node.label.slice(0, 80);
  node.options?.forEach(option => {
    if (typeof option.description === 'string') option.description = option.description.slice(0, 100);
  });
  fitLimits(node.components);
  fitLimits(node.component);
}

function fitModal(json) {
  json.title = json.title.slice(0, 45);
  const visit = node => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.label === 'string') node.label = node.label.slice(0, 45);
    visit(node.components);
    visit(node.component);
  };
  visit(json.components);
  return json;
}

function primaryGuildId() {
  if (process.env.GUILD_ID) return process.env.GUILD_ID;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'), 'utf8'));
    return Object.keys(config).find(k => /^\d{17,}$/.test(k)) || null;
  } catch { return null; }
}

function langFor(guildId, channelId) {
  const id = guildId || primaryGuildId();
  if (!id) return 'ar';
  const cfg = getGuildConfig(id);
  return cfg.channel_lang?.[channelId] || cfg.language || 'ar';
}

const textFor = (lang, text) => (lang === 'en' ? translate(text) : text);

function targetIds(target) {
  const known = target.__i18n;
  if (known) return known;
  return {
    guildId: target.guildId ?? target.guild?.id ?? target.channel?.guildId ?? null,
    channelId: target.channelId ?? target.channel?.id ?? target.id ?? null,
  };
}

function patchMessages() {
  const resolveBody = MessagePayload.prototype.resolveBody;
  MessagePayload.prototype.resolveBody = function patchedResolveBody() {
    resolveBody.call(this);
    try {
      const { guildId, channelId } = targetIds(this.target);
      if (this.body && langFor(guildId, channelId) === 'en') {
        for (const key of ['content', 'embeds', 'components', 'poll']) {
          if (typeof this.body[key] === 'string') this.body[key] = translate(this.body[key]);
          else if (this.body[key]) walk(this.body[key]);
        }
        fitLimits(this.body.components);
      }
    } catch (err) {
      console.error('[I18N]', err.message);
    }
    return this;
  };
}

function patchModals() {
  const classes = [ChatInputCommandInteraction, MessageComponentInteraction, MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction];
  for (const cls of classes) {
    const showModal = cls.prototype.showModal;
    cls.prototype.showModal = function patchedShowModal(modal, options) {
      if (langFor(this.guildId, this.channelId) !== 'en') return showModal.call(this, modal, options);
      const json = typeof modal.toJSON === 'function' ? modal.toJSON() : modal;
      return showModal.call(this, fitModal(walk(JSON.parse(JSON.stringify(json)))), options);
    };
  }
}

function install(client) {
  loadTables();
  patchMessages();
  patchModals();
  // editReply and followUp go through a webhook that does not know its server
  client.on('interactionCreate', interaction => {
    if (interaction.webhook) interaction.webhook.__i18n = { guildId: interaction.guildId, channelId: interaction.channelId };
  });
}

function localizeCommands(commands, lang) {
  if (lang !== 'en') return commands;
  const copy = JSON.parse(JSON.stringify(commands));
  const visit = node => {
    if (typeof node.description === 'string') node.description = translate(node.description).slice(0, 100);
    node.options?.forEach(visit);
    node.choices?.forEach(choice => { choice.name = translate(choice.name).slice(0, 100); });
  };
  copy.forEach(visit);
  return copy;
}

module.exports = { install, langFor, textFor, translate, localizeCommands, primaryGuildId };
