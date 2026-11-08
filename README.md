# 🤖 discord-bot-sanad

A modular Discord bot built with **Discord.js v14** and **Node.js**.

⚡ Slash commands · 📋 Guild event logging · 🎭 Automated role assignment

[![Deploy on Bot-Hosting.net](https://img.shields.io/badge/Deploy-Bot--Hosting.net-orange?logo=discord&logoColor=white)](https://sanad.apps.bot-hosting.cloud/)
[![Node.js](https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Support Server](https://img.shields.io/badge/Support-Discord-5865F2?logo=discord&logoColor=white)](https://discord.gg/BMrh56BgcS)
[![Architecture](https://img.shields.io/badge/architecture-event--driven-blueviolet)](./Events)
[![Style guide](https://img.shields.io/badge/code%20style-eslint-4B32C3?logo=eslint&logoColor=white)](./eslint.config.js)

## 🚀 Deploy

Want to try it without setting it up locally? Deploy it in one click as a community template on Bot-Hosting.net:

[![Deploy on Bot-Hosting.net](https://img.shields.io/badge/Deploy-Bot--Hosting.net-orange?logo=discord&logoColor=white)](https://sanad.apps.bot-hosting.cloud/)
[![Deployments](https://img.shields.io/badge/deployments-150%2B-brightgreen)](https://sanad.apps.bot-hosting.cloud/)
[![Community Template](https://img.shields.io/badge/Bot--Hosting.net-Community%20Template-blue?logo=cloudflare&logoColor=white)](https://sanad.apps.bot-hosting.cloud/)

👉 **[Click here to deploy](https://sanad.apps.bot-hosting.cloud/)**

## ✨ Features

- ⚡ **Slash commands** — modular, auto-loaded from `slashcommands/`
- 🎭 **Autorole** — automatic role assignment for users/bots on join, with role-hierarchy and admin-permission safety checks
- 📋 **Guild logging** — channel and role create/update/delete, message delete/bulk delete/update
- 🚫 **Blacklist system** — block users from using the bot with reason, evidence, and automatic expiration
- 🎵 **Music** — Lavalink-powered music playback via `moonlink.js`
- 🗃️ **Local JSON database** — lightweight file-based storage per guild

## 📦 Requirements

- 🟢 Node.js `22`
- 🤖 A Discord bot application ([Discord Developer Portal](https://sanad.apps.bot-hosting.cloud/))

## 🛠️ Setup

**1.** Clone the repository and install dependencies:

```bash
git clone https://github.com/sanad-dev-bot/discord-bot-sanad

cd discord-bot-sanad

npm install
```

**2.** Copy the example environment file and fill in your bot token:

```bash
cp .env.example .env
```

```ignore
TOKEN=your_bot_token_here
```

**3.** Run the bot:

```bash
npm start -s
```

## 🗂️ Project structure

```
📁 Events/          Event listeners (client, guild, interaction, logging)
📁 handlers/        Dynamic loaders for events and slash commands
📁 slashcommands/   Slash commands, grouped by category
📁 database/        Local JSON-based storage
```

## 💬 Support

Need help or found a bug? Check [SUPPORT.md](./.github/SUPPORT.md) or join the [support server](https://discord.gg/BMrh56BgcS).

🔒 For security-related concerns, please follow the process in [SECURITY.md](./.github/SECURITY.md) instead of opening a public issue.

## 📄 License

MIT — see [LICENSE](./LICENSE).
