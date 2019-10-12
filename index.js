const { Client, Util } = require('discord.js');
const { TOKEN, PREFIX, GOOGLE_API_KEY } = require('./config');
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');

const client = new Client({ disableEveryone: true });

const youtube = new YouTube(GOOGLE_API_KEY);

const queue = new Map();

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready', () => console.log('Yo this ready!'));

client.on('disconnect', () => console.log('I just disconnected, making sure you know, I will reconnect now...'));

client.on('reconnecting', () => console.log('I am reconnecting now!'));

client.on('message', async msg => { // eslint-disable-line
	if (msg.author.bot) return undefined;
	if (!msg.content.startsWith(PREFIX)) return undefined;

	const args = msg.content.split(' ');
	const searchString = args.slice(1).join(' ');
	const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	const serverQueue = queue.get(msg.guild.id);

	let command = msg.content.toLowerCase().split(' ')[0];
	command = command.slice(PREFIX.length)

	if (command === 'play') {
		const voiceChannel = msg.member.voiceChannel;
		if (!voiceChannel) return msg.channel.send('¡Tienes que estar en un canal de voz para reproducir música!');
		const permissions = voiceChannel.permissionsFor(msg.client.user);
		if (!permissions.has('CONNECT')) {
			return msg.channel.send('No puedo conectarme a tu canal de voz, ¡asegúrate de tener los permisos adecuados!');
		}
		if (!permissions.has('SPEAK')) {
			return msg.channel.send('No puedo hablar en este canal de voz, ¡asegúrese de tener los permisos adecuados!');
		}

		if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
			const playlist = await youtube.getPlaylist(url);
			const videos = await playlist.getVideos();
			for (const video of Object.values(videos)) {
				const video2 = await youtube.getVideoByID(video.id); // eslint-disable-line no-await-in-loop
				await handleVideo(video2, msg, voiceChannel, true); // eslint-disable-line no-await-in-loop
			}
			return msg.channel.send(`✅ **${playlist.title}** ha sido añadido a la cola!`);
		} else {
			try {
				var video = await youtube.getVideo(url);
			} catch (error) {
				try {
					var videos = await youtube.searchVideos(searchString, 10);
					let index = 0;
					msg.channel.send(`
            __**Selecciona una canción:**__
            ${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}
            **Solo tienes que poner el numero de la canción que quieras escuchar** 
					`);
					// eslint-disable-next-line max-depth
					try {
						var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
							maxMatches: 1,
							time: 30000,
							errors: ['time']
						});
					} catch (err) {
						console.error(err);
						return msg.channel.send('No se ingresó ningún valor o no es válido, cancelando la selección de video.');
					}
					const videoIndex = parseInt(response.first().content);
					var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
				} catch (err) {
					console.error(err);
					return msg.channel.send('🆘 No pude obtener ningún resultado de búsqueda.');
				}
			}
			return handleVideo(video, msg, voiceChannel);
		}
	} else if (command === 'skip') {
		if (!msg.member.voiceChannel) return msg.channel.send('¡No estás en un canal de voz!');
		if (!serverQueue) return msg.channel.send('No hay nada que pueda saltar por ti.');
		serverQueue.connection.dispatcher.end('Pasando de canción');
		return undefined;
	} else if (command === 'stop') {
		if (!msg.member.voiceChannel) return msg.channel.send('¡No estás en un canal de voz!');
		if (!serverQueue) return msg.channel.send('No hay nada que pueda parar por ti.');
		serverQueue.songs = [];
		serverQueue.connection.dispatcher.end('Se ha detanido la musica.');
		return undefined;
	} else if (command === 'vol') {
		if (!msg.member.voiceChannel) return msg.channel.send('¡No estás en un canal de voz!');
		if (!serverQueue) return msg.channel.send('No hay nada en la lista de reproducción.');
		if (!args[1]) return msg.channel.send(`el volumen actual es: **${serverQueue.volume}**`);
		serverQueue.volume = args[1];
		serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
		return msg.channel.send(`Ahora el volumen es: **${args[1]}**`);
	} else if (command === 'actual') {
		if (!serverQueue) return msg.channel.send('No hay nada en la lista de reproducción.');
		return msg.channel.send(`🎶 esta sonando: **${serverQueue.songs[0].title}** disfruta de la musuca ;3`);
	} else if (command === 'lista') {
		if (!serverQueue) return msg.channel.send('No hay nada en la lista de reproducción.');
		return msg.channel.send(`
__**Lista de reproducción:**__
${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}
**Ahora esta sonando:** ${serverQueue.songs[0].title}
		`);
	} else if (command === 'p') {
		if (serverQueue && serverQueue.playing) {
			serverQueue.playing = false;
			serverQueue.connection.dispatcher.pause();
			return msg.channel.send('⏸ he pausado la musica por ti <3 ');
		}
		return msg.channel.send('No hay nada en la lista de reproducción.');
	} else if (command === 'r') {
		if (serverQueue && !serverQueue.playing) {
			serverQueue.playing = true;
			serverQueue.connection.dispatcher.resume();
			return msg.channel.send('▶ ¡Música en marcha!');
		}
		return msg.channel.send('No hay nada que reproducir.');
	} if (command === 'help') {
        msg.channel.send('__<play [Nombre de la canción o URL de Youtube]__ : para reproduccir una canción.');
        msg.channel.send('__<skip__ : Para saltar a la siguiente canción.');
        msg.channel.send('__<stop__ : para parar la lista de reproducción.');
        msg.channel.send('__<actual__ : para mostrar la canción que esta sonando ahora.');
        msg.channel.send('__<lista__ : Para mostrar las canciones en cola.');
        msg.channel.send('__<vol__ : Para mostar el volumen actual.');
        msg.channel.send('__<vol [Numero del 0-15]__ : Para cambiar el volumen.');
        //msg.channel.send('__<p__ : Para pausar la canción.');
        //msg.channel.send('__<r__ : Para reanudar la canión.');
    }

	return undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
	const serverQueue = queue.get(msg.guild.id);
	console.log(video);
	const song = {
		id: video.id,
		title: Util.escapeMarkdown(video.title),
		url: `https://www.youtube.com/watch?v=${video.id}`
	};
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playing: true
		};
		queue.set(msg.guild.id, queueConstruct);

		queueConstruct.songs.push(song);

		try {
			var connection = await voiceChannel.join();
			queueConstruct.connection = connection;
			play(msg.guild, queueConstruct.songs[0]);
		} catch (error) {
			console.error(`No pude unirme al canal de voz: ${error}`);
			queue.delete(msg.guild.id);
			return msg.channel.send(`No pude unirme al canal de voz: ${error}`);
		}
	} else {
		serverQueue.songs.push(song);
		console.log(serverQueue.songs);
		if (playlist) return undefined;
		else return msg.channel.send(`✅ **${song.title}** se ha añadido a la lista`);
	}
	return undefined;
}

function play(guild, song) {
	const serverQueue = queue.get(guild.id);

	if (!song) {
		serverQueue.voiceChannel.leave();
		queue.delete(guild.id);
		return;
	}
	console.log(serverQueue.songs);

	const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
		.on('end', reason => {
			if (reason === 'Stream no se genera lo suficientemente rápido.') console.log('La cancion termino');
			else console.log(reason);
			serverQueue.songs.shift();
			play(guild, serverQueue.songs[0]);
		})
		.on('error', error => console.error(error));
	dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

	serverQueue.textChannel.send(`🎶 Reproduciendo: **${song.title}**`);
}

client.login(TOKEN);