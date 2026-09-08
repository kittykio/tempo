import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rangeFor} from '../src/periods.ts';
test('goal date ranges handle leap years and week/year boundaries',()=>{
 assert.deepEqual(rangeFor('monthly','2024-02-19'),{start:'2024-02-01',end:'2024-02-29'});
 assert.deepEqual(rangeFor('weekly','2026-01-01'),{start:'2025-12-29',end:'2026-01-04'});
 assert.deepEqual(rangeFor('yearly','2026-09-05'),{start:'2026-01-01',end:'2026-12-31'});
 assert.deepEqual(rangeFor('daily','2026-09-05'),{start:'2026-09-05',end:'2026-09-05'});
});
