// 临时脚本：生成密码哈希
const bcrypt = require('bcryptjs');

const password = 'admin123';
const hash = bcrypt.hashSync(password, 10);
console.log('密码:', password);
console.log('哈希:', hash);
console.log('请将这个哈希值替换到 database.js 中的 $2b$10$YourHashedPasswordHere');