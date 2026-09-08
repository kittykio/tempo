import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsLeft } from '../src/timer.ts';

test('background tabs calculate elapsed wall-clock time', () => {
  const clock = { deadline: 1500000, remaining: 1500 };
  assert.equal(secondsLeft(clock, 900000), 600);
  assert.equal(secondsLeft(clock, 1500001), 0);
});
test('a refreshed timer uses its persisted deadline', () => {
  const clock = JSON.parse(JSON.stringify({deadline: 1500000, remaining: 1500}));
  assert.equal(secondsLeft(clock, 1499000), 1);
});
test('paused timers do not tick down', () => {
  assert.equal(secondsLeft({deadline:null,remaining:721}, 9999999),721);
});
test('fractional seconds round up and completed sessions never go negative', () => {
  assert.equal(secondsLeft({deadline:1000,remaining:1},1),1);
  assert.equal(secondsLeft({deadline:1000,remaining:1},1000),0);
  assert.equal(secondsLeft({deadline:1000,remaining:1},100000),0);
});
