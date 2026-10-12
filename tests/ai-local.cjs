const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('Transformers.js / Whisper: constantes, carregador e transcrição definidos', () => {
  assert.ok(appJs.includes('@huggingface/transformers'), 'CDN do transformers.js incluído');
  assert.ok(appJs.includes('function getWhisper('), 'função getWhisper definida');
  assert.ok(appJs.includes('function transcribeAudioWhisper('), 'função transcribeAudioWhisper definida');
  assert.ok(appJs.includes('function runCaptionsWhisper('), 'função runCaptionsWhisper definida');
  assert.ok(appJs.includes('function createCaptionLayers('), 'função modular createCaptionLayers definida');
});

test('Google MediaPipe: constantes, segmentação e rastreamento facial definidos', () => {
  assert.ok(appJs.includes('@mediapipe/tasks-vision'), 'CDN do MediaPipe tasks-vision incluído');
  assert.ok(appJs.includes('selfie_segmenter'), 'modelo de segmentação selfie do MediaPipe incluído');
  assert.ok(appJs.includes('blaze_face_short_range'), 'modelo de detecção facial do MediaPipe incluído');
  assert.ok(appJs.includes('function getMediaPipeVision('), 'função getMediaPipeVision definida');
  assert.ok(appJs.includes('function getMediaPipeSegmenter('), 'função getMediaPipeSegmenter definida');
  assert.ok(appJs.includes('function segmentPersonMediaPipe('), 'função segmentPersonMediaPipe definida');
  assert.ok(appJs.includes('function mediaPipeCutPerson('), 'função mediaPipeCutPerson definida');
  assert.ok(appJs.includes('function getMediaPipeFaceDetector('), 'função getMediaPipeFaceDetector definida');
  assert.ok(appJs.includes('function mediaPipeFaceAutoFrame('), 'função mediaPipeFaceAutoFrame definida');
});

test('UI e estilos: botões e ícones do Whisper e MediaPipe no painel e menu', () => {
  assert.ok(styleCss.includes('.sw-whisper'), 'classe .sw-whisper presente em style.css');
  assert.ok(styleCss.includes('.sw-mediapipe'), 'classe .sw-mediapipe presente em style.css');
  assert.ok(appJs.includes('data-act="mediapipe-segment"'), 'botão de recortar pessoa presente');
  assert.ok(appJs.includes('data-act="mediapipe-face"'), 'botão de auto-enquadramento facial presente');
  assert.ok(appJs.includes('data-ai="mp-seg"'), 'opção de recorte do MediaPipe no menu de IA');
  assert.ok(appJs.includes('data-ai="mp-face"'), 'opção de enquadramento facial no menu de IA');
  assert.ok(appJs.includes('id="capEngine"'), 'seletor de motor de IA (Whisper/Gemini) no modal de legendas');
});

test('window.__motion exporta funções e Service Worker atualizado', () => {
  assert.ok(appJs.includes('getWhisper'), 'getWhisper exportado em window.__motion');
  assert.ok(appJs.includes('runCaptionsWhisper'), 'runCaptionsWhisper exportado em window.__motion');
  assert.ok(appJs.includes('mediaPipeCutPerson'), 'mediaPipeCutPerson exportado em window.__motion');
  assert.ok(appJs.includes('mediaPipeFaceAutoFrame'), 'mediaPipeFaceAutoFrame exportado em window.__motion');
  const cacheVersion = swJs.match(/const VERSION = 'motion-v(\d+)'/);
  assert.ok(cacheVersion && Number(cacheVersion[1]) >= 17, 'versão do service worker mantém motion-v17 ou uma versão posterior');
});
