export type ApiGoal = {id:number;title:string;description:string;repo_url:string;votes:number;task_count:number;visibility?:'pending'|'approved'|'rejected'|'hidden';viewer_voted?:boolean;progress:{total:number;open:number;claimed:number;submitted:number;done:number;percent_done:number}};
export type ApiThread = {id:number;author:string;title:string;body:string;comment_count:number;created_at:number};
export type ApiThreadPage = ApiThread & {comments:{author:string;body:string}[];comments_page:number;comments_next_page:number|null};
export type ApiSession = {handle:string;token:string};
export const apiBase = ((import.meta as unknown as {env:Record<string,string>}).env.VITE_API_BASE ?? '').replace(/\/$/,'');
export class ApiError extends Error {
 constructor(message:string,public readonly status:number){super(message);this.name='ApiError';}
}
export async function request<T>(path:string,options:{method?:string;body?:unknown;token?:string;signal?:AbortSignal}={}):Promise<T>{
 const timeout=AbortSignal.timeout(15000);
 const response=await fetch(apiBase+path,{method:options.method??'GET',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.token?{Authorization:'Bearer '+options.token}:{})},body:options.body?JSON.stringify(options.body):undefined,signal:options.signal?AbortSignal.any([options.signal,timeout]):timeout});
 if(!response.ok){const error=await response.json().catch(()=>({detail:'The community server could not complete the request.'}));throw new ApiError(typeof error.detail==='string'?error.detail:'Please check your entries and try again.',response.status);}
 return response.json();
}
export function loadSession():ApiSession|null {try{return JSON.parse(sessionStorage.getItem('common-good-session')??'null');}catch{return null;}}
export async function requestThreadPage(id:string,page:number,options:{token?:string;signal?:AbortSignal}={}){
 const thread=await request<ApiThreadPage>('/threads/'+id+'?page='+page,options);
 if(thread.comments_page!==page||!(thread.comments_next_page===null||(Number.isInteger(thread.comments_next_page)&&thread.comments_next_page>page))){
  throw new Error('Discussion replies are unavailable on this server version. Please try again after the server is updated.');
 }
 return thread;
}
export function saveSession(session:ApiSession|null){try{session?sessionStorage.setItem('common-good-session',JSON.stringify(session)):sessionStorage.removeItem('common-good-session');}catch{}}
export function githubUrl(url:string){try{const parsed=new URL(url);return parsed.protocol==='https:'&&parsed.hostname==='github.com'?parsed.href:'https://github.com/slainhedden/swarm-commons';}catch{return 'https://github.com/slainhedden/swarm-commons';}}
