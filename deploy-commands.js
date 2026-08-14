
require('dotenv').config();

const { REST, Routes } = require('discord.js');

const commands = [
    {
        name: 'create-project',
        description: 'Créer un projet',
        options: [
            {
                name: 'title',
                description: 'Titre du projet.',
                type: 3,
                required: true
            },
            {
                name: 'description',
                description: 'Description du projet.',
                type: 3,
                required: true
            },
            {
                name: 'languages',
                description: 'Langages utilisés, séparés par une virgule.',
                type: 3,
                required: true
            },
            {
                name: 'difficulty',
                description: 'Difficulté du projet (débutant, intermédiaire, expert).',
                type: 3,
                required: true,
                choices: [
                    {
                        name: '★☆☆☆☆',
                        value: '1'
                    },
                    {
                        name: '★★☆☆☆',
                        value: '2'
                    },
                    {
                        name: '★★★☆☆',
                        value: '3'
                    },
                    {
                        name: '★★★★☆',
                        value: '4'
                    },
                    {
                        name: '★★★★★',
                        value: '5'
                    },
                ]
            }
        ]
    },
    {
        name: 'delete-project',
        description: 'Supprimer un projet',
        options: [
            {
                name: 'id',
                type: 4, // INTEGER
                description: 'ID du projet à supprimer',
                required: true,
            },
        ],
    },
    {
        name: 'join-project',
        description: 'Demander à rejoindre un projet',
        options: [
            {
                name: 'id',
                type: 4,
                description: 'ID du projet',
                required: true,
            },
            {
                name: 'message',
                type: 3, // string
                description: "Message pour l'owner",
                required: true,
            },
        ],
    },
    {
        name: 'remove-member',
        description: 'Retirer un membre d’un projet',
        options: [
            {
                name: 'id',
                type: 4,
                description: 'ID du projet',
                required: true,
            },
            {
                name: 'user',
                type: 6,
                description: 'Membre à retirer',
                required: true,
            },
        ],
    }
];

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1533843026777211051';

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('Déploiement des commandes...');

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );

        console.log('Commandes déployées !');
    } catch (error) {
        console.error(error);
    }
})();