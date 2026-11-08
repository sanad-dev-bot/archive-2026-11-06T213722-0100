const { getGuildConfig } = require('./storage');

// People (not roles) the server owner named co-owner with /protection trust. A role would be unsafe: anyone with
// Manage Roles above it could hand it to themselves and become exempt.
function coOwnerIds(guild) {
  return getGuildConfig(guild.id).owner_users || [];
}

// Owner and co-owner. Being above Sanad cannot be self-granted: handing out a role above Sanad
// already needs a role above it. Administrator alone is NOT trusted, so a rogue admin is still caught.
function isTrusted(member) {
  if (!member?.guild || member.user?.bot) return false;
  const guild = member.guild;
  if (member.id === guild.ownerId) return true;
  const me = guild.members.me;
  if (me && member.roles.highest.comparePositionTo(me.roles.highest) > 0) return true;
  return coOwnerIds(guild).includes(member.id);
}

function isGuildOwner(member) {
  return Boolean(member?.guild) && member.id === member.guild.ownerId;
}

module.exports = { isTrusted, isGuildOwner, coOwnerIds };
