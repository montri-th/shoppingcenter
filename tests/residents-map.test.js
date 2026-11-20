import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('0.9.2: the lines and names over the residents map follow scripts/build-residents-map.py (no OpenStreetMap file needed)', () => {
  execFileSync('python3', ['-I', fileURLToPath(new URL('./test_residents_map.py', import.meta.url))],
    {cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8'});
});
