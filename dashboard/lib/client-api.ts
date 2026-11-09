export async function readApiResponse(response:Response):Promise<any> {
  let result:any;
  try{result=await response.json();}catch{
    if(response.status===401 || response.redirected)throw new Error("ログインの有効期限を確認し、ログインし直してください。");
    throw new Error("応答を確認できませんでした。操作を繰り返す前に、最新の状態を読み込んでください。");
  }
  if(!response.ok)throw new Error(typeof result?.error==="string"?result.error:response.status===401?"ログインし直してください。":"処理できませんでした。最新の状態を確認してください。");
  return result;
}
export async function requestJson(path:string,method="GET",data?:unknown) {
  let response:Response;
  try{response=await fetch(path,{method,...(data!==undefined?{headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}:{})});}
  catch{throw new Error("通信できませんでした。操作を繰り返す前に、最新の状態を確認してください。");}
  return readApiResponse(response);
}
