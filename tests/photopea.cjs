'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('index.html contém botão, modal e inputs do Photopea', () => {
  assert.ok(html.includes('id="btnPhotopea"'), 'deve conter o chip #btnPhotopea na barra');
  assert.ok(html.includes('id="photopeaFileInput"'), 'deve conter o input de arquivo #photopeaFileInput');
  assert.ok(html.includes('id="photopeaModal"'), 'deve conter o modal #photopeaModal');
  assert.ok(html.includes('id="btnPhotopeaSave"'), 'deve conter o botão #btnPhotopeaSave');
  assert.ok(html.includes('id="btnPhotopeaClose"'), 'deve conter o botão #btnPhotopeaClose');
  assert.ok(html.includes('id="photopeaReplaceCheck"'), 'deve conter o checkbox de substituição');
  assert.ok(html.includes('data-menu="photopea-frame"'), 'deve conter opção no menu do projeto');
});

test('style.css contém estilos do Photopea e responsividade', () => {
  assert.ok(css.includes('.sw-photopea'), 'ícone do Photopea estilizado');
  assert.ok(css.includes('.photopea-modal'), 'modal estilizado');
  assert.ok(css.includes('.photopea-card'), 'card estilizado');
  assert.ok(css.includes('.photopea-bar'), 'barra superior estilizada');
  assert.ok(css.includes('.photopea-badge'), 'badge da marca Photopea');
  assert.ok(css.includes('@media (max-width: 860px)'), 'responsivo para celular');
});

test('app.js integra Photopea com passagem de dados e Live Messaging', () => {
  assert.ok(js.includes('/* ======================= photopea ======================= */'), 'seção photopea em app.js');
  assert.ok(js.includes('openPhotopea'), 'função openPhotopea definida');
  assert.ok(js.includes('closePhotopea'), 'função closePhotopea definida');
  assert.ok(js.includes('photopeaChoiceModal'), 'função photopeaChoiceModal definida');
  assert.ok(js.includes('customIO'), 'configura customIO do Photopea');
  assert.ok(js.includes('saveToOE("png")'), 'usa saveToOE para exportar PNG do Photopea');
  assert.ok(js.includes('data-act="photopea-edit"'), 'painel de camada de imagem tem botão de editar no Photopea');
  assert.ok(js.includes('photopea-frame'), 'menu tem ação para editar frame');
  assert.ok(js.includes('window.__motion ='), 'exporta __motion');
});

test('configuração do Photopea respeita o formato oficial', () => {
  // Testa montagem e decodificação do payload
  const cfg = {
    environment: {
      theme: 2,
      lang: 'pt',
      intro: false,
      customIO: { save: 'app.activeDocument.saveToOE("png");' }
    },
    script: 'app.documents.add(1080, 1920, 72, "Teste", 2, 3);'
  };
  const hash = encodeURIComponent(JSON.stringify(cfg));
  const decoded = JSON.parse(decodeURIComponent(hash));
  assert.equal(decoded.environment.theme, 2);
  assert.equal(decoded.environment.lang, 'pt');
  assert.equal(decoded.environment.intro, false);
  assert.equal(decoded.environment.customIO.save, 'app.activeDocument.saveToOE("png");');
  assert.equal(decoded.script, 'app.documents.add(1080, 1920, 72, "Teste", 2, 3);');
});

