const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// 确保上传目录存在
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // --- 开始：修复文件名乱码逻辑 ---
        let originalname = file.originalname;

        try {
            // 1. 将乱码字符串（被错误解析为 Latin1 的 UTF-8 字节）转回 Buffer
            const buffer = Buffer.from(originalname, 'latin1');

            // 2. 将 Buffer 重新用 UTF-8 解码
            const decodedName = buffer.toString('utf8');

            // 3. 简单的验证：检查解码后的字符串是否包含中文字符
            // 如果包含中文，说明修复成功，更新 file.originalname
            if (/[\u4e00-\u9fa5]/.test(decodedName)) {
                file.originalname = decodedName;
                console.log('检测到乱码并已修复:', file.originalname);
            }
        } catch (e) {
            // 如果转换出错（例如纯英文文件名），不做任何处理，保持原样
            // console.error('文件名解码跳过:', e);
        }
        // --- 结束：修复文件名乱码逻辑 ---

        // 获取文件扩展名（此时 file.originalname 已经是修复后的中文了）
        const ext = path.extname(file.originalname);

        // 生成唯一的存储文件名
        const storedName = `${uuidv4()}${ext}`;

        cb(null, storedName);
    }
});

const fileFilter = (req, file, cb) => {
    // 这里可以根据需求限制文件类型，例如：
    // if (file.mimetype === 'application/pdf') { ... }
    cb(null, true);
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 500 * 1024 * 1024 // 默认限制 500MB
    },
    fileFilter: fileFilter
});

module.exports = upload;
