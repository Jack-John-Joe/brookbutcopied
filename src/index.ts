import { Client, GatewayIntentBits, ChannelType, TextChannel, WebhookClient, ActivityType, PermissionsBitField, Guild, Events, TextBasedChannel, GuildTextBasedChannel, NonThreadGuildBasedChannel, BaseGuildTextChannel, Message, Partials, MessageReaction, GuildMember } from 'discord.js';
import chalk from 'chalk';
import fs from 'fs';
import { Database } from "bun:sqlite";

const db = new Database("brook.sqlite");
// create table upvotes (source_message_id text, new_message_id text); if not exists
db.run("create table if not exists upvotes (source_message_id text, new_message_id text);");
// create table reputation (user_id text, reputation integer); if not exists
db.run("create table if not exists reputation (user_id text, reputation integer);");
// create a real
db.run("create table if not exists economy (user_id text, money integer);");

// if no entry of 427114333000957952 in economy, insert 1 million so we can start the currency without having admin commands to do so
let stmt = db.query("select * from economy where user_id = ?");
let rows = stmt.all('427114333000957952');
if (rows.length === 0) {
    db.run("insert into economy (user_id, money) values (?, ?)", [
        '427114333000957952',
        1000000
    ]);
} // there is no way to edit the currency, to keep it fair

let usedDaily: {
    [userID: string]: boolean
} = {};

// every 24 hours we clear usedDaily
setInterval(() => {
    usedDaily = {};
}, 24 * 60 * 60 * 1000);

async function changeMoney(user_id: string, amount: number) {
    let stmt = db.query("select * from economy where user_id = ?");
    let rows = stmt.all(user_id);
    if (rows.length > 0) {
        // update
        db.run("update economy set money = money + ? where user_id = ?", [
            amount,
            user_id
        ]);
    }
    else {
        // insert
        db.run("insert into economy (user_id, money) values (?, ?)", [
            user_id,
            amount
        ]);
    }
}


function numberWithCommas(x: number) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}


async function getMoney(user_id: string): Promise<number> {
    let stmt = db.query("select * from economy where user_id = ?");
    let rows = stmt.all(user_id);
    if (rows.length > 0) {
        return (rows[0] as any).money;
    }
    else {
        return 0;
    }
}

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

let activeMurders: {
    [murdererID: string]: {
        type: 'injur' | 'kill',
        victimID: string,
        condition: (message: Message) => boolean,
    }
} = {};

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

    // if knife on message that meets activemurder condition, timeout
    if ((reaction.emoji.name === 'knife' || reaction.emoji.name?.includes('🔪')) && activeMurders[user.id] && activeMurders[user.id].condition(message)) {
        // timeout
        let guild = await message.guild!.fetch();
        let member = await new Promise<GuildMember | null>((resolve, reject) => {
            guild.members.fetch(activeMurders[user.id].victimID).then(member => {
                resolve(member);
            }).catch(err => {
                resolve(null);
            });
        });
        if (member) {
            if (activeMurders[user.id].type === 'kill') {
                member.timeout(7 * 24 * 60 * 60 * 1000, 'Murdered by ' + user.username);
            }
            else {
                member.timeout(24 * 60 * 60 * 1000, 'Injured by ' + user.username);
            }
            // timeout the author as well, for 1 hour
            let authorMember = await new Promise<GuildMember | null>((resolve, reject) => {
                guild.members.fetch(user.id).then(member => {
                    resolve(member);
                }).catch(err => {
                    resolve(null);
                });
            });
            if (authorMember) {
                authorMember.timeout(60 * 60 * 1000, 'Timeout for injuring someone');
            }
            // remove all reactions
            message.reactions.removeAll();
            // send message
            let embed = {
                color: 0x86c7ff,
                description: `**${member.displayName}** has been ${activeMurders[user.id].type === 'injur' ? 'injured' : 'murdered'} by <@${user.id}>!\n\nThe ${activeMurders[user.id].type === 'injur' ? 'injurer' : 'murderer'} has been timed out for 1 hour.`
            };
            message.channel.send({ embeds: [embed] });
            // delete from activeMurders
            delete activeMurders[user.id];
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

    // !help says no
    if (message.content === '!help') {
        message.channel.send('In order to allow users to discover commands on their own, no help is provided.\n\nIn other words, good luck nerd.');
    }

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

    // !bal or !balance or !money or !qubit shows your money
    else if (message.content === '!bal' || message.content === '!balance' || message.content === '!money' || message.content === '!qubit') {
        let money = await getMoney(message.author.id);
        message.channel.send(`You have **${numberWithCommas(money)}**<:qubit:1183442475336093706>!`);
    }

    // !bal @user or !balance @user or !money @user or !qubit @user shows @user's money
    else if (message.content.startsWith('!bal ') || message.content.startsWith('!balance ') || message.content.startsWith('!money ') || message.content.startsWith('!qubit ')) {
        let user = message.mentions.users.first();
        if (!user) {
            message.channel.send('Please mention a user!');
            return;
        }
        let money = await getMoney(user.id);
        message.channel.send(`<@${user.id}> has **${numberWithCommas(money)}**<:qubit:1183442475336093706>!`);
    }

    // pay people
    else if (message.content.startsWith('!pay ')) {
        let user = message.mentions.users.first();
        if (!user) {
            message.channel.send('Please mention a user!');
            return;
        }
        let amount = parseInt(message.content.split(' ')[2]);
        if (isNaN(amount)) {
            message.channel.send('Please specify an amount!');
            return;
        }
        if (amount < 1) {
            message.channel.send('Please specify an amount greater than 0!');
            return;
        }
        let money = await getMoney(message.author.id);
        if (money < amount) {
            message.channel.send('You don\'t have enough money!');
            return;
        }
        // if their rep is >= 0, no tax. if not, we take away the same amount but only give the recipient 50% of it, taxing the other 50% away
        let taxA = 0;
        let stmt = db.query("select * from reputation where user_id = ?");
        let rows = stmt.all(message.author.id);
        if (rows.length > 0) {
            if ((rows[0] as any).reputation < 0) {
                taxA = Math.floor(amount / 2); // while itd be funny to ceil it up, that could lead to recipient gaining more money since it could lead to negative money
            }
        }

        // now tax B, for recipient
        let taxB = 0;
        stmt = db.query("select * from reputation where user_id = ?");
        rows = stmt.all(user.id);
        if (rows.length > 0) {
            if ((rows[0] as any).reputation < 0) {
                taxB = Math.floor((amount - taxA) / 2);
            }
        }

        // pay both taxes to 1183134058415394846
        await changeMoney('1183134058415394846', taxA + taxB);

        // make sure to await so there isnt a moment that the recipient has the money and the giver at the same time
        await changeMoney(message.author.id, -amount);
        await changeMoney(user.id, amount - taxA - taxB);
        message.channel.send(`You gave <@${user.id}> **${numberWithCommas(amount)}**<:qubit:1183442475336093706>!\n\n<@${message.author.id}> now has **${numberWithCommas(await getMoney(message.author.id))}**<:qubit:1183442475336093706>.\n<@${user.id}> now has **${numberWithCommas(await getMoney(user.id))}**<:qubit:1183442475336093706>.\n\nNote: taxes may have been applied.`);
    }

    // if user has 1182740620075352104 role and runs !daily, we draw 100 from government (1183134058415394846) and give it to them if they arent in usedDaily with true
    else if (message.content === '!daily') {
        let member = await message.member!.fetch();
        if (member.roles.cache.has('1182740620075352104')) {
            if (usedDaily[message.author.id]) {
                message.channel.send('You already claimed your daily <:qubit:1183442475336093706>! Stop being a greedy a' + 'ss' + '! Fuc' + 'k' + 'ing hell. F' + 'uck' + ' you.');
                return;
            }
            usedDaily[message.author.id] = true;
            // remove from government
            await changeMoney('1183134058415394846', -100);
            await changeMoney(message.author.id, 100);
            // we just kinda assume the government will never go bankrupt, if it does we have bigger problems anyways
            message.channel.send('You claimed your daily <:qubit:1183442475336093706>! You now have **' + numberWithCommas(await getMoney(message.author.id)) + '**<:qubit:1183442475336093706>.');
        }
        else {
            message.channel.send('You need to be a <:brook:1182746377642578100> Staff to claim your daily staff <:qubit:1183442475336093706> ._.');
        }
    }

    // pay people in rep, but 50% tax no matter what
    else if (message.content.startsWith('!payrep ')) {
        let user = message.mentions.users.first();
        if (!user) {
            message.channel.send('Please mention a user!');
            return;
        }
        let amount = parseInt(message.content.split(' ')[2]);
        if (isNaN(amount)) {
            message.channel.send('Please specify an amount!');
            return;
        }
        if (amount < 1) {
            message.channel.send('Please specify an amount greater than 0!');
            return;
        }
        let stmt = db.query("select * from reputation where user_id = ?");
        let rows = stmt.all(message.author.id);
        if (rows.length > 0) {
            if ((rows[0] as any).reputation < amount) {
                message.channel.send('You don\'t have enough reputation!');
                return;
            }
        }
        else {
            message.channel.send('You don\'t have enough reputation!');
            return;
        }
        let tax = Math.floor(amount / 2);
        // insert if not exists
        stmt = db.query("select * from reputation where user_id = ?");
        rows = stmt.all(user.id);
        if (rows.length === 0) {
            db.run("insert into reputation (user_id, reputation) values (?, ?)", [
                user.id,
                0
            ]);
        }
        // same for author even tho its impossible lmao
        stmt = db.query("select * from reputation where user_id = ?");
        rows = stmt.all(message.author.id);
        if (rows.length === 0) {
            db.run("insert into reputation (user_id, reputation) values (?, ?)", [
                message.author.id,
                0
            ]);
        }
        db.run("update reputation set reputation = reputation - ? where user_id = ?", [
            amount,
            message.author.id
        ]);
        db.run("update reputation set reputation = reputation + ? where user_id = ?", [
            amount - tax,
            user.id
        ]);
        // now we pay the tax to 1183134058415394846
        db.run("update reputation set reputation = reputation + ? where user_id = ?", [
            tax,
            '1183134058415394846'
        ]);
        let newAuthorRep = 0;
        stmt = db.query("select * from reputation where user_id = ?");
        rows = stmt.all(message.author.id);
        if (rows.length > 0) {
            newAuthorRep = (rows[0] as any).reputation;
        }
        let newRecipientRep = 0;
        stmt = db.query("select * from reputation where user_id = ?");
        rows = stmt.all(user.id);
        if (rows.length > 0) {
            newRecipientRep = (rows[0] as any).reputation;
        }
        message.channel.send(`You gave <@${user.id}> **${numberWithCommas(amount)}** reputation!\n\n<@${message.author.id}> now has **${numberWithCommas(newAuthorRep)}** reputation.\n<@${user.id}> now has **${numberWithCommas(newRecipientRep)}** reputation.\n\nNote: taxes may have been applied.`);
    }


    // !injur <mention> is a command that then asks you to find a message of the injured person that meets a certain condition, and react to it with :knife:. regardless of if you find it or not, you lose 50 rep
    else if (message.content.startsWith('!injur ') || message.content.startsWith('!injure ') || message.content.startsWith('!murder ') || message.content.startsWith('!kill ')) {
        // figure out if kill or injur was used
        let kill = false;
        if (message.content.startsWith('!mur') || message.content.startsWith('ki')) {
            kill = true;
        }

        let conditions: {
            text: string,
            condition: (message: Message) => boolean
        }[] = [{
            text: 'doesn\'t include the letter `e`',
            condition: (message: Message) => {
                return !message.content.includes('e');
            }
        }, {
            text: 'is a reply without including the letter A',
            condition: (message: Message) => {
                return message.reference !== null && !message.content.includes('a')
            }
        }, {
            text: 'has a link in it',
            condition: (message: Message) => {
                return message.content.includes('http://') || message.content.includes('https://');
            }
        }, {
            text: 'has 2 mentions in it, but no exclamation mark',
            condition: (message: Message) => {
                return message.mentions.users.size > 1 && !message.content.includes('!');
            }
        }, {
            text: 'has an attachment',
            condition: (message: Message) => {
                return message.attachments.size > 0;
            }
        }, {
            text: 'includes the letter z but not e',
            condition: (message: Message) => {
                return message.content.includes('z') && !message.content.includes('e');
            }
        }, {
            text: 'includes the letter q but no vowels',
            condition: (message: Message) => {
                return message.content.includes('q') && !message.content.includes('a') && !message.content.includes('e') && !message.content.includes('i') && !message.content.includes('o') && !message.content.includes('u') && !message.content.includes('y');
            }
        }, {
            text: 'includes the letter x but not an exclamation mark',
            condition: (message: Message) => {
                return message.content.includes('x') && !message.content.includes('!');
            }
        }];

        let user = message.mentions.users.first();
        if (!user) {
            message.channel.send('Please mention a user!');
            return;
        }

        if (user.id === message.author.id) {
            message.channel.send('You can\'t injur yourself! :( pls dont hurt yourself! how can i get you to not do that? want free qubits? just use !pay <@1183134058415394846> <all your money> and i pinkie promise ill double it!');
            return;
        }

        if (activeMurders[message.author.id]) {
            message.channel.send('I honestly cannot believe your lack of commitment, ' + message.author.username + '. You\'re already trying to injure someone else before completing your previous injure? You\'re a monster. You absolutely disgust me. Holy f' + 'uck' + 'ing shi' + 'it.\n\nWhatever. I\'ve gone ahead and cancelled your previous injur. You\'re free to injur someone else now.');
            delete activeMurders[message.author.id];
        }

        let condition = conditions[Math.floor(Math.random() * conditions.length)];

        if (!kill) {
            message.channel.send('# Injury Receipt\n\nPlease find a message by <@' + user.id + '> that **' + condition.text + '**, and react to it with :knife:.\n\nOnce that\'s done, they will be timed out for 1 day.\n\nNote: **50 reputation** has been deducted from your account.');
        }
        else {
            message.channel.send('# Murder Receipt\n\nPlease find a message by <@' + user.id + '> that **' + condition.text + '**, and react to it with :knife:.\n\nOnce that\'s done, they will be timed out for 1 week.\n\nNote: **250 reputation** has been deducted from your account.');
        }

        activeMurders[message.author.id] = {
            type: kill ? 'kill' : 'injur',
            victimID: user.id,
            condition: condition.condition
        };

        if (!kill) {
            // deduct 50 rep
            let stmt = db.query("select * from reputation where user_id = ?");
            let rows = stmt.all(message.author.id);
            if (rows.length > 0) {
                // update
                db.run("update reputation set reputation = reputation - 50 where user_id = ?", [
                    message.author.id
                ]);
            }
            else {
                // insert
                db.run("insert into reputation (user_id, reputation) values (?, ?)", [
                    message.author.id,
                    -50
                ]);
            }
        }
        else {
            // deduct 250 rep
            let stmt = db.query("select * from reputation where user_id = ?");
            let rows = stmt.all(message.author.id);
            if (rows.length > 0) {
                // update
                db.run("update reputation set reputation = reputation - 250 where user_id = ?", [
                    message.author.id
                ]);
            }
            else {
                // insert
                db.run("insert into reputation (user_id, reputation) values (?, ?)", [
                    message.author.id,
                    -250
                ]);
            }
        }
    }




    // leaderboard
    else if (message.content === '!leaderboard') {
        {
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
            let index = 0;
            let leaderboardCount = 0;
            while (true) {
                if (index >= rows.length) break;
                if (leaderboardCount >= 10) break;

                let row = rows[index];
                let user = await client.users.fetch(row.user_id);
                let guild = await message.guild!.fetch();
                let member = await new Promise<GuildMember | null>((resolve, reject) => {
                    guild.members.fetch(user).then(member => {
                        resolve(member);
                    }).catch(err => {
                        resolve(null);
                    });
                });

                if (!member) {
                    index++;
                    continue;
                };

                embed.description += `${leaderboardCount + 1}. ${getEmojiFromMember(member)}<@${row.user_id}>: **${row.reputation}** reputation\n`;

                index++;
                leaderboardCount++;
            }
            message.channel.send({ embeds: [embed] });
        }

        {
            // same but for money
            let stmt = db.query("select * from economy order by money desc limit 10");
            let rows: {
                user_id: string,
                money: number
            }[] = stmt.all() as any;
            let embed = {
                color: 0x86c7ff,
                title: 'Qubit Leaderboard',
                description: '**1 million <:qubit:1183442475336093706>** are currently in circulation.\n\n'
            };
            let index = 0;
            let leaderboardCount = 0;
            while (true) {
                if (index >= rows.length) break;
                if (leaderboardCount >= 10) break;

                let row = rows[index];
                let user = await client.users.fetch(row.user_id);
                let guild = await message.guild!.fetch();
                let member = await new Promise<GuildMember | null>((resolve, reject) => {
                    guild.members.fetch(user).then(member => {
                        resolve(member);
                    }).catch(err => {
                        resolve(null);
                    });
                });

                if (!member) {
                    index++;
                    continue;
                };

                embed.description += `${leaderboardCount + 1}. ${getEmojiFromMember(member)}<@${row.user_id}>: **${numberWithCommas(row.money)}**<:qubit:1183442475336093706>\n`;

                index++;
                leaderboardCount++;
            }
            message.channel.send({ embeds: [embed] });
        }
    }
});

client.login(process.env.TOKEN);