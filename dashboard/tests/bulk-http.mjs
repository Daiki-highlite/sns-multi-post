import assert from 'node:assert/strict';
const origin='http://127.0.0.1:5173';
const login=await fetch(`${origin}/signin-with-chatgpt?return_to=/`,{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
async function api(path,method='GET',data){const response=await fetch(`${origin}/api/${path}`,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,body:await response.json()};}
const state=await api('state');assert.equal(state.status,200);assert.equal(state.body.connections.length,0,'Only test against an unconnected local environment');
const ids=[];
try{
 for(let i=0;i<2;i++){
  const created=await api('posts','POST',{date:'2027-02-01',time:i?'18:00':'08:00'});assert.equal(created.status,200);ids.push(created.body.id);
  const p=(await api('state')).body.posts.find(p=>p.id===created.body.id);
  assert.equal((await api(`posts/${p.id}`,'PATCH',{...p,title:`[一括検証] ${i}`,content:{x:[i?'あ'.repeat(150):'検証用の原稿'],linkedin:'会社ページ原稿',facebook:'Facebook原稿'},needsImage:true})).status,200);
 }
 const ps=(await api('state')).body.posts.filter(p=>ids.includes(p.id));
 const options={entries:ps.map(p=>({id:p.id,revision:p.revision})),platforms:['x','linkedin','facebook'],dateMode:'shift',startDate:'2027-03-01',imageMode:'text',mediaIds:[]};
 const refused=await api('posts/bulk','POST',{options,mode:'approve',destinations:{}});assert.equal(refused.status,400);
 assert.ok((await api('state')).body.posts.filter(p=>ids.includes(p.id)).every(p=>p.approvedVersion===null));
 const result=await api('posts/bulk','POST',{options,mode:'approve',allowIncomplete:true,destinations:{}});assert.equal(result.status,200);assert.equal(result.body.approved,1);assert.equal(result.body.drafts,1);assert.equal(result.body.skipped.length,0);
 const saved=(await api('state')).body.posts.filter(p=>ids.includes(p.id));
 assert.ok(saved.every(p=>p.date==='2027-03-01'&&!p.needsImage));assert.equal(saved.flatMap(p=>p.targets).length,3);
 const stale=await api('posts/bulk','POST',{options,mode:'draft'});assert.equal(stale.status,200);assert.equal(stale.body.saved,0);assert.equal(stale.body.skipped.length,2);
 console.log('Bulk HTTP: preview constraints, explicit partial approval, shared date/image settings, frozen targets and stale revision protection passed');
}finally{for(const id of ids){const p=(await api('state')).body.posts.find(p=>p.id===id);if(p)assert.equal((await api(`posts/${id}`,'DELETE',{revision:p.revision})).status,200);}}
