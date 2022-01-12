const { SlashCommandBuilder } = require('@discordjs/builders');
const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState
} = require('@discordjs/voice');
const { MessageEmbed, CommandInteractionOptionResolver } = require('discord.js');
const fs = require('fs');
const TriviaPlayer = require('../../utils/music/TriviaPlayer');

module.exports = {
  data: 	new SlashCommandBuilder()
  .setName('music-trivia')
  .setDescription('Music Trivia')
  .addSubcommand(subcommand =>
	  subcommand
		  .setName('play')
		  .setDescription('Engage in a music quiz with your friends!')
		  .addStringOption(option =>
			  option
				  .setName('length')
				  .setDescription('How many songs would you like the trivia to have?'),
		  ),
  )
  .addSubcommand(subcommand =>
	  subcommand
		  .setName('add')
		  .setDescription('Adds a song to the music trivia list.')
		  .addStringOption(option => option.setName('url').setDescription("The YouTube URL for the song").setRequired(true))
		  .addStringOption(option => option.setName('artist').setDescription("The song's artist").setRequired(true))
		  .addStringOption(option => option.setName('title').setDescription("The song's title").setRequired(true)),
  ),
  async execute(interaction) {
	const subcommand = interaction.options.getSubcommand()
	if(subcommand === 'play'){
		await startMusicTrivia(interaction)
	} else if (subcommand === 'add'){
		await addSongToList(interaction)
	}
  }
};

const urlRegex = /[^=\/]*$/

function isValidSong(song) {
	const songUrlKey = song.url
	const match = urlRegex.exec(songUrlKey)

	return !!match
}

function songIsDuplicate(song = {}, existingSongs = []) {
	const [ urlSuffix ] = urlRegex.exec(song.url)

	const lowercaseTitle = song?.title?.toLowerCase()
	const lowercaseSinger = song?.singer?.toLowerCase()

	return !!existingSongs.some(existingSong => {
		return existingSong.url.endsWith(urlSuffix) || (lowercaseSinger === existingSong?.singer && lowercaseTitle === existingSong?.title)
	})
}

async function addSongToList(interaction){
	await interaction.deferReply()
	if(interaction.options.getString('url').includes('playlist')){
		interaction.followUp({content: 'Adding playlists not supported! *Video* URLs only please!'})
		return
	}

	let songArray = getSongArray()
	const newSong = {
		url: interaction.options.getString('url'),
		singer: interaction.options.getString('artist').toLowerCase(),
		title: interaction.options.getString('title').toLowerCase(),
		addedBy: interaction.user.username,
	}

	if(!isValidSong(newSong)){
		interaction.followUp({content: `Invalid YouTube URL provided`})
	} else if(songIsDuplicate(newSong, songArray)) {
		interaction.followUp({content: `**${newSong.singer}: ${newSong.title}** already exists in the list!`})
	} else {
		songArray.push(newSong)
		const result = await saveSongArray(songArray)
		if(result){
			interaction.followUp({content: `Successfully added song **${newSong.singer}: ${newSong.title}** to the list, for a total of ${songArray.length} songs.`})
		} else {
			interaction.followUp({content: 'CHARLES BROKE THE BOT! IT DIDN\'T WORK!'})
		}
	}
}

async function startMusicTrivia(interaction) {
	await interaction.deferReply();
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.followUp(
        ':no_entry: Please join a voice channel and try again!'
      );
    }

    if (interaction.client.playerManager.get(interaction.guildId)) {
      return interaction.followUp(
        `You can't use this while a track is playing!`
      );
    }

    if (interaction.client.triviaManager.get(interaction.guildId)) {
      return interaction.followUp('There is already a trivia in play!');
    }

    const numberOfSongs = interaction.options.get('length')
      ? interaction.options.get('length').value
      : 5;

    const videoDataArray = getSongArray();
    // get random numberOfSongs videos from the array

    const randomLinks = getRandom(videoDataArray, numberOfSongs);
    interaction.client.triviaManager.set(
      interaction.guildId,
      new TriviaPlayer()
    );

    const triviaPlayer = interaction.client.triviaManager.get(
      interaction.guildId
    );

    randomLinks.forEach(link => {
      triviaPlayer.queue.push({
        url: link.url,
        singer: link.singer,
        title: link.title,
        voiceChannel
      });
    });

    const membersInChannel = interaction.member.voice.channel.members;

    membersInChannel.each(user => {
      if (user.user.bot) return;
      triviaPlayer.score.set(user.user.username, 0);
    });

    // play and display embed that says trivia started and how many songs are going to be
    handleSubscription(interaction, triviaPlayer);
}

const songJsonPath = '././resources/music/musictrivia.json'

function getSongArray() {
	const jsonSongs = fs.readFileSync(
		songJsonPath,
		'utf8'
	);
	return JSON.parse(jsonSongs).songs;
}

async function saveSongArray(songArray){
	await fs.writeFile(songJsonPath, JSON.stringify({songs: songArray}, null, 2), err => {
		if (err) {
			console.error(`Error writing file: ${err}`)
			return false
		}
	})
	return true
}

async function handleSubscription(interaction, player) {
  const queue = player.queue;
  let voiceChannel = queue[0].voiceChannel;

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guild.id,
    adapterCreator: interaction.guild.voiceAdapterCreator
  });

  player.textChannel = interaction.channel;
  player.passConnection(connection);
  try {
    await entersState(player.connection, VoiceConnectionStatus.Ready, 10000);
  } catch (err) {
    console.error(err);
    await interaction.followUp({ content: 'Failed to join your channel!' });
    return;
  }
  player.process(player.queue);

  const startTriviaEmbed = new MessageEmbed()
    .setColor('#ff7373')
    .setTitle(':notes: Starting Music Quiz!')
    .setDescription(
      `:notes: Get ready! There are ${queue.length} songs, you have 30 seconds to guess either the singer/band or the name of the song. Good luck!
    Vote skip the song by entering the word 'skip'.
    You can end the trivia at any point by using the end-trivia command!`
    );
  return interaction.followUp({ embeds: [startTriviaEmbed] });
}

function getRandom(arr, n) {
  var result = new Array(n),
    len = arr.length,
    taken = new Array(len);
  if (n > len)
    throw new RangeError('getRandom: more elements taken than available!');
  while (n--) {
    var x = Math.floor(Math.random() * len);
    // prettier-ignore
    result[n] = arr[(x in taken) ? taken[x] : x];
    // prettier-ignore
    taken[x] = (--len in taken) ? taken[len] : len;
    // prettier-ignore-end
  }
  return result;
}
