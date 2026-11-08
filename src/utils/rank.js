// Sanad outranks the staff, so its commands must enforce the staff hierarchy themselves
function outranks(actor, target) {
  return actor.id === actor.guild.ownerId || actor.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

module.exports = { outranks };
