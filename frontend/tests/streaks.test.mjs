import {test} from 'node:test';
import assert from 'node:assert/strict';
import {habitStreaks} from '../src/streaks.ts';
const daily={days:[0,1,2,3,4,5,6],created:'2026-09-01',checks:[]};
test('daily streak keeps today open and resets after a missed day',()=>{
 const habit={...daily,checks:['2026-09-01','2026-09-02']};
 assert.deepEqual(habitStreaks(habit,'2026-09-03'),{current:2,best:2});
 assert.deepEqual(habitStreaks(habit,'2026-09-04'),{current:0,best:2});
 assert.deepEqual(habitStreaks({...habit,checks:[...habit.checks,'2026-09-04']},'2026-09-04'),{current:1,best:2});
});
test('weekends and other scheduled days off do not break streaks',()=>{
 const habit={days:[0,2,4],created:'2026-09-01',checks:['2026-09-02','2026-09-04','2026-09-07']};
 assert.deepEqual(habitStreaks(habit,'2026-09-08'),{current:3,best:3});
 assert.deepEqual(habitStreaks(habit,'2026-09-10'),{current:0,best:3});
});
test('undo and backfill recompute current and best; duplicates never count twice',()=>{
 const habit={...daily,checks:['2026-09-01','2026-09-03','2026-09-03']};
 assert.deepEqual(habitStreaks(habit,'2026-09-03'),{current:1,best:1});
 assert.deepEqual(habitStreaks({...habit,checks:[...habit.checks,'2026-09-02']},'2026-09-03'),{current:3,best:3});
});
test('empty history and checks outside the schedule or date range do not count',()=>{
 assert.deepEqual(habitStreaks(daily,'2026-09-05'),{current:0,best:0});
 assert.deepEqual(habitStreaks({...daily,days:[0],checks:['2026-08-31','2026-09-01','2026-09-07']},'2026-09-05'),{current:0,best:0});
});
