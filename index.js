const TelegramBot = require('node-telegram-bot-api');
const { IgApiClient } = require('instagram-private-api');
const dotenv = require('dotenv');
const Bottleneck = require('bottleneck');
dotenv.config();

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_API, { polling: true });

// Initialize Instagram Client
const ig = new IgApiClient();

// Rate Limiter (1 request every 2 seconds)
const limiter = new Bottleneck({
    minTime: 2000, // 2 seconds between requests
});

// Login to Instagram
const loginToInstagram = async () => {
    ig.state.generateDevice(process.env.IG_USERNAME);
    await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
    console.log('Logged in to Instagram');
};

// Function to fetch Instagram media (posts, reels, and stories)
const getInstagramMedia = async (url) => {
    try {
        // Extract the shortcode or ID from the URL
        const shortcode = url.split('/p/')[1]?.split('/')[0] || url.split('/reel/')[1]?.split('/')[0] || url.split('/stories/')[1]?.split('/')[0];

        if (!shortcode) {
            throw new Error('Invalid Instagram URL');
        }

        // Fetch media info using the shortcode
        const mediaInfo = await ig.media.info(shortcode);

        // Extract media URLs
        const mediaItems = mediaInfo.items[0];
        const mediaType = mediaItems.media_type; // 1 = image, 2 = video, 8 = album
        const mediaUrls = [];

        if (mediaType === 1 || mediaType === 2) {
            // Single image or video
            mediaUrls.push({
                type: mediaType === 1 ? 'image' : 'video',
                url: mediaItems.image_versions2?.candidates[0]?.url || mediaItems.video_versions[0]?.url,
            });
        } else if (mediaType === 8) {
            // Album (multiple media items)
            mediaItems.carousel_media.forEach((item) => {
                mediaUrls.push({
                    type: item.media_type === 1 ? 'image' : 'video',
                    url: item.image_versions2?.candidates[0]?.url || item.video_versions[0]?.url,
                });
            });
        }

        return mediaUrls;
    } catch (error) {
        console.error('Error fetching Instagram media:', error);
        throw error;
    }
};

// Handle /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Send me an Instagram post, reel, or story link, and I'll download it for you!");
});

// Handle Instagram links
bot.on('message', async (msg) => {
    if (msg.text && msg.text.includes('https://www.instagram.com/')) {
        const chatId = msg.chat.id;

        try {
            bot.sendMessage(chatId, 'Processing your link, please wait...');

            // Fetch media from Instagram with rate limiting
            const mediaUrls = await limiter.schedule(() => getInstagramMedia(msg.text));

            // Send media back to the user
            for (const media of mediaUrls) {
                if (media.type === 'image') {
                    await bot.sendPhoto(chatId, media.url);
                } else if (media.type === 'video') {
                    await bot.sendVideo(chatId, media.url);
                }
            }
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, 'Failed to download the media. Please make sure the link is valid.');
        }
    }
});

// Start the bot
(async () => {
    await loginToInstagram();
    console.log('Telegram bot is running...');
})();