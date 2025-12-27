const sharp = require('sharp');

const compressImage = async (buffer) => {
    try {
        // 轉為 JPEG, 寬度最大 1024, 品質 60%
        return await sharp(buffer)
            .resize({ width: 1024, withoutEnlargement: true })
            .toFormat('jpeg', { quality: 60 })
            .toBuffer();
    } catch (err) {
        console.error('Failed to compress image:', err);
        throw err;
    }
};

module.exports = {
    compressImage,
};
