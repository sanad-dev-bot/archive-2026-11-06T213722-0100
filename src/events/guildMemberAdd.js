const { getGuildConfig } = require('../utils/storage');
const { sendWelcome } = require('../utils/verifySystem');

module.exports = {
  name: 'guildMemberAdd',

  async execute(client, member) {
    const cfg = getGuildConfig(member.guild.id);

    // New people wait in the verify room; the auto role and welcome come after they pass
    if (cfg.verify_enabled && !member.user.bot && member.guild.roles.cache.has(cfg.verify_role)) {
      const gated = await member.roles.add(cfg.verify_role, 'Awaiting verification').catch(err => {
        console.error('[VERIFY ERROR] Could not gate member:', err.message);
        return null;
      });
      if (gated) return;
    }

    await sendWelcome(member);

    if (cfg.auto_role && !member.user.bot) {
      const role = member.guild.roles.cache.get(cfg.auto_role);
      if (role) await member.roles.add(role).catch(() => {});
    }
  },
};
