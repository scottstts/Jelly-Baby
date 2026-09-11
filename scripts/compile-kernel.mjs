import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter } from 'node:path';

const homebrewRoots=['/opt/homebrew','/usr/local'];
const homebrewLLVM=homebrewRoots.map(root=>`${root}/opt/llvm`).find(root=>existsSync(`${root}/bin/clang`));
const homebrewLLD=homebrewRoots.map(root=>`${root}/opt/lld`).find(root=>existsSync(`${root}/bin/wasm-ld`));

function compilerEnvironment() {
  const toolPaths=[homebrewLLVM&&`${homebrewLLVM}/bin`,homebrewLLD&&`${homebrewLLD}/bin`,process.env.PATH].filter(Boolean);
  return {...process.env,PATH:toolPaths.join(delimiter)};
}

// Share the production compiler flags with the native equivalence regression.
export function compileKernel(output,defines=[]) {
  const args=[process.env.CLANG||(homebrewLLVM?`${homebrewLLVM}/bin/clang`:'clang'),
    '--target=wasm32','-O3','-fno-builtin','-nostdlib',
    '-Wl,--no-entry','-Wl,--export-memory',
    '-Wl,--initial-memory=16777216','-Wl,--max-memory=16777216',
    ...defines.map(name=>`-D${name}`),'scripts/native/soft-body-kernel.c','-o',output,
  ];
  const quote=value=>`'${value.replaceAll("'","'\\''")}'`;
  execFileSync('zsh',['-ic',args.map(quote).join(' ')],{stdio:'inherit',env:compilerEnvironment()});
}
