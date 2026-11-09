export const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('Tests require an isolated loopback environment');
export function identity(email='uat-a@example.test'){return {'oai-authenticated-user-id':email,'oai-authenticated-user-email':email,'oai-authenticated-user-full-name':encodeURIComponent('UAT担当'),'oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'};}
export async function authHeaders(){if(process.env.TEST_AUTH_MODE==='headers')return identity();const r=await fetch(origin+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});return {Cookie:r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')};}
export const headers={Origin:origin,'Content-Type':'application/json',...await authHeaders()};
export async function api(path,method='GET',data,custom=headers){const r=await fetch(origin+'/api/'+path,{method,headers:custom,body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};}
export function futureDate(days=7){return new Date(Date.now()+days*86400000).toISOString().slice(0,10);}
