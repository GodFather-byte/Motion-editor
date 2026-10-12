#!/usr/bin/env node
/* Gera chaves de licença do Motion Pro.
   Uso:
     node tools/licenca.mjs nova "Nome ou e-mail do cliente" 30     -> licença por 30 dias
     node tools/licenca.mjs nova "Cliente" 0                        -> licença sem validade
     node tools/licenca.mjs iniciar                                 -> cria um par de chaves NOVO (invalida as licenças antigas)
   A chave privada fica em motion-licenca-privada.pem (NUNCA suba esse arquivo para o GitHub). */
import { generateKeyPairSync, createPrivateKey, sign, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRIV = process.env.MOTION_PRIVATE_KEY || join(root, 'motion-licenca-privada.pem');
const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const [, , cmd, who, days] = process.argv;

if (cmd === 'iniciar') {
  if (existsSync(PRIV)) { console.error('Já existe uma chave privada em ' + PRIV + '. Apague-a antes se quiser mesmo trocar.'); process.exit(1); }
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  writeFileSync(PRIV, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const cfgPath = join(root, 'pro-config.js');
  const cfg = readFileSync(cfgPath, 'utf8').replace(/publicKey: \{[^}]*\}/, 'publicKey: ' + JSON.stringify(publicKey.export({ format: 'jwk' })));
  writeFileSync(cfgPath, cfg);
  console.log('Chaves criadas. pro-config.js foi atualizado: faça commit dele. Guarde ' + PRIV + ' em lugar seguro.');
} else if (cmd === 'nova' && who) {
  if (!existsSync(PRIV)) { console.error('Chave privada não encontrada em ' + PRIV + '. Coloque o arquivo .pem na raiz do projeto ou defina MOTION_PRIVATE_KEY.'); process.exit(1); }
  const n = Number(days || 30);
  const until = n > 0 ? new Date(Date.now() + n * 864e5).toISOString().slice(0, 10) : null;
  const payload = b64u(JSON.stringify({ n: who, u: until, i: b64u(randomBytes(6)) }));
  const sig = sign('sha256', Buffer.from(payload), { key: createPrivateKey(readFileSync(PRIV)), dsaEncoding: 'ieee-p1363' });
  console.log(`MOTION-${payload}.${b64u(sig)}`);
  console.error(`Licença para "${who}"${until ? ' válida até ' + until : ' sem validade'}.`);
} else {
  console.log('Uso:\n  node tools/licenca.mjs nova "Cliente" 30\n  node tools/licenca.mjs iniciar');
}
