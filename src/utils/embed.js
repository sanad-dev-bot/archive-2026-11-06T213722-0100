const { EmbedBuilder, Colors } = require('discord.js');

/**
 * Quick embed builder
 * @param {string} title
 * @param {string} [description]
 * @param {number} [color]        - discord.js Colors constant
 * @param {object} [opts]         - { thumb, image, footer, footerIcon, fields[] }
 */
function em(title = '', description = '', color = Colors.Blue, opts = {}) {
  const e = new EmbedBuilder().setColor(color).setTimestamp();
  if (title)       e.setTitle(title);
  if (description) e.setDescription(description);
  if (opts.thumb)  e.setThumbnail(opts.thumb);
  if (opts.image)  e.setImage(opts.image);
  if (opts.footer) e.setFooter({ text: opts.footer, iconURL: opts.footerIcon });
  if (opts.fields) opts.fields.forEach(f => e.addFields(f));
  return e;
}

module.exports = { em };
