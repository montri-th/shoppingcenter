import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('official venue-network adapter preserves evidence and branch reconciliation gates', () => {
  execFileSync('python3', ['-I', fileURLToPath(new URL('./test_venue_network_tenants.py', import.meta.url))],
    {cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8'});
});
