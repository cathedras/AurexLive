const { spawnSync } = require('child_process');
const path = require('path');

function run(cmd, args, opts) {
  console.log('> ' + [cmd].concat(args).join(' '));
  const res = spawnSync(cmd, args, Object.assign({ stdio: 'inherit' }, opts || {}));
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${res.status}`);
}

try {
  // 1) If backend has a generate-openapi script, run it first so generated spec is available
  try {
    const backendPkg = path.join(process.cwd(), 'backend', 'package.json');
    const bp = require(backendPkg);
    if (bp && bp.scripts && bp.scripts['generate-openapi']) {
      run('npm', ['--prefix', 'backend', 'run', 'generate-openapi']);
    }
  } catch (e) {
    // ignore if backend package missing
  }

  // 2) Build frontend
  run('npm', ['--prefix', 'frontend', 'run', 'build']);

  // 2) Optional backend build: if backend/package.json exists and has a build script, run it
  const backendPkg = path.join(process.cwd(), 'backend', 'package.json');
  try {
    const pkg = require(backendPkg);
    if (pkg && pkg.scripts && pkg.scripts.build) {
      run('npm', ['--prefix', 'backend', 'run', 'build']);
    } else {
      console.log('No backend build script found; skipping backend build.');
    }
  } catch (e) {
    console.log('No backend/package.json found; skipping backend build.');
  }

  console.log('\nAll builds completed successfully.');
} catch (err) {
  console.error('\nBuild failed:', err && err.message ? err.message : err);
  process.exit(1);
}
