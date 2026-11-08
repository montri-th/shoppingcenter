import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('D42: another venue\'s buildings come out of a research site (scripts/separate-sites.py)', () => {
  execFileSync('python3', ['-I', fileURLToPath(new URL('./test_separate_sites.py', import.meta.url))],
    {cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8'});
});
