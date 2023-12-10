import { Client, GatewayIntentBits, ChannelType, TextChannel, WebhookClient, ActivityType, PermissionsBitField, Guild, Events, TextBasedChannel, GuildTextBasedChannel, NonThreadGuildBasedChannel, BaseGuildTextChannel, Message, Partials, MessageReaction, GuildMember } from 'discord.js';
import chalk from 'chalk';
import fs from 'fs';
import { Database } from "bun:sqlite";

const db = new Database("brook.sqlite");
// create table upvotes (source_message_id text, new_message_id text); if not exists
db.run("create table if not exists upvotes (source_message_id text, new_message_id text);");
// create table reputation (user_id text, reputation integer); if not exists
db.run("create table if not exists reputation (user_id text, reputation integer);");

// Bun automatically reads .env files, so we don't need dotenv or anything

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.Reaction, Partials.User]
});

import path from 'path';

client.on(Events.ClientReady, async () => {
    console.log(chalk.greenBright('Brook Bot ready!'));
});

let roleIDToEmoji: { [key: string]: string } = {
    '1183135596122751122': '<:brook:1182746377642578100>',
    '1183191894566649866': '<:not_real:1183429603600113764>',
    '1182740620075352104': '<:brook:1182746377642578100>',
    '1182740964205404180': '<:brook_judge:1182746376585629797>',
    '1182791114479124622': ':knife:',
    '1183221422307430532': '<:e70_hook:1183232671653052457>',
    '1183212496639774760': '<:windowsicon42345:1183430931655184495>',
    '1183184984538878054': '<:boost:1183416669981397114>',
    '1183195590599921824': '<:costume2:1183431204003905607>',
    '1183196616761548881': '<:gh:1183431322862104626>',
    '1182741624166555698': '<:red:1182750629802815650>',
    '1182741680022106253': '<:orange:1182750628515164343>',
    '1182742490432938085': '<:gold:1182750627110064188>',
    '1182741746879303722': '<:yellow:1182750625998573728>',
    '1182741808774643752': '<:green:1182750624484446228>',
    '1182741909534416988': '<:emerald_green:1182750622366302308>',
    '1182741988005658654': '<:teal:1182750621191901224>',
    '1182742062630707261': '<:cyan:1182750619811975259>',
    '1182742157015134238': '<:sky_blue:1182750618012635288>',
    '1182742211687890964': '<:blue:1182750610383196160>',
    '1182742290561765426': '<:purple:1182750609212981268>',
    '1182742382257651793': '<:magenta:1182750605253562539>',
    '1182741577328771193': '<:pink:1182750608143433878>',
};

function getEmojiFromMember(member: GuildMember) {
    // we loop through the keys, we use first one
    for (const key of Object.keys(roleIDToEmoji)) {
        if (member.roles.cache.has(key)) {
            return roleIDToEmoji[key] + ' ';
        }
    }
    return '';
}

async function updateTop(message: Message<boolean>, reaction: MessageReaction) {
    const channel = await message.guild!.channels.fetch('1183139149432242277');
    if (!channel) return;
    // get downvote count (<:downvote:1182728989010300992>)
    let downvoteCount = 0;
    for (const reaction of message.reactions.cache.values()) {
        if (reaction.emoji.id === '1182728989010300992' && reaction.emoji.name === "downvote") {
            downvoteCount = reaction.count;
            break;
        }
    }
    let messageObject = {
        content: '<@' + message.author.id + '>',
        embeds: [{
            color: 0x86c7ff,
            description: message.content,
            author: {
                name: message.member ? message.member.displayName : message.author.username,
                icon_url: message.author.displayAvatarURL()
            },
            fields: [{
                name: `**${reaction.count.toString()}** <:upvote:1182728525338378361>`,
                value: `**${downvoteCount.toString()} <:downvote:1182728989010300992>**`,
                inline: false
            }, {
                name: 'Date',
                value: `<t:${Math.floor(message.createdTimestamp / 1000)}:f>`,
                inline: true
            }, {
                name: 'Original Message',
                value: `[Jump to message](${message.url})`,
                inline: true
            }]
        }]
    };
    // look into db upvotes table, is there a message with the same id as the source message?
    let stmt = db.query("select * from upvotes where source_message_id = ?");
    let rows = stmt.all(message.id);
    if (rows.length > 0) {
        // edit with new messageObject
        let msg = await (channel as TextChannel).messages.fetch((rows[0] as any).new_message_id);
        await msg.edit(messageObject);
        console.log('edited');
        return;
    }

    let msg = await (channel as TextChannel).send(messageObject);
    // add to database, all we need it to store is source message id and new message id
    db.run("insert into upvotes (source_message_id, new_message_id) values (?, ?)", [
        message.id,
        msg.id
    ]);
}

client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.id === '1171991184227442759') return;
    console.log('reaction');
    if (user.id === client.user!.id) return;
    // if guild isnt 1182500877173522462
    if (!reaction.message.guild || reaction.message.guild.id !== '1182500877173522462') return;
    if (reaction.partial) reaction = await reaction.fetch();
    let message = reaction.message;
    if (message.partial) message = await message.fetch();
    console.log('passed tests');

    if (message.channel.id === '1183139149432242277') {
        return;
    }

    if (reaction.emoji.id === '1182728525338378361' && reaction.emoji.name === "upvote") {
        // the message.author.id gets +1 reputation unless theyre the same as user.id
        if (message.author.id !== user.id) {
            console.log('ready to process rep change');
            // check if user.id is in the database
            let stmt = db.query("select * from reputation where user_id = ?");
            let rows = stmt.all(message.author.id);
            if (rows.length > 0) {
                // update
                db.run("update reputation set reputation = reputation + 1 where user_id = ?", [
                    message.author.id
                ]);
                console.log('Added to someones rep! omg theyre so lucky and cool');
            }
            else {
                // insert
                db.run("insert into reputation (user_id, reputation) values (?, ?)", [
                    message.author.id,
                    1
                ]);
                console.log('initialized new rep');
            }
        }
        else {
            console.log('someone tried to upvote their own message lamo what a bozo');
        }
    }
    // same for downvote (<:downvote:1182728989010300992>)
    else if (reaction.emoji.id === '1182728989010300992' && reaction.emoji.name === "downvote") {
        // the message.author.id gets -1 reputation unless theyre the same as user.id
        if (message.author.id !== user.id) {
            // check if user.id is in the database
            let stmt = db.query("select * from reputation where user_id = ?");
            let rows = stmt.all(message.author.id);
            if (rows.length > 0) {
                // update
                db.run("update reputation set reputation = reputation - 1 where user_id = ?", [
                    message.author.id
                ]);
            }
            else {
                // insert
                db.run("insert into reputation (user_id, reputation) values (?, ?)", [
                    message.author.id,
                    -1
                ]);
            }

            // 1/10 chance of removing 1 rep from user.id as well, this encourages not downvoting for no reason
            if (Math.random() < 0.1) {
                // check if user.id is in the database
                let stmt = db.query("select * from reputation where user_id = ?");
                let rows = stmt.all(user.id);
                if (rows.length > 0) {
                    // update
                    db.run("update reputation set reputation = reputation - 1 where user_id = ?", [
                        user.id
                    ]);
                }
                else {
                    // insert
                    db.run("insert into reputation (user_id, reputation) values (?, ?)", [
                        user.id,
                        -1
                    ]);
                }
            }
        }
    }

    // basically, if 3 people react <:upvote:1182728525338378361> on something, its sent to <#1183139149432242277>. this is just like starboard, but built into this bot so we dont rely on closed source code
    if (reaction.emoji.id === '1182728525338378361' && reaction.emoji.name === "upvote" && reaction.count >= 3) {
        console.log('upvote');
        updateTop(message, reaction);
    }
    else {
        console.log('name: `' + reaction.emoji.name + '` id: `' + reaction.emoji.id + '`');
    }
});

// reaction remove

client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.id === '1171991184227442759') return;
    console.log('reaction removed');
    if (user.id === client.user!.id) return;
    // if guild isnt 1182500877173522462
    if (!reaction.message.guild || reaction.message.guild.id !== '1182500877173522462') return;
    if (reaction.partial) reaction = await reaction.fetch();
    let message = reaction.message;
    if (message.partial) message = await message.fetch();
    console.log('passed tests');

    if (message.channel.id === '1183139149432242277') {
        return;
    }

    if (reaction.emoji.id === '1182728525338378361' && reaction.emoji.name === "upvote") {
        // the message.author.id gets -1 reputation unless theyre the same as user.id
        if (message.author.id !== user.id) {
            // check if user.id is in the database
            let stmt = db.query("select * from reputation where user_id = ?");
            let rows = stmt.all(message.author.id);
            if (rows.length > 0) {
                // update
                db.run("update reputation set reputation = reputation - 1 where user_id = ?", [
                    message.author.id
                ]);
            }
            else {
                // insert
                db.run("insert into reputation (user_id, reputation) values (?, ?)", [
                    message.author.id,
                    0
                ]);
            }
        }
    }
    // same for downvote (<:downvote:1182728989010300992>)
    else if (reaction.emoji.id === '1182728989010300992' && reaction.emoji.name === "downvote") {
        // the message.author.id gets +1 reputation unless theyre the same as user.id
        if (message.author.id !== user.id) {
            // check if user.id is in the database
            let stmt = db.query("select * from reputation where user_id = ?");
            let rows = stmt.all(message.author.id);
            if (rows.length > 0) {
                // update
                db.run("update reputation set reputation = reputation + 1 where user_id = ?", [
                    message.author.id
                ]);
            }
            else {
                // insert
                db.run("insert into reputation (user_id, reputation) values (?, ?)", [
                    message.author.id,
                    1
                ]);
            }
        }
    }

    // basically, if 3 people react <:upvote:1182728525338378361> on something, its sent to <#1183139149432242277>. this is just like starboard, but built into this bot so we dont rely on closed source code
    if (reaction.emoji.id === '1182728525338378361' && reaction.emoji.name === "upvote" && reaction.count >= 3) {
        console.log('upvote');
        updateTop(message, reaction);
    }
});


client.on(Events.MessageCreate, async message => {
    if (message.author.id === client.user!.id) return;
    if (!message.guild || message.guild.id !== '1182500877173522462') return;

    // !rep shows your rep
    if (message.content === '!rep') {
        let stmt = db.query("select * from reputation where user_id = ?");
        let rows = stmt.all(message.author.id);
        if (rows.length > 0) {
            message.channel.send(`You have **${(rows[0] as any).reputation}** reputation!`);
        }
        else {
            message.channel.send(`You have **0** reputation!`);
        }
    }

    // !rep @user shows @user's rep
    else if (message.content.startsWith('!rep ')) {
        let user = message.mentions.users.first();
        if (!user) {
            message.channel.send('Please mention a user!');
            return;
        }
        let stmt = db.query("select * from reputation where user_id = ?");
        let rows = stmt.all(user.id);
        if (rows.length > 0) {
            message.channel.send(`<@${user.id}> has **${(rows[0] as any).reputation}** reputation!`);
        }
        else {
            message.channel.send(`<@${user.id}> has **0** reputation!`);
        }
    }

    // leaderboard
    else if (message.content === '!leaderboard') {
        let stmt = db.query("select * from reputation order by reputation desc limit 10");
        let rows: {
            user_id: string,
            reputation: number
        }[] = stmt.all() as any;
        let embed = {
            color: 0x86c7ff,
            title: 'Reputation Leaderboard',
            description: ''
        };
        for (let i = 0; i < rows.length; i++) {
            let row = rows[i];
            let user = await client.users.fetch(row.user_id);
            let guild = await message.guild!.fetch();
            let member = await new Promise<GuildMember | null>((resolve, reject) => {
                guild.members.fetch(user).then(member => {
                    resolve(member);
                }).catch(err => {
                    resolve(null);
                });
            });

            if (!member) continue;

            embed.description += `${i + 1}. ${getEmojiFromMember(member)}<@${row.user_id}> - **${row.reputation}** reputation\n`;
        }
        message.channel.send({ embeds: [embed] });
    }
});

client.login(process.env.TOKEN);