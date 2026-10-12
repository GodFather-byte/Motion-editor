'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('index.html contém botão, menu e input de arquivo do FFmpeg', () => {
  assert.ok(html.includes('id="btnFFmpeg"'), 'deve conter o chip #btnFFmpeg na barra de ferramentas');
  assert.ok(html.includes('id="ffmpegFileInput"'), 'deve conter o input oculto #ffmpegFileInput');
  assert.ok(html.includes('data-menu="ffmpeg"'), 'deve conter a opção FFmpeg no menu do projeto');
});

test('style.css contém ícone e estilos do FFmpeg', () => {
  assert.ok(css.includes('.sw-ffmpeg'), 'ícone verde estilizado do FFmpeg');
  assert.ok(css.includes('.ffmpeg-log'), 'área de log com rolagem e fonte mono');
  assert.ok(css.includes('.ffmpeg-preview'), 'prévia para vídeo, áudio e imagem');
});

test('app.js contém integração do FFmpeg WebAssembly', () => {
  assert.ok(js.includes('/* ======================= FFmpeg ======================= */'), 'seção FFmpeg em app.js');
  assert.ok(js.includes('getFFmpeg'), 'carregamento sob demanda do motor FFmpeg');
  assert.ok(js.includes('ffmpegModal'), 'modal de operações do FFmpeg');
  assert.ok(js.includes('data-act="ffmpeg-media"'), 'botão FFmpeg nos painéis de vídeo e áudio');
  assert.ok(js.includes('window.__motion ='), 'exporta __motion');
  assert.ok(js.includes('ffmpegModal,'), 'exporta ffmpegModal em __motion');
  assert.ok(js.includes('getFFmpeg'), 'exporta getFFmpeg em __motion');
});

test('FFmpeg suporta operações essenciais (MP4, extrair áudio, comprimir, GIF e mudo)', () => {
  assert.ok(js.includes("id: 'mp4'"), 'suporte a conversão para MP4');
  assert.ok(js.includes("id: 'audio'"), 'suporte a extração de áudio');
  assert.ok(js.includes("id: 'compress'"), 'suporte a compressão com CRF');
  assert.ok(js.includes("id: 'gif'"), 'suporte a geração de GIF com paleta');
  assert.ok(js.includes("id: 'mute'"), 'suporte a remoção de som');
  assert.ok(js.includes("id: 'custom'"), 'suporte a comando personalizado');
});
