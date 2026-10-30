import assert from 'node:assert/strict';
import {orderMvtTransports} from './runivers-transport-order.mjs';

const canonical = {kind: 'canonical-resource-mvt', url: 'https://example.invalid/resource'};
const component = {kind: 'component-feature-layer-mvt', url: 'https://example.invalid/component'};
const candidates = [canonical, component];

assert.deepEqual(orderMvtTransports(candidates, 'component-mvt'), [component, canonical],
  'healthy component endpoint should be attempted before the timed-out canonical endpoint');
assert.deepEqual(orderMvtTransports(candidates, 'resource-mvt'), [canonical, component],
  'healthy canonical endpoint should retain its default priority');
for (const preference of ['', 'feature-json', 'export-json', 'geojson', 'invalid', undefined]) {
  assert.deepEqual(orderMvtTransports(candidates, preference), candidates,
    'JSON-only or unrecognized preflight must preserve the canonical MVT order');
}
assert.deepEqual(candidates, [canonical, component], 'ordering must not mutate fallback candidates');
assert.deepEqual(orderMvtTransports([canonical], 'component-mvt'), [canonical],
  'a missing preferred endpoint must never remove the remaining fallback');
console.log('Runivers preflight-guided MVT transport ordering tests passed.');
