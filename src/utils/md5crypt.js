import crypto from "node:crypto";

// Webshare vyžaduje heslo vo formáte sha1(md5_crypt(password, salt)), kde
// md5_crypt je klasický Unix "$1$" MD5-based crypt (Poul-Henning Kamp, FreeBSD),
// presne ako je popísané vo Webshare API dokumentácii. Node.js nemá crypt(3)
// vstavaný, preto je algoritmus implementovaný manuálne nižšie.

const ITOA64 = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MAGIC = "$1$";

function to64(value, count) {
  let output = "";
  let v = value >>> 0;
  while (count-- > 0) {
    output += ITOA64[v & 0x3f];
    v >>>= 6;
  }
  return output;
}

function extractSalt(rawSalt) {
  let salt = rawSalt.startsWith(MAGIC) ? rawSalt.slice(MAGIC.length) : rawSalt;
  salt = salt.split("$")[0];
  return salt.slice(0, 8);
}

export function md5crypt(password, rawSalt) {
  const pw = Buffer.from(password, "utf8");
  const salt = Buffer.from(extractSalt(rawSalt), "utf8");

  // final = MD5(password + salt + password)
  const finalCtx = crypto.createHash("md5");
  finalCtx.update(pw);
  finalCtx.update(salt);
  finalCtx.update(pw);
  const final = finalCtx.digest();

  const ctx1 = crypto.createHash("md5");
  ctx1.update(pw);
  ctx1.update(Buffer.from(MAGIC));
  ctx1.update(salt);

  for (let pl = pw.length; pl > 0; pl -= 16) {
    ctx1.update(final.subarray(0, pl > 16 ? 16 : pl));
  }

  for (let i = pw.length; i; i >>= 1) {
    if (i & 1) {
      ctx1.update(Buffer.from([0]));
    } else {
      ctx1.update(pw.subarray(0, 1));
    }
  }

  let result = ctx1.digest();

  for (let i = 0; i < 1000; i++) {
    const ctx = crypto.createHash("md5");
    ctx.update(i & 1 ? pw : result);
    if (i % 3) ctx.update(salt);
    if (i % 7) ctx.update(pw);
    ctx.update(i & 1 ? result : pw);
    result = ctx.digest();
  }

  const groups = [
    [0, 6, 12],
    [1, 7, 13],
    [2, 8, 14],
    [3, 9, 15],
    [4, 10, 5],
  ];

  let hash = "";
  for (const [a, b, c] of groups) {
    const v = (result[a] << 16) | (result[b] << 8) | result[c];
    hash += to64(v, 4);
  }
  hash += to64(result[11], 2);

  return `${MAGIC}${extractSalt(rawSalt)}$${hash}`;
}

// Presný formát hesla, aký očakáva Webshare /api/login/ endpoint.
export function webshareLoginDigest(password, salt) {
  const crypted = md5crypt(password, salt);
  return crypto.createHash("sha1").update(crypted, "utf8").digest("hex");
}
