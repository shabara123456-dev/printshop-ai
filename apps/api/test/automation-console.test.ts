import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApiServer, type AuthGateway, type Role } from '../src/api.ts';
import { AppError } from '../src/errors.ts';

test('automation delivery history and retries are manager-only and failures stay redacted', async (context) => {
  const managerId='20000000-0000-4000-8000-000000000001';
  const users: Record<string,{id:string;role:Role}>={manager:{id:managerId,role:'manager'},customer:{id:'10000000-0000-4000-8000-000000000001',role:'customer'}};
  const eventId='80000000-0000-4000-8000-000000000001';
  let retriedBy='';
  const gateway={
    authenticate:async(token:string)=>{if(!users[token])throw new AppError('UNAUTHORIZED',401,'Invalid access token.');return{id:users[token].id};},
    getRole:async(id:string)=>Object.values(users).find(user=>user.id===id)?.role??null,
    listAutomationEvents:async()=>[{id:eventId,event_type:'order.created',status:'dead',attempt_count:10,available_at:'2026-10-08T00:00:00Z',delivered_at:null,created_at:'2026-10-08T00:00:00Z',last_error:'Authorization: Bearer secret-value'}],
    retryDeadAutomationEvent:async(actorId:string,id:string)=>{if(id!==eventId)return false;retriedBy=actorId;return true;}
  } as unknown as AuthGateway;
  const server=createApiServer({gateway,pricing:gateway});server.listen(0,'127.0.0.1');await once(server,'listening');
  context.after(async()=>{server.close();await once(server,'close');});
  const {port}=server.address() as AddressInfo;const base=`http://127.0.0.1:${port}`;
  const req=(path:string,token:string,method='GET')=>fetch(`${base}${path}`,{method,headers:{authorization:`Bearer ${token}`}});
  assert.equal((await req('/api/manager/automations/events','customer')).status,403);
  const listed=await req('/api/manager/automations/events','manager');assert.equal(listed.status,200);
  const body=await listed.json() as {events:Array<{last_error:string}>};assert.equal(body.events.length,1);assert.doesNotMatch(body.events[0].last_error,/secret-value/);
  assert.equal((await req(`/api/manager/automations/events/${eventId}/retry`,'customer','POST')).status,403);
  assert.equal((await req(`/api/manager/automations/events/${eventId}/retry`,'manager','POST')).status,200);assert.equal(retriedBy,managerId);
});

test('live n8n workflow and execution status is manager-only', async (context) => {
  const managerId='20000000-0000-4000-8000-000000000002';
  const users: Record<string,{id:string;role:Role}>={manager:{id:managerId,role:'manager'},customer:{id:'10000000-0000-4000-8000-000000000002',role:'customer'}};
  const gateway={
    authenticate:async(token:string)=>{if(!users[token])throw new AppError('UNAUTHORIZED',401,'Invalid access token.');return{id:users[token].id};},
    getRole:async(id:string)=>Object.values(users).find(user=>user.id===id)?.role??null
  } as unknown as AuthGateway;
  const server=createApiServer({gateway,pricing:gateway,n8nManagement:{overview:async()=>({
    status:'connected', workflows:[{id:'wf-1',name:'Daily Ops',active:true,updated_at:null,tags:[]}],
    executions:[{id:'ex-1',workflow_id:'wf-1',workflow_name:'Daily Ops',status:'success',started_at:null,stopped_at:null,mode:'trigger'}]
  })}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  context.after(async()=>{server.close();await once(server,'close');});
  const {port}=server.address() as AddressInfo;const endpoint=`http://127.0.0.1:${port}/api/manager/automations/overview`;
  assert.equal((await fetch(endpoint,{headers:{authorization:'Bearer customer'}})).status,403);
  const response=await fetch(endpoint,{headers:{authorization:'Bearer manager'}});
  assert.equal(response.status,200);
  const body=await response.json() as {status:string;workflows:Array<{active:boolean}>;executions:Array<{status:string}>};
  assert.equal(body.status,'connected');assert.equal(body.workflows[0].active,true);assert.equal(body.executions[0].status,'success');
});
