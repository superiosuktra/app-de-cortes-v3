import { test } from 'node:test';
import assert from 'node:assert';
import { generatePremiereXml } from './xmlExportService';

test('generatePremiereXml produces valid Premiere xmeml structure', () => {
  const xml = generatePremiereXml({
    title: 'Gancho Incrível & Polêmico <1>',
    startTime: '01:15',
    endTime: '01:45',
    durationSeconds: 30,
    hook: 'Você não vai acreditar!',
    payoff: 'Ele revelou tudo',
    videoTitle: 'Podcast #42',
  });

  assert.ok(xml.includes('<?xml version="1.0" encoding="UTF-8"?>'), 'Has XML header');
  assert.ok(xml.includes('<xmeml version="5">'), 'Has xmeml version 5');
  assert.ok(xml.includes('<sequence id="sequence-viral-1">'), 'Has sequence');
  assert.ok(xml.includes('&amp;'), 'Escapes & properly');
  assert.ok(xml.includes('&lt;1&gt;'), 'Escapes < and > properly');
  assert.ok(xml.includes('<width>1080</width>'), 'Vertical format width is 1080');
  assert.ok(xml.includes('<height>1920</height>'), 'Vertical format height is 1920');
  assert.ok(xml.includes('<marker>'), 'Includes viral markers for editor cues');
});
