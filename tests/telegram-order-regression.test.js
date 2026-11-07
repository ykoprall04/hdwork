const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Isolated VM: no real token, database, network client, or polling is loaded.
function fixture() {
  const commands = new Map();
  const messages = [];
  class FakeBot {
    constructor() {
      this.telegram = {
        sendMessage: async (...args) => { messages.push(args); return { message_id: 42 }; },
        sendPhoto: async (...args) => { messages.push(args); return { message_id: 43 }; },
      };
    }
    command(name, handler) { commands.set(name, handler); }
    on() {}
    action() {}
    catch() {}
    launch() { throw new Error('Polling is forbidden in this test'); }
  }
  const context = {
    module: { exports: {} },
    process: { env: { TELEGRAM_BOT_TOKEN: 'isolated-test-placeholder' } },
    console,
    require(name) {
      if (name === 'telegraf') return { Telegraf: FakeBot, Markup: {} };
      if (['../repositories/telegram.repository', '../repositories/order.repository', '../services/realtime.service'].includes(name)) return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/telegram.service.js'), 'utf8');
  vm.runInNewContext(`${source}\nregisterHandlers();`, context);
  return { service: context.module.exports, commands, messages };
}

test('order commands and help remain available without collector commands', async () => {
  const f = fixture();
  assert.deepEqual([...f.commands.keys()].sort(), ['config', 'help', 'setgrup']);
  let help;
  await f.commands.get('help')({ message: {}, reply: async (text) => { help = text; } });
  for (const command of ['#req', '#assign', '/config']) assert.ok(help.includes(command));
  assert.doesNotMatch(help, /alarm|collector/i);
});

test('claim notification keeps the original order reply and topic', async () => {
  const f = fixture();
  await f.service.notifyOrderClaim({ telegram_chat_id: -10, telegram_message_id: 99, telegram_thread_id: 7, user_name: 'HD Test' });
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0][0], -10);
  assert.match(f.messages[0][1], /HD Test/);
  assert.equal(f.messages[0][2].reply_to_message_id, 99);
  assert.equal(f.messages[0][2].message_thread_id, 7);
});

test('order result, image and completion keep delivery and reply behavior', async () => {
  const f = fixture();
  const notification = { chat_id: -10, message_id: 99, thread_id: 7, user_name: 'HD Test', content: 'Hasil cek', files: [{ local_path: '/mock/image.png', file_name: 'image.png', mime_type: 'image/png' }] };
  const result = await f.service.notifyOrderResult(notification);
  assert.equal(result.delivered, true);
  assert.equal(result.message_id, 42);
  assert.match(f.messages[0][1], /Hasil cek/);
  assert.equal(f.messages[1][1].filename, 'image.png');
  assert.equal((await f.service.notifyOrderCompleted(notification)).delivered, true);
  for (const message of f.messages) {
    assert.equal(message[2].reply_to_message_id, 99);
    assert.equal(message[2].message_thread_id, 7);
  }
});
