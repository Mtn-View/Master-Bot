const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs');

const songJsonPath = '././resources/music/musictrivia.json'

module.exports = {
	data: new SlashCommandBuilder()
	.setName('music-trivia-add')
		.setDescription('Adds a song to the music trivia list.')
		.addStringOption(option => option.setName('url').setDescription("The YouTube URL for the song").setRequired(true))
		.addStringOption(option => option.setName('artist').setDescription("The song's artist").setRequired(true))
		.addStringOption(option => option.setName('title').setDescription("The song's title").setRequired(true)),
	async execute(interaction) {
		await interaction.deferReply({ephemeral: true})
		if(interaction.options.getString('url').includes('playlist')){
			interaction.followUp({content: 'Adding playlists not supported! *Video* URLs only please!', ephemeral: true})
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
			interaction.followUp({content: `Invalid YouTube URL provided`, ephemeral: true})
		} else if(songIsDuplicate(newSong, songArray)) {
			interaction.followUp({content: `**${newSong.singer}: ${newSong.title}** already exists in the list!`, ephemeral: true})
		} else {
			songArray.push(newSong)
			const result = await saveSongArray(songArray)
			if(result){
				interaction.followUp({content: `Successfully added song **${newSong.singer}: ${newSong.title}** to the list, for a total of ${songArray.length} songs.`, ephemeral: true})
			} else {
				interaction.followUp({content: 'Error saving song to list.', ephemeral: true})
			}
		}
	}
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

function getSongArray() {
	const jsonSongs = fs.readFileSync(
		songJsonPath,
		'utf8'
	);
	return JSON.parse(jsonSongs).songs;
}

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
		return existingSong.url.endsWith(urlSuffix) ||
			(lowercaseSinger === existingSong?.singer?.toLowerCase() && lowercaseTitle === existingSong?.title?.toLowerCase())
	})
}