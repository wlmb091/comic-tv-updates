import {execFileSync} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {SIGNING_CERTIFICATE,createManifest,validateManifest} from './update-contract.mjs';

export function verifySignedApk(apk,version,buildTools) {
  const signer=execFileSync(path.join(buildTools,'apksigner'),['verify','--verbose','--print-certs',apk],{encoding:'utf8'});
  const certs=[...signer.matchAll(/certificate SHA-256 digest: ([a-f0-9]+)/g)].map(m=>m[1]);
  if(certs.length!==1 || certs[0]!==SIGNING_CERTIFICATE || !signer.includes('Verified using v2 scheme (APK Signature Scheme v2): true'))throw Error('Unexpected APK signer');
  execFileSync(path.join(buildTools,'zipalign'),['-c','-P','16','4',apk],{stdio:['ignore','pipe','pipe']});
  const metadata=execFileSync(path.join(buildTools,'aapt'),['dump','badging',apk],{encoding:'utf8'});
  if(!metadata.includes("package: name='com.pelican.comictv'") || !metadata.includes(`versionCode='${version.versionCode}'`) || !metadata.includes(`versionName='${version.versionName}'`) || !metadata.includes(`\nsdkVersion:'${version.minSdk}'`) || metadata.includes('application-debuggable'))throw Error('APK identity/SDK/debug flags do not match');
  if(!metadata.includes("'armeabi-v7a'") || !metadata.includes("'arm64-v8a'"))throw Error('APK must support both ARM variants');
}
export function verifyIncoming(buildTools) {
  const json=fs.readFileSync('incoming/update.json');if(json.length>65536)throw Error('Manifest too large');
  const m=validateManifest(JSON.parse(json.toString('utf8')));
  const branch=process.env.GITHUB_REF ?? '';
  const expected=`refs/heads/incoming/v${m.versionName}-`;
  if(process.env.GITHUB_REPOSITORY!=='wlmb091/comic-tv-updates' || !branch.startsWith(expected) || !/^[0-9]+-[0-9]+$/.test(branch.slice(expected.length)))throw Error('Unexpected publication context');
  const name=`Comic-TV-${m.versionName}.apk`;
  const files=fs.readdirSync('incoming').sort();
  if(JSON.stringify(files)!==JSON.stringify([name,'update.json'].sort()))throw Error('Only APK and manifest may be staged');
  const apk=`incoming/${name}`;
  const actual=createManifest({versionCode:m.versionCode,versionName:m.versionName,minSdk:m.minSdk},apk,m.notes);
  if(actual.sha256!==m.sha256 || actual.sizeBytes!==m.sizeBytes)throw Error('Incoming bytes differ');
  verifySignedApk(apk,m,buildTools);
  console.log(JSON.stringify({verified:true,version:m.versionName,sha256:m.sha256}));
}
