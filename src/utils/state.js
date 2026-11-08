// Shared in-memory state (lives as long as the process is running)

/** @type {Map<string, {entries:string[], winners:number, prize:string, channelId:string, timeout:NodeJS.Timeout}>} */
const activeGiveaways = new Map();

/** @type {Map<string, Array<{label:string, description?:string, emoji?:string, value:string}>>} */
const ticketPanels = new Map();

module.exports = { activeGiveaways, ticketPanels };
