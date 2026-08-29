

require('dotenv').config();

const { Client, GatewayIntentBits, Events } = require('discord.js');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const supabase = require('./supabase');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
client.once(Events.ClientReady, async () => {
    console.log(`Connecté en tant que ${client.user.tag}`);

    const guild = client.guilds.cache.first();

    if (guild) {
        await guild.members.fetch();
        console.log("Membres chargés !");
    }

    const { data: users, error } = await supabase
        .from('users')
        .select('user_id, points');

    if (error) {
        console.error("Erreur chargement des points :", error);
    } else {
        for (const user of users) {
            userPoints.set(user.user_id, Number(user.points) || 0);
        }

        console.log(`${users.length} utilisateurs chargés dans userPoints !`);
    }

    for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;

        const { error } = await supabase
            .from('users')
            .upsert(
                {
                    user_id: member.id,
                    points: 0,
                    messages: 0,
                    vocal: 0
                },
                {
                    onConflict: 'user_id',
                    ignoreDuplicates: true
                }
            );

        if (error) {
            console.error(`Erreur ajout ${member.user.username} :`, error);
        }
    }

    console.log("Utilisateurs initialisés dans Supabase !");

    const voiceChannel = guild.channels.cache.get("1533839111595622552");

    if (voiceChannel) {
        joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfMute: true,
            selfDeaf: true
        });

        console.log("Connecté au vocal DevMatch !");

        await updateProjectsMessage();
        console.log("Liste des projets actualisée !");





        console.log("   🟢   Bot chargé   🟢   ")
    }
});

const messageCounters = new Map();
const userPoints = new Map();
const voiceSessions = new Map();
const voiceCounters = new Map();
const ranks = [
    { points: 1, roleId: "1543063273459556452", name: "Bronze 1" },
    { points: 10, roleId: "1543062968953077841", name: "Bronze 2" },
    { points: 20, roleId: "1542530060571910164", name: "Bronze 3" },
    { points: 50, roleId: "1543063327658352681", name: "Silver 1" },
    { points: 100, roleId: "1543063845835251753", name: "Silver 2" },
    { points: 150, roleId: "1543063896452235274", name: "Silver 3" },
    { points: 200, roleId: "1543064192163254302", name: "Gold 1" },
    { points: 300, roleId: "1543064168935067678", name: "Gold 2" },
    { points: 400, roleId: "1543064030405726370", name: "Gold 3" },
    { points: 500, roleId: "1543064941085462548", name: "Légende" }
];

function getRank(points) {
    let currentRank = null;

    for (const rank of ranks) {
        if (points >= rank.points) {
            currentRank = rank;
        } else {
            break;
        }
    }

    return currentRank;
}

async function updateRank(member, points) {
    const rank = getRank(points);

    if (!rank) return;

    // Récupérer tous les rôles de rang
    const rankRoleIds = ranks.map(rank => rank.roleId);

    // Retirer les anciens rôles de rang
    const rolesToRemove = member.roles.cache.filter(
        role => rankRoleIds.includes(role.id) && role.id !== rank.roleId
    );

    if (rolesToRemove.size > 0) {
        await member.roles.remove(rolesToRemove);
    }

    // Ajouter le nouveau rôle s'il ne l'a pas déjà
    if (!member.roles.cache.has(rank.roleId)) {
        await member.roles.add(rank.roleId);

        console.log(
            `${member.user.username} atteint ${points} points → nouveau rang !`
        );
        const rankChannel = member.guild.channels.cache.get(
            "1543283853836419225"
        );

        if (rankChannel) {
            await rankChannel.send(
                `# 🎉 <@${member.id}> vient de passer **${rank.name}** !
# Mais quel beau gosse c'est fou ça`
            );
        }
    }


}

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const member = newState.member;

    if (!member || member.user.bot) return;

    // Le membre rejoint un vocal
    if (!oldState.channelId && newState.channelId) {
        voiceSessions.set(member.id, {
            joinedAt: Date.now(),
            pointsEarned: 0
        });

        console.log(
            `${member.user.username} a rejoint le vocal.`
        );
    }

    // Le membre quitte un vocal
    if (oldState.channelId && !newState.channelId) {
        const session = voiceSessions.get(member.id);

        if (!session) return;

        const duration = Date.now() - session.joinedAt;
        const minutes = Math.floor(duration / 60000);

        voiceSessions.delete(member.id);

        console.log(
            `${member.user.username} a quitté le vocal après ${minutes} minute(s).`
        );
    }
});

setInterval(async () => {
    const now = Date.now();

    for (const [userId, session] of voiceSessions) {
        const elapsedMinutes = Math.floor(
            (now - session.joinedAt) / 60000
        );

        const totalVoicePoints = Math.floor(elapsedMinutes / 10);

        if (totalVoicePoints <= session.pointsEarned) continue;

        const pointsToAdd = totalVoicePoints - session.pointsEarned;

        session.pointsEarned = totalVoicePoints;

        const currentPoints = userPoints.get(userId) || 0;
        const newPoints = currentPoints + pointsToAdd;

        userPoints.set(userId, newPoints);

        voiceCounters.set(
            userId,
            (voiceCounters.get(userId) || 0) + pointsToAdd
        );

        const member = await client.guilds.cache
            .first()
            .members.fetch(userId);

        console.log(
            `${member.user.username} → +${pointsToAdd} point(s) vocal (${elapsedMinutes} min)`
        );

        await updateRank(member, newPoints);
    }
}, 60000);

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    const userId = message.author.id;

    messageCounters.set(
        userId,
        (messageCounters.get(userId) || 0) + 1
    );


    const newPoints = (userPoints.get(userId) || 0) + 1;
    userPoints.set(userId, newPoints);

    await updateRank(message.member, newPoints);

    console.log(
        `${message.author.username} → ${newPoints} points`
    );
});


setInterval(async () => {
    if (messageCounters.size === 0) return;

    const countersToSave = new Map(messageCounters);

    messageCounters.clear();

    for (const [userId, count] of countersToSave) {
        const { error } = await supabase.rpc('add_user_stats', {
            p_user_id: userId,
            p_messages: count,
            p_points: count,
            p_vocal: 0
        });

        if (error) {
            console.error(`Erreur sauvegarde messages de ${userId} :`, error);

            // on remet les messages en mémoire s'ils n'ont pas pu être sauvegardés, 
            // pour qu'ils puissent être envoyés à la "salve" d'après 
            messageCounters.set(
                userId,
                (messageCounters.get(userId) || 0) + count
            );
        }
    }

    console.log(`Stats messages sauvegardées : ${countersToSave.size} utilisateur(s)`);
}, 60000);

setInterval(async () => {
    if (voiceCounters.size === 0) return;

    const countersToSave = new Map(voiceCounters);
    voiceCounters.clear();

    for (const [userId, count] of countersToSave) {
        const { error } = await supabase.rpc('add_user_stats', {
            p_user_id: userId,
            p_messages: 0,
            p_points: count,
            p_vocal: count
        });

        if (error) {
            console.error(
                `Erreur sauvegarde vocal de ${userId} :`,
                error
            );

            // On remet les points en mémoire s'ils n'ont pas pu être sauvegardés
            voiceCounters.set(
                userId,
                (voiceCounters.get(userId) || 0) + count
            );
        }
    }

    console.log(
        `Stats vocal sauvegardées : ${countersToSave.size} utilisateur(s)`
    );
}, 60000);

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'create-project') {

        await interaction.deferReply({ ephemeral: true });

        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const languages = interaction.options.getString('languages');
        const languagesArray = languages
            .split(',')
            .map(lang => lang.trim())
            .filter(lang => lang.length > 0);
        const difficulty = interaction.options.getString('difficulty');
        const openSource = interaction.options.getString('open-source');
        const userId = interaction.user.id;
        const ownerUsername = interaction.user.username;

        const { data, error } = await supabase
            .from('projects')
            .insert([
                {
                    title: title,
                    description: description,
                    languages: languagesArray,
                    difficulty: difficulty,
                    open_source: openSource,
                    owner: userId,
                    owner_username: ownerUsername,
                    members: [userId],
                    verified: false
                }
            ])
            .select();

        if (error) {
            console.log(error);
            await interaction.editReply('Erreur lors de la création du projet');
            return;
        }


        const channel = await client.channels.fetch("1534122149252436161");
        const project = data[0]
        const message = await channel.send({
            content: `**Nouveau projet**

        **Titre :** ${title}
        **Description :** ${description}
        **Langages :** ${languagesArray.join(", ")}
        **Owner :** <@${userId}>
        **Open Source :** ${openSource === 'true' ? 'Oui' : 'Non'}
        **Difficulty :** ${difficulty}`,


            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_${project.id}`)
                        .setLabel('✔️')
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId(`reject_${project.id}`)
                        .setLabel('✖️')
                        .setStyle(ButtonStyle.Danger)
                )
            ]
        });

        console.log(data);

        await interaction.editReply(`Projet créé avec succès ! 
En attente de vérification d'un modérateur.`);
    }
    if (interaction.commandName === 'delete-project') {

        await interaction.deferReply({ ephemeral: true });

        const projectId = interaction.options.getInteger('id');

        // récupérer le projet
        const { data: project, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (error || !project) {
            return interaction.editReply("Projet introuvable.");
        }

        const userId = interaction.user.id;

        // check owner
        const isOwner = project.owner === userId;

        // check modo 
        const member = await interaction.guild.members.fetch(userId);
        const isMod = member.roles.cache.has('1533837255309791313');

        if (!isOwner && !isMod) {
            return interaction.editReply("Tu n'as pas la permission de supprimer ce projet.");
        }


        // trouver la catégorie
        const category = interaction.guild.channels.cache.find(
            c => c.name === `#${projectId} - ${project.title}` && c.type === 4
        );

        if (category) {
            // supprimer tous les salons dedans
            const channels = interaction.guild.channels.cache.filter(
                c => c.parentId === category.id
            );

            for (const channel of channels.values()) {
                await channel.delete();
            }

            // supprimer la catégorie
            await category.delete();
        }
        const ownerRole = interaction.guild.roles.cache.find(
            r => r.name === `projet-${projectId}-owner`
        );

        const memberRole = interaction.guild.roles.cache.find(
            r => r.name === `projet-${projectId}-member`
        );

        if (ownerRole) await ownerRole.delete();
        if (memberRole) await memberRole.delete();

        const { error: deleteError } = await supabase
            .from('projects')
            .delete()
            .eq('id', projectId);

        await updateProjectsMessage();

        if (deleteError) {
            console.error(deleteError);
            try {
                return interaction.editReply("Projet supprimé côté Discord, mais erreur côté base de données.");
            } catch { }
        }

        try {
            await interaction.editReply(`Projet ${projectId} supprimé.`);
        } catch { }
    }
    if (interaction.commandName === 'join-project') {


        await interaction.deferReply({ ephemeral: true });

        const projectId = interaction.options.getInteger('id');
        const joinMessage = interaction.options.getString('message');
        const userId = interaction.user.id;

        // récupérer le projet
        const { data: project, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (error || !project) {
            return interaction.editReply("Projet introuvable.");
        }

        // vérifier si déjà membre
        if (project.members?.includes(userId)) {
            return interaction.editReply("Tu es déjà membre de ce projet.");
        }

        // trouver le salon owner
        const ownerChannel = interaction.guild.channels.cache.find(
            c => c.name === `👑・${projectId}-owner`
        );

        if (!ownerChannel) {
            return interaction.editReply("Salon owner introuvable.");
        }

        // créer les boutons
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`accept_join_${projectId}_${userId}`)
                .setLabel('✔️')
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(`deny_join_${projectId}_${userId}`)
                .setLabel('✖️')
                .setStyle(ButtonStyle.Danger)
        );

        // envoyer message dans owner
        await ownerChannel.send({
            content: `<@${userId}> souhaite rejoindre le projet **${project.title}**.
Il dit : **${joinMessage}**.
Souhaitez-vous l'accepter comme membre de votre projet ?`,
            components: [row],
        });

        // réponse utilisateur
        await interaction.editReply("Demande envoyée au propriétaire du projet.");
    }
    if (interaction.commandName === 'remove-member') {


        const projectId = interaction.options.getInteger('id');
        const user = interaction.options.getUser('user');
        const userId = user.id;

        await interaction.deferReply({ ephemeral: true });

        const { data: project, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (error || !project) {
            return interaction.editReply("Projet introuvable.");
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);

        const isOwner = project.owner === interaction.user.id;
        const isModerator = member.roles.cache.has('1533837255309791313');

        if (!isOwner && !isModerator) {
            return interaction.editReply(
                "Tu n'as pas la permission de retirer un membre."
            );
        }

        if (!project.members?.includes(userId)) {
            return interaction.editReply(
                "Cet utilisateur n'est pas membre de ce projet."
            );
        }

        // retirer le membre de la liste
        const newMembers = project.members.filter(
            id => id !== userId
        );

        const { error: updateError } = await supabase
            .from('projects')
            .update({ members: newMembers })
            .eq('id', projectId);

        if (updateError) {
            console.error(updateError);

            return interaction.editReply(
                "Impossible de retirer le membre de la base de données."
            );
        }

        // trouver le rôle member
        const memberRole = interaction.guild.roles.cache.find(
            role => role.name === `projet-${projectId}-member`
        );

        if (!memberRole) {
            return interaction.editReply(
                "Membre retiré de la base, mais rôle introuvable."
            );
        }

        // retirer le rôle
        const targetMember = await interaction.guild.members.fetch(userId);

        await targetMember.roles.remove(memberRole);

        await interaction.editReply(
            `<@${userId}> a été retiré du projet ${projectId}.`
        );

    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;

    //bouton approve
    if (customId.startsWith('approve_')) {
        await interaction.deferReply({ ephemeral: true });

        const projectId = customId.split('_')[1];

        //update Supabase
        const { error } = await supabase
            .from('projects')
            .update({ verified: true })
            .eq('id', projectId);

        if (error) {
            return interaction.editReply("Erreur validation");
        }



        const { data: project, error: fetchError } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (fetchError || !project) {
            return interaction.editReply("Projet introuvable");
        }

        const guild = interaction.guild;

        const member = await interaction.guild.members.fetch(project.owner);

        const ownerRole = await guild.roles.create({
            name: `projet-${projectId}-owner`,
            color: 0xFF0000,
            hoist: true
        });

        const memberRole = await guild.roles.create({
            name: `projet-${projectId}-member`,
            color: 0xFF5B5B,
            hoist: true
        });

        
        const ownerRoleDelimitation = interaction.guild.roles.cache.get("1543302507680366714");
        const memberRoleDelimitation = interaction.guild.roles.cache.get("1543302285692633299");

        await ownerRole.setPosition(ownerRoleDelimitation.position + 1);
        await memberRole.setPosition(memberRoleDelimitation.position + 1);

        await member.roles.add(ownerRole);
        await member.roles.add(memberRole);



        const category = await interaction.guild.channels.create({
            name: `#${projectId} - ${project.title}`,
            type: 4, // GUILD_CATEGORY
        });

        const ownerChannel = await interaction.guild.channels.create({
            name: `👑・${projectId}-owner`,
            type: 0, // text
            parent: category.id,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: ['ViewChannel'],
                },
                {
                    id: ownerRole.id,
                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                },
                {
                    id: '1533837255309791313',
                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                },
                {
                    id: '1541436751405514754',
                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                },
            ],
        });

        await ownerChannel.send({
            content: `👑 **Espace propriétaire du projet**

Salut <@${project.owner}> !

Ce salon est réservé à la gestion de ton projet.

Tu peux :
• discuter avec les modérateurs
• utiliser des commandes slash (pour inviter des personnes dans le projet, par exemple.)
• demander des modifications si besoin

Les modérateurs ont aussi accès à ce salon.

Pour discuter avec les membres de ton projet, va dans #membres.

Utilise-le dès que nécessaire :) `
        });

        const membersChannel = await interaction.guild.channels.create({
            name: `🗯️・${projectId}-members`,
            type: 0,
            parent: category.id,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: ['ViewChannel'],
                },
                {
                    id: memberRole.id,
                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                },
                {
                    id: ownerRole.id,
                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                },
                {
                    id: '1533837255309791313',
                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                },
                {
                    id: '1541436751405514754',
                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                },
            ],
        });

        const generalChannel = await interaction.guild.channels.create({
            name: `💬・${projectId}-general`,
            type: 0,
            parent: category.id,
        });

        await generalChannel.send({
            content: `**Nouveau projet !**

**Nom :** ${project.title}
**Description :** ${project.description}
**Langages de programmation :** ${project.languages.join(", ")}
**Difficulté :** ${project.difficulty}
**Open Source :** ${project.open_source === 'true' ? 'Oui' : 'Non'}

👑 Créateur : <@${project.owner}>

Bienvenue à tous ! Posez vos questions ici.`
        });

        const vocalChannel = await interaction.guild.channels.create({
            name: `🔊・${projectId}-vocal`,
            type: 2, // vocal
            parent: category.id,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    allow: ['ViewChannel'],
                    deny: ['Connect'],
                },
                {
                    id: memberRole.id,
                    allow: ['ViewChannel', 'Connect'],
                },
                {
                    id: ownerRole.id,
                    allow: ['ViewChannel', 'Connect'],
                },
                {
                    id: '1533837255309791313',
                    allow: ['ViewChannel', 'Connect'],
                },
            ],
        });











        //supprimer le message
        try {
            await interaction.message.delete();
        } catch (error) {
            console.error(error);
        }

        await updateProjectsMessage();

        //confirmation
        await interaction.editReply("Projet validé !");
    }
    //bouton rejet
    if (customId.startsWith('reject_')) {


        await interaction.deferReply({ ephemeral: true });

        const projectId = customId.split('_')[1];

        //supprimer dans Supabase
        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', projectId);

        if (error) {
            return interaction.editReply("Erreur suppression");
        }

        //supprimer le message
        try {
            await interaction.message.delete();
        } catch (error) {
            console.error(error);
        }

        //petite confirmation (optionnel)
        await interaction.editReply("Projet supprimé");
    }
    if (interaction.customId.startsWith('accept_join_')) {
        await interaction.deferReply({ ephemeral: true });

        const parts = interaction.customId.split('_');

        const projectId = parseInt(parts[2]);
        const userId = parts[3];

        // récupérer le projet
        const { data: project, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (error || !project) {
            return interaction.editReply({
                content: 'Projet introuvable.',
                components: [],
            });
        }

        // vérifier que celui qui clique est bien le owner
        if (interaction.user.id !== project.owner) {
            return interaction.followUp({
                content: "Tu n'es pas le propriétaire de ce projet.",
                ephemeral: true,
            });
        }

        // vérifier que l'utilisateur n'est pas déjà membre
        if (project.members?.includes(userId)) {
            return interaction.editReply({
                content: `<@${userId}> est déjà membre de ce projet.`,
                components: [],
            });
        }

        // ajouter le membre dans Supabase
        const newMembers = [...(project.members || []), userId];

        const { error: updateError } = await supabase
            .from('projects')
            .update({ members: newMembers })
            .eq('id', projectId);

        if (updateError) {
            console.error(updateError);

            return interaction.editReply({
                content: 'Impossible d’ajouter le membre.',
                components: [],
            });
        }

        // récupérer le rôle du projet
        const memberRole = interaction.guild.roles.cache.find(
            role => role.name === `projet-${projectId}-member`
        );

        if (!memberRole) {
            return interaction.editReply({
                content: 'Membre ajouté à la base, mais rôle introuvable.',
                components: [],
            });
        }

        // donner le rôle
        const member = await interaction.guild.members.fetch(userId);
        await member.roles.add(memberRole);

        // modifier le message
        try {
            await interaction.message.edit({
                content: `<@${userId}> a été accepté dans le projet **${project.title}** !`,
                components: [],
            });
        } catch (error) {
            console.error(error);
        }


        await interaction.editReply("Membre accepté !");

    }
    if (interaction.customId.startsWith('deny_join_')) {
        await interaction.deferUpdate();

        const parts = interaction.customId.split('_');

        const projectId = parseInt(parts[2]);
        const userId = parts[3];

        // récupérer le projet
        const { data: project, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (error || !project) {
            return interaction.editReply({
                content: 'Projet introuvable.',
                components: [],
            });
        }

        // vérifier que celui qui clique est bien le owner
        if (interaction.user.id !== project.owner) {
            return interaction.followUp({
                content: "Tu n'es pas le propriétaire de ce projet.",
                ephemeral: true,
            });
        }

        // modifier le message
        try {
            await interaction.message.edit({
                content: `La demande de <@${userId}> pour rejoindre le projet **${project.title}** a été refusée.`,
                components: [],
            });
        } catch (error) {
            console.error(error);
        }
    }
}
);


async function updateNickname(member) {

    if (member.id === "866958928373743626") return;

    const roles = member.roles.cache
        .filter(role => role.id !== member.guild.id)
        .sort((a, b) => b.position - a.position);

    const highestRole = roles.first();

    if (!highestRole) return;

    const roleName = highestRole.name.toUpperCase();
    const suffix = ` [${roleName}]`;

    // Retirer un éventuel ancien suffixe ajouté par le bot
    const baseName = member.displayName.replace(/\s*\[[^\]]+\]$/, '');

    const nickname = `${baseName.slice(0, 32 - suffix.length)}${suffix}`;

    // Vérifier que le bot peut modifier ce membre
    const botMember = member.guild.members.me;

    if (member.roles.highest.position >= botMember.roles.highest.position) {
        return;
    }

    await member.setNickname(nickname);
}

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    console.log("GuildMemberUpdate reçu !");

    console.log(
        "UPDATE :",
        newMember.user.username,
        "anciens rôles :",
        oldMember.roles.cache.map(role => role.name),
        "nouveaux rôles :",
        newMember.roles.cache.map(role => role.name)
    );

    setTimeout(async () => {
        const member = await newMember.guild.members.fetch(newMember.id);
        await updateNickname(member);
    }, 500);
});

client.on(Events.GuildMemberAdd, async member => {
    await updateNickname(member);
    if (member.user.bot) return;

    const { error } = await supabase
        .from('users')
        .insert({
            user_id: member.id,
            points: 0,
            messages: 0,
            vocal: 0
        });

    if (error) {
        console.error(`Erreur ajout ${member.user.username} :`, error);
        return;
    }

    console.log(`${member.user.username} ajouté à la base !`);
});

async function updateProjectsMessage() {
    const channel = await client.channels.fetch("1534900516151103598");

    const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .eq('verified', true)
        .order('id', { ascending: true });

    if (error) {
        console.error("Erreur récupération projets :", error);
        return;
    }

    let content = "# Projets en cours\n\n";

    if (!projects || projects.length === 0) {
        content += "Aucun projet en cours pour le moment.";
    } else {
        for (const project of projects) {
            content += `## ${project.title}\n`;
            content += `**Description :** ${project.description}\n`;
            content += `**Langages :** ${project.languages.join(", ")}\n`;
            content += `**Difficulté :** ${project.difficulty}\n`;
            content += `**Open Source :** ${project.open_source === 'true' ? 'Oui' : 'Non'}\n`;
            content += `**Créateur :** <@${project.owner}>\n`;
            content += `**Projet :** \`#${project.id}\`\n\n`;
        }
    }

    // Chercher le message existant du bot
    const messages = await channel.messages.fetch({ limit: 100 });

    const botMessage = messages.find(
        message => message.author.id === client.user.id
    );

    if (botMessage) {
        await botMessage.edit(content);
    } else {
        await channel.send(content);
    }
}

client.login(TOKEN);