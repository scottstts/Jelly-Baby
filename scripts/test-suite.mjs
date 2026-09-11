import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const scriptsDirectory=join(projectRoot,'scripts');
const testFiles=readdirSync(scriptsDirectory,{withFileTypes:true})
  .filter(entry=>entry.isFile()&&entry.name.startsWith('verify-')&&entry.name.endsWith('.mjs'))
  .map(entry=>join('scripts',entry.name))
  .sort();

function outputFor(result) {
  const output=[result.stdout,result.stderr].filter(Boolean).join('\n').trim();
  if(result.error)return [output,result.error.stack??result.error.message].filter(Boolean).join('\n').trim();
  return output;
}

function runAudit(name,command) {
  const result=spawnSync('zsh',['-ic',command],{
    cwd:projectRoot,
    encoding:'utf8',
    stdio:['ignore','pipe','pipe'],
  });
  return {
    name,
    passed:result.status===0,
    output:outputFor(result),
  };
}

function parseTestSummary(output,total) {
  const value=(pattern,fallback)=>Number(output.match(pattern)?.[1]??fallback);
  const tests=value(/^# tests (\d+)$/m,total);
  const failed=value(/^# fail (\d+)$/m,0);
  const passed=value(/^# pass (\d+)$/m,Math.max(0,tests-failed));
  return {tests,passed,failed};
}

function failureReport(output) {
  const lines=output.split('\n');
  const blocks=[];
  for(let index=0;index<lines.length;index++){
    if(!/^\s*not ok\b/.test(lines[index]))continue;
    const block=[lines[index]];
    for(let next=index+1;next<lines.length;next++){
      if(/^\s*not ok\b/.test(lines[next]))break;
      block.push(lines[next]);
      if(/^\s*\.\.\.\s*$/.test(lines[next]))break;
    }
    blocks.push(block.join('\n').trim());
  }
  return blocks.length?blocks.join('\n\n'):output.trim();
}

const audits=[
  runAudit('lint','npm run lint'),
  runAudit('typecheck','npm run typecheck'),
];

const testResult=spawnSync(process.execPath,[
  '--test',
  '--test-concurrency=1',
  '--experimental-strip-types',
  ...testFiles,
],{
  cwd:projectRoot,
  encoding:'utf8',
  stdio:['ignore','pipe','pipe'],
});
const testOutput=outputFor(testResult);
const testSummary=parseTestSummary(testOutput,testFiles.length);
const testSuite={
  name:'verification suite',
  passed:testResult.status===0&&testSummary.failed===0,
  tests:testSummary,
  output:failureReport(testOutput),
};

const failedAudits=audits.filter(audit=>!audit.passed);
const failedTests=testResult.status===0?testSummary.failed:Math.max(1,testSummary.failed);
const failedChecks=failedAudits.length+failedTests;
const totalChecks=audits.length+testSummary.tests;
const passedChecks=totalChecks-failedChecks;

if(failedChecks===0){
  console.log('PASS: '+passedChecks+'/'+totalChecks+' checks passed ('+testSummary.tests+' tests, '+audits.length+' audits).');
}else{
  console.error('FAIL: '+passedChecks+'/'+totalChecks+' checks passed ('+failedTests+' test failures, '+failedAudits.length+' audit failures).');
  console.error('\nError report:');
  for(const audit of failedAudits){
    console.error('\n['+audit.name+']');
    console.error(audit.output||'Command failed without output.');
  }
  if(!testSuite.passed){
    console.error('\n['+testSuite.name+']');
    console.error(testSuite.output||'Test runner failed without output.');
  }
  process.exitCode=1;
}
