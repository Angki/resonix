const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

const username = process.argv[2] || 'admin';
const password = process.argv[3] || 'blacklibrary123';

function hashPassword(pwd) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(pwd, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

(async () => {
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { username },
    update: { passwordHash, role: 'admin' },
    create: { username, passwordHash, role: 'admin' },
  });
  console.log(`Admin account ready!`);
  console.log(`Username: ${user.username}`);
  console.log(`Password: ${password}`);
  await prisma.$disconnect();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
