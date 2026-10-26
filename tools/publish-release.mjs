import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createManifest,validateManifest,bounded,fetchCurrentManifest,CHANNEL} from './update-contract.mjs';
export async function publishRelease(m,apk,api) {
  validateManifest(m);
  const actual=createManifest({versionCode:m.versionCode,versionName:m.versionName,minSdk:m.minSdk},apk,m.notes);
  if(actual.sha256!==m.sha256 || actual.sizeBytes!==m.sizeBytes)throw Error('APK differs from manifest');
  const latest=await api.latest();if(latest && latest.versionCode>=m.versionCode)return {skipped:true};
  const tag=`v${m.versionName}`;let release=await api.byTag(tag);
  if(release && !release.draft)return {skipped:true};
  release ??=await api.create({tag_name:tag,target_commitish:'main',name:`Comic TV ${m.versionName}`,body:m.notes,draft:true,prerelease:false});
  await api.upload(release,`Comic-TV-${m.versionName}.apk`,fs.readFileSync(apk),'application/vnd.android.package-archive');
  await api.upload(release,'update.json',Buffer.from(JSON.stringify(m,null,2)+'\n'),'application/json');
  await api.publish(release);return {published:true,url:`${CHANNEL}/releases/tag/${tag}`};
}
function githubApi(token) {
  if(!token)throw Error('Missing scoped GitHub token');
  const base='https://api.github.com/repos/wlmb091/comic-tv-updates';
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  async function request(suffix,method='GET',body) {
    const r=await fetch(base+suffix,{method,redirect:'error',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    if(r.status===404)return null;if(!r.ok)throw Error(`Release API failed (${r.status})`);if(r.status===204)return{};
    return JSON.parse((await bounded(r,1048576)).toString('utf8'));
  }
  return {
    latest:fetchCurrentManifest,byTag:tag=>request(`/releases/tags/${tag}`),create:value=>request('/releases','POST',value),
    upload:async(release,name,bytes,type)=>{
      if(!release.draft)throw Error('Cannot modify published release');
      const old=release.assets?.find(a=>a.name===name);if(old)await request(`/releases/assets/${old.id}`,'DELETE');
      const url=new URL(release.upload_url.replace(/\{.*$/,''));
      if(url.origin!=='https://uploads.github.com' || !url.pathname.startsWith('/repos/wlmb091/comic-tv-updates/releases/'))throw Error('Invalid upload origin');
      url.searchParams.set('name',name);
      const r=await fetch(url,{method:'POST',redirect:'error',headers:{...headers,'Content-Type':type},body:bytes});
      if(r.status!==201)throw Error(`Asset upload failed (${r.status})`);await bounded(r,1048576);
    },
    publish:release=>request(`/releases/${release.id}`,'PATCH',{draft:false,make_latest:'true'}),
    removeIncoming:branch=>request(`/git/refs/heads/${branch}`,'DELETE'),
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const m=validateManifest(JSON.parse(fs.readFileSync('incoming/update.json','utf8')));
  const prefix=`refs/heads/incoming/v${m.versionName}-`, ref=process.env.GITHUB_REF??'';
  if(process.env.GITHUB_REPOSITORY!=='wlmb091/comic-tv-updates' || !ref.startsWith(prefix) || !/^[0-9]+-[0-9]+$/.test(ref.slice(prefix.length)))throw Error('Unexpected publication context');
  const api=githubApi(process.env.GH_TOKEN);
  console.log(JSON.stringify(await publishRelease(m,`incoming/Comic-TV-${m.versionName}.apk`,api)));
  await api.removeIncoming(ref.slice('refs/heads/'.length));
}
