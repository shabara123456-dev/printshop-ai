import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApiServer, type AuthGateway, type Role } from '../src/api.ts';
import { AppError } from '../src/errors.ts';

test('product option administration is manager-only and rejects untrusted surcharge shapes', async (context) => {
  const productId='50000000-0000-4000-8000-000000000001';
  const managerId='20000000-0000-4000-8000-000000000001';
  const users:Record<string,{id:string;role:Role}>={manager:{id:managerId,role:'manager'},customer:{id:'10000000-0000-4000-8000-000000000001',role:'customer'}};
  let saved:unknown;
  const gateway={
    authenticate:async(token:string)=>{if(!users[token])throw new AppError('UNAUTHORIZED',401,'Invalid access token.');return{id:users[token].id};},
    getRole:async(id:string)=>Object.values(users).find(user=>user.id===id)?.role??null,
    replaceProductOptions:async(_actor:string,_product:string,options:unknown,reason:string)=>{saved={options,reason};}
  } as unknown as AuthGateway;
  const server=createApiServer({gateway,pricing:gateway});server.listen(0,'127.0.0.1');await once(server,'listening');
  context.after(async()=>{server.close();await once(server,'close');});
  const {port}=server.address() as AddressInfo;const url=`http://127.0.0.1:${port}/api/manager/products/${productId}/options`;
  const options=[{key:'color',label_en:'Color',label_ar:'اللون',required:true,values:[{key:'black',label_en:'Black',label_ar:'أسود',adjustment_type:'one_time',price_adjustment:'25.00'}]}];
  const request=(token:string,body:unknown)=>fetch(url,{method:'PUT',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await request('customer',{options,reason:'approved'})).status,403);
  assert.equal((await request('manager',{options:[{...options[0],values:[{...options[0].values[0],price_adjustment:'-25.00'}]}],reason:'approved'})).status,400);
  assert.equal((await request('manager',{options,reason:'Approved colored option surcharge'})).status,200);
  assert.deepEqual(saved,{options:[{...options[0],values:[{...options[0].values[0],price_adjustment:'25.00'}]}],reason:'Approved colored option surcharge'});
});
