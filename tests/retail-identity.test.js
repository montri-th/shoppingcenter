import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('D36: component-typed rows without a qualified parent read as the place they are', () => {
  execFileSync('python3', ['-I', fileURLToPath(new URL('./test_retail_identity.py', import.meta.url))],
    {cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8'});
});
