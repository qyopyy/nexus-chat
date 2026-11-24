import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEmail, trimBreaches } from '../supabase/functions/leak-check/core.mjs';

test('normalizeEmail accepts normal addresses and rejects junk', () => {
  assert.equal(normalizeEmail('  Martin@Example.COM '), 'martin@example.com');
  for (const bad of ['', null, 'no-at-sign', 'a@b', 'a b@c.com', '<x>@c.com', 'a@c.com,b@c.com', 'x'.repeat(300) + '@c.com']) assert.equal(normalizeEmail(bad), null, String(bad));
});

test('trimBreaches keeps only display fields and never passes provider text through', () => {
  const out = trimBreaches([{ Name: 'Site', Title: 'Site', Domain: 'site.com', BreachDate: '2020-01-02', DataClasses: ['Emails', 'Passwords'], IsVerified: true, Description: '<script>x</script>' }, { Title: 'no name' }, { Name: 'Bad', BreachDate: 'yesterday' }]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: 'Site', title: 'Site', domain: 'site.com', date: '2020-01-02', data: ['Emails', 'Passwords'], verified: true, sensitive: false });
  assert.equal(out[1].date, null);
  assert.ok(!('Description' in out[0]) && !('description' in out[0]));
  assert.deepEqual(trimBreaches('nope'), []);
});
