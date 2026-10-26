import fs from 'node:fs';
import crypto from 'node:crypto';
export const CHANNEL='https://github.com/wlmb091/comic-tv-updates';
export const SIGNING_CERTIFICATE='5f60801ffa010bb913a59857e851d5eed2d4b63bc79de38747f2db15ae0395ae';
const fields=['schemaVersion','applicationId','versionCode','versionName','minSdk','sizeBytes','sha256','apkUrl','notes'];
export function validateManifest(m) {
  if(!m || typeof m!=='object' || Object.keys(m).length!==fields.length || fields.some(k=>!Object.hasOwn(m,k)))throw Error('Invalid fields');
  if(m.schemaVersion!==1 || m.applicationId!=='com.pelican.comictv' || !Number.isInteger(m.versionCode) || m.versionCode<1 || m.versionCode>2147483647)throw Error('Invalid application/version');
  if(typeof m.versionName!=='string' || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(m.versionName) || m.versionName.length>40)throw Error('Invalid version name');
  if(!Number.isInteger(m.minSdk) || m.minSdk<1 || m.minSdk>10000 || !Number.isInteger(m.sizeBytes) || m.sizeBytes<1 || m.sizeBytes>67108864)throw Error('Invalid limits');
  if(typeof m.sha256!=='string' || !/^[a-f0-9]{64}$/.test(m.sha256) || m.apkUrl!==`${CHANNEL}/releases/download/v${m.versionName}/Comic-TV-${m.versionName}.apk`)throw Error('Invalid APK identity');
  if(typeof m.notes!=='string' || m.notes.length>12000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(m.notes))throw Error('Invalid notes');
  return m;
}
export function readBuildVersion(text) {
  const code=[...text.matchAll(/\bversionCode\s*=\s*([0-9]+)/g)], name=[...text.matchAll(/\bversionName\s*=\s*"([^"]+)"/g)], sdk=[...text.matchAll(/\bminSdk\s*=\s*([0-9]+)/g)];
  if(code.length!==1 || name.length!==1 || sdk.length!==1)throw Error('Expected one literal version and SDK');
  const v={versionCode:Number(code[0][1]),versionName:name[0][1],minSdk:Number(sdk[0][1])};
  validateManifest({schemaVersion:1,applicationId:'com.pelican.comictv',...v,sizeBytes:1,sha256:'a'.repeat(64),apkUrl:`${CHANNEL}/releases/download/v${v.versionName}/Comic-TV-${v.versionName}.apk`,notes:''});
  return v;
}
export function createManifest(version,apk,notes) {
  const sizeBytes=fs.statSync(apk).size;if(sizeBytes<1 || sizeBytes>67108864)throw Error('APK exceeds limits');
  return validateManifest({schemaVersion:1,applicationId:'com.pelican.comictv',...version,sizeBytes,
    sha256:crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),
    apkUrl:`${CHANNEL}/releases/download/v${version.versionName}/Comic-TV-${version.versionName}.apk`,notes});
}
export async function bounded(response,limit) {
  const chunks=[];let total=0;
  for await(const chunk of response.body){total+=chunk.length;if(total>limit)throw Error('Response too large');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
export async function fetchCurrentManifest() {
  const r=await fetch(`${CHANNEL}/releases/latest/download/update.json`,{headers:{'User-Agent':'ComicTV-Release/1'}});
  if(r.status===404)return null;if(!r.ok)throw Error(`Public channel unavailable (${r.status})`);
  return validateManifest(JSON.parse((await bounded(r,65536)).toString('utf8')));
}
